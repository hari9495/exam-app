'use client';

// v2 Staff Users — format-only re-skin of the old (org-admin)/users page (which was a thin wrapper
// over StaffUsersTable + NewUserModal). Same hooks (useUsers/useCurrentUser/useUpdateUser/
// useDeactivateUser/useReactivateUser/useResetUserPassword/useCreateUser/useBulkCreateUsers/
// useSsoStatus/useSsoSettings) and identical logic (client-side search/filter/sort over a 200-row
// page, role + status header filters, Edit/Deactivate/Reactivate/Reset password, Login as +
// impersonate). Old table/ListView → shared DataTable; old Modal forms → v2 Dialog; toast → notice.
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Power, KeyRound, ListFilter, Check, LogIn, Plus } from 'lucide-react';
import { useUsers, useUpdateUser, useDeactivateUser, useReactivateUser, useResetUserPassword, useCreateUser, useBulkCreateUsers } from '../../../../lib/hooks/useUsers';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { useSsoStatus, useSsoSettings } from '../../../../lib/hooks/useSso';
import { useAuth } from '../../../../lib/auth-context';
import type { StaffUser } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Cb, Dropdown, DropdownItem, Dialog, TextField, Combobox, Button } from '../../../../components/ui-v2';
import { VIZ, STATUS } from '../../../../components/ui-v2/viz';

const ROLE_COLOR: Record<string, string> = { org_admin: VIZ.violet, recruiter: VIZ.azure, panel: 'var(--muted)', super_admin: VIZ.amber };
const ROLE_LABEL: Record<string, string> = { org_admin: 'Org Admin', recruiter: 'Recruiter', panel: 'Interview Panel', super_admin: 'Super Admin' };
const ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'All roles' },
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'panel', label: 'Interview Panel' },
];
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'deactivated', label: 'Deactivated' },
];
const ROLE_OPTIONS = [
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'panel', label: 'Interview Panel' },
];

// Mirrors the server matrix: an org_admin (or a super_admin acting on this org) may
// manage any staff member except a super_admin and except themselves.
function canManage(target: StaffUser, currentUserRole: string | null, isActingSuperAdmin: boolean, currentUserId: string): boolean {
  if (target.id === currentUserId) return false;
  if (target.role === 'super_admin') return false;
  return isActingSuperAdmin || currentUserRole === 'org_admin';
}
// A super_admin may log in as anyone but another super_admin; an org_admin may only log in as the
// roles they manage day to day (recruiter, panel) -- never another admin.
function canImpersonate(target: StaffUser, currentUserRole: string | null, isActingSuperAdmin: boolean, currentUserId: string): boolean {
  if (target.id === currentUserId) return false;
  if (target.role === 'super_admin') return false;
  if (isActingSuperAdmin) return true;
  return currentUserRole === 'org_admin' && (target.role === 'recruiter' || target.role === 'panel');
}

type Notify = (type: 'success' | 'error', text: string) => void;

// New-user dialog (Single / Multiple tabs) — inlined re-skin of NewUserModal. Same hooks and flow.
function NewUserDialog({ onClose, notify }: { onClose: () => void; notify: Notify }) {
  const createUser = useCreateUser();
  const bulkCreateUsers = useBulkCreateUsers();
  const { data: ssoSettings } = useSsoSettings();
  const ssoEnabled = ssoSettings?.samlEnabled === true;

  const [tab, setTab] = useState('single');
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('recruiter');
  const [sendLink, setSendLink] = useState(false);
  const [emailsText, setEmailsText] = useState('');
  const [bulkRole, setBulkRole] = useState('recruiter');

  function submitSingle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError('Enter an email address.'); return; }
    const onError = (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to add user');
    if (ssoEnabled) {
      createUser.mutate({ email, name: name.trim() || undefined, role }, { onSuccess: () => { notify('success', `Added ${email} as ${role}.`); onClose(); }, onError });
      return;
    }
    if (sendLink) {
      bulkCreateUsers.mutate({ emails: [email], role }, { onSuccess: () => { notify('success', `Sent a set-password link to ${email}.`); onClose(); }, onError });
      return;
    }
    createUser.mutate({ email, name: name.trim() || undefined, password, role }, { onSuccess: () => { notify('success', `Added ${email} as ${role}.`); onClose(); }, onError });
  }

  function submitBulk(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const emails = emailsText.split('\n').map((line) => line.trim()).filter(Boolean);
    if (emails.length === 0) { setError('Enter at least one email.'); return; }
    bulkCreateUsers.mutate({ emails, role: bulkRole }, {
      onSuccess: (result: { created: unknown[]; skipped: unknown[] }) => { notify('success', `Created ${result.created.length} user(s), skipped ${result.skipped.length}.`); onClose(); },
      onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to create users'),
    });
  }

  return (
    <Dialog open onClose={onClose} title="New user" width={480}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', gap: 2, borderBottom: '1px solid color-mix(in srgb, var(--ink) 13%, var(--hair))', width: '100%' }}>
          {[{ value: 'single', label: 'Single' }, { value: 'multiple', label: 'Multiple' }].map((t) => {
            const active = t.value === tab;
            return (
              <button key={t.value} type="button" onClick={() => { setTab(t.value); setError(null); }} style={{ padding: '9px 14px', fontSize: 13, fontWeight: active ? 600 : 500, color: active ? 'var(--ink)' : 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderBottom: `2px solid ${active ? 'var(--org-primary)' : 'transparent'}`, marginBottom: -1 }}>{t.label}</button>
            );
          })}
        </div>
      </div>

      {tab === 'single' ? (
        <form onSubmit={submitSingle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TextField id="nu-name" label="Name" value={name} onChange={setName} autoComplete="off" />
            <TextField id="nu-email" label="Email" type="email" value={email} onChange={setEmail} required autoComplete="off" />
            <div><label className="v2-label">Role</label><Combobox options={ROLE_OPTIONS} value={role} onChange={setRole} width="100%" /></div>
            {ssoEnabled ? (
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Single sign-on is enabled for this organization. New users sign in with your identity provider — no password is needed.</p>
            ) : (
              <>
                {!sendLink && <TextField id="nu-password" label="Password" type="password" value={password} onChange={setPassword} required autoComplete="new-password" />}
                <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
                  <Cb checked={sendLink} onChange={setSendLink} /> Send set-password link instead
                </label>
              </>
            )}
          </div>
          {error && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
            <Button type="submit" loading={createUser.isPending || bulkCreateUsers.isPending}>Add user</Button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitBulk}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="nu-emails" className="v2-label">Emails (one per line)</label>
              <textarea id="nu-emails" value={emailsText} onChange={(e) => setEmailsText(e.target.value)} rows={6} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
            </div>
            <div><label className="v2-label">Role</label><Combobox options={ROLE_OPTIONS} value={bulkRole} onChange={setBulkRole} width="100%" /></div>
            {ssoEnabled && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Single sign-on is enabled — these users won&apos;t receive a set-password email; they sign in with your identity provider.</p>}
          </div>
          {error && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
            <Button type="submit" loading={bulkCreateUsers.isPending}>Add users</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export default function V2UsersPage() {
  const { role, actingSuperAdmin, impersonate } = useAuth();
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id ?? '';
  // ListView sorted/filtered client-side, so a paginated slice would only ever sort/filter the
  // visible page. Fetch one large page instead (same as the old page).
  const { data: usersResponse, isLoading, isError } = useUsers({ pageSize: 200 });
  const { data: ssoStatus } = useSsoStatus();
  const ssoEnabled = ssoStatus?.enabled === true;

  const updateUser = useUpdateUser();
  const deactivateUser = useDeactivateUser();
  const reactivateUser = useReactivateUser();
  const resetPassword = useResetUserPassword();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editName, setEditName] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify: Notify = (type, text) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => (usersResponse?.data ?? []).filter((u) =>
    (roleFilter === 'all' || u.role === roleFilter) &&
    (statusFilter === 'all' || u.status === statusFilter) &&
    (!q || u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q))
  ), [usersResponse, roleFilter, statusFilter, q]);

  function openEdit(target: StaffUser) { setEditing(target); setEditRole(target.role); setEditName(target.name ?? ''); }
  function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    updateUser.mutate({ id: editing.id, role: editRole, name: editName }, { onSuccess: () => { notify('success', `Updated ${editing.email}.`); setEditing(null); } });
  }
  async function handleImpersonate(target: StaffUser) {
    if (!confirm(`Log in as ${target.email}? You will act as this user until you return.`)) return;
    await impersonate(target.id);
    router.push(target.role === 'org_admin' ? '/users' : target.role === 'panel' ? '/reports' : '/dashboard');
  }

  const columns: ColumnDef<typeof DT_FEATURES, StaffUser>[] = [
    { accessorKey: 'name', enableHiding: false, header: ({ column }) => <SortHead label="Full name" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{row.original.name ?? '—'}</span> },
    { accessorKey: 'email', header: ({ column }) => <SortHead label="Email" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.email}</span> },
    {
      accessorKey: 'role', enableSorting: false,
      header: () => (
        <Dropdown align="start" menuWidth={160} trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: roleFilter !== 'all' ? 'var(--org-primary)' : 'var(--muted)' }}>Role <ListFilter size={12} style={{ opacity: 0.75 }} /></span>}>
          {(close) => ROLE_FILTER_OPTIONS.map((o) => (
            <DropdownItem key={o.value} onClick={() => { close(); setRoleFilter(o.value); }}><span style={{ width: 15, display: 'inline-flex', flexShrink: 0, color: 'var(--org-primary)' }}>{roleFilter === o.value && <Check size={15} />}</span>{o.label}</DropdownItem>
          ))}
        </Dropdown>
      ),
      cell: ({ row }) => <Pill c={ROLE_COLOR[row.original.role] ?? 'var(--muted)'} label={ROLE_LABEL[row.original.role] ?? row.original.role} />,
    },
    {
      accessorKey: 'status', enableSorting: false,
      header: () => (
        <Dropdown align="start" menuWidth={160} trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: statusFilter !== 'all' ? 'var(--org-primary)' : 'var(--muted)' }}>Status <ListFilter size={12} style={{ opacity: 0.75 }} /></span>}>
          {(close) => STATUS_FILTER_OPTIONS.map((o) => (
            <DropdownItem key={o.value} onClick={() => { close(); setStatusFilter(o.value); }}><span style={{ width: 15, display: 'inline-flex', flexShrink: 0, color: 'var(--org-primary)' }}>{statusFilter === o.value && <Check size={15} />}</span>{o.label}</DropdownItem>
          ))}
        </Dropdown>
      ),
      cell: ({ row }) => <Pill c={row.original.status === 'active' ? STATUS.ok : 'var(--muted)'} label={row.original.status === 'active' ? 'Active' : 'Deactivated'} />,
    },
    { accessorKey: 'lastLoginAt', header: ({ column }) => <SortHead label="Last login" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.lastLoginAt ? new Date(row.original.lastLoginAt).toLocaleString() : 'Never'}</span> },
    { accessorKey: 'createdAt', header: ({ column }) => <SortHead label="Created" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.createdAt).toLocaleDateString()}</span> },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => {
        const u = row.original;
        const manage = canManage(u, role, actingSuperAdmin, currentUserId);
        const impersonatable = canImpersonate(u, role, actingSuperAdmin, currentUserId);
        if (!manage && !impersonatable) return null;
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            {impersonatable && <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => handleImpersonate(u)}><LogIn size={14} /> Login as</button>}
            {manage && (
              <Dropdown align="end" menuWidth={180} trigger={<span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, color: 'var(--muted)', cursor: 'pointer' }}><MoreHorizontal size={17} /></span>}>
                {(close) => (<>
                  <DropdownItem onClick={() => { close(); openEdit(u); }}><Pencil size={15} /> Edit</DropdownItem>
                  {u.status === 'active'
                    ? <DropdownItem danger onClick={() => { close(); deactivateUser.mutate(u.id, { onSuccess: () => notify('success', `Deactivated ${u.email}.`) }); }}><Power size={15} /> Deactivate</DropdownItem>
                    : <DropdownItem onClick={() => { close(); reactivateUser.mutate(u.id, { onSuccess: () => notify('success', `Reactivated ${u.email}.`) }); }}><Power size={15} /> Reactivate</DropdownItem>}
                  {!ssoEnabled && (
                    <DropdownItem onClick={() => { close(); resetPassword.mutate(u.id, { onSuccess: (result: { emailSent?: boolean }) => result.emailSent === false ? notify('error', `Reset link created for ${u.email}, but the email failed to send.`) : notify('success', `Password reset email sent to ${u.email}.`) }); }}><KeyRound size={15} /> Reset password</DropdownItem>
                  )}
                </>)}
              </Dropdown>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Staff Users</h1>
        <Button onClick={() => setShowNew(true)}><Plus size={15} /> New user</Button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <DataTable
        columns={columns} data={rows} getRowId={(u) => u.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search staff users…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load staff users." emptyMessage={q || roleFilter !== 'all' || statusFilter !== 'all' ? 'No matching staff users.' : 'No staff users yet.'}
        columnLabels={{ name: 'Full name', email: 'Email', role: 'Role', status: 'Status', lastLoginAt: 'Last login', createdAt: 'Created' }}
      />

      {editing && (
        <Dialog open onClose={() => setEditing(null)} title={`Edit ${editing.email}`} width={440}>
          <form onSubmit={submitEdit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <TextField id="edit-name" label="Name" value={editName} onChange={setEditName} autoComplete="off" />
              <div><label className="v2-label">Role</label><Combobox options={ROLE_OPTIONS} value={editRole} onChange={setEditRole} width="100%" /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setEditing(null)} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
              <Button type="submit" loading={updateUser.isPending}>Save</Button>
            </div>
          </form>
        </Dialog>
      )}

      {showNew && <NewUserDialog onClose={() => setShowNew(false)} notify={notify} />}
    </>
  );
}
