import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase, q } from '../lib/supabase';
import { api } from '../lib/api';
import { label, pct } from '../lib/format';
import { Badge, Button, Card, Input, PageHeader, QueryView, Table } from '../components/ui';

export default function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => q(supabase.from('settings').select('*').order('key')) });
  const rules = useQuery({ queryKey: ['point-rules'], queryFn: () => q(supabase.from('point_rules').select('*').order('key')) });
  const models = useQuery({ queryKey: ['ml-models'], queryFn: () => q(supabase.from('ml_models').select('id, version, algorithm, metrics, trained_rows, active, created_at').eq('name', 'demand').order('created_at', { ascending: false })) });

  const saveSetting = useMutation({
    mutationFn: ({ key, raw }: { key: string; raw: string }) => {
      let value: unknown;
      try { value = JSON.parse(raw); } catch { value = raw; }
      return q(supabase.from('settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key).select());
    },
    onSuccess: () => { toast.success('Setting saved'); void qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveRule = useMutation({
    mutationFn: ({ key, row }: { key: string; row: Record<string, unknown> }) => q(supabase.from('point_rules').update(row).eq('key', key).select()),
    onSuccess: () => { toast.success('Rule saved'); void qc.invalidateQueries({ queryKey: ['point-rules'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const activate = useMutation({
    mutationFn: async (id: string) => {
      await q(supabase.from('ml_models').update({ active: false }).eq('name', 'demand').neq('id', id).select());
      await q(supabase.from('ml_models').update({ active: true }).eq('id', id).select());
      await api('/planning/models/reload', { body: {} }).catch(() => undefined);
    },
    onSuccess: () => { toast.success('Model activated for planning'); void qc.invalidateQueries({ queryKey: ['ml-models'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Settings" description="Fees, geofence, alerts, complaint deadlines, reward rules and the active prediction model." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="System settings">
          <QueryView query={settings}>
            {(list) => (
              <Table head={['Setting', 'Value']}>
                {list.map((s: any) => (
                  <tr key={s.key}>
                    <td><p className="font-medium">{label(s.key)}</p><p className="text-xs text-muted-fg">{s.description}</p></td>
                    <td><Input aria-label={s.key} defaultValue={JSON.stringify(s.value).replace(/^"|"$/g, '')} className="w-40"
                      onBlur={(e) => { const raw = /^-?\d+(\.\d+)?$/.test(e.target.value) ? e.target.value : JSON.stringify(e.target.value); if (raw !== JSON.stringify(s.value)) saveSetting.mutate({ key: s.key, raw }); }} /></td>
                  </tr>
                ))}
              </Table>
            )}
          </QueryView>
        </Card>
        <div className="space-y-4">
          <Card title="Green point rules" description="Points are converted to a fee discount on the next bill.">
            <QueryView query={rules}>
              {(list) => (
                <Table head={['Rule', 'Points', 'Active']}>
                  {list.map((r: any) => (
                    <tr key={r.key}>
                      <td><p className="font-medium">{label(r.key)}</p><p className="text-xs text-muted-fg">{r.description}</p></td>
                      <td><Input aria-label={`Points for ${r.key}`} type="number" defaultValue={r.points} className="w-24"
                        onBlur={(e) => Number(e.target.value) !== r.points && saveRule.mutate({ key: r.key, row: { points: Number(e.target.value) } })} /></td>
                      <td><input type="checkbox" aria-label={`Activate ${r.key}`} className="size-5 cursor-pointer" defaultChecked={r.active} onChange={(e) => saveRule.mutate({ key: r.key, row: { active: e.target.checked } })} /></td>
                    </tr>
                  ))}
                </Table>
              )}
            </QueryView>
          </Card>
          <Card title="Demand prediction model">
            <QueryView query={models} empty={{ title: 'No trained model yet', text: 'Planning uses cold-start rules until a model is trained with ml/train_demand.py.' }}>
              {(list) => (
                <Table head={['Version', 'Algorithm', 'Test F1', 'ROC-AUC', '']}>
                  {list.map((m: any) => (
                    <tr key={m.id}>
                      <td className="num">{m.version}</td><td>{label(m.algorithm)}</td><td className="num">{pct(m.metrics?.f1)}</td><td className="num">{m.metrics?.roc_auc?.toFixed(3) ?? '—'}</td>
                      <td>{m.active ? <Badge tone="success">Active</Badge> : <Button variant="secondary" loading={activate.isPending} onClick={() => activate.mutate(m.id)}>Activate</Button>}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </QueryView>
          </Card>
        </div>
      </div>
    </>
  );
}
