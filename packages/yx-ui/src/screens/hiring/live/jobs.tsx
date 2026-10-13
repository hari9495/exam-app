import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button } from '../../../components/button';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { Checkbox } from '../../../components/choice';
import type { Choice, HiringJob, HiringJobStatus, JobCustomField, LoadState, NewJobInput, OpenPlanLine } from './types';

// Recruitment batch AT1, wired (M10-BUILD-DESIGN §3): the jobs list that replaces the older /v2/jobs list. Opening a
// job still goes to its existing workspace until the YukthiX pipeline screens ship (AT5).

const STATUS: Record<HiringJobStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending_approval: { label: 'Waiting for approval', tone: 'warning' },
  open: { label: 'Open', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export type JobsFilter = 'all' | 'open' | 'closed';

export interface HiringJobsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  jobs: HiringJob[];
  filter: JobsFilter;
  onFilter: (f: JobsFilter) => void;
  /** pipeline:manage / ats.job.manage: create and delete jobs. */
  canManage: boolean;
  onOpen: (id: string) => void;
  onCreate: (input: NewJobInput) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /** Present only when the company's AI drafting is available. */
  onDraftDescription?: (title: string) => Promise<string>;
  /** P01 masters; when a list is empty the field is free text (a company without the masters set up). */
  departments: Choice[];
  locations: Choice[];
  designations: Choice[];
  managers: Choice[];
  pipelines: (Choice & { isDefault?: boolean })[];
  customFields: JobCustomField[];
  /** AT2: lines of approved headcount plans (empty: no plan in use), people a replacement may name, and the requisition actions. */
  planLines?: OpenPlanLine[];
  employees?: Choice[];
  onSubmitRequisition?: (id: string) => Promise<unknown>;
  onWithdraw?: (id: string) => Promise<unknown>;
}

export function HiringJobsScreen(p: HiringJobsScreenProps) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<HiringJob | null>(null);
  const q = search.trim().toLowerCase();
  const rows = q ? p.jobs.filter((j) => j.title.toLowerCase().includes(q)) : p.jobs;
  const columns: TableColumn<HiringJob>[] = [
    { key: 't', header: 'Job', value: (x) => x.title, width: 280, hideable: false },
    { key: 's', header: 'Status', value: (x) => x.status, render: (x) => <Badge tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Badge>, width: 180 },
    { key: 'p', header: 'Pipeline', value: (x) => x.stageSummary, width: 320 },
    { key: 'c', header: 'Created', value: (x) => x.createdAt, render: (x) => <span>{dateText(x.createdAt.slice(0, 10))}</span>, width: 140 },
  ];
  return (
    <LivePage
      title="Jobs"
      description="Open a job to follow its candidates from applied to hired."
      state={p.state}
      onRetry={p.onRetry}
      what="jobs"
      grantedBy="your admin"
      actions={
        p.canManage && (
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New job
          </Button>
        )
      }
    >
      <Segment label="Show" value={p.filter} onChange={p.onFilter} options={[{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} />
      <FormField id="hj-search" label="Search jobs" hideLabel>
        <TextField value={search} onChange={setSearch} placeholder="Search jobs" maxLength={200} />
      </FormField>
      <DataTable
        label="Jobs"
        columns={columns}
        rows={rows}
        getRowId={(x) => x.id}
        rowNoun={['job', 'jobs']}
        cardSummary
        empty={<EmptyState compact title={q ? 'No matches.' : 'No jobs yet.'} />}
        rowButtons={(x) => (
          <>
            <Button size="sm" onClick={() => p.onOpen(x.id)}>
              Open
            </Button>
            {p.canManage && x.status === 'draft' && p.onSubmitRequisition && (
              <Button size="sm" variant="primary" onClick={() => void p.onSubmitRequisition!(x.id)}>
                Send for approval
              </Button>
            )}
            {p.canManage && x.status === 'pending_approval' && p.onWithdraw && (
              <Button size="sm" onClick={() => void p.onWithdraw!(x.id)}>
                Withdraw
              </Button>
            )}
            {p.canManage && (
              <Button size="sm" variant="danger" onClick={() => setDeleting(x)}>
                Delete
              </Button>
            )}
          </>
        )}
      />
      {creating && <NewJobDialog {...p} onClose={() => setCreating(false)} />}
      {deleting && (
        <ConfirmDialog open onOpenChange={(o) => !o && setDeleting(null)} size="sm" title="Delete job" consequence={`"${deleting.title}" and its pipeline are removed.`} confirmLabel="Delete" destructive onConfirm={async () => {
          await p.onDelete(deleting.id);
          setDeleting(null);
        }}>
          <span />
        </ConfirmDialog>
      )}
    </LivePage>
  );
}

function NewJobDialog(p: HiringJobsScreenProps & { onClose: () => void }) {
  const { busy, error, run } = useRun();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [department, setDepartment] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [designationId, setDesignationId] = useState<string | null>(null);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState<number | null>(null);
  const [salaryMin, setSalaryMin] = useState<number | null>(null);
  const [salaryMax, setSalaryMax] = useState<number | null>(null);
  const [currency, setCurrency] = useState('');
  const [pipelineId, setPipelineId] = useState<string | null>(p.pipelines.find((x) => x.isDefault)?.value ?? p.pipelines[0]?.value ?? null);
  const [custom, setCustom] = useState<Record<string, string | number | null>>({});
  const [reason, setReason] = useState<'new' | 'replacement'>('new');
  const [lineId, setLineId] = useState<string | null>(null);
  const [outside, setOutside] = useState(false);
  const [outsideWhy, setOutsideWhy] = useState('');
  const [replaces, setReplaces] = useState<string | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [start, setStart] = useState<Date | null>(null);
  const lines = (p.planLines ?? []).filter((l) => !departmentId || l.departmentId === departmentId);
  const missing = p.customFields.filter((f) => f.required && (custom[f.id] === undefined || custom[f.id] === null || custom[f.id] === ''));
  const rangeBad = salaryMin !== null && salaryMax !== null && salaryMin > salaryMax;
  const reqBad = (reason === 'replacement' && !replaces) || (outside && outsideWhy.trim().length < 3);
  const ok = title.trim().length > 0 && !missing.length && !rangeBad && !reqBad;
  const opt = <T,>(v: T | null | '') => (v === null || v === '' ? undefined : v);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} size="md" title="New job" confirmLabel="Create" confirmDisabled={!ok} onConfirm={async () => {
      await p.onCreate({
        title: title.trim(),
        description: opt(description.trim()),
        departmentId: opt(departmentId),
        department: p.departments.length ? undefined : opt(department.trim()),
        locationId: opt(locationId),
        location: p.locations.length ? undefined : opt(location.trim()),
        designationId: opt(designationId),
        hiringManagerId: opt(managerId),
        headcount: opt(headcount),
        salaryMin: opt(salaryMin),
        salaryMax: opt(salaryMax),
        salaryCurrency: opt(currency.trim().toUpperCase()),
        pipelineId: opt(pipelineId),
        customFields: Object.keys(custom).length ? custom : undefined,
        requisitionReason: reason,
        headcountPlanLineId: reason === 'new' && !outside ? opt(lineId) : undefined,
        outsidePlan: reason === 'new' && outside ? true : undefined,
        outsidePlanReason: reason === 'new' && outside ? outsideWhy.trim() : undefined,
        replacementOfEmployeeId: reason === 'replacement' ? opt(replaces) : undefined,
        budgetAmount: opt(budget),
        targetStart: start ? dayKey(start) : undefined,
      });
      p.onClose();
    }}>
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <FormField id="hj-title" label="Job title" required>
        <TextField value={title} onChange={setTitle} maxLength={200} />
      </FormField>
      <FormField id="hj-dept" label="Department" optional>
        {p.departments.length ? <Select aria-label="Department" value={departmentId} onChange={setDepartmentId} options={p.departments} searchable clearable /> : <TextField value={department} onChange={setDepartment} maxLength={200} />}
      </FormField>
      <FormField id="hj-loc" label="Location" optional>
        {p.locations.length ? <Select aria-label="Location" value={locationId} onChange={setLocationId} options={p.locations} searchable clearable /> : <TextField value={location} onChange={setLocation} maxLength={200} />}
      </FormField>
      {p.designations.length > 0 && (
        <FormField id="hj-desig" label="Designation" optional>
          <Select aria-label="Designation" value={designationId} onChange={setDesignationId} options={p.designations} searchable clearable />
        </FormField>
      )}
      <FormField id="hj-mgr" label="Hiring manager" optional>
        <Select aria-label="Hiring manager" value={managerId} onChange={setManagerId} options={p.managers} searchable clearable />
      </FormField>
      <FormField id="hj-count" label="Openings" optional>
        <NumberField value={headcount} onChange={setHeadcount} min={1} />
      </FormField>
      <FormField id="hj-min" label="Salary from" optional>
        <NumberField value={salaryMin} onChange={setSalaryMin} min={0} />
      </FormField>
      <FormField id="hj-max" label="Salary up to" optional error={rangeBad ? 'Must be at least the starting salary.' : undefined}>
        <NumberField value={salaryMax} onChange={setSalaryMax} min={0} />
      </FormField>
      <FormField id="hj-cur" label="Currency" optional helper="Three letters, for example INR.">
        <TextField value={currency} onChange={setCurrency} maxLength={3} />
      </FormField>
      <FormField id="hj-pipe" label="Pipeline">
        <Select aria-label="Pipeline" value={pipelineId} onChange={setPipelineId} options={p.pipelines} />
      </FormField>
      <FormField id="hj-why" label="Why this hire">
        <Segment label="Why this hire" value={reason} onChange={setReason} options={[{ value: 'new', label: 'New position' }, { value: 'replacement', label: 'Replacement' }]} />
      </FormField>
      {reason === 'replacement' ? (
        <FormField id="hj-rep" label="Replaces" required helper="A replacement does not use the headcount plan.">
          <Select aria-label="Replaces" value={replaces} onChange={setReplaces} options={p.employees ?? []} searchable />
        </FormField>
      ) : (
        <>
          {lines.length > 0 && !outside && (
            <FormField id="hj-line" label="Headcount plan line" optional>
              <Select aria-label="Headcount plan line" value={lineId} onChange={setLineId} options={lines.map((l) => ({ value: l.id, label: `${l.department} · ${l.designation}${l.location ? ` · ${l.location}` : ''} · ${l.left} left` }))} clearable />
            </FormField>
          )}
          <Checkbox label="Outside the headcount plan" description="Adds a finance approval." checked={outside} onChange={setOutside} />
          {outside && (
            <FormField id="hj-out" label="Why outside the plan" required>
              <TextArea value={outsideWhy} onChange={setOutsideWhy} rows={2} maxLength={1000} />
            </FormField>
          )}
        </>
      )}
      <FormField id="hj-budget" label="Budget for this hire (₹ a year)" optional>
        <NumberField value={budget} onChange={setBudget} min={0} />
      </FormField>
      <FormField id="hj-start" label="Wanted from" optional>
        <DatePicker aria-label="Wanted from" value={start} onChange={setStart} />
      </FormField>
      <FormField id="hj-desc" label="Description" optional>
        <TextArea value={description} onChange={setDescription} rows={5} maxLength={5000} />
      </FormField>
      {p.onDraftDescription && (
        <Button size="sm" icon={Sparkles} disabled={!title.trim()} loading={busy === 'draft'} onClick={() => void run('draft', async () => setDescription(await p.onDraftDescription!(title.trim())))}>
          Draft the description
        </Button>
      )}
      {p.customFields.map((f) => (
        <FormField key={f.id} id={`hj-cf-${f.id}`} label={f.label} required={f.required} optional={!f.required}>
          {f.fieldType === 'select' ? (
            <Select aria-label={f.label} value={(custom[f.id] as string | undefined) ?? null} onChange={(v) => setCustom((c) => ({ ...c, [f.id]: v }))} options={(f.options ?? []).map((o) => ({ value: o, label: o }))} clearable />
          ) : f.fieldType === 'number' ? (
            <NumberField value={(custom[f.id] as number | undefined) ?? null} onChange={(v) => setCustom((c) => ({ ...c, [f.id]: v }))} />
          ) : f.fieldType === 'date' ? (
            <DatePicker aria-label={f.label} value={custom[f.id] ? new Date(`${custom[f.id]}T00:00:00`) : null} onChange={(d) => setCustom((c) => ({ ...c, [f.id]: d ? dayKey(d) : null }))} />
          ) : (
            <TextField value={(custom[f.id] as string | undefined) ?? ''} onChange={(v) => setCustom((c) => ({ ...c, [f.id]: v }))} maxLength={500} />
          )}
        </FormField>
      ))}
    </ConfirmDialog>
  );
}
