import { useState } from 'react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert,  } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { FileUpload } from '../../../components/upload';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { WhenBadge } from '../../history/history-kit';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { type FirstThirtyDays, type FormDef, type ImportResult, type JoinerInput, type JoinerPlaces, type JourneyKind, type JourneyTask, type LoadState,  } from './types';

// Lifecycle batch 6a, wired (M01-LIFECYCLE-BUILD-DESIGN §14): the onboarding board (PPL-11), a checklist (PPL-13),
// my checklist tasks, the document verification queue (PPL-27) and "Joining soon" for managers. A joiner is not an
// employee until their joining day (founder D2); IT and Admin tasks close when the Service Desk fulfils them (D1).

const STATUS: Record<JourneyTask['status'], { label: string; tone: BadgeTone }> = {
  waiting: { label: 'Waiting for an earlier task', tone: 'neutral' },
  open: { label: 'To do', tone: 'info' },
  done: { label: 'Done', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const LETTER_KIND_HINT_TEXT = 'Closes when the letter is issued';
const KIND_HINT: Record<JourneyTask['kind'], string> = {
  tick: '',
  form: 'Form',
  document: 'Closes when the document is in',
  letter: LETTER_KIND_HINT_TEXT,
  desk_request: 'Service Desk request',
  read: 'Read and acknowledge',
  watch: 'Watch',
  survey: 'Quick survey',
};
/** What a journey's day 0 is, in words (6f adds life events). */
const ANCHOR_WORD: Record<JourneyKind, string> = { onboarding: 'Joins', offboarding: 'Leaves', new_manager: 'Manages from', transfer: 'Moves', parental_leave: 'Leave from', return_to_work: 'Back on' };
const fromKey = (iso: string) => new Date(`${iso}T00:00:00`);

export function AddJoinerDrawer({ places, today, onClose, onAdd }: { places: JoinerPlaces; today: string; onClose: () => void; onAdd: (x: JoinerInput) => Promise<void> }) {
  const [given, setGiven] = useState('');
  const [family, setFamily] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [joining, setJoining] = useState<Date | null>(null);
  const [entity, setEntity] = useState<string | null>(places.entities.length === 1 ? places.entities[0].value : null);
  const [location, setLocation] = useState<string | null>(null);
  const [dept, setDept] = useState<string | null>(null);
  const [desig, setDesig] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [manager, setManager] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = [
    ...(given.trim() ? [] : [{ fieldId: 'aj-given', message: 'Enter the first name.' }]),
    ...(joining ? (dayKey(joining) < today ? [{ fieldId: 'aj-date', message: 'The joining day cannot be in the past.' }] : []) : [{ fieldId: 'aj-date', message: 'Choose the joining day.' }]),
    ...(entity ? [] : [{ fieldId: 'aj-entity', message: 'Choose the legal entity.' }]),
    ...(location ? [] : [{ fieldId: 'aj-location', message: 'Choose the location.' }]),
    ...(email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? [{ fieldId: 'aj-email', message: 'Enter an email like name@example.com.' }] : []),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onAdd({ givenName: given.trim(), familyName: family.trim() || null, email: email.trim() || null, phone: phone.trim() || null, joiningOn: dayKey(joining!), legalEntityId: entity!, locationId: location!, departmentId: dept, designationId: desig, employmentTypeId: type, managerEmployeeId: manager });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const locations = places.locations.filter((l) => l.entityId === entity);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a joiner"
      subtitle="They are not an employee until their joining day. Their checklist starts now."
      size="lg"
      dirty={Boolean(given || family || email || joining)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Add joiner
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not added">
          {failed}
        </InlineAlert>
      )}
      <FormField id="aj-given" label="First name" required error={v.errorOf('aj-given')}>
        <TextField value={given} onChange={setGiven} maxLength={100} autoComplete="off" />
      </FormField>
      <FormField id="aj-family" label="Last name" optional>
        <TextField value={family} onChange={setFamily} maxLength={100} autoComplete="off" />
      </FormField>
      <FormField id="aj-email" label="Personal email" optional helper="Used later for the pre-boarding portal. Never a work email." error={v.errorOf('aj-email')}>
        <TextField type="email" value={email} onChange={setEmail} maxLength={254} autoComplete="off" />
      </FormField>
      <FormField id="aj-phone" label="Mobile" optional>
        <TextField type="tel" value={phone} onChange={setPhone} maxLength={20} autoComplete="off" />
      </FormField>
      <FormField id="aj-date" label="Joining day" required error={v.errorOf('aj-date')}>
        <DatePicker value={joining} onChange={setJoining} min={fromKey(today)} aria-label="Joining day" />
      </FormField>
      <FormField id="aj-entity" label="Legal entity" required error={v.errorOf('aj-entity')}>
        <Select
          aria-label="Legal entity"
          value={entity}
          onChange={(x) => {
            setEntity(x);
            setLocation(null);
          }}
          options={places.entities}
        />
      </FormField>
      <FormField id="aj-location" label="Location" required error={v.errorOf('aj-location')} helper={entity ? undefined : 'Choose the legal entity first.'}>
        <Select aria-label="Location" value={location} onChange={setLocation} options={locations} disabled={!entity} />
      </FormField>
      <FormField id="aj-dept" label="Department" optional>
        <Select aria-label="Department" value={dept} onChange={setDept} options={places.departments} clearable searchable />
      </FormField>
      <FormField id="aj-desig" label="Designation" optional>
        <Select aria-label="Designation" value={desig} onChange={setDesig} options={places.designations} clearable searchable />
      </FormField>
      <FormField id="aj-type" label="Employment type" optional>
        <Select aria-label="Employment type" value={type} onChange={setType} options={places.employmentTypes} clearable />
      </FormField>
      <FormField id="aj-manager" label="Manager" optional helper="They see the joiner under Joining soon and get the manager's tasks.">
        <Select aria-label="Manager" value={manager} onChange={setManager} options={places.managers} clearable searchable />
      </FormField>
    </Drawer>
  );
}

const IMPORT_HEADER = 'given_name,family_name,email,phone,joining_on,legal_entity,location,department,designation,employment_type,manager_code';

export function ImportDrawer({ onClose, onImport, onDone }: { onClose: () => void; onImport: (csv: string, commit: boolean) => Promise<ImportResult>; onDone: (n: number) => void }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const { busy, error, run } = useRun();
  const read = async (f: File) => {
    setCsv(await f.text());
    setPreview(null);
  };
  const good = preview?.rows.filter((r) => r.ok).length ?? 0;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Import joiners"
      subtitle="A CSV file with one joiner per row. You see every row's problem before anything is added."
      size="lg"
      dirty={Boolean(csv)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {preview && good > 0 ? (
            <Button variant="primary" loading={busy === 'commit'} onClick={() => void run('commit', async () => onDone((await onImport(csv, true)).added))}>
              {`Add ${good} ${good === 1 ? 'joiner' : 'joiners'}`}
            </Button>
          ) : (
            <Button variant="primary" disabled={!csv.trim()} loading={busy === 'preview'} onClick={() => void run('preview', async () => setPreview(await onImport(csv, false)))}>
              Check the file
            </Button>
          )}
        </>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="The file was not read">
          {error}
        </InlineAlert>
      )}
      <Text as="p" tone="secondary" size="sm">
        {`Columns: ${IMPORT_HEADER}. Dates as YYYY-MM-DD; the legal entity by its short name, the rest by code or name; the manager by employee code.`}
      </Text>
      <FormField id="imp-file" label="CSV file">
        <FileUpload id="imp-file" upload={read} accept={['.csv']} multiple={false} maxSize={2 * 1024 * 1024} />
      </FormField>
      <FormField id="imp-text" label="Or paste the rows" optional>
        <TextArea
          value={csv}
          onChange={(x) => {
            setCsv(x);
            setPreview(null);
          }}
          rows={6}
          placeholder={IMPORT_HEADER}
        />
      </FormField>
      {preview && (
        <Card title={`${good} of ${preview.rows.length} rows can be added`}>
          <ul className="yx-lif-list">
            {preview.rows.map((r) => (
              <li key={r.line}>
                <Badge tone={r.ok ? 'success' : 'danger'}>{r.ok ? 'Ready' : 'Problem'}</Badge> <Text>{`Line ${r.line}: ${r.name || 'no name'}${r.joiningOn ? `, joins ${r.joiningOn}` : ''}`}</Text>
                {r.problem && (
                  <Text as="p" size="sm" tone="danger">
                    {r.problem}
                  </Text>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ tasks (shared)

export interface TaskActions {
  onComplete: (task: JourneyTask, payload: { answers?: Record<string, unknown>; note?: string }) => Promise<unknown>;
  onSkip: (task: JourneyTask, reason: string) => Promise<unknown>;
  /** HR uploads the asked-for document for the person (document tasks). */
  onUpload?: (task: JourneyTask, file: File) => Promise<unknown>;
  /** HR previews (a download) and issues the letter a letter task asks for (6b); the task then closes by itself. */
  onPreviewLetter?: (task: JourneyTask) => Promise<unknown>;
  onIssueLetter?: (task: JourneyTask) => Promise<unknown>;
}

export type TaskAsk = { kind: 'done' | 'form' | 'letter' | 'skip' | 'upload' | 'read' | 'watch' | 'survey'; task: JourneyTask };
export const CONTENT_ASK: Partial<Record<JourneyTask['kind'], { ask: TaskAsk['kind']; button: string; confirm: string }>> = {
  form: { ask: 'form', button: 'Fill in', confirm: 'Submit' },
  letter: { ask: 'letter', button: 'Record the letter', confirm: 'Issue letter' },
  read: { ask: 'read', button: 'Read', confirm: 'I have read this' },
  watch: { ask: 'watch', button: 'Watch', confirm: 'I have watched this' },
  survey: { ask: 'survey', button: 'Answer', confirm: 'Send answers' },
};

function TaskTable({ tasks, today, showPerson, actions, onOpen, canUpload }: { tasks: JourneyTask[]; today: string; showPerson?: boolean; actions: TaskActions; onOpen?: (journeyId: string) => void; canUpload?: boolean }) {
  const [ask, setAsk] = useState<TaskAsk | null>(null);
  const columns: TableColumn<JourneyTask>[] = [
    ...(showPerson
      ? [{ key: 'person', header: 'For', type: 'person' as const, value: (r: JourneyTask) => r.person ?? '', person: (r: JourneyTask) => ({ name: r.person ?? '', secondary: r.anchorOn ? `${ANCHOR_WORD[r.journeyKind ?? 'onboarding']} ${dateText(r.anchorOn)}` : undefined }), width: 220, hideable: false }]
      : []),
    {
      key: 'title',
      header: 'Task',
      value: (r) => r.title,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Text>{r.title}</Text>
          <Text tone="secondary" size="sm">
            {[KIND_HINT[r.kind], r.locked ? 'Required by law' : !r.required ? 'Optional' : ''].filter(Boolean).join(' · ')}
          </Text>
        </span>
      ),
      width: 260,
      hideable: showPerson ? true : false,
    },
    {
      key: 'status',
      header: 'Status',
      value: (r) => r.status,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
          {r.status === 'done' && r.completedBy && (
            <Text tone="secondary" size="sm">
              {`by ${r.completedBy}`}
            </Text>
          )}
          {r.status === 'skipped' && r.skipReason && (
            <Text tone="secondary" size="sm">
              Why skipped: {r.skipReason}
            </Text>
          )}
        </span>
      ),
      width: 190,
    },
    {
      key: 'due',
      header: 'Due',
      value: (r) => r.dueOn,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Text>{dateText(r.dueOn)}</Text>
          {r.overdue ? <Badge tone="danger">Overdue</Badge> : r.status === 'open' && r.dueOn <= today ? <WhenBadge date={r.dueOn} today={today} /> : null}
        </span>
      ),
      width: 150,
    },
    { key: 'owner', header: 'Who', value: (r) => r.assignee ?? r.ownerLabel, render: (r) => <Text>{r.assignee ?? r.ownerLabel}</Text>, width: 170, optional: true },
  ];
  return (
    <>
      <DataTable
        label="Checklist tasks"
        columns={columns}
        rows={tasks}
        getRowId={(r) => r.id}
        rowNoun={['task', 'tasks']}
        cardSummary
        empty={<EmptyState compact title="Nothing to do." description="Tasks given to you or your team appear here." />}
        rowButtons={(r) => (
          <>
            {r.canComplete && (
              <Button size="sm" variant="primary" onClick={() => setAsk({ kind: CONTENT_ASK[r.kind]?.ask ?? 'done', task: r })}>
                {CONTENT_ASK[r.kind]?.button ?? 'Mark done'}
              </Button>
            )}
            {canUpload && actions.onIssueLetter && r.kind === 'letter' && r.status === 'open' && (
              <Button size="sm" variant="primary" onClick={() => setAsk({ kind: 'letter', task: r })}>
                Issue letter
              </Button>
            )}
            {canUpload && actions.onUpload && r.kind === 'document' && r.status === 'open' && (
              <Button size="sm" onClick={() => setAsk({ kind: 'upload', task: r })}>
                Upload
              </Button>
            )}
            {r.canSkip && (
              <Button size="sm" onClick={() => setAsk({ kind: 'skip', task: r })}>
                Skip
              </Button>
            )}
            {showPerson && onOpen && r.journeyId && (
              <Button size="sm" onClick={() => onOpen(r.journeyId!)}>
                Checklist
              </Button>
            )}
          </>
        )}
      />
      {ask && <TaskDialog ask={ask} actions={actions} onClose={() => setAsk(null)} />}
    </>
  );
}

export function TaskDialog({ ask, actions, onClose }: { ask: TaskAsk; actions: TaskActions; onClose: () => void }) {
  const t = ask.task;
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const questions = t.content?.questions ?? [];
  const [ratings, setRatings] = useState<(string | null)[]>(questions.map(() => null));
  const confirm = async () => {
    try {
      if (ask.kind === 'skip') await actions.onSkip(t, text.trim());
      else if (ask.kind === 'upload') await actions.onUpload!(t, file!);
      else if (ask.kind === 'letter') await actions.onIssueLetter!(t);
      else if (ask.kind === 'survey') await actions.onComplete(t, { answers: { ratings: ratings.map(Number), ...(text.trim() ? { comment: text.trim() } : {}) } });
      else if (ask.kind === 'read' || ask.kind === 'watch') await actions.onComplete(t, {});
      else await actions.onComplete(t, ask.kind === 'form' ? { answers } : text.trim() ? { note: text.trim() } : {});
    } catch (e) {
      const errs = (e as { body?: { errors?: Record<string, string> } }).body?.errors;
      if (errs) setFormErrors(errs);
      throw e;
    }
    onClose();
  };
  const ready = ask.kind === 'skip' ? text.trim().length >= 3 : ask.kind === 'upload' ? Boolean(file) : ask.kind === 'survey' ? ratings.every(Boolean) : true;
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={ask.kind === 'skip' ? `Skip "${t.title}"?` : ask.kind === 'upload' ? `Upload for "${t.title}"` : t.title}
      consequence={
        ask.kind === 'skip'
          ? 'The task is marked skipped with your reason. It stays on the checklist.'
          : ask.kind === 'letter'
            ? 'The letter is made from your company’s active template with the joiner’s details. Letters that need approval go to the signatory first. Once issued it never changes, and this task closes by itself.'
            : ask.kind === 'upload'
              ? 'The file is checked for viruses before anyone can open it. HR verifies it in the documents queue.'
              : ask.kind === 'survey'
                ? 'HR sees your answers. Your manager sees only that you answered.'
                : ask.kind === 'read' || ask.kind === 'watch'
                  ? `${ask.kind === 'read' ? 'Read' : 'Watch'} it, then confirm. The step is marked done with your name and the time.`
                  : 'The task is marked done with your name and the time.'
      }
      confirmLabel={ask.kind === 'skip' ? 'Skip task' : ask.kind === 'upload' ? 'Upload' : ask.kind === 'done' ? 'Mark done' : (CONTENT_ASK[t.kind]?.confirm ?? 'Mark done')}
      confirmDisabled={!ready}
      onConfirm={confirm}
    >
      {ask.kind === 'skip' && (
        <FormField id="tk-reason" label="Why skip it" required helper="Kept on the checklist.">
          <TextArea value={text} onChange={setText} rows={2} maxLength={300} />
        </FormField>
      )}
      {ask.kind === 'letter' && actions.onPreviewLetter && (
        <>
          {previewError && (
            <InlineAlert tone="danger" title="No preview">
              {previewError}
            </InlineAlert>
          )}
          <Button
            loading={previewing}
            onClick={async () => {
              setPreviewing(true);
              setPreviewError(null);
              try {
                await actions.onPreviewLetter!(t);
              } catch (e) {
                setPreviewError(errorText(e));
              } finally {
                setPreviewing(false);
              }
            }}
          >
            Download a preview
          </Button>
        </>
      )}
      {ask.kind === 'done' && (
        <FormField id="tk-note" label="Note" optional>
          <TextField value={text} onChange={setText} maxLength={300} />
        </FormField>
      )}
      {ask.kind === 'upload' && (
        <FormField id="tk-file" label="File" required>
          <FileUpload id="tk-file" upload={async (f) => setFile(f)} accept={['.pdf', '.jpg', '.jpeg', '.png']} multiple={false} onItemsChange={(items) => items.length === 0 && setFile(null)} />
        </FormField>
      )}
      {ask.kind === 'form' && t.form && <TaskForm form={t.form} answers={answers} onChange={setAnswers} errors={formErrors} />}
      {(ask.kind === 'read' || ask.kind === 'watch') && <StepContent task={t} />}
      {ask.kind === 'survey' && (
        <>
          {questions.map((q, i) => (
            <FormField key={q} id={`sv-${i}`} label={q} required helper="1 = not at all, 5 = fully">
              <Segment label={q} value={ratings[i]} onChange={(x) => setRatings(ratings.map((r, j) => (j === i ? x : r)))} options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))} />
            </FormField>
          ))}
          <FormField id="sv-comment" label="Anything else" optional>
            <TextArea value={text} onChange={setText} rows={2} maxLength={500} />
          </FormField>
        </>
      )}
    </ConfirmDialog>
  );
}

/** What a read or watch step shows: the text, and the link (opens in a new tab). */
function StepContent({ task }: { task: JourneyTask }) {
  const c = task.content ?? {};
  return (
    <>
      {c.text?.split(/\n+/).map((para, i) => (
        <Text as="p" key={i}>
          {para}
        </Text>
      ))}
      {c.url && (
        <a className="yx-link" href={c.url} target="_blank" rel="noopener noreferrer">
          {task.kind === 'watch' ? `Open the video${c.minutes ? ` (about ${c.minutes} minutes)` : ''}` : 'Open the page'}
        </a>
      )}
    </>
  );
}

/** The few field types checklist forms use; the server checks the answers (P19 forms). */
export function TaskForm({ form, answers, onChange, errors }: { form: FormDef; answers: Record<string, unknown>; onChange: (a: Record<string, unknown>) => void; errors: Record<string, string> }) {
  const set = (k: string, v: unknown) => onChange({ ...answers, [k]: v });
  return (
    <>
      {form.sections.flatMap((s) =>
        s.fields.map((f) => {
          const id = `tf-${f.key}`;
          const val = answers[f.key];
          return (
            <FormField key={f.key} id={id} label={f.label} required={f.required} optional={!f.required} helper={f.help} error={errors[f.key]}>
              {f.type === 'checkbox' ? (
                <Checkbox checked={val === true} onChange={(c) => set(f.key, c)} aria-label={f.label} />
              ) : f.type === 'textarea' ? (
                <TextArea value={typeof val === 'string' ? val : ''} onChange={(x) => set(f.key, x)} rows={3} maxLength={f.max ?? 2000} />
              ) : f.type === 'number' ? (
                <NumberField value={typeof val === 'number' ? val : null} onChange={(x) => set(f.key, x)} min={f.min} max={f.max} />
              ) : f.type === 'date' ? (
                <DatePicker value={typeof val === 'string' ? fromKey(val) : null} onChange={(x) => set(f.key, x ? dayKey(x) : null)} aria-label={f.label} />
              ) : f.type === 'choice' && f.options ? (
                <Select aria-label={f.label} value={typeof val === 'string' ? val : null} onChange={(x) => set(f.key, x)} options={f.options} />
              ) : (
                <TextField value={typeof val === 'string' ? val : ''} onChange={(x) => set(f.key, x)} maxLength={f.max ?? 500} />
              )}
            </FormField>
          );
        }),
      )}
    </>
  );
}

export function PostponeDialog({ current, today, onClose, onPostpone }: { current: string; today: string; onClose: () => void; onPostpone: (joiningOn: string, reason: string) => Promise<unknown> }) {
  const [date, setDate] = useState<Date | null>(fromKey(current));
  const [reason, setReason] = useState('');
  const ready = Boolean(date) && dayKey(date!) !== current && reason.trim().length >= 3;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Change the joining day?"
      consequence="Every task not done yet moves by the same number of days. Done tasks stay as they are."
      confirmLabel="Change joining day"
      confirmDisabled={!ready}
      onConfirm={async () => {
        await onPostpone(dayKey(date!), reason.trim());
        onClose();
      }}
    >
      <FormField id="pp-date" label="New joining day" required>
        <DatePicker value={date} onChange={setDate} min={fromKey(today)} aria-label="New joining day" />
      </FormField>
      <FormField id="pp-reason" label="Reason" required helper="Kept on the record.">
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ 6f: my first 30 days, life events

export interface FirstThirtyDaysScreenProps extends TaskActions {
  state: LoadState;
  onRetry?: () => void;
  data: FirstThirtyDays | null;
}

/** Design §7.6 (gap pass O2): a new hire's own steps for today, this week and this month, from their joining checklist. */
export function FirstThirtyDaysScreen(p: FirstThirtyDaysScreenProps) {
  const d = p.data;
  const sections: [string, JourneyTask[], string][] = d
    ? [
        ['Today', d.today, 'Nothing for today.'],
        ['This week', d.week, 'Nothing else this week.'],
        ['This month', d.month, 'Nothing else this month.'],
      ]
    : [];
  return (
    <LivePage title="My first 30 days" description={d ? `Day ${d.day} of 30. You joined on ${dateText(d.joinedOn)}.` : undefined} state={p.state} onRetry={p.onRetry} what="your first days">
      {d && (
        <>
          <Card title="Your people">
            <ul className="yx-lif-list">
              <li>
                <Text tone="secondary">Manager</Text> <Text>{d.manager ?? 'Not set yet'}</Text>
              </li>
              {d.buddy && (
                <li>
                  <Text tone="secondary">Buddy</Text> <Text>{d.buddy}</Text>
                </li>
              )}
              <li>
                <Text tone="secondary">Steps done</Text> <Text>{String(d.done)}</Text>
              </li>
            </ul>
          </Card>
          {sections.map(([title, rows, none]) => (
            <Card key={title} title={title}>
              {rows.length ? <TaskTable tasks={rows} today={d.date} actions={p} /> : <Text tone="secondary">{none}</Text>}
            </Card>
          ))}
        </>
      )}
    </LivePage>
  );
}
