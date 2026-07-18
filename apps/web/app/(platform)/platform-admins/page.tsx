'use client';

import { useState } from 'react';
import { useSuperAdmins, useInviteSuperAdmin, usePromoteSuperAdmin } from '../../../lib/hooks/useSuperAdmins';
import { Table, Input, Button, Card, Modal, useToast, type Column } from '../../../components/ui';
import { SuperAdminSummary } from '../../../lib/types';

type PendingAction = { kind: 'invite' | 'promote'; email: string } | null;

export default function PlatformAdminsPage() {
  const { data: superAdmins, isLoading, isError } = useSuperAdmins();
  const inviteSuperAdmin = useInviteSuperAdmin();
  const promoteSuperAdmin = usePromoteSuperAdmin();
  const { toast } = useToast();

  const [inviteEmail, setInviteEmail] = useState('');
  const [promoteEmail, setPromoteEmail] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  function confirmPending() {
    if (!pending) return;
    setError(null);
    const mutation = pending.kind === 'invite' ? inviteSuperAdmin : promoteSuperAdmin;
    mutation.mutate(
      { email: pending.email },
      {
        onSuccess: () => {
          toast(`Granted super_admin access to ${pending.email}.`);
          if (pending.kind === 'invite') setInviteEmail('');
          else setPromoteEmail('');
          setPending(null);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Action failed');
          setPending(null);
        },
      },
    );
  }

  const columns: Column<SuperAdminSummary>[] = [
    { key: 'email', header: 'Email', render: (sa) => sa.email, sortValue: (sa) => sa.email },
    {
      key: 'createdAt',
      header: 'Created',
      render: (sa) => new Date(sa.createdAt).toLocaleDateString(),
      sortValue: (sa) => sa.createdAt,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-gray-900">Platform Admins</h1>

      <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Invite new admin</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPending({ kind: 'invite', email: inviteEmail });
            }}
            className="flex flex-col gap-3"
          >
            <Input label="Invite by email" type="email" value={inviteEmail} onChange={setInviteEmail} required />
            <Button type="submit">Invite</Button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Promote existing user</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPending({ kind: 'promote', email: promoteEmail });
            }}
            className="flex flex-col gap-3"
          >
            <Input label="Promote by email" type="email" value={promoteEmail} onChange={setPromoteEmail} required />
            <Button type="submit">Promote</Button>
          </form>
        </Card>
      </div>

      {error && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}

      {isLoading && <p className="text-sm text-gray-500">Loading platform admins…</p>}
      {isError && (
        <p role="alert" className="text-sm text-status-danger">
          Failed to load platform admins.
        </p>
      )}
      {!isLoading && !isError && (
        <Table columns={columns} rows={superAdmins ?? []} rowKey={(sa) => sa.id} emptyMessage="No platform admins yet." />
      )}

      <Modal open={pending !== null} title="Confirm" onClose={() => setPending(null)}>
        <p className="mb-4 text-sm text-gray-700">
          Grant super_admin access to {pending?.email}? This cannot be undone from this screen.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={confirmPending}
            loading={inviteSuperAdmin.isPending || promoteSuperAdmin.isPending}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </div>
  );
}
