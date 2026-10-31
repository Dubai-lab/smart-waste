import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_LABELS, type UserRole } from '@sw/shared';
import { supabase, q } from '../lib/supabase';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, QueryView, Select, Table } from '../components/ui';

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

export default function UsersPage() {
  const qc = useQueryClient();
  const { profile: me } = useAuth();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [creating, setCreating] = useState(false);
  const users = useQuery({ queryKey: ['profiles'], queryFn: () => q(supabase.from('profiles').select('*').order('created_at', { ascending: false })) });

  const update = useMutation({
    mutationFn: ({ id, row }: { id: string; row: Record<string, unknown> }) => q(supabase.from('profiles').update(row).eq('id', id).select()),
    onSuccess: () => { toast.success('User updated'); void qc.invalidateQueries({ queryKey: ['profiles'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => (users.data ?? []).filter((u: any) =>
    (!role || u.role === role) && (!search || [u.full_name, u.email, u.phone].some((v: string | null) => v?.toLowerCase().includes(search.toLowerCase())))), [users.data, role, search]);

  return (
    <>
      <PageHeader title="Users & roles" description="Residents and recyclers sign up themselves. Create staff accounts (crew, manager, officer) here and share the temporary password with them."
        actions={<Button icon={UserPlus} onClick={() => setCreating(true)}>Create staff account</Button>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search">{(id) => (
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" aria-hidden />
            <Input id={id} value={search} onChange={(e) => setSearch(e.target.value)} className="w-72 pl-9" placeholder="Name, email or phone" /></div>
        )}</Field>
        <Field label="Role">{(id) => (
          <Select id={id} value={role} onChange={(e) => setRole(e.target.value)} className="w-56">
            <option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        )}</Field>
      </div>
      <Card>
        <QueryView query={users} empty={{ title: 'No users match', when: () => rows.length === 0 }}>
          {() => (
            <Table head={['Name', 'Contact', 'Role', 'Officer sector', 'Consent', 'Joined']}>
              {rows.map((u: any) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.full_name || '—'}{u.id === me?.id && <span className="ml-1 text-xs text-muted-fg">(you)</span>}</td>
                  <td><p>{u.email}</p><p className="text-xs text-muted-fg">{u.phone ?? ''}</p></td>
                  <td>
                    <Select aria-label={`Role for ${u.email}`} value={u.role} disabled={u.id === me?.id} className="w-52"
                      onChange={(e) => update.mutate({ id: u.id, row: { role: e.target.value } })}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </Select>
                  </td>
                  <td>{u.role === 'officer'
                    ? <Input aria-label="Officer sector" defaultValue={u.officer_sector ?? ''} placeholder="All sectors" className="w-36"
                        onBlur={(e) => e.target.value !== (u.officer_sector ?? '') && update.mutate({ id: u.id, row: { officer_sector: e.target.value || null } })} />
                    : '—'}</td>
                  <td>{u.consent_at ? <Badge tone="success">Given</Badge> : <Badge tone="warning">Pending</Badge>}</td>
                  <td className="num">{dateTime(u.created_at)}</td>
                </tr>
              ))}
            </Table>
          )}
        </QueryView>
      </Card>
      {creating && <CreateUser onClose={() => setCreating(false)} onDone={() => qc.invalidateQueries({ queryKey: ['profiles'] })} />}
    </>
  );
}

function CreateUser({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<UserRole>('crew');
  const [result, setResult] = useState<{ email: string; temporary_password: string } | null>(null);
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ email: string; temporary_password: string }>('/admin/users', { body }),
    onSuccess: (r) => { setResult(r); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal open onClose={onClose} title="Create staff account"
      footer={result ? <Button onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="user-form" loading={create.isPending}>Create</Button></>}>
      {result ? (
        <div className="space-y-3">
          <p>Account created for <strong>{result.email}</strong>. Share this temporary password privately — it is shown only once.</p>
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
            <code className="num flex-1 text-lg">{result.temporary_password}</code>
            <Button variant="secondary" icon={Copy} onClick={() => { void navigator.clipboard.writeText(result.temporary_password); toast.success('Copied'); }}>Copy</Button>
          </div>
          <p className="text-xs text-muted-fg">Ask the user to change it from the mobile app profile after first sign-in.</p>
        </div>
      ) : (
        <form id="user-form" className="space-y-3" onSubmit={(e) => {
          e.preventDefault(); const f = new FormData(e.currentTarget);
          create.mutate({ email: f.get('email'), full_name: f.get('full_name'), phone: f.get('phone') || undefined, role, officer_sector: f.get('officer_sector') || undefined });
        }}>
          <Field label="Full name" required>{(id) => <Input id={id} name="full_name" required minLength={2} />}</Field>
          <Field label="Email" required>{(id) => <Input id={id} name="email" type="email" required />}</Field>
          <Field label="Phone">{(id) => <Input id={id} name="phone" type="tel" />}</Field>
          <Field label="Role">{(id) => (
            <Select id={id} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          )}</Field>
          {role === 'officer' && <Field label="Sector" hint="Leave empty for all sectors">{(id, d) => <Input id={id} name="officer_sector" aria-describedby={d} placeholder="e.g. Remera" />}</Field>}
        </form>
      )}
    </Modal>
  );
}
