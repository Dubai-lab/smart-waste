import { randomUUID } from 'node:crypto';
import { env, momoConfigured } from '../lib/env.js';
import { HttpError } from '../lib/http.js';

/** MTN MoMo Collection API (developer sandbox). Docs: https://momodeveloper.mtn.com/api-documentation */
let token: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (!momoConfigured) throw new HttpError(503, 'Mobile Money is not configured on the server yet');
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const res = await fetch(`${env.MOMO_BASE_URL}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${env.MOMO_API_USER}:${env.MOMO_API_KEY}`).toString('base64'),
      'Ocp-Apim-Subscription-Key': env.MOMO_SUBSCRIPTION_KEY!,
    },
  });
  if (!res.ok) throw new HttpError(502, `MoMo token request failed (${res.status})`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return token.value;
}

export async function requestToPay(p: { amount: number; phone: string; externalId: string; note: string }): Promise<string> {
  const ref = randomUUID();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    'X-Reference-Id': ref,
    'X-Target-Environment': env.MOMO_TARGET_ENV,
    'Ocp-Apim-Subscription-Key': env.MOMO_SUBSCRIPTION_KEY!,
    'Content-Type': 'application/json',
  };
  if (env.PUBLIC_API_URL) headers['X-Callback-Url'] = `${env.PUBLIC_API_URL}/payments/momo/callback`;
  const res = await fetch(`${env.MOMO_BASE_URL}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      amount: String(p.amount),
      currency: env.MOMO_CURRENCY,
      externalId: p.externalId,
      payer: { partyIdType: 'MSISDN', partyId: p.phone },
      payerMessage: p.note.slice(0, 160),
      payeeNote: p.note.slice(0, 160),
    }),
  });
  if (res.status !== 202) throw new HttpError(502, `MoMo rejected the request (${res.status}): ${await res.text()}`);
  return ref;
}

export async function paymentStatus(ref: string): Promise<{ status: 'PENDING' | 'SUCCESSFUL' | 'FAILED'; reason?: string }> {
  const res = await fetch(`${env.MOMO_BASE_URL}/collection/v1_0/requesttopay/${ref}`, {
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'X-Target-Environment': env.MOMO_TARGET_ENV,
      'Ocp-Apim-Subscription-Key': env.MOMO_SUBSCRIPTION_KEY!,
    },
  });
  if (!res.ok) throw new HttpError(502, `MoMo status check failed (${res.status})`);
  const body = (await res.json()) as { status: 'PENDING' | 'SUCCESSFUL' | 'FAILED'; reason?: string | { message?: string } };
  const reason = typeof body.reason === 'string' ? body.reason : body.reason?.message;
  return { status: body.status, reason };
}
