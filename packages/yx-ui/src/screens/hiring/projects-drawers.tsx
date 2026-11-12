// Projects P-1 (founder answers 1402 to 1404, 1412, 1420): the PRJ-01 editing drawers, drawn in the kit first
// (stories in prj-01-projects.stories.tsx): a project's details, a team member's allocation, a task and a milestone.
import { useState } from 'react';
import { Checkbox, Switch } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { FormField, FormSection, useSaveErrors, type FormErrorItem } from '../../components/field';
import { NumberField, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { EditorDrawer, useRun } from '../org/org-kit';
import { isoOf, projectProblems, type AllocationInput, type BillingModel, type LiveAllocation, type LiveProjectRow, type MilestoneInput, type ProjectChoices, type ProjectInput, type TaskInput } from './projects-live';

const dateOf = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`) : null);
const MODELS: { value: BillingModel; label: string }[] = [
  { value: 'time_material', label: 'Time & material' },
  { value: 'fixed_fee', label: 'Fixed fee' },
  { value: 'retainer', label: 'Retainer' },
  { value: 'non_billable', label: 'Non-billable' },
];

/** New project, or a project's details. Fee and cost budget only for Projects finance (answer 1412). */
export function ProjectDrawer({ project, choices, finance, onClose, onSave }: { project: LiveProjectRow | null; choices: ProjectChoices; finance: boolean; onClose: () => void; onSave: (input: ProjectInput) => Promise<void> }) {
  const [v, setV] = useState<ProjectInput>(
    project
      ? { code: project.code, name: project.name, managerUserId: project.managerUserId, clientId: project.clientId, billingModel: project.billingModel, startOn: project.startOn, endOn: project.endOn, budgetHours: project.budgetHours, budgetCost: project.budgetCost ?? null, fee: project.fee ?? null, clientAcceptsMilestones: project.clientAcceptsMilestones, clientApprovesHours: project.clientApprovesHours ?? false }
      : { code: '', name: '', managerUserId: null, clientId: null, billingModel: choices.defaultBillingModel ?? 'time_material', startOn: null, endOn: null, budgetHours: null, budgetCost: null, fee: null, clientAcceptsMilestones: false, clientApprovesHours: false },
  );
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const errors: FormErrorItem[] = projectProblems(v);
  const save = useSaveErrors(errors);
  const set = (p: Partial<ProjectInput>) => {
    setV((x) => ({ ...x, ...p }));
    setDirty(true);
  };
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title={project ? `Change ${project.code}` : 'New project'}
      subtitle={project ? undefined : 'It starts as a draft. Start it when the team and budgets are ready; only an active project takes time.'}
      errors={save.shownErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel={project ? 'Save changes' : 'Create project'}
      onSave={() => {
        if (errors.length) return save.reveal();
        const input: ProjectInput = { ...v, code: v.code.trim(), name: v.name.trim() };
        if (!finance) {
          delete input.fee;
          delete input.budgetCost;
        }
        void run('save', () => onSave(input)).then((ok) => ok && onClose());
      }}
    >
      <FormSection title="Project">
        <FormField id="prj-code" label="Code" required helper={project ? 'A project keeps its code.' : 'Capital letters, digits or dashes, such as NRP-WEB.'} error={save.errorOf('prj-code')}>
          <TextField value={v.code} onChange={(code) => set({ code: code.toUpperCase() })} maxLength={12} disabled={!!project} />
        </FormField>
        <FormField id="prj-name" label="Name" required error={save.errorOf('prj-name')}>
          <TextField value={v.name} onChange={(name) => set({ name })} maxLength={100} />
        </FormField>
        <FormField id="prj-manager" label="Project manager" optional>
          <Select value={v.managerUserId} onChange={(managerUserId) => set({ managerUserId })} clearable placeholder="Choose" options={choices.managers.map((m) => ({ value: m.id, label: m.name }))} />
        </FormField>
      </FormSection>
      <FormSection title="Client and billing" description="The client is one of the staffing desk's clients (same GSTIN, contacts and portal).">
        <FormField id="prj-model" label="Billing model" required>
          <Segment label="Billing model" options={MODELS} value={v.billingModel} onChange={(billingModel) => set({ billingModel })} />
        </FormField>
        <FormField id="prj-client" label="Client" required={v.billingModel !== 'non_billable'} optional={v.billingModel === 'non_billable'} error={save.errorOf('prj-client')} helper={choices.clients.length ? undefined : 'No clients yet. Add them in Staffing desk › Clients.'}>
          <Select value={v.clientId} onChange={(clientId) => set({ clientId })} clearable placeholder="Choose" options={choices.clients.map((c) => ({ value: c.id, label: c.name }))} />
        </FormField>
        {v.billingModel === 'fixed_fee' && (
          <Switch checked={v.clientAcceptsMilestones} onChange={(clientAcceptsMilestones) => set({ clientAcceptsMilestones })} label="The client accepts each milestone" description="A completed milestone then waits for the client in the client portal before it is billed." />
        )}
        {v.clientId && (
          <Switch checked={!!v.clientApprovesHours} onChange={(clientApprovesHours) => set({ clientApprovesHours })} label="The client approves the hours" description="After the project manager, each approved line waits for the client in the client portal. The client sees only this project's hours." />
        )}
      </FormSection>
      <FormSection title="Dates and budgets">
        <FormField id="prj-start" label="Start" optional>
          <DatePicker value={dateOf(v.startOn)} onChange={(x) => set({ startOn: x ? isoOf(x) : null })} />
        </FormField>
        <FormField id="prj-end" label="End" optional error={save.errorOf('prj-end')}>
          <DatePicker value={dateOf(v.endOn)} onChange={(x) => set({ endOn: x ? isoOf(x) : null })} />
        </FormField>
        <FormField id="prj-hours" label="Budget hours" optional helper="Burn alerts go to the manager and Projects finance at the company's levels (80% and 100% by default).">
          <NumberField value={v.budgetHours} onChange={(budgetHours) => set({ budgetHours })} min={0} max={1_000_000} suffix="h" />
        </FormField>
        {finance && (
          <>
            <FormField id="prj-cost" label="Cost budget (₹)" optional helper="Seen only with Projects finance.">
              <NumberField value={v.budgetCost ?? null} onChange={(budgetCost) => set({ budgetCost })} min={0} />
            </FormField>
            <FormField id="prj-fee" label="Fee (₹)" optional helper="Seen only with Projects finance.">
              <NumberField value={v.fee ?? null} onChange={(fee) => set({ fee })} min={0} />
            </FormField>
          </>
        )}
      </FormSection>
    </EditorDrawer>
  );
}

/** Add a person to the team, or change their allocation (answer 1404: only allocated people book time). */
export function AllocationDrawer({ allocation, people, onClose, onSave }: { allocation: LiveAllocation | null; people: { id: string; name: string }[]; onClose: () => void; onSave: (input: AllocationInput) => Promise<void> }) {
  const [v, setV] = useState<AllocationInput>(
    allocation
      ? { employeeId: allocation.employeeId, role: allocation.role, fromOn: allocation.fromOn, toOn: allocation.toOn, percent: allocation.percent, tentative: allocation.tentative }
      : { employeeId: '', role: null, fromOn: isoOf(new Date()), toOn: null, percent: 100, tentative: false },
  );
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const errors: FormErrorItem[] = [
    ...(!v.employeeId ? [{ fieldId: 'alloc-person', message: 'Choose who works on the project.' }] : []),
    ...(!v.percent || v.percent < 1 || v.percent > 100 ? [{ fieldId: 'alloc-pct', message: 'Give a share of their week from 1% to 100%.' }] : []),
    ...(v.toOn && v.toOn < v.fromOn ? [{ fieldId: 'alloc-to', message: 'The allocation ends before it starts.' }] : []),
  ];
  const save = useSaveErrors(errors);
  const set = (p: Partial<AllocationInput>) => {
    setV((x) => ({ ...x, ...p }));
    setDirty(true);
  };
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title={allocation ? `Change ${allocation.person}'s allocation` : 'Add to the team'}
      subtitle="Only allocated people book time to the project, on the days of their allocation (a tentative one books nothing yet)."
      errors={save.shownErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel={allocation ? 'Save allocation' : 'Add allocation'}
      onSave={() => {
        if (errors.length) return save.reveal();
        void run('save', () => onSave({ ...v, role: v.role?.trim() || null })).then((ok) => ok && onClose());
      }}
    >
      <FormSection title="Who">
        <FormField id="alloc-person" label="Person" required error={save.errorOf('alloc-person')}>
          <Select value={v.employeeId || null} onChange={(employeeId) => set({ employeeId: employeeId ?? '' })} placeholder="Choose" disabled={!!allocation} options={people.map((p) => ({ value: p.id, label: p.name }))} />
        </FormField>
        <FormField id="alloc-role" label="Role on the project" optional>
          <TextField value={v.role ?? ''} onChange={(role) => set({ role })} maxLength={80} />
        </FormField>
      </FormSection>
      <FormSection title="When and how much">
        <FormField id="alloc-from" label="From" required>
          <DatePicker value={dateOf(v.fromOn)} onChange={(x) => x && set({ fromOn: isoOf(x) })} />
        </FormField>
        <FormField id="alloc-to" label="To" optional error={save.errorOf('alloc-to')}>
          <DatePicker value={dateOf(v.toOn)} onChange={(x) => set({ toOn: x ? isoOf(x) : null })} />
        </FormField>
        <FormField id="alloc-pct" label="Share of their week" required error={save.errorOf('alloc-pct')}>
          <NumberField value={v.percent} onChange={(percent) => set({ percent: percent ?? 0 })} min={1} max={100} suffix="%" />
        </FormField>
        <Checkbox checked={v.tentative} onChange={(tentative) => set({ tentative })} label="Tentative (not confirmed yet)" description="A tentative allocation shows on the team but books no time." />
      </FormSection>
    </EditorDrawer>
  );
}

/** A task (Time's activity), with an optional budget in hours. */
export function TaskDrawer({ task, onClose, onSave }: { task: { name: string; budgetHours: number | null; billable: boolean; active: boolean } | null; onClose: () => void; onSave: (input: TaskInput) => Promise<void> }) {
  const [v, setV] = useState<TaskInput & { active: boolean }>(task ? { ...task } : { name: '', budgetHours: null, billable: true, active: true });
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const errors: FormErrorItem[] = !v.name.trim() ? [{ fieldId: 'task-name', message: 'Give the task a name.' }] : [];
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
      title={task ? `Change ${task.name}` : 'Add task'}
      subtitle="People choose the task on their timesheet. A project has at most 20 tasks in use."
      errors={save.shownErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel={task ? 'Save task' : 'Add task'}
      onSave={() => {
        if (errors.length) return save.reveal();
        void run('save', () => onSave({ ...v, name: v.name.trim() })).then((ok) => ok && onClose());
      }}
    >
      <FormSection title="Task">
        <FormField id="task-name" label="Name" required helper={task ? 'A task keeps its name: hours already booked carry it.' : undefined} error={save.errorOf('task-name')}>
          <TextField value={v.name} onChange={(name) => set({ name })} maxLength={60} disabled={!!task} />
        </FormField>
        <FormField id="task-budget" label="Budget hours" optional>
          <NumberField value={v.budgetHours} onChange={(budgetHours) => set({ budgetHours })} min={0} suffix="h" />
        </FormField>
        <Checkbox checked={v.billable} onChange={(billable) => set({ billable })} label="Billable" />
        {task && <Checkbox checked={v.active} onChange={(active) => set({ active })} label="In use (people can book to it)" />}
      </FormSection>
    </EditorDrawer>
  );
}

/** A fixed-fee milestone: its share of the fee and when it is due (answer 1420). */
export function MilestoneDrawer({ onClose, onSave }: { onClose: () => void; onSave: (input: MilestoneInput) => Promise<void> }) {
  const [v, setV] = useState<{ name: string; pct: number | null; dueOn: string | null }>({ name: '', pct: null, dueOn: null });
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const errors: FormErrorItem[] = [
    ...(!v.name.trim() ? [{ fieldId: 'ms-name', message: 'Give the milestone a name.' }] : []),
    ...(!v.pct || v.pct <= 0 || v.pct > 100 ? [{ fieldId: 'ms-pct', message: 'Give its share of the fee, from 0.01% to 100%.' }] : []),
    ...(!v.dueOn ? [{ fieldId: 'ms-due', message: 'Choose when it is due.' }] : []),
  ];
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
      title="Add milestone"
      subtitle="Milestones of a fixed-fee project add up to at most 100% of the fee."
      errors={save.shownErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel="Add milestone"
      onSave={() => {
        if (errors.length) return save.reveal();
        void run('save', () => onSave({ name: v.name.trim(), pct: v.pct!, dueOn: v.dueOn! })).then((ok) => ok && onClose());
      }}
    >
      <FormSection title="Milestone">
        <FormField id="ms-name" label="Name" required error={save.errorOf('ms-name')}>
          <TextField value={v.name} onChange={(name) => set({ name })} maxLength={120} />
        </FormField>
        <FormField id="ms-pct" label="Share of the fee" required error={save.errorOf('ms-pct')}>
          <NumberField value={v.pct} onChange={(pct) => set({ pct })} min={0.01} max={100} decimals suffix="%" />
        </FormField>
        <FormField id="ms-due" label="Due" required error={save.errorOf('ms-due')}>
          <DatePicker value={dateOf(v.dueOn)} onChange={(x) => set({ dueOn: x ? isoOf(x) : null })} />
        </FormField>
      </FormSection>
    </EditorDrawer>
  );
}
