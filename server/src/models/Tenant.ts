import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const ATTRIBUTION_MODELS = ['first_touch', 'last_touch', 'first_touch_review'] as const;
export const ATTRIBUTION_WINDOWS = [30, 60, 90, 180] as const;
export const PLANS = ['pilot', 'solo_free', 'solo_pro', 'starter', 'growth', 'enterprise'] as const;

const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    logoUrl: String,
    brand: {
      primaryColor: { type: String, default: '#0f5132' },
      accentColor: { type: String, default: '#c9a227' },
      theme: { type: String, enum: ['classic', 'modern', 'bold'], default: 'modern' },
    },
    contact: {
      phone: String,
      email: String,
      whatsapp: String,
      address: String,
      website: String,
    },
    cacNumber: String,
    plan: { type: String, enum: PLANS, default: 'pilot' },
    status: { type: String, enum: ['active', 'suspended', 'paused'], default: 'active', index: true },
    suspendedReason: String,
    billing: {
      status: { type: String, enum: ['pilot', 'invoiced', 'paid', 'overdue'], default: 'pilot' },
      seatLimit: { type: Number, default: 25 },
      monthlyFee: { type: Number, default: 0 },
      notes: String,
      nextInvoiceAt: Date,
    },
    domains: [{ host: String, verified: { type: Boolean, default: false }, _id: false }],
    registration: {
      code: { type: String, index: true },
      enabled: { type: Boolean, default: true },
      requireApproval: { type: Boolean, default: true },
    },
    settings: {
      attribution: {
        model: { type: String, enum: ATTRIBUTION_MODELS, default: 'first_touch' },
        windowDays: { type: Number, enum: ATTRIBUTION_WINDOWS, default: 90 },
        identityKey: { type: String, enum: ['phone', 'phone_email'], default: 'phone' },
        manualLeads: { type: String, enum: ['admin_only', 'realtor_request'], default: 'admin_only' },
        windowReset: { type: String, enum: ['never', 'on_booking'], default: 'never' },
        houseRoundRobin: { type: Boolean, default: false },
      },
      commission: {
        type: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
        value: { type: Number, default: 5 },
        // When a commission moves from Pending to Earned
        earnOn: { type: String, enum: ['full_payment', 'deposit'], default: 'full_payment' },
      },
      site: {
        heroTitle: String,
        heroSubtitle: String,
        whyBuy: [{ title: String, text: String, _id: false }],
        faqs: [{ q: String, a: String, _id: false }],
        mandatorySections: { type: [String], default: ['hero', 'featured', 'why', 'contact'] },
        allowRealtorEdit: {
          bio: { type: Boolean, default: true },
          photo: { type: Boolean, default: true },
          featuredOrder: { type: Boolean, default: true },
          testimonials: { type: Boolean, default: true },
        },
      },
      hidePaymentAmountsFromRealtors: { type: Boolean, default: false },
      defaultCaption: { type: String, default: 'Own a plot at {estate}, {location}. Prices from {price}. Flexible payment plans available. Chat with me: {link}' },
    },
    privacyPolicy: String,
    onboarding: { dismissed: { type: Boolean, default: false } },
    realtorSeq: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type TenantDoc = HydratedDocument<InferSchemaType<typeof tenantSchema>>;
export const Tenant = model('Tenant', tenantSchema);
