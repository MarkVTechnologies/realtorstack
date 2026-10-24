import type { Types } from 'mongoose';
import { Commission, Estate, Lead, Payment, Product, PAYMENT_TYPES, type TenantDoc, type ProductDoc, type LeadStatus } from '../models/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { formatNaira, round2 } from '../lib/format.js';
import { audit } from './audit.js';
import { notifyUsers, notifyRoles } from './notify.js';

type Rule = { type: 'percent' | 'fixed'; value: number; source: string };

/** FW-06: product rule → estate rule → firm default. */
export async function commissionRuleFor(tenant: TenantDoc, product: ProductDoc): Promise<Rule> {
  if (product.commission?.type && product.commission.value != null) {
    return { type: product.commission.type as Rule['type'], value: product.commission.value, source: 'product' };
  }
  const estate = await Estate.findOne({ tenantId: tenant._id, _id: product.estateId }).select('commission').lean();
  if (estate?.commission?.type && estate.commission.value != null) {
    return { type: estate.commission.type as Rule['type'], value: estate.commission.value, source: 'estate' };
  }
  const d = tenant.settings?.commission;
  return { type: (d?.type ?? 'percent') as Rule['type'], value: d?.value ?? 5, source: 'firm' };
}

export function commissionAmount(rule: Rule, salePrice: number) {
  return round2(rule.type === 'percent' ? (salePrice * rule.value) / 100 : rule.value);
}

/** Effective outright price, honouring an active promo. */
export function effectivePrice(product: { outrightPrice: number; promo?: { price?: number | null; startsAt?: Date | null; endsAt?: Date | null } | null }, at = new Date()) {
  const p = product.promo;
  if (p?.price && (!p.startsAt || p.startsAt <= at) && (!p.endsAt || p.endsAt >= at)) return p.price;
  return product.outrightPrice;
}

export function planTotal(plan: { depositAmount: number; tenorMonths: number; monthlyAmount: number; totalPrice?: number | null }) {
  return plan.totalPrice || plan.depositAmount + plan.tenorMonths * plan.monthlyAmount;
}

export interface RecordPaymentInput {
  tenant: TenantDoc;
  leadId: string;
  amount: number;
  type: (typeof PAYMENT_TYPES)[number];
  productId?: string;
  planName?: string;
  reference: string;
  paidAt?: Date;
  provider?: 'manual' | 'bank_transfer' | 'paystack' | 'flutterwave';
  note?: string;
  actorId: Types.ObjectId | null;
  actorRole?: string;
}

/**
 * Records a payment against a lead. The payment inherits the lead's attribution (§9.2),
 * moves the lead along the pipeline and creates / advances the realtor's commission (AC-05).
 */
export async function recordPayment(input: RecordPaymentInput) {
  const { tenant } = input;
  const lead = await Lead.findOne({ tenantId: tenant._id, _id: input.leadId });
  if (!lead) throw notFound('Lead');
  if (lead.status === 'merged') throw badRequest('This lead was merged into another lead');

  const isSalePayment = input.type !== 'fee';
  let product: ProductDoc | null = null;
  if (isSalePayment && !lead.sale?.productId) {
    if (!input.productId) throw badRequest('Choose the plot / product being bought for the first sale payment');
    product = await Product.findOne({ tenantId: tenant._id, _id: input.productId });
    if (!product) throw notFound('Product');
    let price = effectivePrice(product, input.paidAt ?? new Date());
    if (input.planName) {
      const plan = product.plans.find((p) => p.name === input.planName);
      if (!plan) throw badRequest('Unknown payment plan for this product');
      price = planTotal(plan);
    }
    lead.sale = { productId: product._id, planName: input.planName, price, startedAt: input.paidAt ?? new Date() };
  } else if (lead.sale?.productId) {
    product = await Product.findOne({ tenantId: tenant._id, _id: lead.sale.productId });
  }

  const payment = await Payment.create({
    tenantId: tenant._id,
    leadId: lead._id,
    realtorId: lead.realtorId ?? null,
    productId: lead.sale?.productId ?? input.productId,
    amount: input.amount,
    type: input.type,
    provider: input.provider ?? 'manual',
    reference: input.reference,
    status: 'success',
    paidAt: input.paidAt ?? new Date(),
    recordedBy: input.actorId,
    note: input.note,
  });

  const now = new Date();
  const salePrice = lead.sale?.price ?? 0;
  if (isSalePayment) lead.totalPaid = round2((lead.totalPaid ?? 0) + input.amount);
  const fullyPaid = isSalePayment && salePrice > 0 && (lead.totalPaid ?? 0) >= salePrice;

  let next: LeadStatus | null = null;
  if (fullyPaid) next = 'completed';
  else if (input.type === 'installment') next = 'installment';
  else if (input.type === 'deposit' || input.type === 'outright') next = 'paid_deposit';
  if (next && lead.status !== 'completed') lead.status = next;
  lead.activity.push({ at: now, actorId: input.actorId, action: 'payment.recorded', detail: `${input.type} ${formatNaira(input.amount)} (${input.reference})` });
  await lead.save();

  // Commission
  let commission = null;
  if (isSalePayment && lead.realtorId && product) {
    commission = await Commission.findOne({ tenantId: tenant._id, leadId: lead._id, status: { $ne: 'void' } });
    if (!commission) {
      const rule = await commissionRuleFor(tenant, product);
      commission = new Commission({
        tenantId: tenant._id,
        realtorId: lead.realtorId,
        leadId: lead._id,
        productId: product._id,
        estateId: product.estateId,
        salePrice,
        rule,
        amount: commissionAmount(rule, salePrice),
        status: 'pending',
        history: [{ status: 'pending', at: now, by: input.actorId, note: 'Sale started' }],
      });
    }
    commission.paymentIds.push(payment._id);
    const earnOnDeposit = tenant.settings?.commission?.earnOn === 'deposit';
    if (commission.status === 'pending' && (fullyPaid || earnOnDeposit)) {
      commission.status = 'earned';
      commission.earnedAt = now;
      commission.history.push({ status: 'earned', at: now, by: input.actorId, note: fullyPaid ? 'Fully paid' : 'Deposit received' });
    }
    await commission.save();
  }

  await audit({ tenantId: tenant._id, actorId: input.actorId, actorRole: input.actorRole, action: 'payment.record', entity: 'Payment', entityId: payment._id, after: { leadId: lead._id, amount: input.amount, type: input.type, reference: input.reference } });

  const hideAmounts = !!tenant.settings?.hidePaymentAmountsFromRealtors;
  await notifyUsers({
    tenant, userIds: [lead.realtorId], type: 'payment.received', title: `Payment received from ${lead.name || lead.phone}`,
    body: hideAmounts ? `Your client made a ${input.type} payment.` : `Your client paid ${formatNaira(input.amount)} (${input.type}). Commission status: ${commission?.status ?? 'n/a'}.`,
    link: `/app/leads/${lead._id}`,
  });
  return { payment, lead, commission };
}

const TRANSITIONS: Record<string, { from: string[]; cap: 'approve' | 'pay' | 'void' }> = {
  approved: { from: ['earned'], cap: 'approve' },
  paid: { from: ['approved'], cap: 'pay' },
  void: { from: ['pending', 'earned'], cap: 'void' },
  earned: { from: ['pending'], cap: 'approve' },
};

export async function transitionCommission(params: {
  tenant: TenantDoc; commissionId: string; to: 'approved' | 'paid' | 'void' | 'earned'; actorId: Types.ObjectId; actorRole: string; note?: string; payoutReference?: string;
}) {
  const { tenant, to, actorId, actorRole } = params;
  const c = await Commission.findOne({ tenantId: tenant._id, _id: params.commissionId });
  if (!c) throw notFound('Commission');
  const t = TRANSITIONS[to];
  if (!t || !t.from.includes(c.status)) throw badRequest(`Cannot move a ${c.status} commission to ${to}`);
  if (to === 'void' && !params.note?.trim()) throw badRequest('A reason is required to void a commission');
  const before = { status: c.status };
  const now = new Date();
  c.status = to;
  if (to === 'earned') c.earnedAt = now;
  if (to === 'approved') { c.approvedBy = actorId; c.approvedAt = now; }
  if (to === 'paid') { c.paidBy = actorId; c.paidAt = now; c.payoutReference = params.payoutReference; }
  c.history.push({ status: to, at: now, by: actorId, note: params.note });
  await c.save();
  await audit({ tenantId: tenant._id, actorId, actorRole, action: `commission.${to}`, entity: 'Commission', entityId: c._id, before, after: { status: to, payoutReference: params.payoutReference }, reason: params.note });
  if (to === 'approved' || to === 'paid' || to === 'void') {
    await notifyUsers({
      tenant, userIds: [c.realtorId], type: `commission.${to}`, title: `Commission ${to}`,
      body: `Your commission of ${formatNaira(c.amount)} is now ${to}.${params.note ? ` Note: ${params.note}` : ''}`, link: '/app/commissions',
    });
  }
  if (to === 'earned') {
    await notifyRoles(tenant, ['owner', 'finance'], { type: 'commission.earned', title: 'Commission ready for approval', body: `A commission of ${formatNaira(c.amount)} is earned and awaiting approval.`, link: '/app/commissions', email: false });
  }
  return c;
}
