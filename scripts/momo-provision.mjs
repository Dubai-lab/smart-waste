// One-time: create an MTN MoMo sandbox API user + key from your Collections subscription key.
// Usage: MOMO_SUBSCRIPTION_KEY=xxxx node scripts/momo-provision.mjs [callback-host]
// Then put MOMO_API_USER / MOMO_API_KEY in .env (local) and in Render (production).
import { randomUUID } from 'node:crypto';

const key = process.env.MOMO_SUBSCRIPTION_KEY;
if (!key) { console.error('Set MOMO_SUBSCRIPTION_KEY (Collections primary key from momodeveloper.mtn.com)'); process.exit(1); }
const base = 'https://sandbox.momodeveloper.mtn.com';
const host = process.argv[2] ?? 'webhook.site';
const user = randomUUID();

let res = await fetch(`${base}/v1_0/apiuser`, {
  method: 'POST',
  headers: { 'X-Reference-Id': user, 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ providerCallbackHost: host }),
});
if (res.status !== 201) { console.error('Creating API user failed', res.status, await res.text()); process.exit(1); }

res = await fetch(`${base}/v1_0/apiuser/${user}/apikey`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key } });
if (!res.ok) { console.error('Creating API key failed', res.status, await res.text()); process.exit(1); }
const { apiKey } = await res.json();
console.log(`MOMO_SUBSCRIPTION_KEY=${key}\nMOMO_API_USER=${user}\nMOMO_API_KEY=${apiKey}`);
