import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, momoConfigured } from './lib/env.js';
import { errorHandler } from './lib/http.js';
import { payments } from './routes/payments.js';
import { planning } from './routes/planning.js';
import { jobs } from './routes/jobs.js';
import { ussd } from './routes/ussd.js';
import { adminUsers } from './routes/adminUsers.js';
import { iot } from './routes/iot.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: false }));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

const health = (_req: express.Request, res: express.Response) =>
  res.json({ ok: true, service: 'smart-waste-api', momo: momoConfigured ? 'sandbox' : 'not-configured', time: new Date().toISOString() });
app.get('/health', health);
app.post('/health', health);

app.use('/payments', rateLimit({ windowMs: 60_000, limit: 20 }), payments);
app.use('/planning', rateLimit({ windowMs: 60_000, limit: 10 }), planning);
app.use('/jobs', jobs);
app.use('/admin/users', rateLimit({ windowMs: 60_000, limit: 20 }), adminUsers);
app.use('/iot', rateLimit({ windowMs: 60_000, limit: 60 }), iot);
app.use('/ussd', rateLimit({ windowMs: 60_000, limit: 120 }), ussd);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

app.listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
