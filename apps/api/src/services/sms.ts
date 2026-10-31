import { admin } from '../lib/supabase.js';

/**
 * Sends an SMS through the database's send_sms() (Infobip via pg_net), so the provider key and the
 * recipient allowlist live in one place (ops.secrets). Returns false when SMS is off or the number isn't allowed.
 */
export async function sendSms(to: string, message: string): Promise<boolean> {
  const { data, error } = await admin.rpc('send_sms', { p_phone: to, p_text: message });
  if (error) console.warn('SMS failed', error.message);
  return data === true;
}
