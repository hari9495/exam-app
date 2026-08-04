'use client';

import { ReactNode, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UsersRound } from 'lucide-react';
import { StatusBadge, Select, Input, Button, Modal, useToast, FilterableHeader, type Column, type StatusTone } from './ui';
import { ListView } from '../app/(platform)/components/ListView';
import { RowActions, type RowAction } from '../app/(platform)/components/RowActions';
import { useAuth } from '../lib/auth-context';
import { useUpdateUser, useDeactivateUser, useReactivateUser, useResetUserPassword } from '../lib/hooks/useUsers';
import { useSsoStatus } from '../lib/hooks/useSso';
import { StaffUser } from '../lib/types';

// Lifted from users/page.tsx -- this component now owns them.
const ROLE_TONE: Record<string, StatusTone> = { org_admin: 'purple', recruiter: 'info', panel: 'neutral' };
const ROLE_LABEL: Record<string, string> = { org_admin: 'Org Admin', recruiter: 'Recruiter', panel: 'Interview Panel' };

// Radix's Select treats value="" as its internal "nothing selected" sentinel and renders the
// (unset) placeholder instead of the option's own label, no matter what text is passed as
// children -- the trigger showed only a bare chevron with "All roles"/"All statuses" invisible.
// Every other filter dropdown in the app already sidesteps this with a non-empty 'all' sentinel;
// these two just hadn't been written that way.
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
const EDIT_ROLE_OPTIONS = [
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'panel', label: 'Interview Panel' },
];

interface StaffUsersTableProps {
  users: StaffUser[];
  currentUserRole: string | null;
  isActingSuperAdmin: boolean;
  currentUserId: string;
  isLoading?: boolean;
  isError?: boolean;
  totalCount?: number;
  actions?: ReactNode;
}

// Mirrors the server matrix: an org_admin (or a super_admin acting on this org) may
// manage any staff member except a super_admin and except themselves.
function canManage(target: StaffUser, currentUserRole: string | null, isActingSuperAdmin: boolean, currentUserId: string): boolean {
  if (target.id === currentUserId) return false;
  if (target.role === 'super_admin') return false;
  return isActingSuperAdmin || currentUserRole === 'org_admin';
}

// A super_admin may log in as anyone but another super_admin; an org_admin may only
// log in as the roles they manage day to day (recruiter, panel) -- never another admin.
function canImpersonate(target: StaffUser, currentUserRole: string | null, isActingSuperAdmin: boolean, currentUserId: string): boolean {
  if (target.id === currentUserId) return false;
  if (target.role === 'super_admin') return false;
  if (isActingSuperAdmin) return true;
  return currentUserRole === 'org_admin' && (target.role === 'recruiter' || target.role === 'panel');
}

export function StaffUsersTable({
  users,
  currentUserRole,
  isActingSuperAdmin,
  currentUserId,
  isLoading,
  isError,
  totalCount,
  actions,
}: StaffUsersTableProps) {
  const { impersonate } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const updateUser = useUpdateUser();
  const deactivateUser = useDeactivateUser();
  const reactivateUser = useReactivateUser();
  const resetPassword = useResetUserPassword();
  // Staff on an SSO-enabled org sign in via the identity provider, not a password --
  // resetting one and emailing a set-password link would be dead UI (see NewUserModal
  // for the same reasoning on user creation).
  const { data: ssoStatus } = useSsoStatus();
  const ssoEnabled = ssoStatus?.enabled === true;

  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editName, setEditName] = useState('');

  // ListView holds no filter state -- it renders whatever rows it is given, and its
  // item count follows them. Filter here, before handing rows over.
  const rows = useMemo(
    () =>
      users.filter(
        (u) => (roleFilter === 'all' || u.role === roleFilter) && (statusFilter === 'all' || u.status === statusFilter),
      ),
    [users, roleFilter, statusFilter],
  );

  function openEdit(target: StaffUser) {
    setEditing(target);
    setEditRole(target.role);
    setEditName(target.name ?? '');
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    updateUser.mutate(
      { id: editing.id, role: editRole, name: editName },
      {
        onSuccess: () => {
          toast(`Updated ${editing.email}.`);
          setEditing(null);
        },
      },
    );
  }

  async function handleImpersonate(target: StaffUser) {
    if (!confirm(`Log in as ${target.email}? You will act as this user until you return.`)) return;
    await impersonate(target.id);
    // The token is now the target's role with actingSuperAdmin=false, but we're still on
    // /users (an (org-admin) route). Without navigating, that layout's guard ejects the
    // now-lower-privileged session to /login. Send them to the target role's own console.
    router.push(target.role === 'org_admin' ? '/users' : target.role === 'panel' ? '/reports' : '/dashboard');
  }

  function renderActions(u: StaffUser) {
    const manage = canManage(u, currentUserRole, isActingSuperAdmin, currentUserId);
    const rowActions: RowAction[] = manage
      ? [
          { label: 'Edit', onSelect: () => openEdit(u) },
          u.status === 'active'
            ? {
                label: 'Deactivate',
                danger: true,
                onSelect: () => deactivateUser.mutate(u.id, { onSuccess: () => toast(`Deactivated ${u.email}.`) }),
              }
            : { label: 'Reactivate', onSelect: () => reactivateUser.mutate(u.id, { onSuccess: () => toast(`Reactivated ${u.email}.`) }) },
          ...(ssoEnabled
            ? []
            : [
                {
                  label: 'Reset password',
                  onSelect: () =>
                    resetPassword.mutate(u.id, {
                      // The request can succeed (token created) while the email itself fails to
                      // send -- report which one actually happened instead of a blanket "sent"
                      // that hid real SMTP failures from the admin (ADO #6850).
                      onSuccess: (result: { emailSent?: boolean }) =>
                        result.emailSent === false
                          ? toast(`Reset link created for ${u.email}, but the email failed to send.`, 'error')
                          : toast(`Password reset email sent to ${u.email}.`),
                    }),
                },
              ]),
        ]
      : [];

    return (
      <div className="flex items-center justify-end gap-1.5">
        {canImpersonate(u, currentUserRole, isActingSuperAdmin, currentUserId) && (
          <Button size="sm" variant="secondary" onClick={() => handleImpersonate(u)}>
            Login as
          </Button>
        )}
        <RowActions label={`Actions for ${u.email}`} actions={rowActions} />
      </div>
    );
  }

  const columns: Column<StaffUser>[] = useMemo(
    () => [
      { key: 'name', header: 'Full Name', render: (u) => u.name ?? '—', sortValue: (u) => u.name ?? '' },
      { key: 'email', header: 'Email', render: (u) => u.email, sortValue: (u) => u.email },
      {
        key: 'role',
        header: <FilterableHeader label="Role" value={roleFilter} onChange={setRoleFilter} options={ROLE_FILTER_OPTIONS} />,
        sortLabel: 'Role',
        render: (u) => <StatusBadge tone={ROLE_TONE[u.role] ?? 'neutral'}>{ROLE_LABEL[u.role] ?? u.role}</StatusBadge>,
      },
      {
        key: 'status',
        header: <FilterableHeader label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />,
        sortLabel: 'Status',
        render: (u) => <StatusBadge tone={u.status === 'active' ? 'success' : 'neutral'}>{u.status}</StatusBadge>,
      },
      {
        key: 'lastLoginAt',
        header: 'Last Login',
        render: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'),
        sortValue: (u) => u.lastLoginAt ?? '',
      },
      { key: 'createdAt', header: 'Created', render: (u) => new Date(u.createdAt).toLocaleDateString(), sortValue: (u) => u.createdAt },
      { key: 'actions', header: '', render: renderActions },
    ],
    // renderActions closes over currentUserRole/isActingSuperAdmin/currentUserId/ssoEnabled
    // (the gating inputs) and the mutation objects, which are stable per render of this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUserRole, isActingSuperAdmin, currentUserId, ssoEnabled, roleFilter, statusFilter],
  );

  return (
    <>
      <ListView<StaffUser>
        title="Staff Users"
        icon={<UsersRound size={22} />}
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        searchMatch={(u, query) => u.email.toLowerCase().includes(query) || (u.name ?? '').toLowerCase().includes(query)}
        storageKey="staff-users"
        searchPlaceholder="Search staff users…"
        emptyMessage="No staff users yet."
        isLoading={isLoading}
        isError={isError}
        totalCount={totalCount}
        actions={actions}
      />

      {editing && (
        <Modal open title={`Edit ${editing.email}`} onClose={() => setEditing(null)}>
          <form onSubmit={submitEdit} className="flex flex-col gap-3">
            <Input label="Name" value={editName} onChange={setEditName} />
            <Select label="Role" value={editRole} onChange={setEditRole} options={EDIT_ROLE_OPTIONS} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={updateUser.isPending}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
