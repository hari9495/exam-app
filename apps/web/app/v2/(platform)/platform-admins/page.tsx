'use client';

// v2 Platform Admins (super-admin) — format-only re-skin of the old (platform)/platform-admins page
// (ListView + two Modals). Same hooks (useSuperAdmins pageSize 100, useInviteSuperAdmin,
// usePromoteSuperAdmin) and identical logic: one form serves both grants (invite vs promote), then a
// second confirm step (granting super_admin cannot be undone). Old ListView → shared DataTable; old
// Modals → v2 Dialog; toast → inline notice.
import { useMemo, useState, type FormEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useSuperAdmins, useInviteSuperAdmin, usePromoteSuperAdmin } from '../../../../lib/hooks/useSuperAdmins';
import type { SuperAdminSummary } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, TextField, Dialog, Button } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

// Matches the server's MAX_PAGE_SIZE; see the note in useOrganizations.
const SUPER_ADMIN_PAGE_SIZE = 100;

type GrantKind = 'invite' | 'promote';

export default function V2PlatformAdminsPage() {
  const { data, isLoading, isError } = useSuperAdmins({ pageSize: SUPER_ADMIN_PAGE_SIZE });
  const inviteSuperAdmin = useInviteSuperAdmin();
  const promoteSuperAdmin = usePromoteSuperAdmin();

  const [openForm, setOpenForm] = useState<GrantKind | null>(null);
  const [email, setEmail] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => (data?.data ?? []).filter((sa) => !q || sa.email.toLowerCase().includes(q)), [data, q]);

  function closeAll() {
    setOpenForm(null);
    setConfirming(false);
    setEmail('');
    setError(null);
  }

  function confirmGrant() {
    if (!openForm) return;
    setError(null);
    const mutation = openForm === 'invite' ? inviteSuperAdmin : promoteSuperAdmin;
    mutation.mutate(
      { email },
      {
        onSuccess: () => { notify('success', `Granted super_admin access to ${email}.`); closeAll(); },
        onError: (err) => { setError(err instanceof Error ? err.message : 'Action failed'); setConfirming(false); },
      },
    );
  }

  const columns: ColumnDef<typeof DT_FEATURES, SuperAdminSummary>[] = [
    { accessorKey: 'email', enableHiding: false, header: ({ column }) => <SortHead label="Email" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{row.original.email}</span> },
    { accessorKey: 'createdAt', header: ({ column }) => <SortHead label="Created" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.createdAt).toLocaleDateString()}</span> },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Platform Admins</h1>
        <span style={{ display: 'inline-flex', gap: 10 }}>
          <Button onClick={() => setOpenForm('invite')}>Invite admin</Button>
          <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => setOpenForm('promote')}>Promote user</button>
        </span>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <DataTable
        columns={columns} data={rows} getRowId={(sa) => sa.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search platform admins…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load platform admins." emptyMessage={q ? 'No matching platform admins.' : 'No platform admins yet.'}
        columnLabels={{ email: 'Email', createdAt: 'Created' }}
      />

      {openForm !== null && !confirming && (
        <Dialog open onClose={closeAll} title={openForm === 'promote' ? 'Promote existing user' : 'Invite new admin'} width={440}>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); setConfirming(true); }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <TextField id="pa-email" label={openForm === 'promote' ? 'Promote by email' : 'Invite by email'} type="email" value={email} onChange={setEmail} required autoComplete="off" />
            </div>
            {error && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={closeAll} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
              <Button type="submit">{openForm === 'promote' ? 'Promote' : 'Invite'}</Button>
            </div>
          </form>
        </Dialog>
      )}

      {confirming && (
        <Dialog open onClose={() => setConfirming(false)} title="Confirm" width={440}>
          <p style={{ fontSize: 13, color: 'var(--ink)', margin: '0 0 16px' }}>
            Grant super_admin access to {email}? This cannot be undone from this screen.
          </p>
          {error && <p role="alert" style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={() => setConfirming(false)} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
            <Button onClick={confirmGrant} loading={inviteSuperAdmin.isPending || promoteSuperAdmin.isPending}>Confirm</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
