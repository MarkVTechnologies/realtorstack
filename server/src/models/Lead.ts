import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { tenantScoped, tenantField } from './plugins/tenantScoped.js';

export const LEAD_STATUSES = [
  'new', 'contacted', 'inspection_booked', 'inspected', 'paid_deposit', 'installment', 'completed', 'lost', 'merged',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Pipeline order; a status only moves forward automatically (manual changes can go anywhere). */
export const STATUS_RANK: Record<LeadStatus, number> = {
  new: 0, contacted: 1, inspection_booked: 2, inspected: 3, paid_deposit: 4, installment: 5, completed: 6, lost: -1, merged: -2,
};

export const TOUCH_TYPES = ['visit', 'shortlink', 'whatsapp_click', 'form', 'booking', 'manual', 'payment'] as const;
export const CHANNELS = ['whatsapp', 'instagram', 'facebook', 'x', 'linkedin', 'tiktok', 'qr', 'sms', 'email', 'direct', 'other'] as const;

/** A recorded interaction between a (possibly anonymous) visitor and a realtor's link. */
const touchSchema = new Schema({
    tenantId: tenantField,
  realtorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  estateId: { type: Schema.Types.ObjectId, ref: 'Estate', default: null },
  type: { type: String, enum: TOUCH_TYPES, required: true },
  channel: { type: String, enum: CHANNELS, default: 'direct' },
  utm: { source: String, medium: String, campaign: String },
  vid: { type: String, index: true }, // first-party visitor id cookie
  phone: { type: String, index: true }, // bound once the visitor identifies themselves
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', default: null, index: true },
  path: String,
  ipHash: String,
  userAgent: String,
  at: { type: Date, default: Date.now, index: true },
});
touchSchema.plugin(tenantScoped);
touchSchema.index({ tenantId: 1, realtorId: 1, at: -1 });
export type TouchDoc = HydratedDocument<InferSchemaType<typeof touchSchema>>;
export const Touch = model('Touch', touchSchema);

const evidenceSchema = new Schema(
  {
    at: { type: Date, required: true },
    type: { type: String, required: true },
    realtorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    touchId: { type: Schema.Types.ObjectId, ref: 'Touch' },
    channel: String,
    estateId: { type: Schema.Types.ObjectId, ref: 'Estate' },
    note: String,
  },
  { _id: false },
);

const leadSchema = new Schema(
  {
    tenantId: tenantField,
    phone: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true },
    name: { type: String, trim: true, default: '' },
    realtorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true }, // null = House
    attribution: {
      model: String,
      rule: String, // first_touch | last_touch | window_expired | house | house_round_robin | manual | override | conflict_resolution
      touchId: { type: Schema.Types.ObjectId, ref: 'Touch' },
      windowStart: Date,
      decidedAt: Date,
      underReview: { type: Boolean, default: false },
      manual: { type: Boolean, default: false },
      manualReason: String,
    },
    evidence: [evidenceSchema],
    status: { type: String, enum: LEAD_STATUSES, default: 'new', index: true },
    source: { type: String, enum: ['form', 'whatsapp', 'booking', 'manual', 'import'], default: 'form' },
    estateIds: [{ type: Schema.Types.ObjectId, ref: 'Estate' }],
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    preferredContactTime: String,
    message: String,
    consentAt: Date,
    notes: [
      {
        authorId: { type: Schema.Types.ObjectId, ref: 'User' },
        kind: { type: String, enum: ['note', 'call', 'whatsapp', 'meeting', 'email'], default: 'note' },
        text: String,
        at: { type: Date, default: Date.now },
      },
    ],
    activity: [
      {
        at: { type: Date, default: Date.now },
        actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        action: String,
        detail: String,
        _id: false,
      },
    ],
    sale: {
      productId: { type: Schema.Types.ObjectId, ref: 'Product' },
      planName: String,
      price: Number,
      startedAt: Date,
    },
    totalPaid: { type: Number, default: 0 },
    mergedInto: { type: Schema.Types.ObjectId, ref: 'Lead' },
    lostReason: String,
  },
  { timestamps: true },
);
leadSchema.plugin(tenantScoped);
// De-duplication by phone within a firm (LC-03). Merged leads keep their phone but leave the unique set.
leadSchema.index({ tenantId: 1, phone: 1 }, { unique: true, partialFilterExpression: { status: { $in: LEAD_STATUSES.filter((s) => s !== 'merged') } } });
leadSchema.index({ tenantId: 1, email: 1 });
leadSchema.index({ tenantId: 1, createdAt: -1 });

export type LeadDoc = HydratedDocument<InferSchemaType<typeof leadSchema>>;
export const Lead = model('Lead', leadSchema);

const conflictSchema = new Schema(
  {
    tenantId: tenantField,
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    currentRealtorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    claimantRealtorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    model: String,
    status: { type: String, enum: ['open', 'auto_resolved', 'resolved'], default: 'open', index: true },
    autoDecision: { type: String, enum: ['kept_original', 'moved_to_claimant', null], default: null },
    touchIds: [{ type: Schema.Types.ObjectId, ref: 'Touch' }],
    resolution: {
      realtorId: { type: Schema.Types.ObjectId, ref: 'User' },
      reason: String,
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: Date,
    },
  },
  { timestamps: true },
);
conflictSchema.plugin(tenantScoped);
export const Conflict = model('Conflict', conflictSchema);

const bookingSchema = new Schema(
  {
    tenantId: tenantField,
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    estateId: { type: Schema.Types.ObjectId, ref: 'Estate', required: true, index: true },
    realtorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    slotAt: { type: Date, required: true, index: true },
    dateKey: { type: String, required: true }, // YYYY-MM-DD Lagos
    time: { type: String, required: true },
    attendees: { type: Number, default: 1, min: 1, max: 20 },
    status: { type: String, enum: ['booked', 'attended', 'no_show', 'cancelled'], default: 'booked', index: true },
    name: String,
    phone: String,
    email: String,
    note: String,
  },
  { timestamps: true },
);
bookingSchema.plugin(tenantScoped);
export const Booking = model('Booking', bookingSchema);
