import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { User, Tenant, type Role, type TenantDoc } from '../models/index.js';
import type { Types } from 'mongoose';

export interface AuthCtx {
  userId: Types.ObjectId;
  role: Role;
  tenantId: Types.ObjectId | null;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthCtx;
      tenant?: TenantDoc;
    }
  }
}

export const AUTH_COOKIE = 'rs_token';
const MAX_AGE_DAYS = 30;

interface TokenPayload {
  sub: string;
  tid: string | null;
  role: Role;
  v: number;
}

export function issueSession(res: Response, user: { _id: Types.ObjectId; tenantId?: Types.ObjectId | null; role: string; tokenVersion?: number | null }) {
  const payload: TokenPayload = {
    sub: String(user._id),
    tid: user.tenantId ? String(user.tenantId) : null,
    role: user.role as Role,
    v: user.tokenVersion ?? 0,
  };
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: `${MAX_AGE_DAYS}d` });
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: MAX_AGE_DAYS * 86_400_000,
    path: '/',
  });
  return token;
}

export function clearSession(res: Response) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}

function readToken(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[AUTH_COOKIE] as string | undefined;
}

/** Verifies the session, re-checks the user's status/tokenVersion and loads the tenant. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) throw unauthorized();
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    throw unauthorized('Session expired, please sign in again');
  }
  const user = await User.findById(payload.sub).lean();
  if (!user || (user.tokenVersion ?? 0) !== payload.v) throw unauthorized('Session expired, please sign in again');
  if (user.status === 'suspended' || user.status === 'exited') throw forbidden('Your account is not active');

  req.auth = { userId: user._id, role: user.role as Role, tenantId: user.tenantId ?? null, name: user.name };

  if (user.tenantId) {
    const tenant = await Tenant.findById(user.tenantId);
    if (!tenant) throw unauthorized();
    req.tenant = tenant;
    const isMe = req.method === 'GET' && req.path.endsWith('/auth/me');
    if (tenant.status === 'suspended' && !isMe) throw forbidden(`This workspace has been suspended${tenant.suspendedReason ? `: ${tenant.suspendedReason}` : ''}`);
  }
  next();
}

/**
 * Capability matrix from PRD §8.13. "Own"/"View" variants are enforced inside the handlers
 * (e.g. realtors only ever see their own leads).
 */
export const CAPABILITIES = {
  billing: ['owner', 'finance'],
  settings: ['owner', 'admin'],
  'estates.write': ['owner', 'admin', 'sales_manager'],
  'estates.read': ['owner', 'admin', 'sales_manager', 'finance', 'realtor'],
  'realtors.manage': ['owner', 'admin', 'sales_manager'],
  'realtors.read': ['owner', 'admin', 'sales_manager', 'finance'],
  'leads.all': ['owner', 'admin', 'sales_manager', 'finance'],
  'leads.write': ['owner', 'admin', 'sales_manager'],
  'attribution.override': ['owner', 'admin'],
  'commission.approve': ['owner', 'finance'],
  'commission.read': ['owner', 'admin', 'sales_manager', 'finance'],
  'payments.ledger': ['owner', 'admin', 'finance'],
  'payments.record': ['owner', 'admin', 'finance'],
  'bookings.manage': ['owner', 'admin', 'sales_manager'],
  'team.manage': ['owner', 'admin'],
  'audit.read': ['owner', 'admin'],
  'analytics.firm': ['owner', 'admin', 'sales_manager', 'finance'],
} as const satisfies Record<string, Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role | undefined, cap: Capability) {
  return !!role && (CAPABILITIES[cap] as readonly Role[]).includes(role);
}

export function requireCap(...caps: Capability[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw unauthorized();
    if (!caps.some((c) => can(req.auth!.role, c))) throw forbidden();
    next();
  };
}

/** Firm-scoped route: the caller must belong to a tenant. */
export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth?.tenantId || !req.tenant) throw forbidden('This action requires a firm workspace');
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== 'super_admin') throw forbidden();
  next();
}

/** Helpers for handlers */
export function ctx(req: Request) {
  if (!req.auth || !req.tenant) throw unauthorized();
  return { auth: req.auth, tenant: req.tenant, tenantId: req.tenant._id };
}

export const isRealtor = (req: Request) => req.auth?.role === 'realtor';
