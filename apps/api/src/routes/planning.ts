import { Router } from 'express';
import { planRequestSchema, urgentStopSchema } from '@sw/shared';
import { requireAuth } from '../lib/auth.js';
import { addUrgentStop, planDay } from '../services/planner.js';
import { clearModelCache, predictDemand, type FeatureRow } from '../services/demand.js';
import { admin } from '../lib/supabase.js';

export const planning = Router();

const kigaliToday = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);

planning.post('/run', requireAuth('manager', 'admin'), async (req, res) => {
  const input = planRequestSchema.parse(req.body ?? {});
  const result = await planDay(input.date ?? kigaliToday(), { zoneId: input.zone_id, threshold: input.include_threshold, userId: req.user!.id });
  res.json({ date: input.date ?? kigaliToday(), zones: result });
});

planning.post('/urgent', requireAuth('manager', 'admin'), async (req, res) => {
  const input = urgentStopSchema.parse(req.body);
  res.json(await addUrgentStop(input.route_id, input.household_id));
});

planning.post('/models/reload', requireAuth('admin'), (_req, res) => {
  clearModelCache();
  res.json({ ok: true });
});

export { kigaliToday };

/** Expected number of full bins per zone for a day (sum of predicted probabilities). Read-only. */
planning.get('/forecast', requireAuth('manager', 'admin', 'officer'), async (req, res) => {
  const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : kigaliToday();
  const { data: features, error } = await admin.rpc('demand_features', { p_date: date });
  if (error) throw error;
  const { version, predictions } = await predictDemand(features as FeatureRow[]);
  const zoneOf = new Map((features as FeatureRow[]).map((f) => [f.household_id, f.zone_id]));
  const { data: zones } = await admin.from('zones').select('id, name, sector');
  const out = (zones ?? []).map((z) => {
    const ps = predictions.filter((p) => zoneOf.get(p.household_id) === z.id);
    return { zone_id: z.id, zone: z.name, sector: z.sector, households: ps.length,
             expected_full: +ps.reduce((s, p) => s + p.probability, 0).toFixed(1),
             likely_full: ps.filter((p) => p.probability >= 0.5).length };
  });
  res.json({ date, model_version: version, zones: out });
});
