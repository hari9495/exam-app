import { useState } from 'react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Badge } from '../../components/display';
import { DescriptionList } from '../../components/shell';
import { FormField, FormSection, type FormErrorItem, useSaveErrors } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { MenuItem } from '../../components/menu';
import { useToast } from '../../components/notify';
import { Card } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { EditorDrawer, useRun } from '../org/org-kit';
import { ConsolePage, useReasonDialog } from './console-kit';
import type { LoadState } from './types';

// Console › Staff and roles (founder answers 1058, 1086): five staff roles, each a fixed set of console keys. Who holds
// what, and a Security lead changing another member of staff's roles (the security key again, a reason, audited).

export type StaffRoleId = 'support_agent' | 'customer_success' | 'rules_editor' | 'finance' | 'security_lead';
export interface StaffRoleDef {
  role: StaffRoleId;
  label: string;
  keys: string[];
}
export interface StaffRow {
  id: string;
  name: string;
  email: string;
  active: boolean;
  /** The signed-in member of staff: nobody changes their own roles. */
  me: boolean;
  roles: StaffRoleId[];
  /** The only active Security lead: keeps the role. */
  lastLead: boolean;
}

/** What each console key lets a member of staff do, in plain words. */
export const KEY_WORDS: Record<string, string> = {
  'platform.companies.view': 'See companies',
  'platform.companies.manage': 'Create companies and change their lifecycle',
  'platform.plans.manage': 'Set prices',
  'platform.channels.manage': 'Run the shared SMS account',
  'platform.support.request': 'Ask a company for a support session',
  'platform.support_desk.work': 'Work the Support desk',
  'platform.customers.success': 'Customer health, alerts and messages to company admins',
  'platform.news.manage': "Write What's new",
  'platform.statutory.manage': 'Draft, review and publish rule sets',
  'platform.audit.view': 'Read the platform audit log',
  'platform.staff.manage': 'Add, deactivate and give roles to staff',
  'platform.company.contain': 'Contain a company after a suspected breach',
  'platform.flags.manage': 'Switch features on and off',
  'platform.maintenance.manage': 'Schedule planned maintenance',
  'platform.maintenance.view': 'See planned maintenance',
  'platform.helpcentre.write': 'Write and publish the help-centre articles',
  'platform.settings.manage': 'Change the platform settings',
};

/** Answer 1164: the checks for adding a member of staff. */
export function inviteInput(d: { email: string; name: string; reason: string }): { errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) errors.push({ fieldId: 'staff-email', message: 'Give their work email, such as name@yukthix.com.' });
  if (d.name.trim().length < 2) errors.push({ fieldId: 'staff-name', message: 'Give their name.' });
  if (d.reason.trim().length < 5) errors.push({ fieldId: 'staff-invite-reason', message: 'Say why (at least 5 characters). It is kept in the audit log.' });
  return { errors };
}

/** The checks for a change of roles: a reason; the last Security lead keeps it. */
export function rolesInput(row: StaffRow, roles: StaffRoleId[], reason: string): { errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (row.lastLead && !roles.includes('security_lead')) errors.push({ fieldId: 'staff-roles', message: 'The last Security lead keeps the role. Make someone else a Security lead first.' });
  if (reason.trim().length < 5) errors.push({ fieldId: 'staff-reason', message: 'Say why (at least 5 characters). It is kept in the audit log.' });
  return { errors };
}

export interface StaffRolesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  roles: StaffRoleDef[];
  staff: StaffRow[];
  onSave: (id: string, roles: StaffRoleId[], reason: string) => Promise<void>;
  /** Answer 1164: add a member of staff (an invitation; no role until one is given). */
  onInvite?: (input: { email: string; name: string; reason: string }) => Promise<void>;
  /** Answer 1164: deactivate another member of staff (signed out everywhere). */
  onDeactivate?: (id: string, reason: string) => Promise<void>;
  /** Story: the change drawer open for this member of staff. */
  defaultOpenId?: string;
  /** Story: the add-staff drawer open. */
  defaultInvite?: boolean;
}

function InviteDrawer({ onClose, onInvite }: { onClose: () => void; onInvite: (input: { email: string; name: string; reason: string }) => Promise<void> }) {
  const [d, setD] = useState({ email: '', name: '', reason: '' });
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const { errors } = inviteInput(d);
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  const set = (patch: Partial<typeof d>) => {
    setD((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title="Add staff"
      subtitle="They get an email to set a password, then add a security key at first sign-in. They hold no console key until you give them a role."
      errors={saveErrors.shownErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel="Send invitation"
      onSave={() => {
        if (errors.length) return saveErrors.reveal();
        void run('save', () => onInvite({ email: d.email.trim(), name: d.name.trim(), reason: d.reason.trim() })).then((ok) => ok && onClose());
      }}
    >
      <FormSection title="Who">
        <FormField id="staff-name" label="Name" required error={errorOf('staff-name')}>
          <TextField value={d.name} onChange={(name) => set({ name })} maxLength={100} />
        </FormField>
        <FormField id="staff-email" label="Work email" required error={errorOf('staff-email')}>
          <TextField type="email" value={d.email} onChange={(email) => set({ email })} maxLength={254} />
        </FormField>
      </FormSection>
      <FormSection title="Why">
        <FormField id="staff-invite-reason" label="Reason" required helper="Kept in the platform audit log." error={errorOf('staff-invite-reason')}>
          <TextArea value={d.reason} onChange={(reason) => set({ reason })} rows={3} maxLength={300} />
        </FormField>
      </FormSection>
    </EditorDrawer>
  );
}

function RolesDrawer({ row, defs, onClose, onSave }: { row: StaffRow; defs: StaffRoleDef[]; onClose: () => void; onSave: (roles: StaffRoleId[], reason: string) => Promise<void> }) {
  const [roles, setRoles] = useState<StaffRoleId[]>(row.roles);
  const [reason, setReason] = useState('');
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const { errors } = rolesInput(row, roles, reason);
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title={`Roles of ${row.name}`}
      subtitle="A role gives its keys at once; taking it away takes them at once. You confirm with your security key."
      errors={saveErrors.shownErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel="Save roles"
      onSave={() => {
        if (errors.length) return saveErrors.reveal();
        void run('save', () => onSave(roles, reason.trim())).then((ok) => ok && onClose());
      }}
    >
      <FormSection title="Roles" description="Give only what the work needs. No role gives every key.">
        <FormField id="staff-roles" label="Roles" error={errorOf('staff-roles')}>
          <div id="staff-roles" tabIndex={-1} className="yx-auth__stack" role="group" aria-label="Roles">
            {defs.map((d) => (
              <Checkbox
                key={d.role}
                id={`staff-role-${d.role}`}
                label={d.label}
                description={d.keys.map((k) => KEY_WORDS[k] ?? k).join(' · ')}
                checked={roles.includes(d.role)}
                onChange={(on) => {
                  setRoles((r) => (on ? [...r, d.role] : r.filter((x) => x !== d.role)));
                  setDirty(true);
                }}
              />
            ))}
          </div>
        </FormField>
      </FormSection>
      <FormSection title="Why">
        <FormField id="staff-reason" label="Reason" required helper="Kept in the platform audit log." error={errorOf('staff-reason')}>
          <TextArea
            value={reason}
            onChange={(v) => {
              setReason(v);
              setDirty(true);
            }}
            rows={3}
            maxLength={300}
          />
        </FormField>
      </FormSection>
    </EditorDrawer>
  );
}

/** Console › Staff and roles: who holds which staff role (answer 1058); a Security lead changes them. */
export function StaffRolesScreen(props: StaffRolesScreenProps) {
  const [open, setOpen] = useState<string | null>(props.defaultOpenId ?? null);
  const [inviting, setInviting] = useState(!!props.defaultInvite);
  const [reasonDialog, askReason] = useReasonDialog();
  const { toast } = useToast();
  const label = new Map(props.roles.map((r) => [r.role, r.label]));
  const row = props.staff.find((s) => s.id === open) ?? null;
  const columns: TableColumn<StaffRow>[] = [
    { key: 'name', header: 'Name', value: (s) => s.name, render: (s) => (s.me ? `${s.name} (you)` : s.name), width: 200, hideable: false },
    { key: 'email', header: 'Email', value: (s) => s.email, width: 240 },
    {
      key: 'roles',
      header: 'Roles',
      value: (s) => s.roles.map((r) => label.get(r) ?? r).join(', '),
      render: (s) =>
        s.roles.length ? (
          <span className="yx-auth__row">
            {s.roles.map((r) => (
              <Badge key={r} tone={r === 'security_lead' ? 'info' : 'neutral'}>
                {label.get(r) ?? r}
              </Badge>
            ))}
          </span>
        ) : (
          'No role: no console keys'
        ),
      width: 320,
    },
    { key: 'active', header: 'Account', value: (s) => (s.active ? 'Active' : 'Inactive'), render: (s) => <Badge tone={s.active ? 'success' : 'neutral'}>{s.active ? 'Active' : 'Inactive'}</Badge>, width: 110 },
  ];
  return (
    <ConsolePage
      crumb="Staff and roles"
      title="Staff and roles"
      description="Who holds which console keys. Only a Security lead adds, deactivates and gives roles, never to themselves."
      actions={props.onInvite ? <Button onClick={() => setInviting(true)}>Add staff</Button> : undefined}
      state={props.state}
      onRetry={props.onRetry}
      what="the staff roles"
    >
      <Card title="Staff">
        <div className="yx-auth__stack">
          <Text tone="secondary">Every change is kept in the platform audit log with its reason. The last Security lead keeps the role.</Text>
          <DataTable
            label="Staff and their roles"
            columns={columns}
            rows={props.staff}
            getRowId={(s) => s.id}
            rowNoun={['member of staff', 'members of staff']}
            cardSummary
            // Nobody changes their own roles: no action on your own row (the API refuses it too).
            rowActions={(s) =>
              s.me ? null : (
                <>
                  <MenuItem onSelect={() => setOpen(s.id)}>Change roles</MenuItem>
                  {props.onDeactivate && s.active && !s.lastLead && (
                    <MenuItem
                      destructive
                      onSelect={() =>
                        askReason({
                          title: `Deactivate ${s.name}?`,
                          consequence: 'They are signed out everywhere at once and can no longer sign in. Their roles and history stay.',
                          confirmLabel: 'Deactivate',
                          destructive: true,
                          helper: 'Kept in the platform audit log.',
                          action: async (reason) => {
                            await props.onDeactivate!(s.id, reason);
                            toast({ tone: 'success', title: `${s.name} deactivated` });
                          },
                        })
                      }
                    >
                      Deactivate
                    </MenuItem>
                  )}
                </>
              )
            }
          />
        </div>
      </Card>
      <Card title="What each role holds">
        <DescriptionList items={props.roles.map((r) => ({ label: r.label, value: r.keys.map((k) => KEY_WORDS[k] ?? k).join(' · ') }))} />
      </Card>
      {reasonDialog}
      {inviting && props.onInvite && (
        <InviteDrawer
          onClose={() => setInviting(false)}
          onInvite={async (input) => {
            await props.onInvite!(input);
            toast({ tone: 'success', title: `Invitation sent to ${input.email}`, description: 'They hold no console key until you give them a role.' });
          }}
        />
      )}
      {row && !row.me && (
        <RolesDrawer
          key={row.id}
          row={row}
          defs={props.roles}
          onClose={() => setOpen(null)}
          onSave={async (roles, reason) => {
            await props.onSave(row.id, roles, reason);
            toast({ tone: 'success', title: `Roles of ${row.name} saved` });
          }}
        />
      )}
    </ConsolePage>
  );
}
