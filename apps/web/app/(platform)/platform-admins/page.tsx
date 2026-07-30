'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSuperAdmins, useInviteSuperAdmin, usePromoteSuperAdmin } from '../../../lib/hooks/useSuperAdmins';
import { Input, Button, Modal, useToast, type Column } from '../../../components/ui';
import { SuperAdminSummary } from '../../../lib/types';
import { ListView } from '../components/ListView';

// Matches the server's MAX_PAGE_SIZE; see the note in useOrganizations.
const SUPER_ADMIN_PAGE_SIZE = 100;

type GrantKind = 'invite' | 'promote';

export default function PlatformAdminsPage() {
  const { data, isLoading, isError } = useSuperAdmins({ pageSize: SUPER_ADMIN_PAGE_SIZE });
  const inviteSuperAdmin = useInviteSuperAdmin();
  const promoteSuperAdmin = usePromoteSuperAdmin();
  const { toast } = useToast();

  // One modal serves both grants: the form is the same single field, and only
  // the mutation differs. The confirm step is preserved from the old page --
  // granting super_admin cannot be undone from this screen.
  const [openForm, setOpenForm] = useState<GrantKind | null>(null);
  const [email, setEmail] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const superAdmins = useMemo(() => data?.data ?? [], [data]);

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
        onSuccess: () => {
          toast(`Granted super_admin access to ${email}.`);
          closeAll();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Action failed');
          setConfirming(false);
        },
      },
    );
  }

  const columns: Column<SuperAdminSummary>[] = useMemo(
    () => [
      { key: 'email', header: 'Email', render: (sa) => <span className="font-medium text-gray-900">{sa.email}</span>, sortValue: (sa) => sa.email },
      { key: 'created', header: 'Created', render: (sa) => new Date(sa.createdAt).toLocaleDateString(), sortValue: (sa) => sa.createdAt },
    ],
    [],
  );

  return (
    <>
      <ListView<SuperAdminSummary>
        title="Platform Admins"
        icon={<ShieldCheck size={22} />}
        columns={columns}
        rows={superAdmins}
        rowKey={(sa) => sa.id}
        searchMatch={(sa, query) => sa.email.toLowerCase().includes(query)}
        storageKey="platform-admins"
        searchPlaceholder="Search platform admins…"
        emptyMessage="No platform admins yet."
        isLoading={isLoading}
        isError={isError}
        totalCount={data?.total}
        actions={
          <>
            <Button onClick={() => setOpenForm('invite')}>Invite admin</Button>
            <Button variant="secondary" onClick={() => setOpenForm('promote')}>
              Promote user
            </Button>
          </>
        }
      />

      <Modal
        open={openForm !== null && !confirming}
        title={openForm === 'promote' ? 'Promote existing user' : 'Invite new admin'}
        onClose={closeAll}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setConfirming(true);
          }}
          className="flex flex-col gap-3"
        >
          <Input
            label={openForm === 'promote' ? 'Promote by email' : 'Invite by email'}
            type="email"
            value={email}
            onChange={setEmail}
            required
          />
          <Button type="submit">{openForm === 'promote' ? 'Promote' : 'Invite'}</Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {error}
          </p>
        )}
      </Modal>

      <Modal open={confirming} title="Confirm" onClose={() => setConfirming(false)}>
        <p className="mb-4 text-sm text-gray-700">
          Grant super_admin access to {email}? This cannot be undone from this screen.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmGrant} loading={inviteSuperAdmin.isPending || promoteSuperAdmin.isPending}>
            Confirm
          </Button>
        </div>
      </Modal>
    </>
  );
}
