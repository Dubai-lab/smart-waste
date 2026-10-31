import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, FileText, Gift, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, q } from '../lib/supabase';
import { date, dateTime, kigaliToday, label, money } from '../lib/format';
import { useRealtimeInvalidate } from '../hooks/useRealtime';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, QueryView, Stat, StatusBadge, Table, Tabs } from '../components/ui';

export default function BillingPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(kigaliToday().slice(0, 7));
  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
  const [cashFor, setCashFor] = useState<any | null>(null);

  const invKey = ['invoices', period];
  const invoices = useQuery({
    queryKey: invKey,
    queryFn: () => q(supabase.from('invoices').select('*, households(label, phone, profiles:owner_id(full_name, phone))').eq('period', period).order('status').order('created_at')),
  });
  const payments = useQuery({
    queryKey: ['payments', period],
    queryFn: () => q(supabase.from('payments').select('*, invoices!inner(period), households(label)').eq('invoices.period', period).order('created_at', { ascending: false })),
  });
  useRealtimeInvalidate(['invoices', 'payments'], [invKey, ['payments', period]]);

  const generate = useMutation({
    mutationFn: () => q(supabase.rpc('generate_invoices', { p_period: period })),
    onSuccess: (n) => { toast.success(`${n} new bills created for ${period}. Residents are notified.`); void qc.invalidateQueries({ queryKey: invKey }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = invoices.data ?? [];
  const sum = (f: (r: any) => number) => rows.reduce((s: number, r: any) => s + f(r), 0);

  return (
    <>
      <PageHeader title="Billing" description="Monthly bills are created automatically on the 1st. Green points reduce the bill (up to the limit set by the administrator). Mobile Money runs in sandbox (test) mode."
        actions={<Button icon={FileText} loading={generate.isPending} onClick={() => generate.mutate()}>Generate bills for {period}</Button>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Month">{(id) => <Input id={id} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" />}</Field>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat index={0} icon={Receipt} label="Billed" value={sum((r) => r.amount)} format={(n) => money(Math.round(n))} hint={`${rows.length} bills`} />
        <Stat index={1} icon={Gift} tone="success" label="Green-point discounts" value={sum((r) => r.discount)} format={(n) => money(Math.round(n))} />
        <Stat index={2} icon={Wallet} tone="accent" label="Collected" value={sum((r) => (r.status === 'paid' ? r.amount_due : 0))} format={(n) => money(Math.round(n))} hint={`${rows.filter((r: any) => r.status === 'paid').length} paid`} />
        <Stat index={3} icon={Banknote} tone="danger" label="Outstanding" value={sum((r) => (r.status !== 'paid' && r.status !== 'waived' ? r.amount_due : 0))} format={(n) => money(Math.round(n))} />
      </div>
      <Card>
        <div className="mb-3"><Tabs value={tab} onChange={setTab} options={[{ value: 'invoices', label: 'Bills', count: rows.length }, { value: 'payments', label: 'Payments', count: payments.data?.length }]} /></div>
        {tab === 'invoices' ? (
          <QueryView query={invoices} empty={{ title: `No bills for ${period}`, text: 'Generate them with the button above, or wait for the automatic run on the 1st.' }}>
            {(list) => (
              <Table head={['Household', 'Fee', 'Points used', 'Discount', 'Amount due', 'Due', 'Status', '']}>
                {list.map((i: any) => (
                  <tr key={i.id}>
                    <td><p className="font-medium">{i.households?.label}</p><p className="text-xs text-muted-fg">{i.households?.profiles?.full_name ?? i.households?.phone ?? ''}</p></td>
                    <td className="num">{money(i.amount)}</td>
                    <td className="num">{i.points_used}</td>
                    <td className="num text-success">{i.discount ? `−${money(i.discount)}` : '—'}</td>
                    <td className="num font-semibold">{money(i.amount_due)}</td>
                    <td className="num">{date(i.due_date)}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td>{i.status !== 'paid' && i.status !== 'waived' && <Button variant="secondary" onClick={() => setCashFor(i)}>Record cash</Button>}</td>
                  </tr>
                ))}
              </Table>
            )}
          </QueryView>
        ) : (
          <QueryView query={payments} empty={{ title: 'No payments yet for this month' }}>
            {(list) => (
              <Table head={['Date', 'Household', 'Amount', 'Method', 'Phone', 'Receipt', 'Status']}>
                {list.map((p: any) => (
                  <tr key={p.id}>
                    <td className="num">{dateTime(p.created_at)}</td>
                    <td>{p.households?.label}</td>
                    <td className="num">{money(p.amount)}</td>
                    <td>{p.provider === 'mtn_momo' ? <Badge tone="info" icon={false}>MoMo sandbox</Badge> : label(p.provider)} <span className="text-xs text-muted-fg">· {p.channel}</span></td>
                    <td className="num">{p.payer_phone}</td>
                    <td className="num">{p.receipt_no ?? '—'}</td>
                    <td><StatusBadge status={p.status} />{p.failure_reason && <p className="text-xs text-danger">{p.failure_reason}</p>}</td>
                  </tr>
                ))}
              </Table>
            )}
          </QueryView>
        )}
      </Card>
      {cashFor && <CashModal invoice={cashFor} onClose={() => setCashFor(null)} onDone={() => qc.invalidateQueries({ queryKey: invKey })} />}
    </>
  );
}

function CashModal({ invoice, onClose, onDone }: { invoice: any; onClose: () => void; onDone: () => void }) {
  const [phone, setPhone] = useState(invoice.households?.profiles?.phone ?? invoice.households?.phone ?? '');
  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      return q(supabase.from('payments').insert({
        invoice_id: invoice.id, household_id: invoice.household_id, amount: invoice.amount_due, provider: 'cash',
        payer_phone: phone || 'cash', status: 'successful', initiated_by: u.user?.id, channel: 'web',
      }).select());
    },
    onSuccess: () => { toast.success('Payment recorded. A receipt was issued and the resident notified.'); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal open onClose={onClose} title="Record cash payment"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Record {money(invoice.amount_due)}</Button></>}>
      <p className="mb-3">{invoice.households?.label} · bill {invoice.period}</p>
      <Field label="Payer phone (optional)">{(id) => <Input id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
    </Modal>
  );
}
