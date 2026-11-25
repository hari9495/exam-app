// Projects P-4 (PRJ-07, founder answers 1417, 1418): the live resource requests, drawn in the kit first (stories in
// prj-07-bench-requests.stories.tsx). The one bench is Staffing desk › Bench (1417): this page keeps only the Resource
// requests tab and links there. Matching is on free capacity only, bench first; skills come later (1418).
import { useState } from 'react';
import { Plus, UserSearch } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField, FormSection, useSaveErrors, type FormErrorItem } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { MenuItem } from '../../components/menu';
import { useToast } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Text } from '../../components/foundations';
import { formatDate } from '../../lib/format';
import { EditorDrawer, useRun } from '../org/org-kit';
import { ProjectsFrame } from './hiring-kit';
import { ProjectsOffState } from './projects';

export interface LiveResourceRequest {
  id: string;
  projectId: string;
  project: string;
  role: string;
  percent: number;
  fromOn: string;
  toOn: string;
  note: string | null;
  status: 'open' | 'filled' | 'withdrawn';
  requestedBy: string | null;
  person: string | null;
  mine: boolean;
  version: number;
}
/** GET /projects/requests. */
export interface ResourceRequestsData {
  can: { raise: boolean; fill: boolean };
  projects: { id: string; code: string; name: string }[];
  rows: LiveResourceRequest[];
}
/** GET /projects/requests/:id/matches. */
export interface RequestMatches {
  request: { id: string; percent: number; fromOn: string; toOn: string; role: string };
  matches: { employeeId: string; name: string; free: number; onBench: boolean }[];
}
export interface RequestInput {
  projectId: string;
  role: string;
  percent: number;
  fromOn: string;
  toOn: string;
  note: string | null;
}
export interface LiveRequests {
  state: 'ready' | 'loading' | 'error' | 'no-access' | 'off';
  onRetry?: () => void;
  data: ResourceRequestsData | null;
  onRaise: (input: RequestInput) => Promise<void>;
  onMatches: (id: string) => Promise<RequestMatches>;
  onFill: (id: string, employeeId: string, version: number) => Promise<void>;
  onWithdraw: (id: string, version: number) => Promise<void>;
  /** Staffing desk › Bench, the one bench (1417). */
  onBench: () => void;
  /** Stories: the raise drawer, or a request's matches, open. */
  defaultRaise?: boolean;
  defaultMatch?: RequestMatches;
}

const STATUS: Record<LiveResourceRequest['status'], string> = { open: 'Open', filled: 'Filled', withdrawn: 'Withdrawn' };
const d = (iso: string) => new Date(`${iso}T00:00:00`);
const isoOf = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const SHARES = ['25', '50', '75', '100'].map((v) => ({ value: v, label: `${v}%` }));

/** The checks the request form runs before saving (the API checks them again). */
export function requestProblems(v: { projectId: string | null; role: string; fromOn: string | null; toOn: string | null }): FormErrorItem[] {
  return [
    ...(!v.projectId ? [{ fieldId: 'rq-project', message: 'Choose the project.' }] : []),
    ...(!v.role.trim() ? [{ fieldId: 'rq-role', message: 'Say the role, such as Java developer.' }] : []),
    ...(!v.fromOn ? [{ fieldId: 'rq-from', message: 'Choose when it starts.' }] : []),
    ...(!v.toOn ? [{ fieldId: 'rq-to', message: 'Choose when it ends.' }] : v.fromOn && v.toOn < v.fromOn ? [{ fieldId: 'rq-to', message: 'The end is before the start.' }] : []),
  ];
}

function RaiseDrawer({ projects, onClose, onSave }: { projects: ResourceRequestsData['projects']; onClose: () => void; onSave: (input: RequestInput) => Promise<void> }) {
  const [v, setV] = useState<{ projectId: string | null; role: string; percent: string; fromOn: string | null; toOn: string | null; note: string }>({ projectId: projects.length === 1 ? projects[0]!.id : null, role: '', percent: '100', fromOn: null, toOn: null, note: '' });
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const errors = requestProblems(v);
  const save = useSaveErrors(errors);
  const set = (p: Partial<typeof v>) => {
    setV((x) => ({ ...x, ...p }));
    setDirty(true);
  };
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title="Raise resource request"
      subtitle="Projects resource finds someone with this much free time over the dates, bench first."
      errors={save.shownErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel="Send request"
      onSave={() => {
        if (errors.length) return save.reveal();
        void run('save', () => onSave({ projectId: v.projectId!, role: v.role.trim(), percent: Number(v.percent), fromOn: v.fromOn!, toOn: v.toOn!, note: v.note.trim() || null })).then((ok) => ok && onClose());
      }}
    >
      <FormSection title="What you need">
        <FormField id="rq-project" label="Project" required error={save.errorOf('rq-project')}>
          <Select value={v.projectId} onChange={(projectId) => set({ projectId })} placeholder="Choose" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
        </FormField>
        <FormField id="rq-role" label="Role" required helper="Skills come later; say the role and anything else in the note." error={save.errorOf('rq-role')}>
          <TextField value={v.role} onChange={(role) => set({ role })} maxLength={80} />
        </FormField>
        <FormField id="rq-pct" label="Share of their week" required>
          <Segment label="Share of their week" options={SHARES} value={v.percent} onChange={(percent) => set({ percent })} />
        </FormField>
      </FormSection>
      <FormSection title="When">
        <FormField id="rq-from" label="From" required error={save.errorOf('rq-from')}>
          <DatePicker value={v.fromOn ? d(v.fromOn) : null} onChange={(x) => set({ fromOn: x ? isoOf(x) : null })} />
        </FormField>
        <FormField id="rq-to" label="To" required error={save.errorOf('rq-to')}>
          <DatePicker value={v.toOn ? d(v.toOn) : null} onChange={(x) => set({ toOn: x ? isoOf(x) : null })} />
        </FormField>
        <FormField id="rq-note" label="Note" optional>
          <TextArea value={v.note} onChange={(note) => set({ note })} rows={2} maxLength={500} />
        </FormField>
      </FormSection>
    </EditorDrawer>
  );
}

/** PRJ-07 live: resource requests only; the bench is Staffing desk › Bench. */
export function LiveRequestsView({ live }: { live: LiveRequests }) {
  const data = live.data;
  const { toast } = useToast();
  const [raise, setRaise] = useState(Boolean(live.defaultRaise));
  const [match, setMatch] = useState<RequestMatches | null>(live.defaultMatch ?? null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<LiveResourceRequest | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { busy, run } = useRun();
  const bench = (
    <Button onClick={live.onBench}>Open the bench</Button>
  );
  const head = (
    <PageHeader
      title="Resource requests"
      description="Project managers ask for a share of someone's week; Projects resource fills it with a person who has that much free time, bench first. The bench itself is Staffing desk › Bench."
      actions={
        data ? (
          <>
            {bench}
            {data.can.raise && (
              <Button variant="primary" icon={Plus} onClick={() => setRaise(true)}>
                Raise request
              </Button>
            )}
          </>
        ) : undefined
      }
    />
  );
  if (!data)
    return (
      <ProjectsFrame active="Bench & requests">
        {head}
        {live.state === 'error' ? <ErrorState title="We couldn't load the requests." onRetry={live.onRetry ?? (() => {})} /> : live.state === 'off' ? <ProjectsOffState /> : live.state === 'no-access' ? <NoAccessState what="resource requests" grantedBy="your System Admin" /> : <Skeleton height={320} />}
      </ProjectsFrame>
    );
  const findPeople = async (r: LiveResourceRequest) => {
    setFailed(null);
    try {
      setPicked(null);
      setPickError(null);
      setMatch(await live.onMatches(r.id));
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'We could not find people. Try again.');
    }
  };
  const cols: TableColumn<LiveResourceRequest>[] = [
    { key: 'project', header: 'Project', type: 'id', value: (r) => r.project, width: 130 },
    { key: 'role', header: 'Role', value: (r) => r.role },
    { key: 'pct', header: 'Share', type: 'number', value: (r) => r.percent, render: (r) => `${r.percent}%`, width: 90 },
    { key: 'dates', header: 'Dates', value: (r) => r.fromOn, render: (r) => `${formatDate(d(r.fromOn))} – ${formatDate(d(r.toOn))}` },
    { key: 'by', header: 'Asked by', value: (r) => r.requestedBy ?? '—', optional: true },
    { key: 'status', header: 'Status', type: 'status', value: (r) => STATUS[r.status], statusTone: (v) => (v === 'Filled' ? 'success' : v === 'Open' ? 'warning' : 'neutral') },
    { key: 'person', header: 'Person', value: (r) => r.person ?? '—' },
  ];
  const req = match ? data.rows.find((r) => r.id === match.request.id) : null;
  return (
    <ProjectsFrame active="Bench & requests">
      {head}
      {failed && <InlineAlert tone="danger" title="That did not work">{failed}</InlineAlert>}
      <DataTable
        label="Resource requests"
        columns={cols}
        rows={data.rows}
        getRowId={(r) => r.id}
        rowButtons={data.can.fill ? (r) => (r.status === 'open' ? <Button size="sm" icon={UserSearch} onClick={() => void findPeople(r)}>Find people</Button> : null) : undefined}
        rowActions={(r) => (r.status === 'open' && (r.mine || data.can.fill) ? <MenuItem destructive onSelect={() => setWithdrawing(r)}>Withdraw request</MenuItem> : null)}
        empty={<EmptyState title="No resource requests." description="Project managers raise requests with a role, dates and a share of someone's week." />}
      />
      {raise && (
        <RaiseDrawer
          projects={data.projects}
          onClose={() => setRaise(false)}
          onSave={async (input) => {
            await live.onRaise(input);
            toast({ tone: 'success', title: 'Request sent' });
          }}
        />
      )}
      {match && (
        <Drawer
          open
          onOpenChange={(o) => !o && setMatch(null)}
          size="lg"
          title={`People for ${match.request.role} at ${match.request.percent}%`}
          subtitle={`${req?.project ?? ''} · ${formatDate(d(match.request.fromOn))} – ${formatDate(d(match.request.toOn))} · free time only (skills come later)`}
          footer={
            <>
              <Button onClick={() => setMatch(null)}>Cancel</Button>
              <Button
                variant="primary"
                loading={busy === 'fill'}
                onClick={() => {
                  if (!picked) return setPickError('Choose a person first.');
                  const m = match.matches.find((x) => x.employeeId === picked)!;
                  void run('fill', async () => {
                    await live.onFill(match.request.id, picked, req?.version ?? 1);
                    setMatch(null);
                    toast({ tone: 'success', title: `${m.name} allocated` });
                  }).then((ok) => !ok && setPickError(null));
                }}
              >
                Allocate
              </Button>
            </>
          }
        >
          {pickError && <InlineAlert tone="danger">{pickError}</InlineAlert>}
          {match.matches.length === 0 ? (
            <EmptyState title="No one has this much free time." description="People with less free time over these dates are not shown. Change the dates or the share." />
          ) : (
            <ol className="yx-hire-list" aria-label="People with free time, bench first">
              {match.matches.map((m, i) => (
                <li key={m.employeeId} className="yx-hire-list__item">
                  <div className="yx-hire-list__main">
                    <PersonLabel name={`${i + 1}. ${m.name}`} secondary={`${m.free}% free over these dates`} />
                    {m.onBench && <Badge tone="info">On the bench</Badge>}
                  </div>
                  <Button size="sm" aria-pressed={picked === m.employeeId} onClick={() => (setPicked(m.employeeId), setPickError(null))}>
                    {picked === m.employeeId ? 'Chosen' : 'Choose'}
                  </Button>
                </li>
              ))}
            </ol>
          )}
          <Text size="sm" tone="secondary">
            Allocating creates their allocation on the project for these dates; they can then book time to it.
          </Text>
        </Drawer>
      )}
      {withdrawing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setWithdrawing(null)}
          title={`Withdraw the ${withdrawing.role} request?`}
          consequence="Projects resource stops looking for someone. You can raise it again."
          confirmLabel="Withdraw request"
          destructive
          onConfirm={async () => {
            await live.onWithdraw(withdrawing.id, withdrawing.version);
            setWithdrawing(null);
            toast({ tone: 'success', title: 'Request withdrawn' });
          }}
        />
      )}
    </ProjectsFrame>
  );
}
