import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { tenantScoped, tenantField } from './plugins/tenantScoped.js';

export const PAYMENT_TYPES = ['fee', 'deposit', 'installment', 'outright'] as const;

const paymentSchema = new Schema(
  {
    tenantId: tenantField,
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    realtorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    amount: { type: Number, required: true, min: 1 },
    type: { type: String, enum: PAYMENT_TYPES, required: true },
    provider: { type: String, enum: ['manual', 'bank_transfer', 'paystack', 'flutterwave'], default: 'manual' },
    reference: { type: String, required: true },
    status: { type: String, enum: ['success', 'pending', 'failed'], default: 'success' },
    paidAt: { type: Date, default: Date.now, index: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: String,
  },
  { timestamps: true },
);
paymentSchema.plugin(tenantScoped);
paymentSchema.index({ tenantId: 1, reference: 1 }, { unique: true });
export type PaymentDoc = HydratedDocument<InferSchemaType<typeof paymentSchema>>;
export const Payment = model('Payment', paymentSchema);

export const COMMISSION_STATUSES = ['pending', 'earned', 'approved', 'paid', 'void'] as const;

const commissionSchema = new Schema(
  {
    tenantId: tenantField,
    realtorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    estateId: { type: Schema.Types.ObjectId, ref: 'Estate' },
    paymentIds: [{ type: Schema.Types.ObjectId, ref: 'Payment' }],
    salePrice: { type: Number, required: true },
    rule: { type: { type: String, enum: ['percent', 'fixed'] }, value: Number, source: String },
    amount: { type: Number, required: true },
    status: { type: String, enum: COMMISSION_STATUSES, default: 'pending', index: true },
    earnedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    paidBy: { type: Schema.Types.ObjectId, ref: 'User' },
    paidAt: Date,
    payoutReference: String,
    history: [{ status: String, at: Date, by: { type: Schema.Types.ObjectId, ref: 'User' }, note: String, _id: false }],
  },
  { timestamps: true },
);
commissionSchema.plugin(tenantScoped);
export type CommissionDoc = HydratedDocument<InferSchemaType<typeof commissionSchema>>;
export const Commission = model('Commission', commissionSchema);
