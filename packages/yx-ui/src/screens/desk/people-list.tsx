import { useRef, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { PasswordField, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DataTable, type TableColumn } from '../../components/table';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { CopyValue, DeskPage, when } from './desk-kit';
import type { DeskSummary, LoadState } from './types';

// People list and directory sync (SD-1.29): the light list of people for a company that uses only the Service Desk
// (added by hand, from a CSV file, or kept in step with LDAP / Active Directory or SCIM), and which directory groups
// get seats on which desks. Directory passwords and SCIM tokens need a fresh second factor (asked for by the app).

export interface DeskPerson {
  id: string;
  name: string;
  email: string | null;
  team: string | null;
  location: string | null;
  locationId: string | null;
  source: string;
  hasLogin: boolean;
  /** null: not from a directory. */
  directoryActive: boolean | null;
}

export interface PersonInput {
  email?: string;
  givenName: string;
  familyName?: string;
  team?: string;
  location?: string;
}

export interface ImportResult {
  imported: number;
  created?: number;
  rows: number;
  problems: { row: number; problem: string }[];
}

export type GroupRole = 'agent' | 'lead' | 'collaborator';
export interface GroupMapRow {
  group: string;
  deskId: string;
  role: GroupRole;
}

export interface DirectorySource {
  id: string;
  kind: 'ldap' | 'scim';
  name: string;
  ldap: { url: string; bindDn: string; baseDn: string; filter: string | null } | null;
  scimUrl: string | null;
  groupMap: GroupMapRow[];
  schedule: 'hourly' | 'daily' | 'off';
  status: string;
  lastSyncAt: string | null;
  lastResult: { ok: boolean; read?: number; applied?: number; error?: string; at?: string } | null;
  people: number;
  disabled: number;
  version: number;
}

export interface DirectorySourceInput {
  kind: 'ldap' | 'scim';
  name: string;
  ldap?: { url: string; bindDn: string; bindPassword?: string; baseDn: string; filter?: string };
  groupMap: GroupMapRow[];
  schedule?: 'hourly' | 'daily' | 'off';
  version?: number;
}

export interface PeopleListScreenProps {
  state: LoadState;
  onRetry?: () => void;
  people: DeskPerson[];
  search: string;
  onSearch: (q: string) => void;
  onSavePerson: (id: string | null, input: PersonInput) => Promise<void>;
  /** dryRun: check every row and change nothing. */
  onImport: (csv: string, dryRun: boolean) => Promise<ImportResult>;
  sources: DirectorySource[];
  desks: DeskSummary[];
  /** A new SCIM source answers with its token (shown once). */
  onSaveSource: (source: DirectorySource | null, input: DirectorySourceInput) => Promise<{ id: string; scimToken?: string; scimUrl?: string | null }>;
  onSyncNow: (source: DirectorySource) => Promise<unknown>;
  onNewToken: (source: DirectorySource) => Promise<{ scimToken: string }>;
}

const SOURCE_LABEL: Record<string, string> = { csv: 'CSV file', ldap: 'LDAP / AD', scim: 'SCIM', manual: 'Added by hand' };
const SCHEDULES = [
  { value: 'hourly' as const, label: 'Every hour' },
  { value: 'daily' as const, label: 'Every day' },
  { value: 'off' as const, label: 'Off' },
];
const ROLES = [
  { value: 'agent' as const, label: 'Agent' },
  { value: 'lead' as const, label: 'Team lead' },
  { value: 'collaborator' as const, label: 'Collaborator' },
];

export function PeopleListScreen(props: PeopleListScreenProps) {
  const [tab, setTab] = useState('people');
  const [edit, setEdit] = useState<DeskPerson | 'new' | null>(null);
  return (
    <DeskPage
      title="People list"
      description="The people who can raise tickets. Add them by hand, from a CSV file, or keep them in step with your company directory."
      state={props.state}
      onRetry={props.onRetry}
      what="the people list"
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setEdit('new')}>
          Add a person
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="People list">
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="import">Import from CSV</TabsTrigger>
          <TabsTrigger value="sync">Directory sync</TabsTrigger>
        </TabsList>
        <TabsContent value="people">
          <PeopleTable {...props} onEdit={setEdit} />
        </TabsContent>
        <TabsContent value="import">
          <ImportCard onImport={props.onImport} />
        </TabsContent>
        <TabsContent value="sync">
          <SyncTab {...props} />
        </TabsContent>
      </Tabs>
      {edit && (
        <PersonDrawer
          person={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onSave={async (input) => {
            await props.onSavePerson(edit === 'new' ? null : edit.id, input);
            setEdit(null);
          }}
        />
      )}
    </DeskPage>
  );
}

function PeopleTable(props: PeopleListScreenProps & { onEdit: (p: DeskPerson) => void }) {
  const columns: TableColumn<DeskPerson>[] = [
    { key: 'name', header: 'Name', type: 'person', value: (p) => p.name, person: (p) => ({ name: p.name, secondary: p.email ?? undefined }), width: 240, hideable: false },
    { key: 'team', header: 'Team', value: (p) => p.team ?? '—', width: 140 },
    { key: 'location', header: 'Location', value: (p) => p.location ?? '—', width: 140 },
    { key: 'source', header: 'Came from', value: (p) => SOURCE_LABEL[p.source] ?? p.source, width: 130 },
    { key: 'login', header: 'Can sign in', value: (p) => (p.hasLogin ? 'Yes' : 'No'), width: 110 },
    {
      key: 'dir',
      header: 'In the directory',
      value: (p) => (p.directoryActive === null ? '—' : p.directoryActive ? 'Active' : 'Turned off'),
      render: (p) => (p.directoryActive === null ? '—' : <Badge tone={p.directoryActive ? 'success' : 'warning'}>{p.directoryActive ? 'Active' : 'Turned off'}</Badge>),
      width: 140,
    },
  ];
  return (
    <div className="yx-ops-stack">
      <TextField type="search" aria-label="Find a person" placeholder="Find by name, email or team" value={props.search} onChange={props.onSearch} />
      <DataTable
        label="People"
        columns={columns}
        rows={props.people}
        getRowId={(p) => p.id}
        rowNoun={['person', 'people']}
        filtered={Boolean(props.search)}
        empty={<EmptyState compact title="No people yet." description="Add a person, import a CSV file or connect your directory." />}
        rowButtons={(p) => (
          <Button size="sm" aria-label={`Edit ${p.name}`} onClick={() => props.onEdit(p)}>
            Edit
          </Button>
        )}
      />
    </div>
  );
}

function PersonDrawer({ person, onClose, onSave }: { person: DeskPerson | null; onClose: () => void; onSave: (i: PersonInput) => Promise<void> }) {
  const [given, setGiven] = useState(person ? person.name.split(' ')[0] : '');
  const [family, setFamily] = useState(person ? person.name.split(' ').slice(1).join(' ') : '');
  const [email, setEmail] = useState('');
  const [team, setTeam] = useState(person?.team ?? '');
  const [location, setLocation] = useState(person?.location ?? '');
  const { busy, error, run } = useRun();
  const ok = given.trim() && (person || email.includes('@'));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={person ? `Edit ${person.name}` : 'Add a person'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ok}
            loading={busy === 'save'}
            onClick={() => void run('save', () => onSave({ ...(person ? {} : { email: email.trim() }), givenName: given.trim(), familyName: family.trim(), team: team.trim(), location: location.trim() }))}
          >
            {person ? 'Save' : 'Add person'}
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The person was not saved">{error}</InlineAlert>}
        <FormField label="Given name" required>
          <TextField value={given} onChange={setGiven} maxLength={100} />
        </FormField>
        <FormField label="Family name" optional>
          <TextField value={family} onChange={setFamily} maxLength={100} />
        </FormField>
        {person ? (
          <FormField label="Email">
            <TextField value={person.email ?? ''} readOnly />
          </FormField>
        ) : (
          <FormField label="Email" required helper="Their work email. It cannot be changed later.">
            <TextField type="email" value={email} onChange={setEmail} maxLength={320} />
          </FormField>
        )}
        <FormField label="Team" optional>
          <TextField value={team} onChange={setTeam} maxLength={100} />
        </FormField>
        <FormField label="Location" optional helper="The name of one of your locations, like Chennai office.">
          <TextField value={location} onChange={setLocation} maxLength={100} />
        </FormField>
      </div>
    </Drawer>
  );
}

const readText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('We could not read that file.'));
    r.readAsText(file);
  });

function ImportCard({ onImport }: { onImport: PeopleListScreenProps['onImport'] }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const { busy, error, run } = useRun();
  return (
    <Card title="Import from a CSV file">
      <div className="yx-ops-stack">
        <p className="yx-ops-muted">
          One person per row, with a header row. Columns: <strong>name</strong> (or <strong>first_name</strong> and <strong>last_name</strong>), <strong>email</strong>, and if you have them <strong>team</strong> and{' '}
          <strong>location</strong> (the name of one of your locations). Up to 5,000 people at a time. Someone already on the list is updated, not added twice.
        </p>
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          data-testid="csv-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            void run('read', async () => {
              setFile({ name: f.name, csv: await readText(f) });
              setCheck(null);
              setDone(null);
            });
          }}
        />
        <span className="yx-ops-row">
          <Button icon={Upload} onClick={() => input.current?.click()}>
            {file ? 'Choose another file' : 'Choose a .csv file'}
          </Button>
          {file && <span>{file.name}</span>}
        </span>
        {file && (
          <span className="yx-ops-row">
            <Button loading={busy === 'check'} onClick={() => void run('check', async () => setCheck(await onImport(file.csv, true)))}>
              Check the file
            </Button>
            <Button
              variant="primary"
              disabled={!check || check.problems.length > 0}
              loading={busy === 'import'}
              onClick={() =>
                void run('import', async () => {
                  setDone(await onImport(file.csv, false));
                  setCheck(null);
                  setFile(null);
                })
              }
            >
              Import
            </Button>
          </span>
        )}
        {check && check.problems.length > 0 && (
          <InlineAlert tone="danger" title={`Fix ${check.problems.length} ${check.problems.length === 1 ? 'problem' : 'problems'} and choose the file again`}>
            <ul aria-label="Problems in the file">
              {check.problems.map((p, i) => (
                <li key={i}>
                  Row {p.row}: {p.problem}
                </li>
              ))}
            </ul>
          </InlineAlert>
        )}
        {check && check.problems.length === 0 && (
          <InlineAlert tone="success" title="The file looks right">
            {check.rows} {check.rows === 1 ? 'person' : 'people'} ready to import. Nothing has changed yet.
          </InlineAlert>
        )}
        {done && (
          <InlineAlert tone="success" title="Imported">
            {done.imported} {done.imported === 1 ? 'person' : 'people'} imported{done.created !== undefined ? `, ${done.created} of them new` : ''}.
          </InlineAlert>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------- directory sync

function SyncTab(props: PeopleListScreenProps) {
  const [edit, setEdit] = useState<DirectorySource | 'ldap' | 'scim' | null>(null);
  const [token, setToken] = useState<{ url: string; token: string } | null>(null);
  const { busy, error, run } = useRun();
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      {token && <ScimTokenBox url={token.url} token={token.token} onDone={() => setToken(null)} />}
      <Card
        title="Directories"
        actions={
          <span className="yx-ops-row">
            <Button size="sm" icon={Plus} onClick={() => setEdit('ldap')}>
              Connect LDAP / Active Directory
            </Button>
            <Button size="sm" icon={Plus} onClick={() => setEdit('scim')}>
              Connect with SCIM
            </Button>
          </span>
        }
      >
        {props.sources.length === 0 ? (
          <EmptyState compact title="No directory connected." description="Connect your company directory and people, teams and leavers stay up to date by themselves." />
        ) : (
          <ul className="yx-ops-list" aria-label="Directories">
            {props.sources.map((s) => (
              <li key={s.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">
                    {s.name} · {s.kind === 'ldap' ? 'LDAP / Active Directory' : 'SCIM'}
                  </span>
                  <span className="yx-ops-list__sub">
                    {s.people} {s.people === 1 ? 'person' : 'people'} · {s.disabled} turned off
                    {s.kind === 'ldap' ? ` · ${SCHEDULES.find((x) => x.value === s.schedule)?.label ?? s.schedule}` : ''}
                    {s.groupMap.length ? ` · ${s.groupMap.length} group ${s.groupMap.length === 1 ? 'rule' : 'rules'}` : ''}
                  </span>
                  {s.lastSyncAt && (
                    <span className="yx-ops-list__sub">
                      Last read {when(s.lastSyncAt)}: {s.lastResult?.ok ? `${s.lastResult.read ?? 0} read, ${s.lastResult.applied ?? 0} applied` : (s.lastResult?.error ?? 'did not work')}
                    </span>
                  )}
                </span>
                <span className="yx-ops-row">
                  <Badge tone={s.status === 'active' ? 'success' : s.status === 'error' ? 'danger' : 'neutral'}>{s.status === 'active' ? 'Working' : s.status === 'error' ? 'Problem' : 'Paused'}</Badge>
                  <Button size="sm" aria-label={`Settings for ${s.name}`} onClick={() => setEdit(s)}>
                    Settings
                  </Button>
                  {s.kind === 'ldap' ? (
                    <Button size="sm" aria-label={`Sync ${s.name} now`} loading={busy === `sync-${s.id}`} onClick={() => void run(`sync-${s.id}`, () => props.onSyncNow(s))}>
                      Sync now
                    </Button>
                  ) : (
                    <Button size="sm" aria-label={`New token for ${s.name}`} loading={busy === `tok-${s.id}`} onClick={() => void run(`tok-${s.id}`, async () => setToken({ url: s.scimUrl ?? '', token: (await props.onNewToken(s)).scimToken }))}>
                      New token
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {edit && (
        <SourceDrawer
          kind={typeof edit === 'string' ? edit : edit.kind}
          source={typeof edit === 'string' ? null : edit}
          desks={props.desks}
          onClose={() => setEdit(null)}
          onSave={async (input) => {
            const src = typeof edit === 'string' ? null : edit;
            const r = await props.onSaveSource(src, input);
            setEdit(null);
            if (r.scimToken) setToken({ url: r.scimUrl ?? src?.scimUrl ?? '', token: r.scimToken });
          }}
        />
      )}
    </div>
  );
}

/** The SCIM token is never shown again: copy it now (like the mailbox secret). */
export function ScimTokenBox({ url, token, onDone }: { url: string; token: string; onDone: () => void }) {
  return (
    <InlineAlert tone="warning" title="Copy now, shown once" actions={<Button size="sm" onClick={onDone}>I have copied them</Button>}>
      <span className="yx-ops-stack" data-gap="sm">
        <span>Give your identity provider this SCIM address and token. We cannot show the token again; make a new one if it is lost (the old one stops working).</span>
        {url ? <CopyValue label="SCIM base address" value={url} /> : <span>The SCIM base address is in the directory’s settings once the list reloads.</span>}
        <CopyValue label="SCIM token" value={token} />
      </span>
    </InlineAlert>
  );
}

function SourceDrawer({ kind, source, desks, onClose, onSave }: { kind: 'ldap' | 'scim'; source: DirectorySource | null; desks: DeskSummary[]; onClose: () => void; onSave: (i: DirectorySourceInput) => Promise<void> }) {
  const [name, setName] = useState(source?.name ?? (kind === 'ldap' ? 'Active Directory' : 'Identity provider'));
  const [url, setUrl] = useState(source?.ldap?.url ?? '');
  const [bindDn, setBindDn] = useState(source?.ldap?.bindDn ?? '');
  const [password, setPassword] = useState('');
  const [baseDn, setBaseDn] = useState(source?.ldap?.baseDn ?? '');
  const [filter, setFilter] = useState(source?.ldap?.filter ?? '');
  const [schedule, setSchedule] = useState<'hourly' | 'daily' | 'off'>(source?.schedule ?? 'daily');
  const [map, setMap] = useState<GroupMapRow[]>(source?.groupMap ?? []);
  const { busy, error, run } = useRun();
  const urlOk = /^ldaps:\/\/[A-Za-z0-9.-]{1,253}(:\d{1,5})?\/?$/.test(url);
  const ldapOk = kind === 'scim' || (urlOk && bindDn.trim().length >= 3 && baseDn.trim().length >= 3 && (source || password));
  const mapOk = map.every((m) => m.group.trim() && m.deskId);
  const paid = map.some((m) => m.role !== 'collaborator');
  const set = (i: number, change: Partial<GroupMapRow>) => setMap(map.map((m, j) => (j === i ? { ...m, ...change } : m)));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={source ? `Settings for ${source.name}` : kind === 'ldap' ? 'Connect LDAP / Active Directory' : 'Connect with SCIM'}
      subtitle={kind === 'ldap' ? 'We read your directory with a read-only account over a secure connection. We never write to it.' : 'Your identity provider (like Okta or Entra ID) sends people and groups to us.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!name.trim() || !ldapOk || !mapOk}
            loading={busy === 'save'}
            onClick={() =>
              void run('save', () =>
                onSave({
                  kind,
                  name: name.trim(),
                  ...(kind === 'ldap' ? { ldap: { url: url.trim(), bindDn: bindDn.trim(), ...(password ? { bindPassword: password } : {}), baseDn: baseDn.trim(), ...(filter.trim() ? { filter: filter.trim() } : {}) }, schedule } : {}),
                  groupMap: map.map((m) => ({ ...m, group: m.group.trim() })),
                  ...(source ? { version: source.version } : {}),
                }),
              )
            }
          >
            {source ? 'Save' : kind === 'scim' ? 'Connect and show the token' : 'Connect'}
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
        <FormField label="Name" required>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        {kind === 'ldap' && (
          <>
            <FormField label="Directory address" required helper="A secure address, like ldaps://dc1.example.com" error={url && !urlOk ? 'Start with ldaps:// and give the server name' : null}>
              <TextField value={url} onChange={setUrl} spellCheck={false} />
            </FormField>
            <FormField label="Read-only account" required helper="The account’s full name (DN), like CN=yukthix-read,OU=Service,DC=example,DC=com">
              <TextField value={bindDn} onChange={setBindDn} spellCheck={false} maxLength={300} />
            </FormField>
            <FormField label="Password" required={!source} helper={source ? 'Leave blank to keep the saved password.' : 'Kept encrypted. Never shown again.'}>
              <PasswordField value={password} onChange={setPassword} autoComplete="new-password" maxLength={300} />
            </FormField>
            <FormField label="Where people are" required helper="The base DN to read from, like OU=Staff,DC=example,DC=com">
              <TextField value={baseDn} onChange={setBaseDn} spellCheck={false} maxLength={300} />
            </FormField>
            <FormField label="Filter" optional helper="Only people who match, like (department=Sales). Starts with ( and ends with ).">
              <TextField value={filter} onChange={setFilter} spellCheck={false} maxLength={500} />
            </FormField>
            <FormField label="Read the directory">
              <Segment label="Read the directory" options={SCHEDULES} value={schedule} onChange={setSchedule} />
            </FormField>
          </>
        )}
        <Card title="Groups that get desk seats">
          <div className="yx-ops-stack">
            <p className="yx-ops-muted">People in a directory group get a seat on a desk. When they leave the group or are turned off, the seat ends.</p>
            {paid && <InlineAlert tone="warning">Agent and team lead seats cost ₹999 a month for each person. Collaborators are free.</InlineAlert>}
            {map.map((m, i) => (
              <div key={i} className="yx-ops-stack" data-gap="sm" role="group" aria-label={`Group rule ${i + 1}`}>
                <FormField label="Directory group" required>
                  <TextField value={m.group} onChange={(v) => set(i, { group: v })} maxLength={200} placeholder="IT Support" />
                </FormField>
                <FormField label="Desk" required>
                  <Select value={m.deskId || null} onChange={(v) => set(i, { deskId: v ?? '' })} options={desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose a desk" />
                </FormField>
                <FormField label="Seat">
                  <Segment label={`Seat for group rule ${i + 1}`} options={ROLES} value={m.role} onChange={(v) => set(i, { role: v })} />
                </FormField>
                <span>
                  <Button size="sm" onClick={() => setMap(map.filter((_, j) => j !== i))}>
                    Remove this rule
                  </Button>
                </span>
              </div>
            ))}
            <span>
              <Button size="sm" icon={Plus} disabled={map.length >= 50} onClick={() => setMap([...map, { group: '', deskId: '', role: 'agent' }])}>
                Add a group rule
              </Button>
            </span>
          </div>
        </Card>
      </div>
    </Drawer>
  );
}
