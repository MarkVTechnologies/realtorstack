import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { tenantScoped, tenantField } from './plugins/tenantScoped.js';

export const TITLE_DOCUMENTS = [
  'C of O', "Governor's Consent", 'Excision', 'Gazette', 'Registered Survey', 'Deed of Assignment', 'Building Approval', 'Other',
] as const;

const commissionRule = {
  type: { type: String, enum: ['percent', 'fixed'] },
  value: Number,
};

const imageSchema = new Schema(
  {
    url: { type: String, required: true },
    variants: { sm: String, md: String, lg: String, og: String },
    width: Number,
    height: Number,
    alt: String,
  },
  { _id: true },
);

const estateSchema = new Schema(
  {
    tenantId: tenantField,
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true },
    tagline: String,
    description: { type: String, default: '' },
    location: {
      state: { type: String, required: true },
      lga: String,
      area: String,
      address: String,
      lat: Number,
      lng: Number,
    },
    documents: [{ type: String }],
    amenities: [String],
    status: { type: String, enum: ['selling', 'sold_out', 'coming_soon'], default: 'selling', index: true },
    published: { type: Boolean, default: true },
    visibility: { type: String, enum: ['all', 'groups'], default: 'all' },
    groupIds: [Schema.Types.ObjectId],
    media: {
      images: [imageSchema],
      videos: [{ url: String, title: String, _id: false }],
      sitePlanUrl: String,
      brochureUrl: String,
    },
    inspection: {
      days: { type: [Number], default: [6] }, // 0 = Sunday … 6 = Saturday
      times: { type: [String], default: ['10:00'] },
      meetingPoint: String,
      transportNotes: String,
      daysAhead: { type: Number, default: 30 },
      capacityPerSlot: { type: Number, default: 0 }, // 0 = unlimited
      blackoutDates: [String], // YYYY-MM-DD
    },
    commission: commissionRule,
    shareCaption: String,
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

estateSchema.plugin(tenantScoped);
estateSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

export type EstateDoc = HydratedDocument<InferSchemaType<typeof estateSchema>>;
export const Estate = model('Estate', estateSchema);

const planSchema = new Schema({
  name: { type: String, required: true },
  depositAmount: { type: Number, required: true, min: 0 },
  tenorMonths: { type: Number, required: true, min: 1 },
  monthlyAmount: { type: Number, required: true, min: 0 },
  totalPrice: { type: Number, min: 0 },
});

const productSchema = new Schema(
  {
    tenantId: tenantField,
    estateId: { type: Schema.Types.ObjectId, ref: 'Estate', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['plot', 'house', 'apartment', 'commercial', 'other'], default: 'plot' },
    size: String,
    outrightPrice: { type: Number, required: true, min: 0 },
    plans: [planSchema],
    promo: {
      price: Number,
      label: String,
      startsAt: Date,
      endsAt: Date,
    },
    commission: commissionRule,
    status: { type: String, enum: ['available', 'sold_out'], default: 'available' },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);
productSchema.plugin(tenantScoped);

export type ProductDoc = HydratedDocument<InferSchemaType<typeof productSchema>>;
export const Product = model('Product', productSchema);

const priceHistorySchema = new Schema({
    tenantId: tenantField,
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  estateId: { type: Schema.Types.ObjectId, ref: 'Estate', required: true },
  field: { type: String, required: true }, // outrightPrice | plan:<name> | promo
  oldPrice: Number,
  newPrice: Number,
  changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  changedAt: { type: Date, default: Date.now },
});
priceHistorySchema.plugin(tenantScoped);
export const PriceHistory = model('PriceHistory', priceHistorySchema);
