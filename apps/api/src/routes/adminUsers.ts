import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';
import { admin } from '../lib/supabase.js';

export const adminUsers = Router();

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional(),
  role: z.enum(['household', 'crew', 'manager', 'officer', 'recycler', 'admin']),
  officer_sector: z.string().trim().max(60).optional(),
});

/** Admin creates staff accounts (crew, manager, officer). Returns a one-time temporary password. */
adminUsers.post('/', requireAuth('admin'), async (req, res) => {
  const input = createSchema.parse(req.body);
  const password = randomBytes(9).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email, password, email_confirm: true,
    user_metadata: { full_name: input.full_name, phone: input.phone ?? '' },
  });
  if (error) throw new HttpError(400, error.message);
  const { error: pErr } = await admin.from('profiles')
    .update({ role: input.role, officer_sector: input.officer_sector || null, phone: input.phone || null })
    .eq('id', data.user.id);
  if (pErr) throw new HttpError(400, pErr.message);
  res.status(201).json({ id: data.user.id, email: input.email, temporary_password: password });
});
