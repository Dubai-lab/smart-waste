import { Router } from 'express';
import { requireCron } from '../lib/auth.js';
import { planDay } from '../services/planner.js';
import { kigaliToday } from './planning.js';

export const jobs = Router();

jobs.post('/daily-plan', requireCron, async (_req, res) => {
  res.json({ date: kigaliToday(), zones: await planDay(kigaliToday()) });
});
