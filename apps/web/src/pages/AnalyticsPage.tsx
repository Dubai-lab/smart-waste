import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase, q } from '../lib/supabase';
import { date, km, label, num, pct } from '../lib/format';
import { Badge, Card, PageHeader, QueryView, Table } from '../components/ui';

const tooltipStyle = { background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 };
const axis = { fontSize: 11, fill: 'var(--color-muted-fg)' };

function metrics(rows: { predicted: boolean; actual: boolean }[]) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of rows) {
    if (r.predicted && r.actual) tp++; else if (r.predicted && !r.actual) fp++;
    else if (!r.predicted && r.actual) fn++; else tn++;
  }
  const n = tp + fp + tn + fn;
  const precision = tp + fp ? tp / (tp + fp) : NaN;
  const recall = tp + fn ? tp / (tp + fn) : NaN;
  return { n, tp, fp, tn, fn, accuracy: n ? (tp + tn) / n : NaN, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : NaN };
}

export default function AnalyticsPage() {
  const evals = useQuery({ queryKey: ['pred-eval'], queryFn: () => q(supabase.from('v_prediction_eval').select('*').order('for_date', { ascending: false }).limit(5000)) });
  const models = useQuery({ queryKey: ['ml-models'], queryFn: () => q(supabase.from('ml_models').select('id, name, version, algorithm, metrics, trained_rows, active, created_at').order('created_at', { ascending: false })) });
  const runs = useQuery({ queryKey: ['plan-runs-all'], queryFn: () => q(supabase.from('plan_runs').select('run_date, distance_m, baseline_distance_m, households_selected, households_total').order('run_date').limit(500)) });
  const sorting = useQuery({
    queryKey: ['sorting-analytics'],
    queryFn: async () => {
      const [cls, board] = await Promise.all([
        q(supabase.from('sorting_classifications').select('predicted_label, confidence, inference_ms, user_feedback').limit(5000)),
        q(supabase.rpc('village_leaderboard', { p_days: 30 })),
      ]);
      return { cls, board };
    },
  });

  const byModel = new Map<string, any[]>();
  for (const r of evals.data ?? []) byModel.set(r.model_version, [...(byModel.get(r.model_version) ?? []), r]);

  const runSeries = Object.values((runs.data ?? []).reduce((acc: Record<string, any>, r: any) => {
    const d = acc[r.run_date] ?? (acc[r.run_date] = { day: r.run_date.slice(5), Optimised: 0, 'Fixed route': 0 });
    d.Optimised += r.distance_m / 1000; d['Fixed route'] += r.baseline_distance_m / 1000;
    return acc;
  }, {}));

  const labels = Object.entries((sorting.data?.cls ?? []).reduce((acc: Record<string, number>, c: any) => ({ ...acc, [c.predicted_label]: (acc[c.predicted_label] ?? 0) + 1 }), {}))
    .map(([name, count]) => ({ name: label(name), count }));
  const cls = sorting.data?.cls ?? [];
  const feedback = cls.filter((c: any) => c.user_feedback);
  const avgMs = cls.length ? cls.reduce((s: number, c: any) => s + (c.inference_ms ?? 0), 0) / cls.length : null;

  return (
    <>
      <PageHeader title="Analytics" description="Evidence for the evaluation: prediction accuracy, route savings, sorting behaviour and AI assistant performance — all computed from recorded data." />

      <Card className="mb-4" title="Demand prediction — accuracy on real pickups" description="A prediction is checked against the fill level the crew recorded at the same household that day (full/overflowing = needed collection).">
        <QueryView query={evals} empty={{ title: 'No evaluated predictions yet', text: 'Accuracy appears once planned households have been collected and their fill level recorded.' }}>
          {() => (
            <Table head={['Model', 'Checked', 'Accuracy', 'Precision', 'Recall', 'F1', 'TP / FP / TN / FN']}>
              {[...byModel.entries()].map(([v, rows]) => {
                const m = metrics(rows);
                return (
                  <tr key={v}>
                    <td><Badge tone={v.startsWith('cold') ? 'warning' : 'primary'} icon={false}>{v}</Badge></td>
                    <td className="num">{m.n}</td><td className="num">{pct(m.accuracy)}</td><td className="num">{pct(m.precision)}</td>
                    <td className="num">{pct(m.recall)}</td><td className="num">{pct(m.f1)}</td>
                    <td className="num">{m.tp} / {m.fp} / {m.tn} / {m.fn}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        </QueryView>
        <p className="mt-3 text-xs text-muted-fg">Note: households that were not planned are rarely visited, so this measures mostly precision of the selected stops. The offline test-set metrics from training are listed below.</p>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card title="Trained models" description="Trained in Python (scikit-learn) on crew-recorded fill levels; the active model is used for daily planning.">
          <QueryView query={models} empty={{ title: 'No trained model yet', text: 'Planning uses transparent cold-start rules until enough pickups are recorded. Run ml/train_demand.py to train and compare models.' }}>
            {(list) => (
              <Table head={['Version', 'Algorithm', 'Rows', 'Test accuracy', 'Test F1', 'ROC-AUC', '']}>
                {list.map((m: any) => (
                  <tr key={m.id}>
                    <td className="num">{m.version}</td><td>{label(m.algorithm)}</td><td className="num">{num(m.trained_rows)}</td>
                    <td className="num">{pct(m.metrics?.accuracy)}</td><td className="num">{pct(m.metrics?.f1)}</td><td className="num">{num(m.metrics?.roc_auc, 3)}</td>
                    <td>{m.active && <Badge tone="success">Active</Badge>}</td>
                  </tr>
                ))}
              </Table>
            )}
          </QueryView>
        </Card>
        <Card title="Route distance per day" description="Sum of all optimised routes vs the fixed route that visits every household.">
          <QueryView query={runs} empty={{ title: 'No planning runs yet' }}>
            {() => (
              <div className="h-64" role="img" aria-label="Line chart comparing optimised and fixed route kilometres per day">
                <ResponsiveContainer>
                  <LineChart data={runSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="day" tick={axis} /><YAxis tick={axis} width={36} unit=" km" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => km(Number(v) * 1000)} /><Legend />
                    <Line type="monotone" dataKey="Fixed route" stroke="#94a3b8" strokeDasharray="5 4" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="Optimised" stroke="#0d9488" dot={{ r: 2 }} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </QueryView>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="AI sorting assistant" description="On-device classifier usage. Inference time is measured on the resident's phone.">
          <QueryView query={sorting} empty={{ title: 'No classifications yet', when: (d) => d.cls.length === 0 }}>
            {() => (
              <>
                <div className="mb-3 grid grid-cols-3 gap-3 text-center">
                  <div><p className="num text-2xl font-semibold">{num(cls.length)}</p><p className="text-xs text-muted-fg">photos classified</p></div>
                  <div><p className="num text-2xl font-semibold">{avgMs == null ? '—' : `${Math.round(avgMs)} ms`}</p><p className="text-xs text-muted-fg">avg inference</p></div>
                  <div><p className="num text-2xl font-semibold">{feedback.length ? pct(feedback.filter((c: any) => c.user_feedback === c.predicted_label).length / feedback.length) : '—'}</p><p className="text-xs text-muted-fg">agreed by users ({feedback.length})</p></div>
                </div>
                <div className="h-52" role="img" aria-label="Bar chart of classified waste categories">
                  <ResponsiveContainer>
                    <BarChart data={labels}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="name" tick={axis} /><YAxis allowDecimals={false} tick={axis} width={32} />
                      <Tooltip contentStyle={tooltipStyle} /><Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </QueryView>
        </Card>
        <Card title="Village leaderboard — last 30 days" description="Green points per household and share of pickups sorted correctly.">
          <QueryView query={sorting} empty={{ title: 'No villages with households yet', when: (d) => d.board.length === 0 }}>
            {(d) => (
              <Table head={['#', 'Village', 'Cell / Sector', 'Households', 'Points / household', 'Sorted']}>
                {d.board.map((v: any, i: number) => (
                  <tr key={v.village_id}>
                    <td className="num">{i + 1}</td><td className="font-medium">{v.village}</td><td>{v.cell} · {v.sector}</td>
                    <td className="num">{v.households}</td><td className="num">{num(v.points_per_household, 1)}</td><td className="num">{pct(v.sorted_rate)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </QueryView>
          <p className="mt-2 text-xs text-muted-fg">Updated {date(new Date().toISOString())}</p>
        </Card>
      </div>
    </>
  );
}
