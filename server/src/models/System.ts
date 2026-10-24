import { Schema, model } from 'mongoose';

/**
 * Immutable audit log (NFR Auditability). Not tenantScoped: platform actions (tenantId = null)
 * live here too. Updates and deletes are blocked at the model layer.
 */
const auditLogSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  actorRole: String,
  action: { type: String, required: true, index: true },
  entity: { type: String, required: true },
  entityId: { type: Schema.Types.ObjectId },
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  reason: String,
  ip: String,
  at: { type: Date, default: Date.now, index: true },
});

for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  auditLogSchema.pre(op, function () {
    throw new Error('Audit log entries are immutable');
  });
}
auditLogSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Audit log entries are immutable');
});

export const AuditLog = model('AuditLog', auditLogSchema);

const notificationSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: String,
    link: String,
    readAt: Date,
  },
  { timestamps: true },
);
notificationSchema.index({ userId: 1, createdAt: -1 });
export const Notification = model('Notification', notificationSchema);

/** A realtor tapping "Share to WhatsApp" / "Copy caption" in their dashboard (activation metric). */
const shareEventSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  realtorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  estateId: { type: Schema.Types.ObjectId, ref: 'Estate', default: null },
  channel: String,
  action: { type: String, enum: ['share', 'copy_caption', 'copy_link', 'download_qr'], default: 'share' },
  at: { type: Date, default: Date.now, index: true },
});
export const ShareEvent = model('ShareEvent', shareEventSchema);

/** Abuse reports from the public "Report this page" link (fraud mitigation, SA-03). */
const abuseReportSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    url: String,
    reason: { type: String, required: true },
    contact: String,
    ipHash: String,
    status: { type: String, enum: ['open', 'reviewed', 'actioned'], default: 'open' },
  },
  { timestamps: true },
);
export const AbuseReport = model('AbuseReport', abuseReportSchema);

/** Delivery log for outbound messages (email now; SMS / WhatsApp in Phase 2). */
const messageLogSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    channel: { type: String, enum: ['email', 'sms', 'whatsapp'], required: true },
    to: String,
    subject: String,
    template: String,
    status: { type: String, enum: ['queued', 'sent', 'failed', 'logged'], default: 'queued' },
    error: String,
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const MessageLog = model('MessageLog', messageLogSchema);
