import type { Request } from 'express';
import { z } from 'zod';
import { badRequest } from './errors.js';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = issues[0];
    throw badRequest(first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid input', issues);
  }
  return result.data;
}

export function pageParams(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 25) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

/** Non-empty trimmed string from a query param, else undefined. */
export function qstr(v: unknown) {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid id');

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Express 5 types params as string | string[]; our routes only use simple string params. */
export function param(req: Request, name: string) {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : (v as string);
}
