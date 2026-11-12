import { Router } from 'express';
import { admin } from '../lib/supabase.js';
import { startMomoPayment } from '../services/payments.js';
import { sendSms } from '../services/sms.js';

/**
 * Africa's Talking USSD callback. AT posts: sessionId, serviceCode, phoneNumber, text ("1*2*...").
 * Reply starts with "CON " (more input) or "END " (close session).
 */
export const ussd = Router();

const T = {
  en: {
    welcome: 'Smart Waste\n1. Next collection\n2. My bin is full\n3. Missed pickup\n4. My bill\n5. Green points',
    unknown: 'This number is not registered. Ask your collection company or register in the app.',
    next: (d: string, z: string) => `Next collection (${z}): ${d}`,
    none: 'No collection day set yet.',
    reported: 'Thank you. Your full bin is reported and will be planned for pickup.',
    already: 'Your bin is already reported. The crew will plan it.',
    sensor: 'Your bin has a sensor. It reports automatically when the bin is full, so you do not need to.',
    missed: 'Missed pickup reported. The company must answer within 24 hours.',
    bill: (a: number, p: string) => `Bill ${p}: ${a} RWF\n1. Pay with MTN MoMo\n0. Back`,
    noBill: 'You have no unpaid bill. Thank you!',
    paying: 'Approve the MoMo prompt on your phone to complete payment.',
    payFail: 'Payment could not start. Try again later.',
    points: (p: number, v: number) => `You have ${p} green points (worth ${p * v} RWF off your next bill).`,
    invalid: 'Invalid choice.',
  },
  rw: {
    welcome: 'Smart Waste\n1. Igihe bazatwara\n2. Ingunguru yuzuye\n3. Ntibatwaye imyanda\n4. Fagitire\n5. Amanota',
    unknown: 'Iyi nimero ntiyanditse. Baza ikigo gitwara imyanda cyangwa wiyandikishe muri porogaramu.',
    next: (d: string, z: string) => `Bazatwara (${z}): ${d}`,
    none: 'Nta munsi wo gutwara uratangazwa.',
    reported: 'Murakoze. Ingunguru yuzuye yamenyeshejwe, izategurirwa gutwarwa.',
    already: 'Ingunguru yawe yaramenyeshejwe. Abakozi bazayitegura.',
    sensor: 'Ingunguru yawe ifite sensa. Yimenyesha ubwayo iyo yuzuye, ntukeneye kubikora.',
    missed: 'Byamenyeshejwe. Ikigo kigomba gusubiza mu masaha 24.',
    bill: (a: number, p: string) => `Fagitire ${p}: ${a} RWF\n1. Ishyura na MTN MoMo\n0. Gusubira inyuma`,
    noBill: 'Nta fagitire mutarishyura. Murakoze!',
    paying: 'Emeza ubutumwa bwa MoMo kuri telefoni yawe.',
    payFail: 'Kwishyura ntibyakunze. Ongera ugerageze nyuma.',
    points: (p: number, v: number) => `Ufite amanota ${p} (agabanya ${p * v} RWF kuri fagitire itaha).`,
    invalid: 'Ihitamo ritemewe.',
  },
};

async function findHousehold(phone: string) {
  const local = phone.replace(/\D/g, '').slice(-9);
  const variants = [`250${local}`, `+250${local}`, `0${local}`];
  const { data: byHouse } = await admin.from('households').select('id, owner_id, label').in('phone', variants).eq('active', true).limit(1);
  if (byHouse?.[0]) return byHouse[0];
  const { data: prof } = await admin.from('profiles').select('id').in('phone', variants).limit(1);
  if (!prof?.[0]) return null;
  const { data: owned } = await admin.from('households').select('id, owner_id, label').eq('owner_id', prof[0].id).eq('active', true).limit(1);
  return owned?.[0] ?? null;
}

ussd.post('/', async (req, res) => {
  const { sessionId, phoneNumber, text = '' } = req.body as Record<string, string>;
  res.set('Content-Type', 'text/plain');
  const reply = (s: string) => res.send(s);

  const house = await findHousehold(phoneNumber ?? '');
  let lang: 'en' | 'rw' = 'en';
  if (house?.owner_id) {
    const { data: p } = await admin.from('profiles').select('lang').eq('id', house.owner_id).single();
    if (p?.lang === 'rw') lang = 'rw';
  }
  const t = T[lang];
  await admin.from('ussd_sessions').upsert({ session_id: sessionId, phone: phoneNumber, last_input: text, updated_at: new Date().toISOString() });
  if (!house) return reply(`END ${t.unknown}`);

  const steps = text ? text.split('*') : [];
  if (steps.length === 0) return reply(`CON ${t.welcome}`);

  switch (steps[0]) {
    case '1': {
      const { data } = await admin.rpc('household_summary', { hid: house.id });
      const s = data as { next_collection: string | null; zone: string | null };
      return reply(`END ${s?.next_collection ? t.next(new Date(s.next_collection).toDateString(), s.zone ?? '') : t.none}`);
    }
    case '2': {
      const { data: open } = await admin.from('bin_reports').select('id').eq('household_id', house.id).in('status', ['open', 'scheduled']).limit(1);
      if (open?.length) return reply(`END ${t.already}`);
      const { data: live } = await admin.rpc('has_live_sensor', { hid: house.id });
      if (live) return reply(`END ${t.sensor}`);
      const { error } = await admin.from('bin_reports').insert({ household_id: house.id, type: 'bin_full', channel: 'ussd', created_by: house.owner_id });
      if (error) { console.error(error); return reply(`END ${error.hint === 'sensor_reports_full' ? t.sensor : t.invalid}`); }
      void sendSms(phoneNumber!, t.reported);
      return reply(`END ${t.reported}`);
    }
    case '3': {
      const { error } = await admin.from('complaints').insert({
        household_id: house.id, reporter_id: house.owner_id, category: 'missed_pickup', channel: 'ussd',
        description: 'Missed pickup reported by USSD',
      });
      if (error) console.error(error);
      return reply(`END ${t.missed}`);
    }
    case '4': {
      const { data: inv } = await admin.from('invoices').select('id, period, amount_due').eq('household_id', house.id)
        .in('status', ['unpaid', 'pending']).order('period', { ascending: false }).limit(1).maybeSingle();
      if (!inv) return reply(`END ${t.noBill}`);
      if (steps.length === 1) return reply(`CON ${t.bill(inv.amount_due, inv.period)}`);
      if (steps[1] === '1') {
        try {
          await startMomoPayment(inv.id, '250' + phoneNumber!.replace(/\D/g, '').slice(-9), house.owner_id, 'ussd');
          return reply(`END ${t.paying}`);
        } catch (e) {
          console.warn('USSD payment failed', (e as Error).message);
          return reply(`END ${t.payFail}`);
        }
      }
      return reply(`CON ${t.welcome}`);
    }
    case '5': {
      const { data } = await admin.rpc('household_summary', { hid: house.id });
      const s = data as { points: number; point_value_rwf: number };
      return reply(`END ${t.points(s.points, s.point_value_rwf)}`);
    }
    default:
      return reply(`END ${t.invalid}`);
  }
});
