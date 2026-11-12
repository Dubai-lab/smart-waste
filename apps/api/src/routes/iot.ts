import { Router, type RequestHandler } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';
import { admin } from '../lib/supabase.js';
import { fillPercent } from '../services/fill.js';

export const iot = Router();

/** At or above this fill % the API opens a 'bin_full' report (once, until the bin is collected). */
export const FULL_REPORT_PCT = 90;

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

// ───────────── device → API ─────────────

const readingSchema = z.object({
  distance_cm: z.number().min(0).max(600).nullable(),
  battery_v: z.number().min(0).max(10).optional(),
  rssi: z.number().int().min(-130).max(0).optional(),
});

const requireDevice: RequestHandler = async (req, res, next) => {
  const key = req.header('x-device-key');
  if (!key || key.length < 20 || key.length > 200) throw new HttpError(401, 'Device key required');
  const { data } = await admin.from('bin_sensors').select('id, household_id, empty_cm, full_cm').eq('key_hash', hashKey(key)).maybeSingle();
  if (!data) throw new HttpError(401, 'Unknown device key');
  res.locals.sensor = data;
  next();
};

/** The ESP32 posts one reading each time it wakes up. */
iot.post('/readings', requireDevice, async (req, res) => {
  const input = readingSchema.parse(req.body);
  const s = res.locals.sensor as { id: string; household_id: string; empty_cm: number; full_cm: number };
  const fill = input.distance_cm == null ? null : fillPercent(input.distance_cm, s.empty_cm, s.full_cm);
  const now = new Date().toISOString();

  const { error } = await admin.from('sensor_readings').insert({
    sensor_id: s.id, distance_cm: input.distance_cm, fill_pct: fill, battery_v: input.battery_v ?? null, rssi: input.rssi ?? null,
  });
  if (error) throw new Error(error.message);
  await admin.from('bin_sensors').update({
    last_seen_at: now, last_battery_v: input.battery_v ?? null,
    ...(fill == null ? {} : { last_distance_cm: input.distance_cm, last_fill_pct: fill }),
  }).eq('id', s.id);

  let reported = false;
  if (fill != null && fill >= FULL_REPORT_PCT) {
    const { data: open } = await admin.from('bin_reports').select('id').eq('household_id', s.household_id).in('status', ['open', 'scheduled']).limit(1);
    if (!open?.length) {
      const { error: rErr } = await admin.from('bin_reports').insert({ household_id: s.household_id, type: 'bin_full', channel: 'sensor', note: `Sensor: ${fill}% full` });
      if (rErr) throw new Error(rErr.message);
      reported = true;
    }
  }
  res.json({ ok: true, fill_pct: fill, reported });
});

// ───────────── staff management ─────────────

const calib = { empty_cm: z.number().min(10).max(500), full_cm: z.number().min(5).max(400) };
const createSchema = z.object({ household_id: z.uuid(), ...calib }).refine((v) => v.empty_cm > v.full_cm, 'Empty distance must be larger than full distance');
const updateSchema = z.object(calib).refine((v) => v.empty_cm > v.full_cm, 'Empty distance must be larger than full distance');
const newKey = () => randomBytes(24).toString('base64url');

/** Register a sensor for a household (or issue a new key for an existing one). The key is shown only once. */
iot.post('/sensors', requireAuth('manager', 'admin'), async (req, res) => {
  const input = createSchema.parse(req.body);
  const key = newKey();
  const { data, error } = await admin.from('bin_sensors')
    .upsert({ household_id: input.household_id, empty_cm: input.empty_cm, full_cm: input.full_cm, key_hash: hashKey(key) }, { onConflict: 'household_id' })
    .select('id').single();
  if (error) throw new HttpError(400, error.message);
  res.status(201).json({ id: data.id, device_key: key });
});

iot.patch('/sensors/:id', requireAuth('manager', 'admin'), async (req, res) => {
  const input = updateSchema.parse(req.body);
  const { data, error } = await admin.from('bin_sensors').update(input).eq('id', req.params.id).select('id, last_distance_cm').maybeSingle();
  if (error) throw new HttpError(400, error.message);
  if (!data) throw new HttpError(404, 'Sensor not found');
  // Re-compute the shown fill % with the new calibration.
  if (data.last_distance_cm != null) {
    await admin.from('bin_sensors').update({ last_fill_pct: fillPercent(data.last_distance_cm, input.empty_cm, input.full_cm) }).eq('id', data.id);
  }
  res.json({ ok: true });
});

iot.delete('/sensors/:id', requireAuth('manager', 'admin'), async (req, res) => {
  const { error } = await admin.from('bin_sensors').delete().eq('id', req.params.id);
  if (error) throw new HttpError(400, error.message);
  res.json({ ok: true });
});
