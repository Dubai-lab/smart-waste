import { z } from 'zod';

export const phoneRw = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine((v) => /^(\+?250|0)?7[2389]\d{7}$/.test(v), 'Enter a Rwandan mobile number, e.g. 0788123456')
  .transform((v) => '250' + v.slice(-9));

export const payInvoiceSchema = z.object({
  invoice_id: z.string().uuid(),
  phone: phoneRw,
});

export const planRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  zone_id: z.string().uuid().optional(),
  include_threshold: z.number().min(0).max(1).optional(),
});

export const urgentStopSchema = z.object({
  route_id: z.string().uuid(),
  household_id: z.string().uuid(),
});

export const truckPositionSchema = z.object({
  truck_id: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;
export type PlanRequest = z.infer<typeof planRequestSchema>;
