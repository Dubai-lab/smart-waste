import type { RequestHandler } from 'express';
import type { UserRole } from '@sw/shared';
import { admin } from './supabase.js';
import { env } from './env.js';
import { HttpError } from './http.js';

export interface AuthedUser { id: string; role: UserRole; email: string | null }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthedUser } }
}

/** Verifies the Supabase access token sent by the web/mobile apps. */
export function requireAuth(...roles: UserRole[]): RequestHandler {
  return async (req, _res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Sign in required');
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) throw new HttpError(401, 'Session expired, please sign in again');
    const { data: profile } = await admin.from('profiles').select('role').eq('id', data.user.id).single();
    if (!profile) throw new HttpError(403, 'Profile not found');
    if (roles.length && !roles.includes(profile.role)) throw new HttpError(403, 'You do not have access to this action');
    req.user = { id: data.user.id, role: profile.role, email: data.user.email ?? null };
    next();
  };
}

/** For pg_cron → API calls. */
export const requireCron: RequestHandler = (req, _res, next) => {
  if (!env.CRON_SECRET || req.headers['x-cron-secret'] !== env.CRON_SECRET) throw new HttpError(401, 'Bad cron secret');
  next();
};
