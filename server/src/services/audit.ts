import type { Request } from 'express';
import type { Types } from 'mongoose';
import { AuditLog } from '../models/index.js';
import { hashIp } from '../lib/crypto.js';

interface AuditInput {
  tenantId: Types.ObjectId | null;
  actorId?: Types.ObjectId | null;
  actorRole?: string;
  action: string;
  entity: string;
  entityId?: Types.ObjectId;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string;
}

export async function audit(input: AuditInput) {
  await AuditLog.create({ ...input, ip: input.ip ? hashIp(input.ip) : undefined, at: new Date() });
}

/** Audit with actor/tenant taken from the authenticated request. */
export function auditReq(req: Request, input: Omit<AuditInput, 'tenantId' | 'actorId' | 'actorRole' | 'ip'> & { tenantId?: Types.ObjectId | null }) {
  return audit({
    tenantId: input.tenantId ?? req.auth?.tenantId ?? null,
    actorId: req.auth?.userId ?? null,
    actorRole: req.auth?.role,
    ip: req.ip,
    ...input,
  });
}
