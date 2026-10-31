import { admin } from '../lib/supabase.js';

export const FEATURES = [
  'household_size', 'days_since_pickup', 'reports_since_pickup', 'extra_requested', 'dow', 'is_weekend',
  'holiday_recent', 'umuganda_recent', 'last_fill', 'avg_fill', 'fill_rate', 'expected_fill', 'history_n',
] as const;
export type FeatureRow = Record<(typeof FEATURES)[number], number> & { household_id: string; zone_id: string | null };

interface LogRegPayload { intercept: number; coef: number[]; mean: number[]; scale: number[] }
interface Tree { children_left: number[]; children_right: number[]; feature: number[]; threshold: number[]; value: number[] }
interface TreesPayload { kind: 'random_forest' | 'gradient_boosting'; trees: Tree[]; init?: number; learning_rate?: number }

interface LoadedModel { version: string; format: 'logreg' | 'trees'; payload: LogRegPayload | TreesPayload; features: string[] }

let cache: { model: LoadedModel | null; at: number } | null = null;

export async function activeModel(): Promise<LoadedModel | null> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.model;
  const { data, error } = await admin
    .from('ml_models').select('version, format, payload, features')
    .eq('name', 'demand').eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  cache = { model: (data as LoadedModel | null) ?? null, at: Date.now() };
  return cache.model;
}

export function clearModelCache() { cache = null; }

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function leaf(tree: Tree, x: number[]): number {
  let node = 0;
  while (tree.children_left[node]! !== -1) {
    // scikit-learn compares float32 inputs against the thresholds
    node = Math.fround(x[tree.feature[node]!]!) <= tree.threshold[node]! ? tree.children_left[node]! : tree.children_right[node]!;
  }
  return tree.value[node]!;
}

export function predictWith(model: LoadedModel, row: FeatureRow): number {
  const x = model.features.map((f) => Number((row as Record<string, unknown>)[f] ?? 0));
  if (model.format === 'logreg') {
    const p = model.payload as LogRegPayload;
    const z = x.reduce((s, v, i) => s + p.coef[i]! * ((v - p.mean[i]!) / (p.scale[i]! || 1)), p.intercept);
    return sigmoid(z);
  }
  const p = model.payload as TreesPayload;
  if (p.kind === 'random_forest') return p.trees.reduce((s, t) => s + leaf(t, x), 0) / p.trees.length; // leaf = P(class 1)
  return sigmoid((p.init ?? 0) + (p.learning_rate ?? 0.1) * p.trees.reduce((s, t) => s + leaf(t, x), 0));
}

/**
 * Cold-start rules used only until a model has been trained on collected pickups.
 * Transparent and deterministic; reported as model_version "cold-start-rules-v1".
 */
export function coldStart(row: FeatureRow): number {
  const expected = row.expected_fill >= 0 ? row.expected_fill : (row.days_since_pickup * row.household_size) / 12;
  const z = -2.4 + 2.2 * Math.min(row.reports_since_pickup, 2) + 3 * Math.min(row.extra_requested, 1)
    + 0.9 * expected + 0.5 * row.holiday_recent + 0.4 * row.umuganda_recent;
  return sigmoid(z);
}

export async function predictDemand(rows: FeatureRow[]) {
  const model = await activeModel();
  const version = model ? model.version : 'cold-start-rules-v1';
  return {
    version,
    predictions: rows.map((r) => ({ household_id: r.household_id, probability: model ? predictWith(model, r) : coldStart(r) })),
  };
}
