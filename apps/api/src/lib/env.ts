import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(8080),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  CRON_SECRET: z.string().min(16).optional(),
  OSRM_URL: z.string().url().default('https://router.project-osrm.org'),
  // MTN MoMo developer sandbox (https://momodeveloper.mtn.com) — free account
  MOMO_BASE_URL: z.string().url().default('https://sandbox.momodeveloper.mtn.com'),
  MOMO_SUBSCRIPTION_KEY: z.string().optional(),
  MOMO_API_USER: z.string().optional(),
  MOMO_API_KEY: z.string().optional(),
  MOMO_TARGET_ENV: z.string().default('sandbox'),
  MOMO_CURRENCY: z.string().default('EUR'), // the sandbox only accepts EUR
  PUBLIC_API_URL: z.string().url().optional(),
});

export const env = schema.parse(process.env);
export const momoConfigured = Boolean(env.MOMO_SUBSCRIPTION_KEY && env.MOMO_API_USER && env.MOMO_API_KEY);
