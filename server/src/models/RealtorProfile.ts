import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { tenantScoped, tenantField } from './plugins/tenantScoped.js';

const realtorProfileSchema = new Schema(
  {
    tenantId: tenantField,
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    code: { type: String, required: true, uppercase: true },
    slug: { type: String, required: true, lowercase: true },
    photoUrl: String,
    bio: { type: String, maxlength: 1500 },
    whatsapp: String,
    areasServed: [String],
    bank: {
      bankName: String,
      accountName: String,
      accountNumberEnc: { type: String, select: false },
      accountLast4: String,
    },
    kyc: {
      idType: String,
      idNumberEnc: { type: String, select: false },
      idLast4: String,
    },
    featuredEstateIds: [{ type: Schema.Types.ObjectId, ref: 'Estate' }],
    testimonials: [{ name: String, text: String, _id: false }],
    groupId: { type: Schema.Types.ObjectId, default: null },
    uplineId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, enum: ['invite', 'csv', 'registration_link', 'admin'], default: 'invite' },
    activatedAt: Date,
    lastShareAt: Date,
    lastLeadAt: Date,
    lastAssignedAt: Date,
  },
  { timestamps: true },
);

realtorProfileSchema.plugin(tenantScoped);
realtorProfileSchema.index({ tenantId: 1, code: 1 }, { unique: true });
realtorProfileSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

export type RealtorProfileDoc = HydratedDocument<InferSchemaType<typeof realtorProfileSchema>>;
export const RealtorProfile = model('RealtorProfile', realtorProfileSchema);
