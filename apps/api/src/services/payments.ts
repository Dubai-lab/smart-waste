import { admin } from '../lib/supabase.js';
import { HttpError } from '../lib/http.js';
import { paymentStatus, requestToPay } from './momo.js';

export async function startMomoPayment(invoiceId: string, phone: string, initiatedBy: string | null, channel: 'app' | 'web' | 'ussd') {
  const { data: inv } = await admin.from('invoices').select('id, household_id, period, amount_due, status').eq('id', invoiceId).single();
  if (!inv) throw new HttpError(404, 'Bill not found');
  if (inv.status === 'paid' || inv.status === 'waived') throw new HttpError(409, 'This bill is already settled');
  const { data: pending } = await admin.from('payments').select('id').eq('invoice_id', invoiceId).eq('status', 'pending')
    .gt('created_at', new Date(Date.now() - 5 * 60_000).toISOString()).maybeSingle();
  if (pending) throw new HttpError(409, 'A payment for this bill is already waiting for approval on your phone');

  const ref = await requestToPay({ amount: inv.amount_due, phone, externalId: inv.id, note: `Waste collection ${inv.period}` });
  const { data: payment, error } = await admin.from('payments').insert({
    invoice_id: inv.id, household_id: inv.household_id, amount: inv.amount_due, provider: 'mtn_momo',
    payer_phone: phone, external_ref: ref, status: 'pending', initiated_by: initiatedBy, channel,
  }).select().single();
  if (error) throw error;
  return payment;
}

/** Ask MoMo for the latest status and store it. Never trusts a callback body on its own. */
export async function refreshPayment(paymentId: string) {
  const { data: p } = await admin.from('payments').select('*').eq('id', paymentId).single();
  if (!p) throw new HttpError(404, 'Payment not found');
  if (p.status !== 'pending' || !p.external_ref) return p;
  const s = await paymentStatus(p.external_ref);
  if (s.status === 'PENDING') return p;
  const { data, error } = await admin.from('payments').update({
    status: s.status === 'SUCCESSFUL' ? 'successful' : 'failed',
    failure_reason: s.status === 'FAILED' ? s.reason ?? 'Declined' : null,
    completed_at: new Date().toISOString(),
  }).eq('id', p.id).eq('status', 'pending').select().single();
  if (error) throw error;
  return data;
}
