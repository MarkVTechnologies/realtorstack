import { Schema, model } from 'mongoose';

/** One-time invite tokens for realtors and staff. Only the sha256 of the token is stored. */
const inviteSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: true },
);
export const Invite = model('Invite', inviteSchema);

const otpSchema = new Schema(
  {
    phone: { type: String, required: true, index: true },
    purpose: { type: String, enum: ['login', 'invite', 'register'], required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
  },
  { timestamps: true },
);
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
export const Otp = model('Otp', otpSchema);
