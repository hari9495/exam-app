import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Breadcrumbs, Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { dayKey } from '../../lib/dates';
import { dateLabel, errorText } from '../org/org-kit';
import { codeOf, ConfidentialBadge, GrantStatusBadge, SCOPE_LABEL, SCOPE_TARGET } from './access-kit';
import type { AccessRole, AccessUser, EffectiveAccess, Grant, GrantInput, LoadState, RoleTemplate, ScopeChoices, ScopeType } from './types';

// Settings › Roles & access (PLT-11; P02 §4.2–4.3, §4.6, §7): who holds which role over which people. A role
// opening Confidential data waits for a second admin (never the one who asked, never the person receiving it);
// a grant over many people asks for a confirmed warning first (YX-SEC-18). The API checks every rule.

export interface RolesAccessScreenProps {
  state: LoadState;
  onRetry?: () => void;
  users: AccessUser[];
  roles: AccessRole[];
  templates: RoleTemplate[];
  grants: Grant[];
  scopes: ScopeChoices;
  /** The signed-in admin: they never decide a grant they asked for or that is theirs. */
  meId: string;
  today: string;
  loadEffective: (userId: string) => Promise<EffectiveAccess>;
  onGrant: (input: GrantInput) => Promise<void>;
  onApprove: (grantId: string) => Promise<void>;
  onReject: (grantId: string, reason: string) => Promise<void>;
  onRevoke: (grantId: string, reason: string) => Promise<void>;
  onFromTemplate: (templateKey: string, name: string) => Promise<void>;
}

type View = 'people' | 'waiting' | 'roles';
const userLabel = (u: AccessUser) => (u.name ? `${u.name} · ${u.email}` : u.email);
const SCOPE_TYPES = Object.keys(SCOPE_LABEL) as ScopeType[];
const scopeText = (g: Grant) => (g.scope.name ? `${SCOPE_LABEL[g.scope.type]}: ${g.scope.name}` : SCOPE_LABEL[g.scope.type]);
const period = (g: Grant) => (g.validTo ? `${dateLabel(g.validFrom)} to ${dateLabel(g.validTo)}` : `From ${dateLabel(g.validFrom)}`);

function GrantDialog({ users, roles, scopes, userId, today, onGrant, onClose }: Pick<RolesAccessScreenProps, 'users' | 'roles' | 'scopes' | 'today' | 'onGrant'> & { userId: string | null; onClose: () => void }) {
  const [user, setUser] = useState<string | null>(userId);
  const [role, setRole] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<ScopeType | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [from, setFrom] = useState<Date | null>(new Date(`${today}T00:00:00`));
  const [to, setTo] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const [risk, setRisk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picked = roles.find((r) => r.id === role);
  const targetList = scopeType && SCOPE_TARGET[scopeType] ? scopes[SCOPE_TARGET[scopeType]!] : null;
  const ready = Boolean(user && role && scopeType && (!targetList || target) && from && reason.trim());
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await onGrant({ userId: user!, permissionProfileId: role!, scopeType: scopeType!, ...(targetList ? { scopeId: target! } : {}), validFrom: dayKey(from!), ...(to ? { validTo: dayKey(to) } : {}), reason: reason.trim(), ...(risk ? { confirmRisk: true } : {}) });
      onClose();
    } catch (e) {
      if (codeOf(e) === 'RISK_CONFIRMATION_REQUIRED') setRisk(errorText(e));
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Give access"
      description="A role over a set of people, from a date. Roles that open pay, identity or bank details wait for another admin's approval."
      preventClose={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!ready} onClick={send}>
            {risk ? 'Give access anyway' : picked?.confidential ? 'Send for approval' : 'Give access'}
          </Button>
        </>
      }
    >
      <FormField id="ga-user" label="Person" required>
        <Select aria-label="Person" value={user} onChange={setUser} searchable options={users.map((u) => ({ value: u.id, label: userLabel(u) }))} />
      </FormField>
      <FormField id="ga-role" label="Role" required helper={picked?.confidential ? 'Opens Confidential data: another admin approves it.' : undefined}>
        <Select aria-label="Role" value={role} onChange={(v) => (setRole(v), setRisk(null))} options={roles.map((r) => ({ value: r.id, label: r.confidential ? `${r.name} (Confidential)` : r.name }))} />
      </FormField>
      <FormField id="ga-scope" label="Over" required helper={picked?.companyWideOnly.length ? `This role has permissions that work only for the whole company: ${picked.companyWideOnly.join(', ')}.` : undefined}>
        <Select aria-label="Over" value={scopeType} onChange={(v) => (setScopeType(v), setTarget(null), setRisk(null))} options={SCOPE_TYPES.map((t) => ({ value: t, label: SCOPE_LABEL[t] }))} />
      </FormField>
      {targetList && (
        <FormField id="ga-target" label={SCOPE_LABEL[scopeType!]} required>
          <Select aria-label={SCOPE_LABEL[scopeType!]} value={target} onChange={(v) => (setTarget(v), setRisk(null))} searchable options={targetList} />
        </FormField>
      )}
      <FormField id="ga-from" label="From" required>
        <DatePicker value={from} onChange={setFrom} min={new Date(`${today}T00:00:00`)} />
      </FormField>
      <FormField id="ga-to" label="Until" optional helper="Leave empty for no end date. Auditors and cover roles should have one.">
        <DatePicker value={to} onChange={setTo} min={from ?? undefined} />
      </FormField>
      <FormField id="ga-reason" label="Reason" required helper="Kept on the record.">
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
      {risk && <InlineAlert tone="warning" title="Check before you continue">{risk}</InlineAlert>}
      {error && <InlineAlert tone="danger" title={error} />}
    </Dialog>
  );
}

function TemplateDialog({ templates, onFromTemplate, onClose }: { templates: RoleTemplate[]; onFromTemplate: RolesAccessScreenProps['onFromTemplate']; onClose: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const t = templates.find((x) => x.key === key);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="New role from a template"
      consequence="The template stays as it is; you can change the new role's permissions afterwards."
      confirmLabel="Create role"
      confirmDisabled={!key || !name.trim()}
      onConfirm={async () => {
        await onFromTemplate(key!, name.trim());
        onClose();
      }}
    >
      <FormField id="rt-template" label="Template" required>
        <Select aria-label="Template" value={key} onChange={(v) => (setKey(v), setName(templates.find((x) => x.key === v)?.name ?? ''))} options={templates.map((x) => ({ value: x.key, label: x.name }))} />
      </FormField>
      {t && (
        <Text as="p" tone="secondary" size="sm">
          {`${t.summary} Not included: ${t.cannot}`}
        </Text>
      )}
      <FormField id="rt-name" label="Role name" required>
        <TextField value={name} onChange={setName} maxLength={200} />
      </FormField>
    </ConfirmDialog>
  );
}

type Ask = { kind: 'revoke' | 'reject'; grant: Grant };

function ReasonDialog({ ask, onClose, onRevoke, onReject }: { ask: Ask; onClose: () => void; onRevoke: RolesAccessScreenProps['onRevoke']; onReject: RolesAccessScreenProps['onReject'] }) {
  const [reason, setReason] = useState('');
  const g = ask.grant;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={ask.kind === 'revoke' ? `Revoke ${g.role.name} from ${g.userName}?` : `Reject ${g.role.name} for ${g.userName}?`}
      consequence={ask.kind === 'revoke' ? 'The access ends now. The grant stays on the record.' : 'The grant never starts. It stays on the record.'}
      confirmLabel={ask.kind === 'revoke' ? 'Revoke' : 'Reject'}
      destructive
      confirmDisabled={!reason.trim()}
      onConfirm={async () => {
        await (ask.kind === 'revoke' ? onRevoke(g.id, reason.trim()) : onReject(g.id, reason.trim()));
        onClose();
      }}
    >
      <FormField id="gr-reason" label="Reason" required>
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

function Effective({ userId, loadEffective }: { userId: string; loadEffective: RolesAccessScreenProps['loadEffective'] }) {
  const [data, setData] = useState<EffectiveAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    loadEffective(userId).then(
      (d) => live && setData(d),
      (e) => live && setError(errorText(e)),
    );
    return () => {
      live = false;
    };
  }, [userId, loadEffective]);
  return (
    <Card title="What they can do today">
      {error && <InlineAlert tone="danger" title={error} />}
      {!data && !error && <Skeleton height={80} />}
      {data && (
        <ul className="yx-acc__list">
          {data.keys.map((k) => (
            <li key={k.key}>
              <Text>{k.label}</Text>
              <Text tone={k.people ? 'default' : 'secondary'} weight={k.people ? 'semibold' : undefined}>{`${k.people} ${k.people === 1 ? 'person' : 'people'}`}</Text>
            </li>
          ))}
        </ul>
      )}
      {data && !data.hasEmployeeRecord && (
        <Text as="p" tone="secondary" size="sm">
          No employee record, so no team of their own.
        </Text>
      )}
    </Card>
  );
}

export function RolesAccessScreen(props: RolesAccessScreenProps) {
  const { state, onRetry, users, roles, templates, grants, meId, loadEffective } = props;
  const [view, setView] = useState<View>('people');
  const [picked, setUserId] = useState<string | null>(null);
  // The first person until one is picked (the list may arrive after the first render).
  const userId = picked ?? users[0]?.id ?? null;
  const [giving, setGiving] = useState(false);
  const [fromTemplate, setFromTemplate] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const waiting = grants.filter((g) => g.status === 'pending');
  const mine = grants.filter((g) => g.userId === userId);
  const approve = async (g: Grant) => {
    setBusy(g.id);
    setError(null);
    try {
      await props.onApprove(g.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const grantColumns: TableColumn<Grant>[] = [
    { key: 'role', header: 'Role', value: (g) => g.role.name, render: (g) => <span className="yx-ppl2__row"><Text>{g.role.name}</Text>{g.role.confidential && <ConfidentialBadge />}</span>, width: 220, hideable: false },
    { key: 'scope', header: 'Over', value: (g) => scopeText(g), width: 240 },
    { key: 'when', header: 'When', value: (g) => g.validFrom, render: (g) => period(g), width: 200, optional: true },
    { key: 'status', header: 'Status', value: (g) => g.status, render: (g) => <GrantStatusBadge status={g.status} />, width: 170 },
  ];
  const waitingColumns: TableColumn<Grant>[] = [
    { key: 'who', header: 'Person', type: 'person', value: (g) => g.userName, person: (g) => ({ name: g.userName ?? 'Unknown', secondary: g.role.name }), width: 240, hideable: false },
    { key: 'scope', header: 'Over', value: (g) => scopeText(g), width: 230 },
    { key: 'asked', header: 'Asked by', value: (g) => g.grantedBy, render: (g) => <span className="yx-auth__item-main"><Text>{g.grantedBy ?? '—'}</Text><Text tone="secondary" size="sm">{g.reason}</Text></span>, width: 240, optional: true },
  ];
  const roleColumns: TableColumn<AccessRole>[] = [
    { key: 'name', header: 'Role', value: (r) => r.name, render: (r) => <span className="yx-ppl2__row"><Text>{r.name}</Text>{r.confidential && <ConfidentialBadge />}</span>, width: 260, hideable: false },
    { key: 'perms', header: 'Permissions', value: (r) => r.permissions.length, render: (r) => `${r.permissions.length}`, width: 120, type: 'number' },
    { key: 'holders', header: 'Held by', value: (r) => r.grants + r.assignedUsers, render: (r) => `${r.grants + r.assignedUsers} ${r.grants + r.assignedUsers === 1 ? 'person' : 'people'}`, width: 140 },
  ];
  return (
    <div className="yx-auth__page">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Settings' }, { label: 'Roles & access' }]} />}
        title="Roles & access"
        description="Who holds which role, over which people, and from when."
        actions={state === 'ready' ? <Button variant="primary" onClick={() => setGiving(true)}>Give access</Button> : undefined}
      />
      {state === 'loading' && <Skeleton height={240} />}
      {state === 'error' && <ErrorState title="We couldn't load roles and access." description="Check your connection and try again." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="your System Admin" what="roles and access" />}
      {state === 'ready' && (
        <>
          <Segment label="Show" value={view} onChange={setView} options={[{ value: 'people', label: 'People' }, { value: 'waiting', label: `Waiting (${waiting.length})` }, { value: 'roles', label: 'Roles' }]} />
          {error && <InlineAlert tone="danger" title={error} />}
          {view === 'people' && (
            <>
              <FormField id="ra-user" label="Person">
                <Select aria-label="Person" value={userId} onChange={setUserId} searchable options={users.map((u) => ({ value: u.id, label: userLabel(u) }))} />
              </FormField>
              {userId && <Effective userId={userId} loadEffective={loadEffective} />}
              {userId && (
                <DataTable
                  label="Grants"
                  columns={grantColumns}
                  rows={mine}
                  getRowId={(g) => g.id}
                  rowNoun={['grant', 'grants']}
                  cardSummary
                  empty={<EmptyState compact title="No roles granted here." description="Their base role still applies." action={<Button onClick={() => setGiving(true)}>Give access</Button>} />}
                  rowButtons={(g) =>
                    g.status === 'active' || g.status === 'pending' ? (
                      <Button size="sm" onClick={() => setAsk({ kind: 'revoke', grant: g })}>
                        Revoke
                      </Button>
                    ) : null
                  }
                />
              )}
            </>
          )}
          {view === 'waiting' && (
            <DataTable
              label="Grants waiting for approval"
              columns={waitingColumns}
              rows={waiting}
              getRowId={(g) => g.id}
              rowNoun={['grant', 'grants']}
              cardSummary
              empty={<EmptyState compact title="Nothing is waiting for approval." />}
              rowButtons={(g) => {
                const own = g.grantedById === meId || g.userId === meId;
                return own ? (
                  <Text tone="secondary" size="sm">{g.userId === meId ? 'For you: another admin decides' : 'You asked: another admin decides'}</Text>
                ) : (
                  <>
                    <Button size="sm" variant="approve" loading={busy === g.id} onClick={() => approve(g)}>
                      Approve
                    </Button>
                    <Button size="sm" onClick={() => setAsk({ kind: 'reject', grant: g })}>
                      Reject
                    </Button>
                  </>
                );
              }}
            />
          )}
          {view === 'roles' && (
            <>
              <div className="yx-ppl2__row">
                <Button onClick={() => setFromTemplate(true)}>New role from a template</Button>
              </div>
              <DataTable label="Roles" columns={roleColumns} rows={roles} getRowId={(r) => r.id} rowNoun={['role', 'roles']} cardSummary empty={<EmptyState compact title="No roles yet." description="Start from a template." action={<Button onClick={() => setFromTemplate(true)}>New role from a template</Button>} />} />
            </>
          )}
        </>
      )}
      {giving && <GrantDialog users={users} roles={roles} scopes={props.scopes} today={props.today} userId={userId} onGrant={props.onGrant} onClose={() => setGiving(false)} />}
      {fromTemplate && <TemplateDialog templates={templates} onFromTemplate={props.onFromTemplate} onClose={() => setFromTemplate(false)} />}
      {ask && <ReasonDialog ask={ask} onClose={() => setAsk(null)} onRevoke={props.onRevoke} onReject={props.onReject} />}
    </div>
  );
}
