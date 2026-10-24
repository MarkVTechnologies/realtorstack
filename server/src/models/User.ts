import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const ROLES = ['super_admin', 'owner', 'admin', 'sales_manager', 'finance', 'realtor'] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: Role[] = ['owner', 'admin', 'sales_manager', 'finance'];

/**
 * Users are not tenantScoped via the plugin: login has to look accounts up across tenants
 * (a phone number may belong to realtors in several firms). Every tenant-facing route still
 * filters by tenantId explicitly.
 */
const userSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true, default: null },
    role: { type: String, enum: ROLES, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    status: { type: String, enum: ['invited', 'pending', 'active', 'suspended', 'exited'], default: 'active', index: true },
    phoneVerifiedAt: Date,
    lastLoginAt: Date,
    tokenVersion: { type: Number, default: 0 },
    notificationPrefs: {
      email: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ tenantId: 1, phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
