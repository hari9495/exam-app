import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextField, TimeField } from '../../components/inputs';
import { Checkbox, Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { RichTextEditor } from '../../components/editor';
import { DataTable, type TableColumn } from '../../components/table';
import { Dialog } from '../../components/overlay';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage, PRIORITY_LABEL, STATE_LABEL } from './desk-kit';
import type { Calendar, CannedResponse, DeskDetail, DeskGroup, DeskKind, DeskMember, DeskRole, DeskSummary, LoadState, SeatCost, SystemState } from './types';

// Desk set-up (APX-D §5.8, SD-1.01 / SD-1.02, D8 / D11): desks, seats with their cost shown first, groups and how they
// share work, categories, ticket types and status labels, the priority matrix, saved replies, scenarios, numbering,
// files, and the shared business calendars. Changes are checked and audited on the server.

const AREAS: { value: Exclude<DeskKind, 'customer_support'>; label: string }[] = [
  { value: 'it', label: 'IT' },
  { value: 'hr', label: 'HR' },
  { value: 'admin', label: 'Admin' },
  { value: 'facilities', label: 'Facilities' },
  { value: 'finance', label: 'Finance' },
  { value: 'legal', label: 'Legal' },
  { value: 'security', label: 'Security' },
  { value: 'custom', label: 'Something else' },
];
const ROLE_LABEL: Record<DeskRole, string> = { agent: 'Agent', lead: 'Team lead', admin: 'Desk admin', collaborator: 'Collaborator' };
const METHOD_LABEL = { manual: 'By hand', round_robin: 'Take turns', load: 'Fewest open' } as const;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (s: string | null) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);

export interface DeskSetupScreenProps {
  state: LoadState;
  onRetry?: () => void;
  desks: DeskSummary[];
  canCreate: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  detail: DeskDetail | null;
  canned: CannedResponse[];
  calendars: Calendar[];
  canCalendars: boolean;
  onCreateDesk: (input: { name: string; key: string; kind: DeskKind }) => Promise<void>;
  onUpdateDesk: (change: Partial<Pick<DeskSummary, 'name' | 'privacy' | 'numberPrefix' | 'numberSuffix' | 'attachmentTypes' | 'attachmentMaxMb' | 'vipRaisesPriority' | 'calendarId'>> & { nextNumber?: number }) => Promise<void>;
  onSearchUsers: (q: string) => Promise<{ id: string; name: string | null; email: string }[]>;
  onSeatCost: (userId: string, role: DeskRole) => Promise<SeatCost>;
  onAddMember: (input: { userId: string; role: DeskRole; tier?: string }) => Promise<void>;
  onEndMember: (memberId: string) => Promise<void>;
  onSaveGroup: (id: string | null, input: { name: string; assignmentMethod: DeskGroup['assignmentMethod']; maxOpenPerAgent: number | null; memberIds: string[]; active: boolean }) => Promise<void>;
  onSaveCategory: (id: string | null, input: { name: string; parentId: string | null; sensitive: boolean; defaultGroupId: string | null; active: boolean }) => Promise<void>;
  onSaveType: (id: string | null, input: { name: string; kind?: 'incident' | 'request' | 'question'; active?: boolean }) => Promise<void>;
  onSaveStatus: (id: string | null, input: { label: string; systemState?: SystemState; active?: boolean }) => Promise<void>;
  onSaveMatrix: (cells: { impact: number; urgency: number; priority: number }[]) => Promise<void>;
  onSaveCanned: (id: string | null, input: { title: string; bodyHtml: string; active: boolean }) => Promise<void>;
  onSaveScenario: (id: string | null, input: { name: string; actions: { statusId?: string; priority?: number; addTags?: string[]; reply?: string } }) => Promise<void>;
  onAddHoliday: (calendarId: string, input: { on: string; name: string; halfDay: boolean }) => Promise<void>;
  onSetHours: (calendarId: string, input: { effectiveFrom: string; hours: { weekday: number; startMinute: number; endMinute: number }[] }) => Promise<void>;
}

export function DeskSetupScreen(props: DeskSetupScreenProps) {
  const [creating, setCreating] = useState(false);
  const d = props.detail;
  return (
    <DeskPage
      title="Desk set-up"
      description="Each desk is one team’s workspace: its people, topics, statuses and replies. Agents cost ₹999 a month; collaborators and desk admins who only set up are free."
      state={props.state}
      onRetry={props.onRetry}
      what="the desks"
      actions={
        props.canCreate ? (
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New desk
          </Button>
        ) : undefined
      }
    >
      {props.desks.length === 0 ? (
        <EmptyState title="No desks yet." description={props.canCreate ? 'Create the first desk: an Employee help desk (IT, HR, Admin…) or a Customer support desk.' : 'Ask your Service Desk admin to add you to a desk.'} />
      ) : (
        <div className="yx-desk-setup">
          <Card title="Desks">
            <ul className="yx-ops-list" aria-label="Desks">
              {props.desks.map((x) => (
                <li key={x.id} className="yx-ops-list__item" data-active={x.id === props.selectedId || undefined}>
                  <span className="yx-ops-list__main">
                    <button type="button" className="yx-desk-link" aria-current={x.id === props.selectedId ? 'true' : undefined} onClick={() => props.onSelect(x.id)}>
                      {x.name}
                    </button>
                    <span className="yx-ops-list__sub">
                      {x.key} · {x.audience === 'customer' ? 'Customer support desk' : 'Employee help desk'}
                      {x.billingClass === 'hrms_included' ? ' · free with YukthiX HR' : ''}
                      {x.status === 'archived' ? ' · archived' : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          {d ? <DeskTabs key={d.desk.id} {...props} detail={d} /> : <EmptyState compact title="Choose a desk to set it up." />}
        </div>
      )}
      <NewDeskDrawer open={creating} onOpenChange={setCreating} onCreate={props.onCreateDesk} />
    </DeskPage>
  );
}

function NewDeskDrawer({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: DeskSetupScreenProps['onCreateDesk'] }) {
  const [audience, setAudience] = useState<'employee' | 'customer'>('employee');
  const [area, setArea] = useState<string | null>('it');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const { busy, error, run } = useRun();
  const kind = (audience === 'customer' ? 'customer_support' : area) as DeskKind | null;
  const keyOk = /^[A-Z][A-Z0-9]{1,9}$/.test(key);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="New desk"
      subtitle="The kind is chosen once. It picks a starter set-up you can change afterwards."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'create'}
            disabled={!kind || !name.trim() || !keyOk}
            onClick={() =>
              void run('create', async () => {
                await onCreate({ name: name.trim(), key, kind: kind! });
                onOpenChange(false);
                setName('');
                setKey('');
              })
            }
          >
            Create desk
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The desk was not created">{error}</InlineAlert>}
        <FormField label="Kind of desk" required helper="This never changes after the desk is created.">
          <Segment label="Kind of desk" options={[{ value: 'employee', label: 'Employee help desk' }, { value: 'customer', label: 'Customer support desk' }]} value={audience} onChange={setAudience} />
        </FormField>
        {audience === 'employee' ? (
          <FormField label="Team" required helper="An HR desk is free with YukthiX HR (one per company). Any other desk is ₹999 per agent a month.">
            <Select value={area} onChange={setArea} options={AREAS} />
          </FormField>
        ) : (
          <InlineAlert tone="info">For questions from your own customers: email, help centre and chat come in later releases. ₹999 per agent a month.</InlineAlert>
        )}
        <FormField label="Name" required>
          <TextField value={name} onChange={setName} maxLength={100} placeholder={audience === 'customer' ? 'Customer support' : 'IT help desk'} />
        </FormField>
        <FormField label="Short key" required helper="2–10 capital letters or digits. Ticket numbers start with it, like IT-1001." error={key && !keyOk ? 'Use capital letters and digits, starting with a letter' : null}>
          <TextField value={key} onChange={(v) => setKey(v.toUpperCase())} maxLength={10} />
        </FormField>
      </div>
    </Drawer>
  );
}

function DeskTabs(props: DeskSetupScreenProps & { detail: DeskDetail }) {
  const d = props.detail;
  const [tab, setTab] = useState('members');
  return (
    <Card title={d.desk.name}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Desk set-up">
          <TabsTrigger value="members">People</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="types">Types and statuses</TabsTrigger>
          <TabsTrigger value="priority">Priority</TabsTrigger>
          <TabsTrigger value="replies">Saved replies</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          {props.canCalendars && <TabsTrigger value="calendars">Calendars</TabsTrigger>}
        </TabsList>
        <TabsContent value="members">
          <MembersTab {...props} />
        </TabsContent>
        <TabsContent value="groups">
          <GroupsTab {...props} />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab {...props} />
        </TabsContent>
        <TabsContent value="types">
          <TypesTab {...props} />
        </TabsContent>
        <TabsContent value="priority">
          <MatrixTab {...props} />
        </TabsContent>
        <TabsContent value="replies">
          <RepliesTab {...props} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab {...props} />
        </TabsContent>
        {props.canCalendars && (
          <TabsContent value="calendars">
            <CalendarsTab {...props} />
          </TabsContent>
        )}
      </Tabs>
    </Card>
  );
}

type TabProps = DeskSetupScreenProps & { detail: DeskDetail };
const ReadOnly = ({ show }: { show: boolean }) => (show ? <InlineAlert tone="info">You can see this desk’s set-up. Only its desk admins and Service Desk admins change it.</InlineAlert> : null);

function MembersTab(props: TabProps) {
  const d = props.detail;
  const [find, setFind] = useState('');
  const [found, setFound] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<DeskRole>('agent');
  const [tier, setTier] = useState<string | null>('L1');
  const [cost, setCost] = useState<SeatCost | null>(null);
  const { busy, error, run } = useRun();
  useEffect(() => {
    if (!d.canManageMembers) return;
    const h = setTimeout(() => void props.onSearchUsers(find.trim()).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(h);
  }, [find, d.canManageMembers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setCost(null);
    if (userId) void props.onSeatCost(userId, role).then(setCost).catch(() => setCost(null));
  }, [userId, role]); // eslint-disable-line react-hooks/exhaustive-deps
  const columns: TableColumn<DeskMember>[] = [
    { key: 'name', header: 'Name', type: 'person', value: (m) => m.name, person: (m) => ({ name: m.name, secondary: m.email ?? undefined }), width: 240, hideable: false },
    { key: 'role', header: 'Role', value: (m) => ROLE_LABEL[m.role], width: 140 },
    { key: 'tier', header: 'Tier', value: (m) => m.tier ?? '—', width: 80 },
    { key: 'from', header: 'Since', value: (m) => m.validFrom, width: 120 },
  ];
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <DataTable
        label="People on this desk"
        columns={columns}
        rows={d.members}
        getRowId={(m) => m.id}
        rowNoun={['person', 'people']}
        empty={<EmptyState compact title="Nobody on this desk yet." />}
        rowButtons={(m) =>
          d.canManageMembers ? (
            <Button size="sm" loading={busy === `end-${m.id}`} onClick={() => void run(`end-${m.id}`, () => props.onEndMember(m.id))}>
              Remove
            </Button>
          ) : null
        }
      />
      {d.canManageMembers && (
        <Card title="Add someone">
          <div className="yx-ops-stack">
            <FormField label="Find a person" helper="Name or email">
              <TextField value={find} onChange={setFind} />
            </FormField>
            <FormField label="Person" required>
              <Select value={userId} onChange={setUserId} options={found.map((u) => ({ value: u.id, label: u.name ?? u.email, description: u.email }))} placeholder="Choose a person" emptyText="Nobody matches" />
            </FormField>
            <FormField label="Role" required>
              <Segment label="Role" options={(Object.keys(ROLE_LABEL) as DeskRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} value={role} onChange={setRole} />
            </FormField>
            {(role === 'agent' || role === 'lead') && (
              <FormField label="Tier">
                <Segment label="Tier" options={['L1', 'L2', 'L3'].map((x) => ({ value: x, label: x }))} value={tier ?? 'L1'} onChange={setTier} />
              </FormField>
            )}
            {cost && (
              <InlineAlert tone={cost.paid ? 'warning' : 'info'} title={cost.paid ? 'This adds a paid seat' : 'No extra cost'}>
                {cost.reason}
              </InlineAlert>
            )}
            <div className="yx-ops-row">
              <Button variant="primary" disabled={!userId} loading={busy === 'add'} onClick={() => void run('add', async () => { await props.onAddMember({ userId: userId!, role, tier: role === 'agent' || role === 'lead' ? (tier ?? undefined) : undefined }); setUserId(null); })}>
                Add to desk
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function GroupsTab(props: TabProps) {
  const d = props.detail;
  const [edit, setEdit] = useState<DeskGroup | 'new' | null>(null);
  const agents = d.members.filter((m) => m.active && (m.role === 'agent' || m.role === 'lead'));
  return (
    <div className="yx-ops-stack">
      <ReadOnly show={!d.canSetUp} />
      <p className="yx-ops-muted">New tickets go to the group of their category. Take turns and Fewest open skip people who are away or off shift.</p>
      <ul className="yx-ops-list" aria-label="Groups">
        {d.groups.map((g) => (
          <li key={g.id} className="yx-ops-list__item">
            <span className="yx-ops-list__main">
              <span className="yx-ops-list__title">{g.name}</span>
              <span className="yx-ops-list__sub">
                {METHOD_LABEL[g.assignmentMethod]} · {g.memberIds.length} {g.memberIds.length === 1 ? 'person' : 'people'}
                {g.maxOpenPerAgent ? ` · at most ${g.maxOpenPerAgent} open each` : ''}
                {g.active ? '' : ' · off'}
              </span>
            </span>
            {d.canSetUp && (
              <Button size="sm" onClick={() => setEdit(g)}>
                Edit
              </Button>
            )}
          </li>
        ))}
      </ul>
      {d.canSetUp && (
        <div className="yx-ops-row">
          <Button icon={Plus} onClick={() => setEdit('new')}>
            New group
          </Button>
        </div>
      )}
      {edit && <GroupDialog group={edit === 'new' ? null : edit} agents={agents} onClose={() => setEdit(null)} onSave={(input) => props.onSaveGroup(edit === 'new' ? null : edit.id, input)} />}
    </div>
  );
}

function GroupDialog({ group, agents, onClose, onSave }: { group: DeskGroup | null; agents: DeskMember[]; onClose: () => void; onSave: (i: Parameters<DeskSetupScreenProps['onSaveGroup']>[1]) => Promise<void> }) {
  const [name, setName] = useState(group?.name ?? '');
  const [method, setMethod] = useState<DeskGroup['assignmentMethod']>(group?.assignmentMethod ?? 'round_robin');
  const [max, setMax] = useState<number | null>(group?.maxOpenPerAgent ?? null);
  const [members, setMembers] = useState<string[]>(group?.memberIds ?? []);
  const [active, setActive] = useState(group?.active ?? true);
  const { busy, error, run } = useRun();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={group ? `Edit ${group.name}` : 'New group'}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} loading={busy === 'save'} onClick={() => void run('save', async () => { await onSave({ name: name.trim(), assignmentMethod: method, maxOpenPerAgent: max, memberIds: members, active }); onClose(); })}>
            Save group
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <FormField label="Name" required>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField label="How new tickets are shared">
          <Segment label="How new tickets are shared" options={(Object.keys(METHOD_LABEL) as DeskGroup['assignmentMethod'][]).map((m) => ({ value: m, label: METHOD_LABEL[m] }))} value={method} onChange={setMethod} />
        </FormField>
        <FormField label="People" helper="Only people with an agent or team lead seat on this desk">
          <MultiSelect value={members} onChange={setMembers} options={agents.map((a) => ({ value: a.userId, label: a.name }))} placeholder="Choose people" />
        </FormField>
        <FormField label="Most open tickets per person" optional>
          <NumberField value={max} onChange={setMax} min={1} max={500} />
        </FormField>
        <Checkbox checked={active} onChange={setActive} label="Group is on" />
      </div>
    </Dialog>
  );
}

function CategoriesTab(props: TabProps) {
  const d = props.detail;
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [sensitive, setSensitive] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(d.groups[0]?.id ?? null);
  const { busy, error, run } = useRun();
  const top = d.categories.filter((c) => !c.parentId);
  return (
    <div className="yx-ops-stack">
      <ReadOnly show={!d.canSetUp} />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <ul className="yx-ops-list" aria-label="Categories">
        {top.flatMap((c) => [c, ...d.categories.filter((s) => s.parentId === c.id)]).map((c) => (
          <li key={c.id} className="yx-ops-list__item">
            <span className="yx-ops-list__main">
              <span className="yx-ops-list__title">{c.parentId ? `· ${c.name}` : c.name}</span>
              <span className="yx-ops-list__sub">
                {d.groups.find((g) => g.id === c.defaultGroupId)?.name ?? 'No group'}
                {c.sensitive ? ' · sensitive: agents only' : ''}
                {c.active ? '' : ' · off'}
              </span>
            </span>
            {d.canSetUp && (
              <Button size="sm" loading={busy === c.id} onClick={() => void run(c.id, () => props.onSaveCategory(c.id, { name: c.name, parentId: c.parentId, sensitive: c.sensitive, defaultGroupId: c.defaultGroupId, active: !c.active }))}>
                {c.active ? 'Turn off' : 'Turn on'}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {d.canSetUp && (
        <Card title="Add a category">
          <div className="yx-ops-stack">
            <FormField label="Name" required>
              <TextField value={name} onChange={setName} maxLength={100} />
            </FormField>
            <FormField label="Inside" optional>
              <Select value={parentId} onChange={setParentId} clearable options={top.map((c) => ({ value: c.id, label: c.name }))} placeholder="Top level" />
            </FormField>
            <FormField label="Group that gets these tickets">
              <Select value={groupId} onChange={setGroupId} clearable options={d.groups.map((g) => ({ value: g.id, label: g.name }))} />
            </FormField>
            <Checkbox checked={sensitive} onChange={setSensitive} label="Sensitive" description="Tickets in it are seen only by this desk’s agents and leads, never by admins." />
            <div className="yx-ops-row">
              <Button variant="primary" disabled={!name.trim()} loading={busy === 'add'} onClick={() => void run('add', async () => { await props.onSaveCategory(null, { name: name.trim(), parentId, sensitive, defaultGroupId: groupId, active: true }); setName(''); })}>
                Add category
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function TypesTab(props: TabProps) {
  const d = props.detail;
  const [typeName, setTypeName] = useState('');
  const [kind, setKind] = useState<'incident' | 'request' | 'question'>('request');
  const [label, setLabel] = useState('');
  const [state, setState] = useState<SystemState | null>('open');
  const { busy, error, run } = useRun();
  return (
    <div className="yx-ops-stack">
      <ReadOnly show={!d.canSetUp} />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <p className="yx-ops-muted">Status names are yours. Each one keeps a fixed meaning (new, open, waiting, on hold, resolved, closed), so reports and response targets still work.</p>
      <ul className="yx-ops-list" aria-label="Statuses">
        {d.statuses.map((s) => (
          <li key={s.id} className="yx-ops-list__item">
            <span className="yx-ops-list__main">
              <span className="yx-ops-list__title">{s.label}</span>
              <span className="yx-ops-list__sub">
                Means: {STATE_LABEL[s.systemState]}
                {s.ticketTypeId ? ` · only for ${d.types.find((t) => t.id === s.ticketTypeId)?.name}` : ''}
                {s.active ? '' : ' · off'}
              </span>
            </span>
            {d.canSetUp && (
              <Button size="sm" loading={busy === s.id} onClick={() => void run(s.id, () => props.onSaveStatus(s.id, { label: s.label, active: !s.active }))}>
                {s.active ? 'Turn off' : 'Turn on'}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {d.canSetUp && (
        <span className="yx-ops-row">
          <TextField size="sm" value={label} onChange={setLabel} aria-label="New status name" placeholder="New status name" maxLength={60} />
          <Select size="sm" value={state} onChange={setState} options={(Object.keys(STATE_LABEL) as SystemState[]).map((s) => ({ value: s, label: `Means: ${STATE_LABEL[s]}` }))} aria-label="What it means" />
          <Button size="sm" disabled={!label.trim() || !state} loading={busy === 'status'} onClick={() => void run('status', async () => { await props.onSaveStatus(null, { label: label.trim(), systemState: state! }); setLabel(''); })}>
            Add status
          </Button>
        </span>
      )}
      <h3 className="yx-ops-card__title">Ticket types</h3>
      <ul className="yx-ops-list" aria-label="Ticket types">
        {d.types.map((t) => (
          <li key={t.id} className="yx-ops-list__item">
            <span className="yx-ops-list__main">
              <span className="yx-ops-list__title">{t.name}</span>
              <span className="yx-ops-list__sub">
                {t.kind === 'incident' ? 'Something is broken' : t.kind === 'request' ? 'A request' : 'A question'}
                {t.active ? '' : ' · off'}
              </span>
            </span>
            {d.canSetUp && (
              <Button size="sm" loading={busy === t.id} onClick={() => void run(t.id, () => props.onSaveType(t.id, { name: t.name, active: !t.active }))}>
                {t.active ? 'Turn off' : 'Turn on'}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {d.canSetUp && (
        <span className="yx-ops-row">
          <TextField size="sm" value={typeName} onChange={setTypeName} aria-label="New type name" placeholder="New type name" maxLength={60} />
          <Segment label="Kind" options={[{ value: 'incident', label: 'Broken' }, { value: 'request', label: 'Request' }, { value: 'question', label: 'Question' }]} value={kind} onChange={setKind} />
          <Button size="sm" disabled={!typeName.trim()} loading={busy === 'type'} onClick={() => void run('type', async () => { await props.onSaveType(null, { name: typeName.trim(), kind }); setTypeName(''); })}>
            Add type
          </Button>
        </span>
      )}
    </div>
  );
}

function MatrixTab(props: TabProps) {
  const d = props.detail;
  const cell = (i: number, u: number) => d.matrix.find((m) => m.impact === i && m.urgency === u)?.priority ?? 3;
  const [cells, setCells] = useState(() => [1, 2, 3, 4].flatMap((impact) => [1, 2, 3, 4].map((urgency) => ({ impact, urgency, priority: cell(impact, urgency) }))));
  const { busy, error, run } = useRun();
  const words = ['High', 'Medium', 'Low', 'Very low'];
  return (
    <div className="yx-ops-stack">
      <ReadOnly show={!d.canSetUp} />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <p className="yx-ops-muted">Priority comes from how many people are hit (impact) and how soon it matters (urgency). Agents can still change it with a reason.</p>
      <table className="yx-desk-matrix">
        <caption className="yx-ops-muted">Rows: impact. Columns: urgency.</caption>
        <thead>
          <tr>
            <th scope="col">Impact \ Urgency</th>
            {words.map((w) => (
              <th key={w} scope="col">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4].map((impact) => (
            <tr key={impact}>
              <th scope="row">{words[impact - 1]}</th>
              {[1, 2, 3, 4].map((urgency) => {
                const c = cells.find((x) => x.impact === impact && x.urgency === urgency)!;
                return (
                  <td key={urgency}>
                    <Select size="sm" aria-label={`Impact ${words[impact - 1]}, urgency ${words[urgency - 1]}`} value={String(c.priority)} disabled={!d.canSetUp} onChange={(v) => v && setCells((all) => all.map((x) => (x === c ? { ...x, priority: Number(v) } : x)))} options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: PRIORITY_LABEL[p] }))} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {d.canSetUp && (
        <div className="yx-ops-row">
          <Button variant="primary" loading={busy === 'save'} onClick={() => void run('save', () => props.onSaveMatrix(cells))}>
            Save priorities
          </Button>
        </div>
      )}
    </div>
  );
}

function RepliesTab(props: TabProps) {
  const d = props.detail;
  const [edit, setEdit] = useState<CannedResponse | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scName, setScName] = useState('');
  const [scStatus, setScStatus] = useState<string | null>(null);
  const [scReply, setScReply] = useState('');
  const { busy, error, run } = useRun();
  const desk = props.canned.filter((c) => !c.personal);
  const open = (c: CannedResponse | 'new') => {
    setEdit(c);
    setTitle(c === 'new' ? '' : c.title);
    setBody(c === 'new' ? '' : c.bodyHtml);
  };
  return (
    <div className="yx-ops-stack">
      <ReadOnly show={!d.canSetUp} />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <p className="yx-ops-muted">
        Agents insert these in replies. {'{{requester.first_name}}'}, {'{{ticket.number}}'} and {'{{agent.name}}'} are filled in for them.
      </p>
      <ul className="yx-ops-list" aria-label="Saved replies">
        {desk.map((c) => (
          <li key={c.id} className="yx-ops-list__item">
            <span className="yx-ops-list__title">
              {c.title}
              {c.active ? '' : ' · off'}
            </span>
            {d.canSetUp && (
              <Button size="sm" onClick={() => open(c)}>
                Edit
              </Button>
            )}
          </li>
        ))}
      </ul>
      {d.canSetUp && (
        <div className="yx-ops-row">
          <Button icon={Plus} onClick={() => open('new')}>
            New saved reply
          </Button>
        </div>
      )}
      <h3 className="yx-ops-card__title">Scenarios</h3>
      <p className="yx-ops-muted">One click runs several steps: set a status and send a reply together.</p>
      <ul className="yx-ops-list" aria-label="Scenarios">
        {d.scenarios.map((s) => (
          <li key={s.id} className="yx-ops-list__item">
            <span className="yx-ops-list__title">{s.name}</span>
            {s.actions.statusId && <Badge tone="neutral">Sets {d.statuses.find((x) => x.id === s.actions.statusId)?.label}</Badge>}
          </li>
        ))}
      </ul>
      {d.canSetUp && (
        <Card title="New scenario">
          <div className="yx-ops-stack">
            <FormField label="Name" required>
              <TextField value={scName} onChange={setScName} maxLength={100} />
            </FormField>
            <FormField label="Set the status" optional>
              <Select value={scStatus} onChange={setScStatus} clearable options={d.statuses.filter((s) => s.active).map((s) => ({ value: s.id, label: s.label }))} />
            </FormField>
            <FormField label="Reply to send" optional>
              <RichTextEditor value={scReply} onChange={setScReply} mergeFields={[]} />
            </FormField>
            <div className="yx-ops-row">
              <Button disabled={!scName.trim()} loading={busy === 'scenario'} onClick={() => void run('scenario', async () => { await props.onSaveScenario(null, { name: scName.trim(), actions: { ...(scStatus ? { statusId: scStatus } : {}), ...(scReply.replace(/<[^>]*>/g, '').trim() ? { reply: scReply } : {}) } }); setScName(''); setScReply(''); setScStatus(null); })}>
                Add scenario
              </Button>
            </div>
          </div>
        </Card>
      )}
      {edit && (
        <Dialog
          open
          onOpenChange={(o) => !o && setEdit(null)}
          title={edit === 'new' ? 'New saved reply' : `Edit ${edit.title}`}
          size="md"
          footer={
            <>
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              {edit !== 'new' && (
                <Button loading={busy === 'off'} onClick={() => void run('off', async () => { await props.onSaveCanned(edit.id, { title: edit.title, bodyHtml: edit.bodyHtml, active: !edit.active }); setEdit(null); })}>
                  {edit.active ? 'Turn off' : 'Turn on'}
                </Button>
              )}
              <Button variant="primary" disabled={!title.trim() || !body.replace(/<[^>]*>/g, '').trim()} loading={busy === 'canned'} onClick={() => void run('canned', async () => { await props.onSaveCanned(edit === 'new' ? null : edit.id, { title: title.trim(), bodyHtml: body, active: edit === 'new' ? true : edit.active }); setEdit(null); })}>
                Save reply
              </Button>
            </>
          }
        >
          <div className="yx-ops-stack">
            <FormField label="Title" required>
              <TextField value={title} onChange={setTitle} maxLength={100} />
            </FormField>
            <FormField label="Reply" required>
              <RichTextEditor value={body} onChange={setBody} mergeFields={[]} />
            </FormField>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function SettingsTab(props: TabProps) {
  const x = props.detail.desk;
  const [name, setName] = useState(x.name);
  const [privacy, setPrivacy] = useState(x.privacy);
  const [prefix, setPrefix] = useState(x.numberPrefix);
  const [suffix, setSuffix] = useState(x.numberSuffix);
  const [next, setNext] = useState<number | null>(null);
  const [types, setTypes] = useState(x.attachmentTypes.join(', '));
  const [maxMb, setMaxMb] = useState<number | null>(x.attachmentMaxMb);
  const [vip, setVip] = useState(x.vipRaisesPriority);
  const [calendarId, setCalendarId] = useState<string | null>(x.calendarId);
  const { busy, error, run } = useRun();
  const can = props.detail.canSetUp;
  return (
    <div className="yx-ops-stack">
      <ReadOnly show={!can} />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <FormField label="Desk name" required>
        <TextField value={name} onChange={setName} maxLength={100} disabled={!can} />
      </FormField>
      <FormField label="Who can see its tickets" helper="Restricted: only the desk’s agents and leads, never desk admins or company admins.">
        <Segment label="Who can see its tickets" options={[{ value: 'standard', label: 'Standard' }, { value: 'restricted', label: 'Restricted' }]} value={privacy} onChange={(v) => can && setPrivacy(v)} />
      </FormField>
      <FormField label="Ticket numbers" helper={`Next ticket looks like ${prefix}1234${suffix}. Old numbers keep working.`}>
        <span className="yx-ops-row">
          <TextField size="sm" aria-label="Prefix" value={prefix} onChange={(v) => setPrefix(v.toUpperCase())} maxLength={12} disabled={!can} />
          <TextField size="sm" aria-label="Suffix" value={suffix} onChange={(v) => setSuffix(v.toUpperCase())} maxLength={12} disabled={!can} placeholder="Suffix (optional)" />
          <NumberField size="sm" aria-label="Jump to number" value={next} onChange={setNext} min={1} disabled={!can} placeholder="Next number (only up)" />
        </span>
      </FormField>
      <FormField label="Business hours" helper="The calendar this desk’s response targets will use.">
        <Select value={calendarId} onChange={setCalendarId} clearable disabled={!can} options={props.calendars.map((c) => ({ value: c.id, label: `${c.name} · ${c.timeZone}` }))} />
      </FormField>
      <FormField label="Files people may add" helper="File endings, separated by commas. Every file is checked for viruses too.">
        <TextField value={types} onChange={setTypes} disabled={!can} />
      </FormField>
      <FormField label="Largest file (MB)">
        <NumberField value={maxMb} onChange={setMaxMb} min={1} max={25} disabled={!can} />
      </FormField>
      <Switch label="VIP requesters get one step higher priority" checked={vip} onChange={setVip} disabled={!can} />
      {can && (
        <div className="yx-ops-row">
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() =>
              void run('save', () =>
                props.onUpdateDesk({
                  name: name.trim(),
                  privacy,
                  numberPrefix: prefix,
                  numberSuffix: suffix,
                  attachmentTypes: types.split(',').map((t) => t.trim().toLowerCase().replace(/^\./, '')).filter(Boolean),
                  attachmentMaxMb: maxMb ?? x.attachmentMaxMb,
                  vipRaisesPriority: vip,
                  calendarId,
                  ...(next ? { nextNumber: next } : {}),
                }),
              )
            }
          >
            Save settings
          </Button>
        </div>
      )}
    </div>
  );
}

function CalendarsTab(props: TabProps) {
  const [on, setOn] = useState('');
  const [name, setName] = useState('');
  const [half, setHalf] = useState(false);
  const [days, setDays] = useState<string[]>(['1', '2', '3', '4', '5']);
  const [start, setStart] = useState<string | null>('09:00');
  const [end, setEnd] = useState<string | null>('18:00');
  const [from, setFrom] = useState('');
  const { busy, error, run } = useRun();
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <p className="yx-ops-muted">Calendars are shared by every desk (and by approvals later). Changing hours starts from a date; tickets already counted keep the old hours.</p>
      {props.calendars.map((c) => {
        const today = new Date().toISOString().slice(0, 10);
        const current = c.hours.filter((h) => h.validFrom <= today && (!h.validTo || h.validTo >= today));
        return (
          <Card key={c.id} title={`${c.name} · ${c.timeZone}`}>
            <div className="yx-ops-stack" data-gap="sm">
              <p>{current.length ? current.map((h) => `${DAYS[h.weekday - 1]} ${hhmm(h.startMinute)}–${hhmm(h.endMinute)}`).join(', ') : 'No working hours today'}</p>
              {c.hours.some((h) => h.validFrom > today) && <p className="yx-ops-muted">New hours are planned from {c.hours.filter((h) => h.validFrom > today)[0].validFrom}.</p>}
              <p className="yx-ops-muted">Holidays: {c.holidays.length ? c.holidays.map((h) => `${h.on} ${h.name}${h.halfDay ? ' (half day)' : ''}`).join(' · ') : 'none'}</p>
              <span className="yx-ops-row">
                <TextField size="sm" type="date" aria-label="Holiday date" value={on} onChange={setOn} />
                <TextField size="sm" aria-label="Holiday name" placeholder="Holiday name" value={name} onChange={setName} maxLength={100} />
                <Checkbox checked={half} onChange={setHalf} label="Half day" />
                <Button size="sm" disabled={!on || !name.trim()} loading={busy === `h-${c.id}`} onClick={() => void run(`h-${c.id}`, async () => { await props.onAddHoliday(c.id, { on, name: name.trim(), halfDay: half }); setName(''); setOn(''); })}>
                  Add holiday
                </Button>
              </span>
              <span className="yx-ops-row">
                <MultiSelect size="sm" aria-label="Working days" value={days} onChange={setDays} options={DAYS.map((x, i) => ({ value: String(i + 1), label: x }))} />
                <TimeField size="sm" aria-label="Start" value={start} onChange={setStart} />
                <TimeField size="sm" aria-label="End" value={end} onChange={setEnd} />
                <TextField size="sm" type="date" aria-label="From date" value={from} onChange={setFrom} />
                <Button
                  size="sm"
                  disabled={!from || !days.length || toMin(start) === null || toMin(end) === null || (toMin(end) ?? 0) <= (toMin(start) ?? 0)}
                  loading={busy === `w-${c.id}`}
                  onClick={() => void run(`w-${c.id}`, () => props.onSetHours(c.id, { effectiveFrom: from, hours: days.map((x) => ({ weekday: Number(x), startMinute: toMin(start)!, endMinute: toMin(end)! })) }))}
                >
                  Change hours from this date
                </Button>
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
