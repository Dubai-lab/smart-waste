import { Router, type RequestHandler } from 'express';
import { payInvoiceSchema } from '@sw/shared';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';
import { admin } from '../lib/supabase.js';
import { refreshPayment, startMomoPayment } from '../services/payments.js';

export const payments = Router();

payments.post('/momo', requireAuth('household', 'manager', 'admin'), async (req, res) => {
  const input = payInvoiceSchema.parse(req.body);
  if (req.user!.role === 'household') {
    const { data } = await admin.from('invoices').select('household_id, households!inner(owner_id)').eq('id', input.invoice_id).single();
    if ((data as any)?.households?.owner_id !== req.user!.id) throw new HttpError(403, 'This is not your bill');
  }
  const payment = await startMomoPayment(input.invoice_id, input.phone, req.user!.id, 'app');
  res.status(201).json(payment);
});

payments.get('/:id', requireAuth(), async (req, res) => {
  const { data: p } = await admin.from('payments').select('id, households!inner(owner_id)').eq('id', String(req.params.id)).single();
  if (!p) throw new HttpError(404, 'Payment not found');
  if (req.user!.role === 'household' && (p as any).households.owner_id !== req.user!.id) throw new HttpError(403, 'Not your payment');
  res.json(await refreshPayment(p.id));
});

// MoMo calls this when the customer approves/declines. We re-check with MoMo instead of trusting the body.
const momoCallback: RequestHandler = async (req, res) => {
  const ref = req.body?.referenceId ?? req.body?.financialTransactionId;
  const { data: p } = await admin.from('payments').select('id').eq('external_ref', String(ref ?? '')).maybeSingle();
  if (p) await refreshPayment(p.id).catch((e) => console.warn('callback refresh failed', e.message));
  res.sendStatus(200);
};
payments.put('/momo/callback', momoCallback);
payments.post('/momo/callback', momoCallback);
