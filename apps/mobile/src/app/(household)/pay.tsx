import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Receipt, Smartphone, XCircle } from 'lucide-react-native';
import { phoneRw } from '@sw/shared';
import { api, supabase, q } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { useRealtimeInvalidate } from '../../lib/useRealtime';
import { dateTime, day, money } from '../../lib/format';
import { Badge, Button, Card, EmptyState, Field, QueryState, Row, Screen, Text } from '../../components/ui';
import { font, useColors } from '../../lib/theme';

export default function Pay() {
  const c = useColors();
  const t = useT();
  const qc = useQueryClient();
  const { profile, household } = useAuth();
  const [phone, setPhone] = useState(profile?.phone ? `0${profile.phone.slice(-9)}` : '');
  const [phoneErr, setPhoneErr] = useState<string>();
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ state: 'waiting' | 'successful' | 'failed'; text: string } | null>(null);

  const invoices = useQuery({ queryKey: ['invoices', household?.id], enabled: !!household, queryFn: () => q(supabase.from('invoices').select('*, payments(id, status, receipt_no, provider, created_at, failure_reason)').eq('household_id', household!.id).order('period', { ascending: false })) });
  useRealtimeInvalidate([{ table: 'invoices', filter: `household_id=eq.${household?.id}` }, { table: 'payments', filter: `household_id=eq.${household?.id}` }], [['invoices', household?.id]]);

  const start = useMutation({
    mutationFn: (invoiceId: string) => api<{ id: string }>('/payments/momo', { invoice_id: invoiceId, phone: phoneRw.parse(phone) }),
    onSuccess: (p) => { setPaymentId(p.id); setStatus({ state: 'waiting', text: 'Approve the payment on your phone (MoMo PIN)…' }); },
    onError: (e: Error) => setStatus({ state: 'failed', text: e.message }),
  });

  // poll MoMo until approved/declined (max ~2 minutes)
  useEffect(() => {
    if (!paymentId) return;
    let n = 0;
    const id = setInterval(async () => {
      n++;
      try {
        const p = await api<{ status: string; receipt_no: string | null; failure_reason: string | null }>(`/payments/${paymentId}`);
        if (p.status === 'successful') { setStatus({ state: 'successful', text: `Paid. Receipt ${p.receipt_no ?? ''}` }); setPaymentId(null); void qc.invalidateQueries({ queryKey: ['invoices', household?.id] }); }
        else if (p.status === 'failed') { setStatus({ state: 'failed', text: p.failure_reason ?? 'Payment was declined' }); setPaymentId(null); }
      } catch { /* keep polling */ }
      if (n > 30) { setPaymentId(null); setStatus({ state: 'failed', text: 'No answer from MoMo yet. Check again later — you will be notified.' }); }
    }, 4000);
    return () => clearInterval(id);
  }, [paymentId, qc, household?.id]);

  const unpaid = (invoices.data ?? []).filter((i: any) => i.status === 'unpaid' || i.status === 'pending');
  const history = (invoices.data ?? []).filter((i: any) => i.status === 'paid' || i.status === 'waived');

  return (
    <Screen refreshing={invoices.isRefetching} onRefresh={() => invoices.refetch()}>
      <Text variant="h1">{t('pay')}</Text>
      <Badge tone="warning" label="Test mode: MTN MoMo sandbox — no real money moves" />
      <QueryState query={invoices}>
        {() => (
          <>
            {unpaid.length === 0 && <EmptyState icon={CheckCircle2} title={t('allPaid')} text="Your next bill is created on the 1st of the month, with your green points discount." />}
            {unpaid.map((i: any, k: number) => (
              <Card key={i.id} index={k}>
                <Text variant="caption" muted>Bill {i.period} · due {day(i.due_date)}</Text>
                <Text variant="h1" style={{ fontFamily: font.mono }}>{money(i.amount_due)}</Text>
                {i.discount > 0 && <Text variant="small" color={c.success}>Green points saved you {money(i.discount)} ({i.points_used} {i.points_used === 1 ? 'point' : 'points'})</Text>}
                <Field label="MoMo number" value={phone} onChangeText={(v) => { setPhone(v); setPhoneErr(undefined); }} keyboardType="phone-pad" error={phoneErr} autoComplete="tel" />
                <Button title={t('payNow')} icon={Smartphone} loading={start.isPending || !!paymentId}
                  onPress={() => { if (!phoneRw.safeParse(phone).success) { setPhoneErr('Use a Rwandan number, e.g. 0788 123 456'); return; } setStatus(null); start.mutate(i.id); }} />
              </Card>
            ))}
            {status && (
              <Card>
                <Row>
                  {status.state === 'waiting' ? <Clock color={c.info} /> : status.state === 'successful' ? <CheckCircle2 color={c.success} /> : <XCircle color={c.danger} />}
                  <Text style={{ flex: 1 }} accessibilityLiveRegion="polite">{status.text}</Text>
                </Row>
              </Card>
            )}
            {history.length > 0 && <Text variant="title">Receipts</Text>}
            {history.map((i: any) => {
              const p = (i.payments ?? []).find((x: any) => x.status === 'successful');
              return (
                <Card key={i.id}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Row><Receipt size={20} color={c.mutedFg} /><View><Text variant="label">{i.period}</Text><Text variant="small" muted>{p ? `${p.receipt_no ?? ''} · ${dateTime(p.created_at)}` : i.status}</Text></View></Row>
                    <Text variant="label" style={{ fontFamily: font.mono }}>{money(i.amount_due)}</Text>
                  </Row>
                </Card>
              );
            })}
          </>
        )}
      </QueryState>
    </Screen>
  );
}
