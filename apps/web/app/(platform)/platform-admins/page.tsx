'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSuperAdmins, useInviteSuperAdmin, usePromoteSuperAdmin } from '../../../lib/hooks/useSuperAdmins';
import { CardGrid, Input, Button, Card, Modal, useToast, Pagination } from '../../../components/ui';
import { SuperAdminSummary } from '../../../lib/types';

type PendingAction = { kind: 'invite' | 'promote'; email: string } | null;

export default function PlatformAdminsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data: superAdminsResponse, isLoading, isError } = useSuperAdmins({ page, pageSize: 20, search: search || undefined });
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

  function renderCard(sa: SuperAdminSummary) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-gray-900">{sa.email}</p>
        <p className="shrink-0 text-xs text-gray-500">{new Date(sa.createdAt).toLocaleDateString()}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-gray-900">Platform Admins</h1>

      <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}
        >
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
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
        >
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
        </motion.div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}

      <Input
        label="Search platform admins"
        placeholder="Email…"
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />

      {isLoading && <p className="text-sm text-gray-500">Loading platform admins…</p>}
      {isError && (
        <p role="alert" className="text-sm text-status-danger">
          Failed to load platform admins.
        </p>
      )}
      {!isLoading && !isError && (
        <>
          <CardGrid items={superAdminsResponse?.data ?? []} cardKey={(sa) => sa.id} renderCard={renderCard} emptyMessage="No platform admins yet." />
          <Pagination page={superAdminsResponse?.page ?? 1} totalPages={superAdminsResponse?.totalPages ?? 1} onPageChange={setPage} />
        </>
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
