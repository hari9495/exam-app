'use client';

// v2 Organizations (super-admin) — format-only re-skin of the old (platform)/organizations page
// (ListView + RowActions + three modals). Same hooks (useOrganizations, useSetOrganizationStatus,
// useCreateOrganization, useUpdateOrganization, useDeleteOrganization, usePlans, useAssignPlan,
// useAuth.switchIntoOrg) and identical logic: switch-into / edit / suspend-reactivate / view-users /
// delete (slug-typed confirm), plus per-org plan assignment in the edit dialog. Old ListView →
// shared DataTable; RowActions kebab → v2 Dropdown; three Modals → inlined v2 Dialogs; toast →
// inline notice; old Select → v2 Combobox.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, LogIn, Pencil, Power, Users as UsersIcon, Trash2, Plus, Building2, CircleCheck, CirclePause } from 'lucide-react';
import {
  useOrganizations, useSetOrganizationStatus, useCreateOrganization, useUpdateOrganization, useDeleteOrganization,
} from '../../../../lib/hooks/useOrganizations';
import { usePlans, useAssignPlan } from '../../../../lib/hooks/usePlans';
import { useAuth } from '../../../../lib/auth-context';
import type { Organization } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Dropdown, DropdownItem, TextField, Combobox, Dialog, Button, IconStatCard } from '../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../components/ui-v2/viz';

const REGION_OPTIONS = [
  { value: 'us', label: 'US' },
  { value: 'eu', label: 'EU' },
];

type Notify = (type: 'success' | 'error', text: string) => void;

// New-organization dialog — inlined re-skin of CreateOrganizationModal. Same hook and flow; stays open
// on failure (a slug clash is the common case) so the operator keeps what they typed.
function CreateOrgDialog({ onClose, notify }: { onClose: () => void; notify: Notify }) {
  const createOrganization = useCreateOrganization();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [region, setRegion] = useState('us');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createOrganization.mutate(
      { name, slug, region, adminEmail, adminName },
      {
        onSuccess: () => { notify('success', `Created ${name}. A setup email was sent to ${adminEmail}.`); onClose(); },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create organization'),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title="New Organization" width={480}>
      <form onSubmit={handleSubmit}>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 14px' }}>All fields are required.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextField id="org-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
          <TextField id="org-slug" label="Slug" value={slug} onChange={setSlug} required autoComplete="off" />
          <div><label className="v2-label">Region</label><Combobox options={REGION_OPTIONS} value={region} onChange={setRegion} width="100%" /></div>
          <TextField id="org-admin-name" label="Admin Name" value={adminName} onChange={setAdminName} required autoComplete="off" />
          <TextField id="org-admin-email" label="Admin Email" type="email" value={adminEmail} onChange={setAdminEmail} required autoComplete="off" />
        </div>
        {error && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
          <Button type="submit" loading={createOrganization.isPending}>Create organization</Button>
        </div>
      </form>
    </Dialog>
  );
}

// Edit dialog — inlined re-skin of EditOrganizationModal. Same hooks: update (name/region only; slug is
// immutable) plus a separate plan-assignment action. Fields re-seed per organization.
function EditOrgDialog({ organization, onClose, notify }: { organization: Organization; onClose: () => void; notify: Notify }) {
  const updateOrganization = useUpdateOrganization();
  const { data: plans } = usePlans();
  const assignPlan = useAssignPlan();
  const [name, setName] = useState(organization.name);
  const [region, setRegion] = useState(organization.region);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState('');
  const [planError, setPlanError] = useState<string | null>(null);

  // The organizations list doesn't carry the org's current plan, so it starts blank.
  useEffect(() => {
    setName(organization.name);
    setRegion(organization.region);
    setError(null);
    setPlanId('');
    setPlanError(null);
  }, [organization]);

  const planOptions = useMemo(
    () => (Array.isArray(plans) ? plans : []).map((plan) => ({ value: plan.id, label: plan.name })),
    [plans],
  );

  function handleAssignPlan() {
    if (!planId) return;
    setPlanError(null);
    assignPlan.mutate(
      { id: organization.id, planId },
      {
        onSuccess: () => notify('success', `Assigned plan to ${organization.name}.`),
        onError: (err) => setPlanError(err instanceof Error ? err.message : 'Failed to assign plan'),
      },
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    updateOrganization.mutate(
      { id: organization.id, name, region },
      {
        onSuccess: () => { notify('success', `Updated ${name}.`); onClose(); },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update organization'),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title="Edit Organization" width={480}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextField id="edit-org-name" label="Name" value={name} onChange={setName} required autoComplete="off" />
          <div style={{ fontSize: 13 }}>
            <span className="v2-label">Slug</span>
            <span style={{ color: 'var(--ink)' }}>{organization.slug}</span>
            <p style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>The slug cannot be changed — it appears in invitation links and SSO configuration.</p>
          </div>
          <div><label className="v2-label">Region</label><Combobox options={REGION_OPTIONS} value={region} onChange={setRegion} width="100%" /></div>
        </div>
        {error && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
          <Button type="submit" loading={updateOrganization.isPending}>Save</Button>
        </div>
      </form>

      <div style={{ marginTop: 20, borderTop: '1px solid var(--hair)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label className="v2-label">Plan</label><Combobox options={planOptions} value={planId} onChange={setPlanId} placeholder="Select" width="100%" /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="v2-hoverbtn" style={{ ...dt.toolBtn, opacity: !planId || assignPlan.isPending ? 0.6 : 1, cursor: !planId ? 'not-allowed' : 'pointer' }} disabled={!planId || assignPlan.isPending} onClick={handleAssignPlan}>Assign plan</button>
        </div>
        {planError && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)' }}>{planError}</p>}
      </div>
    </Dialog>
  );
}

// Delete dialog — inlined re-skin of DeleteOrganizationDialog. Same hook and slug-typed confirm; stays
// open on error (e.g. a live-exam 409) so the message stays in front of the operator.
function DeleteOrgDialog({ organization, onClose, notify }: { organization: Organization; onClose: () => void; notify: Notify }) {
  const deleteOrganization = useDeleteOrganization();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setTyped(''); setError(null); }, [organization]);

  function handleDelete() {
    setError(null);
    deleteOrganization.mutate(organization.id, {
      onSuccess: () => { notify('success', `${organization.name} deleted.`); onClose(); },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to delete organization'),
    });
  }

  return (
    <Dialog open onClose={onClose} title="Delete Organization" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: 'var(--ink)', margin: 0 }}>
          <strong>{organization.name}</strong> will be removed from the console and nobody in it will be able to sign in. Its {organization.userCount} users and {organization.examCount} exams are retained, not erased, so this can be reversed.
        </p>
        <TextField id="del-org-slug" label={`Type ${organization.slug} To Confirm`} value={typed} onChange={setTyped} autoComplete="off" />
        {error && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
        <Button onClick={handleDelete} disabled={typed !== organization.slug} loading={deleteOrganization.isPending}>Delete organization</Button>
      </div>
    </Dialog>
  );
}

export default function V2OrganizationsPage() {
  const router = useRouter();
  const { switchIntoOrg } = useAuth();
  const { data, isLoading, isError } = useOrganizations();
  const setStatus = useSetOrganizationStatus();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState<Organization | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify: Notify = (type, text) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => (data?.data ?? []).filter((org) =>
    !q ||
    org.name.toLowerCase().includes(q) ||
    org.slug.toLowerCase().includes(q) ||
    (org.primaryAdminEmail ?? '').toLowerCase().includes(q)
  ), [data, q]);

  // Stats strip reflects all organizations, not the current search.
  const allOrgs = data?.data ?? [];
  const stats = useMemo(() => ({
    total: allOrgs.length,
    active: allOrgs.filter((o) => o.status === 'active').length,
    suspended: allOrgs.filter((o) => o.status !== 'active').length,
    users: allOrgs.reduce((sum, o) => sum + (o.userCount ?? 0), 0),
  }), [allOrgs]);

  async function handleSwitchInto(orgId: string) {
    await switchIntoOrg(orgId);
    router.push('/dashboard');
  }

  function handleSetStatus(org: Organization, status: 'active' | 'suspended') {
    setStatus.mutate(
      { id: org.id, status },
      {
        onSuccess: () => notify('success', status === 'suspended' ? `${org.name} suspended.` : `${org.name} reactivated.`),
        onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to change status'),
      },
    );
  }

  const columns: ColumnDef<typeof DT_FEATURES, Organization>[] = [
    { accessorKey: 'name', enableHiding: false, header: ({ column }) => <SortHead label="Name" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{row.original.name}</span> },
    { accessorKey: 'slug', header: ({ column }) => <SortHead label="Slug" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.slug}</span> },
    { accessorKey: 'primaryAdminName', header: ({ column }) => <SortHead label="Primary admin" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.primaryAdminName ?? '—'}</span> },
    { accessorKey: 'primaryAdminEmail', header: ({ column }) => <SortHead label="Admin email" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.primaryAdminEmail ?? '—'}</span> },
    { accessorKey: 'region', header: ({ column }) => <SortHead label="Region" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.region.toUpperCase()}</span> },
    { accessorKey: 'status', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Status</span>, cell: ({ row }) => <Pill c={row.original.status === 'active' ? STATUS.ok : STATUS.warn} label={row.original.status === 'active' ? 'Active' : 'Suspended'} /> },
    { accessorKey: 'userCount', header: ({ column }) => <SortHead label="Users" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.userCount}</span> },
    { accessorKey: 'examCount', header: ({ column }) => <SortHead label="Exams" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.examCount}</span> },
    { accessorKey: 'createdAt', header: ({ column }) => <SortHead label="Created" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.createdAt).toLocaleDateString()}</span> },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => {
        const org = row.original;
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Dropdown align="end" menuWidth={180} trigger={<span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, color: 'var(--muted)', cursor: 'pointer' }}><MoreHorizontal size={17} /></span>}>
              {(close) => (<>
                <DropdownItem onClick={() => { close(); void handleSwitchInto(org.id); }}><LogIn size={15} /> Switch into</DropdownItem>
                <DropdownItem onClick={() => { close(); setEditing(org); }}><Pencil size={15} /> Edit</DropdownItem>
                {org.status === 'active'
                  ? <DropdownItem danger onClick={() => { close(); handleSetStatus(org, 'suspended'); }}><Power size={15} /> Suspend</DropdownItem>
                  : <DropdownItem onClick={() => { close(); handleSetStatus(org, 'active'); }}><Power size={15} /> Reactivate</DropdownItem>}
                {/* The All Users directory carries organizationName, not a slug. */}
                <DropdownItem onClick={() => { close(); router.push(`/v2/all-users?org=${encodeURIComponent(org.name)}`); }}><UsersIcon size={15} /> View users</DropdownItem>
                <DropdownItem danger onClick={() => { close(); setDeleting(org); }}><Trash2 size={15} /> Delete</DropdownItem>
              </>)}
            </Dropdown>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Platform</p>
          <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>Organizations</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Every tenant on the platform — switch in, manage plans, or suspend access.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus size={15} /> New</Button>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }} className="wf-hero-kpis">
        <IconStatCard title="Organizations" value={stats.total} icon={<Building2 size={22} />} accent={VIZ.azure} />
        <IconStatCard title="Active" value={stats.active} icon={<CircleCheck size={22} />} accent={VIZ.teal} />
        <IconStatCard title="Suspended" value={stats.suspended} icon={<CirclePause size={22} />} accent={VIZ.amber} />
        <IconStatCard title="Total users" value={stats.users} icon={<UsersIcon size={22} />} accent={VIZ.violet} />
      </div>

      <DataTable
        columns={columns} data={rows} getRowId={(org) => org.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search organizations…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load organizations." emptyMessage={q ? 'No matching organizations.' : 'No organizations yet.'}
        columnLabels={{ name: 'Name', slug: 'Slug', primaryAdminName: 'Primary admin', primaryAdminEmail: 'Admin email', region: 'Region', status: 'Status', userCount: 'Users', examCount: 'Exams', createdAt: 'Created' }}
      />

      {createOpen && <CreateOrgDialog onClose={() => setCreateOpen(false)} notify={notify} />}
      {editing && <EditOrgDialog organization={editing} onClose={() => setEditing(null)} notify={notify} />}
      {deleting && <DeleteOrgDialog organization={deleting} onClose={() => setDeleting(null)} notify={notify} />}
    </>
  );
}
