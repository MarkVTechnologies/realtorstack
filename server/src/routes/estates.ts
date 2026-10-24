import { Router } from 'express';
import { z } from 'zod';
import { Estate, Lead, PriceHistory, Product, TITLE_DOCUMENTS } from '../models/index.js';
import { objectId, parse, param } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { uniqueSlug } from '../lib/slug.js';
import { NIGERIAN_STATES } from '../lib/nigeria.js';
import { ctx, isRealtor, requireCap } from '../middleware/auth.js';
import { auditReq } from '../services/audit.js';
import { revalidateFirm } from '../services/revalidate.js';
import { availableSlots } from '../services/slots.js';
import { planTotal } from '../services/commission.js';

export const estatesRouter = Router();

const commissionRule = z.object({ type: z.enum(['percent', 'fixed']), value: z.number().min(0) }).nullable().optional();
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm');

const estateInput = z.object({
  name: z.string().min(2).max(120),
  tagline: z.string().max(160).optional(),
  description: z.string().max(10000).optional(),
  location: z.object({
    state: z.enum(NIGERIAN_STATES),
    lga: z.string().optional(),
    area: z.string().optional(),
    address: z.string().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
  }),
  documents: z.array(z.string()).optional(),
  amenities: z.array(z.string().max(60)).max(40).optional(),
  status: z.enum(['selling', 'sold_out', 'coming_soon']).optional(),
  published: z.boolean().optional(),
  media: z
    .object({
      images: z.array(z.object({ url: z.string(), variants: z.object({ sm: z.string(), md: z.string(), lg: z.string(), og: z.string() }).partial().optional(), width: z.number().optional(), height: z.number().optional(), alt: z.string().optional() })).max(30),
      videos: z.array(z.object({ url: z.string().url(), title: z.string().optional() })).max(10),
      sitePlanUrl: z.string().nullable(),
      brochureUrl: z.string().nullable(),
    })
    .partial()
    .optional(),
  inspection: z
    .object({
      days: z.array(z.number().int().min(0).max(6)),
      times: z.array(time).max(8),
      meetingPoint: z.string().max(300),
      transportNotes: z.string().max(500),
      daysAhead: z.number().int().min(1).max(90),
      capacityPerSlot: z.number().int().min(0).max(500),
      blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    })
    .partial()
    .optional(),
  commission: commissionRule,
  shareCaption: z.string().max(600).optional(),
  sortOrder: z.number().optional(),
});

const planInput = z.object({
  name: z.string().min(1),
  depositAmount: z.number().min(0),
  tenorMonths: z.number().int().min(1).max(120),
  monthlyAmount: z.number().min(0),
  totalPrice: z.number().min(0).optional(),
});

const productInput = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(['plot', 'house', 'apartment', 'commercial', 'other']).optional(),
  size: z.string().max(40).optional(),
  outrightPrice: z.number().min(0),
  plans: z.array(planInput).max(10).optional(),
  promo: z.object({ price: z.number().min(0).nullable(), label: z.string().max(80).nullable(), startsAt: z.coerce.date().nullable(), endsAt: z.coerce.date().nullable() }).partial().nullable().optional(),
  commission: commissionRule,
  status: z.enum(['available', 'sold_out']).optional(),
  sortOrder: z.number().optional(),
});

function cleanDocs(docs?: string[]) {
  return docs?.filter((d) => (TITLE_DOCUMENTS as readonly string[]).includes(d) || d.length <= 60);
}

estatesRouter.get('/meta', (_req, res) => {
  res.json({ states: NIGERIAN_STATES, documents: TITLE_DOCUMENTS });
});

estatesRouter.get('/', requireCap('estates.read'), async (req, res) => {
  const { tenantId } = ctx(req);
  const filter: Record<string, unknown> = { tenantId };
  if (isRealtor(req)) filter.published = true;
  const estates = await Estate.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
  const products = await Product.find({ tenantId, estateId: { $in: estates.map((e) => e._id) } }).sort({ sortOrder: 1, outrightPrice: 1 }).lean();
  res.json(
    estates.map((e) => {
      const ps = products.filter((p) => String(p.estateId) === String(e._id));
      return { ...e, products: ps, fromPrice: ps.length ? Math.min(...ps.map((p) => p.outrightPrice)) : null };
    }),
  );
});

estatesRouter.get('/:id', requireCap('estates.read'), async (req, res) => {
  const { tenantId } = ctx(req);
  const estate = await Estate.findOne({ tenantId, _id: param(req, 'id') }).lean();
  if (!estate || (isRealtor(req) && !estate.published)) throw notFound('Estate');
  const products = await Product.find({ tenantId, estateId: estate._id }).sort({ sortOrder: 1, outrightPrice: 1 }).lean();
  res.json({ ...estate, products });
});

estatesRouter.post('/', requireCap('estates.write'), async (req, res) => {
  const { tenant, tenantId } = ctx(req);
  const body = parse(estateInput, req.body);
  const slug = await uniqueSlug(body.name, async (s) => !!(await Estate.exists({ tenantId, slug: s })));
  const estate = await Estate.create({ ...body, documents: cleanDocs(body.documents), commission: body.commission ?? undefined, tenantId, slug });
  await auditReq(req, { action: 'estate.create', entity: 'Estate', entityId: estate._id, after: { name: estate.name } });
  revalidateFirm(tenant.slug);
  res.status(201).json(estate);
});

estatesRouter.patch('/:id', requireCap('estates.write'), async (req, res) => {
  const { tenant, tenantId } = ctx(req);
  const body = parse(estateInput.partial(), req.body);
  const estate = await Estate.findOne({ tenantId, _id: param(req, 'id') });
  if (!estate) throw notFound('Estate');
  const before = { status: estate.status, published: estate.published, name: estate.name };
  if (body.inspection) body.inspection = { ...estate.toObject().inspection, ...body.inspection } as typeof body.inspection;
  if (body.media) body.media = { ...estate.toObject().media, ...body.media } as typeof body.media;
  if (body.location) body.location = { ...estate.toObject().location, ...body.location } as typeof body.location;
  estate.set({ ...body, documents: body.documents ? cleanDocs(body.documents) : estate.documents });
  if (body.commission === null) estate.set('commission', undefined);
  await estate.save();
  await auditReq(req, { action: 'estate.update', entity: 'Estate', entityId: estate._id, before, after: { status: estate.status, published: estate.published, name: estate.name } });
  revalidateFirm(tenant.slug);
  res.json(estate);
});

estatesRouter.delete('/:id', requireCap('estates.write'), async (req, res) => {
  const { tenant, tenantId } = ctx(req);
  const estate = await Estate.findOne({ tenantId, _id: param(req, 'id') });
  if (!estate) throw notFound('Estate');
  if (await Lead.exists({ tenantId, estateIds: estate._id })) {
    throw badRequest('This estate has leads attached. Unpublish it or mark it sold out instead.');
  }
  await Product.deleteMany({ tenantId, estateId: estate._id });
  await estate.deleteOne();
  await auditReq(req, { action: 'estate.delete', entity: 'Estate', entityId: estate._id, before: { name: estate.name } });
  revalidateFirm(tenant.slug);
  res.json({ ok: true });
});

estatesRouter.get('/:id/slots', requireCap('estates.read'), async (req, res) => {
  const { tenantId } = ctx(req);
  const estate = await Estate.findOne({ tenantId, _id: param(req, 'id') }).lean();
  if (!estate) throw notFound('Estate');
  res.json(await availableSlots(tenantId, estate as never));
});

estatesRouter.get('/:id/price-history', requireCap('estates.read'), async (req, res) => {
  const { tenantId } = ctx(req);
  const rows = await PriceHistory.find({ tenantId, estateId: param(req, 'id') }).sort({ changedAt: -1 }).limit(200).populate('changedBy', 'name').lean();
  res.json(rows);
});

// ---- Products / plot types (PC-02) --------------------------------------------------------------

function normalisePlans(plans?: z.infer<typeof planInput>[]) {
  return plans?.map((p) => ({ ...p, totalPrice: p.totalPrice || planTotal(p) }));
}

estatesRouter.post('/:id/products', requireCap('estates.write'), async (req, res) => {
  const { tenant, tenantId, auth } = ctx(req);
  const estate = await Estate.findOne({ tenantId, _id: param(req, 'id') });
  if (!estate) throw notFound('Estate');
  const body = parse(productInput, req.body);
  const product = await Product.create({ ...body, plans: normalisePlans(body.plans), promo: body.promo ?? undefined, commission: body.commission ?? undefined, tenantId, estateId: estate._id });
  await PriceHistory.create({ tenantId, productId: product._id, estateId: estate._id, field: 'outrightPrice', oldPrice: null, newPrice: product.outrightPrice, changedBy: auth.userId });
  await auditReq(req, { action: 'product.create', entity: 'Product', entityId: product._id, after: { name: product.name, outrightPrice: product.outrightPrice } });
  revalidateFirm(tenant.slug);
  res.status(201).json(product);
});

/** PC-04: price changes are recorded and propagate instantly to all realtor sites. */
estatesRouter.patch('/products/:pid', requireCap('estates.write'), async (req, res) => {
  const { tenant, tenantId, auth } = ctx(req);
  parse(objectId, param(req, 'pid'));
  const body = parse(productInput.partial(), req.body);
  const product = await Product.findOne({ tenantId, _id: param(req, 'pid') });
  if (!product) throw notFound('Product');
  const history: { field: string; oldPrice: number | null; newPrice: number | null }[] = [];
  if (body.outrightPrice !== undefined && body.outrightPrice !== product.outrightPrice) {
    history.push({ field: 'outrightPrice', oldPrice: product.outrightPrice, newPrice: body.outrightPrice });
  }
  if (body.plans) {
    const plans = normalisePlans(body.plans)!;
    for (const plan of plans) {
      const old = product.plans.find((p) => p.name === plan.name);
      if (!old || old.totalPrice !== plan.totalPrice) history.push({ field: `plan:${plan.name}`, oldPrice: old?.totalPrice ?? null, newPrice: plan.totalPrice ?? null });
    }
    body.plans = plans;
  }
  if (body.promo !== undefined && (body.promo?.price ?? null) !== (product.promo?.price ?? null)) {
    history.push({ field: 'promo', oldPrice: product.promo?.price ?? null, newPrice: body.promo?.price ?? null });
  }
  const before = { outrightPrice: product.outrightPrice, plans: product.plans.map((p) => ({ name: p.name, totalPrice: p.totalPrice })) };
  product.set(body);
  if (body.commission === null) product.set('commission', undefined);
  if (body.promo === null) product.set('promo', undefined);
  await product.save();
  if (history.length) {
    await PriceHistory.insertMany(history.map((h) => ({ ...h, tenantId, productId: product._id, estateId: product.estateId, changedBy: auth.userId, changedAt: new Date() })));
    await auditReq(req, { action: 'product.price_change', entity: 'Product', entityId: product._id, before, after: { outrightPrice: product.outrightPrice, plans: product.plans.map((p) => ({ name: p.name, totalPrice: p.totalPrice })) } });
  }
  revalidateFirm(tenant.slug);
  res.json(product);
});

estatesRouter.delete('/products/:pid', requireCap('estates.write'), async (req, res) => {
  const { tenant, tenantId } = ctx(req);
  const product = await Product.findOne({ tenantId, _id: param(req, 'pid') });
  if (!product) throw notFound('Product');
  if (await Lead.exists({ tenantId, 'sale.productId': product._id })) throw badRequest('This product has sales recorded. Mark it sold out instead.');
  await product.deleteOne();
  await auditReq(req, { action: 'product.delete', entity: 'Product', entityId: product._id, before: { name: product.name } });
  revalidateFirm(tenant.slug);
  res.json({ ok: true });
});
