export type UserRole = 'household' | 'crew' | 'manager' | 'officer' | 'recycler' | 'admin';
export type Lang = 'en' | 'rw' | 'fr';
export type FillLevel = 'empty' | 'quarter' | 'half' | 'full' | 'overflow';
export type ReportType = 'bin_full' | 'extra_pickup';
export type ReportStatus = 'open' | 'scheduled' | 'done' | 'cancelled';
export type Channel = 'app' | 'web' | 'ussd' | 'sms';
export type RouteStatus = 'planned' | 'approved' | 'in_progress' | 'completed';
export type StopStatus = 'pending' | 'collected' | 'missed' | 'skipped';
export type InvoiceStatus = 'unpaid' | 'pending' | 'paid' | 'waived';
export type PaymentStatus = 'pending' | 'successful' | 'failed';
export type ComplaintCategory = 'missed_pickup' | 'illegal_dumping' | 'crew_conduct' | 'billing' | 'other';
export type ComplaintStatus = 'open' | 'in_progress' | 'escalated' | 'resolved' | 'rejected';
export type Material = 'plastic' | 'paper' | 'cardboard' | 'metal' | 'glass' | 'organic' | 'e_waste' | 'other';
export type ListingStatus = 'open' | 'booked' | 'collected' | 'cancelled';

export const FILL_LEVELS: FillLevel[] = ['empty', 'quarter', 'half', 'full', 'overflow'];
/** Fill levels that count as "needed collection" — the label for the demand model. */
export const NEEDS_PICKUP_LEVELS: FillLevel[] = ['full', 'overflow'];
export const MATERIALS: Material[] = ['plastic', 'paper', 'cardboard', 'metal', 'glass', 'organic', 'e_waste', 'other'];
export const COMPLAINT_CATEGORIES: ComplaintCategory[] = ['missed_pickup', 'illegal_dumping', 'crew_conduct', 'billing', 'other'];

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  lang: Lang;
  officer_sector: string | null;
  push_token: string | null;
  consent_at: string | null;
  created_at: string;
}

export interface Zone {
  id: string;
  name: string;
  color: string;
  sector: string | null;
  collection_weekdays: number[];
}

export interface HouseholdSummary {
  household_id: string;
  label: string;
  zone: string | null;
  next_collection: string | null;
  today_stop: { status: StopStatus; eta: string | null; seq: number; truck_id: string | null; route_status: RouteStatus } | null;
  open_report: boolean;
  unpaid_invoice: { id: string; period: string; amount_due: number; due_date: string; status: InvoiceStatus } | null;
  points: number;
  point_value_rwf: number;
}

export interface RecordPickupResult {
  pickup_id: string;
  valid: boolean;
  reason: string | null;
  distance_m: number | null;
  household?: string;
  duplicate: boolean;
}

export interface RoutePlanSummary {
  route_id: string;
  crew_id: string;
  stops: number;
  distance_m: number;
  duration_s: number;
  baseline_distance_m: number;
  baseline_duration_s: number;
  saved_distance_m: number;
  saved_fuel_l: number;
  saved_co2_kg: number;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  household: 'Household',
  crew: 'Collection crew',
  manager: 'Company manager',
  officer: 'Local authority officer',
  recycler: 'Recycler / cooperative',
  admin: 'System administrator',
};
