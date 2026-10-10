import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { Upload, UserPlus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Meter } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { Text } from '../../../components/foundations';
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
import { JOURNEY_KIND_LABEL, type FirstThirtyDays, type FormDef, type ImportResult, type Joiner, type JoinerBoard, type JoinerInput, type JoinerPlaces, type Journey, type JourneyKind, type JourneyTask, type LifeJourneyRow, type LoadState, type MyTasks, type QueueDocument } from './types';

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
const DAY_WORD: Record<JourneyKind, string> = { onboarding: 'joining', offboarding: 'last working', new_manager: 'first', transfer: 'move', parental_leave: 'first leave', return_to_work: 'return' };
const fromKey = (iso: string) => new Date(`${iso}T00:00:00`);

// ------------------------------------------------------------------------------------------ onboarding board

export interface OnboardingBoardScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: JoinerBoard | null;
  places: JoinerPlaces;
  onOpen: (journeyId: string) => void;
  onAdd: (input: JoinerInput) => Promise<unknown>;
  onImport: (csv: string, commit: boolean) => Promise<ImportResult>;
}

type Show = 'all' | 'week' | 'late';

export function OnboardingBoardScreen(p: OnboardingBoardScreenProps) {
  const [show, setShow] = useState<Show>('all');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const d = p.data;
  const rows = useMemo(() => {
    if (!d) return [];
    const weekEnd = new Date(fromKey(d.today).getTime() + 7 * 86_400_000);
    return d.joiners.filter((j) => j.status === 'invited' && (show === 'all' || (show === 'week' ? fromKey(j.joiningOn) <= weekEnd : j.overdueTasks > 0)));
  }, [d, show]);
  const columns: TableColumn<Joiner>[] = [
    { key: 'name', header: 'Joiner', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.designation ?? undefined }), width: 230, hideable: false },
    {
      key: 'joining',
      header: 'Joins on',
      value: (r) => r.joiningOn,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Text>{dateText(r.joiningOn)}</Text>
          {d && <WhenBadge date={r.joiningOn} today={d.today} />}
        </span>
      ),
      width: 170,
    },
    { key: 'place', header: 'Where', value: (r) => [r.location, r.department].filter(Boolean).join(' · '), width: 200 },
    { key: 'manager', header: 'Manager', value: (r) => r.manager ?? '', width: 160, optional: true },
    {
      key: 'progress',
      header: 'Checklist',
      value: (r) => r.progress,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Meter value={r.progress} max={100} label={`${r.name}: checklist done`} warnAt={101} dangerAt={101} />
          {r.overdueTasks > 0 ? <Badge tone="danger">{`${r.overdueTasks} overdue`}</Badge> : <Text tone="secondary" size="sm">{`${r.openTasks} to do`}</Text>}
        </span>
      ),
      width: 200,
    },
  ];
  return (
    <LivePage
      title="Onboarding"
      description="People joining soon and their checklists, from the day they are added to their joining day. A joiner becomes an employee on the joining day."
      state={p.state}
      onRetry={p.onRetry}
      what="joiners"
      actions={
        d?.canAdd ? (
          <>
            <Button icon={Upload} onClick={() => setImporting(true)}>
              Import joiners
            </Button>
            <Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>
              Add joiner
            </Button>
          </>
        ) : undefined
      }
    >
      {done && (
        <InlineAlert tone="success" title="Done">
          {done}
        </InlineAlert>
      )}
      <Segment label="Show" value={show} onChange={setShow} options={[{ value: 'all', label: 'Everyone' }, { value: 'week', label: 'Joining this week' }, { value: 'late', label: 'Overdue tasks' }]} />
      <DataTable
        label="Joiners"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowNoun={['joiner', 'joiners']}
        cardSummary
        onRowClick={(r) => r.journeyId && p.onOpen(r.journeyId)}
        rowButtons={(r) =>
          r.journeyId ? (
            <Button size="sm" onClick={() => p.onOpen(r.journeyId!)}>
              Checklist
            </Button>
          ) : null
        }
        empty={<EmptyState compact title={show === 'all' ? 'No one is joining right now.' : 'No one here.'} description={d?.canAdd && show === 'all' ? 'Add a joiner by hand or import a file.' : undefined} />}
      />
      {adding && (
        <AddJoinerDrawer
          places={p.places}
          today={d?.today ?? dayKey(new Date())}
          onClose={() => setAdding(false)}
          onAdd={async (x) => {
            await p.onAdd(x);
            setAdding(false);
            setDone(`${x.givenName} was added. Their checklist has started.`);
          }}
        />
      )}
      {importing && (
        <ImportDrawer
          onClose={() => setImporting(false)}
          onImport={p.onImport}
          onDone={(n) => {
            setImporting(false);
            setDone(`${n} ${n === 1 ? 'joiner was' : 'joiners were'} added.`);
          }}
        />
      )}
    </LivePage>
  );
}

function AddJoinerDrawer({ places, today, onClose, onAdd }: { places: JoinerPlaces; today: string; onClose: () => void; onAdd: (x: JoinerInput) => Promise<void> }) {
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

function ImportDrawer({ onClose, onImport, onDone }: { onClose: () => void; onImport: (csv: string, commit: boolean) => Promise<ImportResult>; onDone: (n: number) => void }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const { busy, error, run } = useRun();
  const read = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
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
        <input id="imp-file" className="yx-input" type="file" accept=".csv,text/csv" onChange={(e) => void read(e)} />
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

type Ask = { kind: 'done' | 'form' | 'letter' | 'skip' | 'upload' | 'read' | 'watch' | 'survey'; task: JourneyTask };
const CONTENT_ASK: Partial<Record<JourneyTask['kind'], { ask: Ask['kind']; button: string; confirm: string }>> = {
  form: { ask: 'form', button: 'Fill in', confirm: 'Submit' },
  letter: { ask: 'letter', button: 'Record the letter', confirm: 'Issue letter' },
  read: { ask: 'read', button: 'Read', confirm: 'I have read this' },
  watch: { ask: 'watch', button: 'Watch', confirm: 'I have watched this' },
  survey: { ask: 'survey', button: 'Answer', confirm: 'Send answers' },
};

function TaskTable({ tasks, today, showPerson, actions, onOpen, canUpload }: { tasks: JourneyTask[]; today: string; showPerson?: boolean; actions: TaskActions; onOpen?: (journeyId: string) => void; canUpload?: boolean }) {
  const [ask, setAsk] = useState<Ask | null>(null);
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
              {r.skipReason}
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

function TaskDialog({ ask, actions, onClose }: { ask: Ask; actions: TaskActions; onClose: () => void }) {
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
        <FormField id="tk-file" label="File" required helper="PDF, JPG or PNG.">
          <input id="tk-file" className="yx-input" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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

// ------------------------------------------------------------------------------------------ one checklist

export interface JourneyScreenProps extends TaskActions {
  state: LoadState;
  onRetry?: () => void;
  data: Journey | null;
  /** HR moves the joining day (YX-LC-13). */
  onPostpone?: (joiningOn: string, reason: string) => Promise<unknown>;
  onBack: () => void;
  /** Joiner details and actions (6b: forms, BGV, Mark joined), shown above the tasks. */
  children?: ReactNode;
}

export function JourneyScreen(p: JourneyScreenProps) {
  const j = p.data;
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [moving, setMoving] = useState(false);
  const tasks = j ? j.tasks.filter((t) => show === 'all' || t.status === 'open' || t.status === 'waiting') : [];
  return (
    <LivePage
      title={j ? `${j.person}: ${j.kind === 'onboarding' ? 'onboarding' : j.kind === 'offboarding' ? 'offboarding' : JOURNEY_KIND_LABEL[j.kind].toLowerCase()}` : 'Checklist'}
      description={j ? `${ANCHOR_WORD[j.kind]} ${j.kind === 'onboarding' || j.kind === 'offboarding' ? 'on ' : ''}${dateText(j.anchorOn)}. Checklist: ${j.template}${j.owner ? `, run by ${j.owner}` : ''}. Due dates follow the ${DAY_WORD[j.kind]} day.` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="this checklist"
      actions={
        <>
          <Button onClick={p.onBack}>Back</Button>
          {j?.canManage && j.status === 'active' && j.subjectType === 'preboarding' && p.onPostpone && <Button onClick={() => setMoving(true)}>Change joining day</Button>}
        </>
      }
    >
      {j && (
        <>
          <Card title="Progress">
            <Meter value={j.progress} max={100} label="Required tasks done" warnAt={101} dangerAt={101} valueText={`${j.progress}% of required tasks done`} />
            {j.status !== 'active' && <Badge tone={j.status === 'done' ? 'success' : 'neutral'}>{j.status === 'done' ? 'Checklist complete' : 'Checklist cancelled'}</Badge>}
          </Card>
          {p.children}
          <Segment label="Show" value={show} onChange={setShow} options={[{ value: 'open', label: 'To do' }, { value: 'all', label: 'All tasks' }]} />
          <TaskTable tasks={tasks} today={j.today} actions={p} canUpload={j.canManage} />
        </>
      )}
      {moving && j && p.onPostpone && <PostponeDialog current={j.anchorOn} today={j.today} onClose={() => setMoving(false)} onPostpone={p.onPostpone} />}
    </LivePage>
  );
}

function PostponeDialog({ current, today, onClose, onPostpone }: { current: string; today: string; onClose: () => void; onPostpone: (joiningOn: string, reason: string) => Promise<unknown> }) {
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

// ------------------------------------------------------------------------------------------ my tasks

export interface MyTasksScreenProps extends TaskActions {
  state: LoadState;
  onRetry?: () => void;
  data: MyTasks | null;
  onOpen: (journeyId: string) => void;
}

export function MyTasksScreen(p: MyTasksScreenProps) {
  const overdue = p.data?.tasks.filter((t) => t.overdue).length ?? 0;
  return (
    <LivePage
      title="My checklist tasks"
      description={p.data ? (overdue ? `${overdue} ${overdue === 1 ? 'task is' : 'tasks are'} overdue. Oldest first.` : 'Tasks for joiners and leavers given to you or your team. Oldest first.') : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="your tasks"
    >
      {p.data && <TaskTable tasks={p.data.tasks} today={p.data.today} showPerson actions={p} onOpen={p.onOpen} />}
    </LivePage>
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

export interface LifeJourneysScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: LifeJourneyRow[] | null;
  onOpen: (journeyId: string) => void;
}

/** Design §7.5: active life-event checklists in the viewer's scope (new manager, transfer, parental leave, return). */
export function LifeJourneysScreen(p: LifeJourneysScreenProps) {
  const columns: TableColumn<LifeJourneyRow>[] = [
    { key: 'person', header: 'Person', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person }), width: 220, hideable: false },
    { key: 'kind', header: 'Life event', value: (r) => r.kindLabel, width: 160 },
    { key: 'on', header: 'Day', value: (r) => r.anchorOn, render: (r) => <Text>{dateText(r.anchorOn)}</Text>, width: 140 },
    { key: 'progress', header: 'Required tasks done', value: (r) => r.progress, render: (r) => <Text>{`${r.progress}%`}</Text>, width: 170 },
  ];
  return (
    <LivePage title="Life events" description="Checklists for new managers, transfers, parental leave and return to work. Each starts by itself once the company turns it on in Settings › Checklists." state={p.state} onRetry={p.onRetry} what="life-event checklists">
      {p.rows && (
        <DataTable
          label="Life-event checklists"
          columns={columns}
          rows={p.rows}
          getRowId={(r) => r.id}
          rowNoun={['checklist', 'checklists']}
          cardSummary
          empty={<EmptyState compact title="No life-event checklists running." description="Turn one on in Settings › Checklists › Life events." />}
          rowButtons={(r) => (
            <Button size="sm" onClick={() => p.onOpen(r.id)}>
              Checklist
            </Button>
          )}
        />
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ joining soon (managers)

export function JoiningSoonCard({ rows, today, onOpen }: { rows: Joiner[]; today: string; onOpen: (journeyId: string) => void }) {
  if (!rows.length) return null;
  return (
    <Card title="Joining soon">
      <ul className="yx-lif-list">
        {rows.map((r) => (
          <li key={r.id}>
            <Text>{`${r.name}${r.designation ? `, ${r.designation}` : ''}`}</Text> <Text tone="secondary">{`joins ${dateText(r.joiningOn)}`}</Text> <WhenBadge date={r.joiningOn} today={today} />{' '}
            {r.journeyId && (
              <Button size="sm" onClick={() => onOpen(r.journeyId!)}>
                Checklist
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------ document verification queue

export interface DocumentQueueScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: QueueDocument[] | null;
  onDownload: (doc: QueueDocument) => Promise<unknown>;
  onDecide: (doc: QueueDocument, decision: 'verify' | 'reject', reason?: string) => Promise<unknown>;
}

export function DocumentQueueScreen(p: DocumentQueueScreenProps) {
  const [rejecting, setRejecting] = useState<QueueDocument | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const columns: TableColumn<QueueDocument>[] = [
    { key: 'person', header: 'Person', type: 'person', value: (r) => r.person ?? '', person: (r) => ({ name: r.person ?? '' }), width: 200, hideable: false },
    { key: 'type', header: 'Document', value: (r) => r.typeName, width: 220 },
    { key: 'at', header: 'Uploaded', value: (r) => r.uploadedAt ?? '', render: (r) => (r.uploadedAt ? dateText(r.uploadedAt.slice(0, 10)) : ''), width: 130 },
    {
      key: 'scan',
      header: 'Virus check',
      value: (r) => r.file?.scanStatus ?? '',
      render: (r) => <Badge tone={r.file?.scanStatus === 'clean' ? 'success' : r.file?.scanStatus === 'infected' ? 'danger' : 'warning'}>{r.file?.scanStatus === 'clean' ? 'Clean' : r.file?.scanStatus === 'infected' ? 'Blocked: virus found' : 'Being checked'}</Badge>,
      width: 170,
    },
  ];
  return (
    <LivePage title="Documents to verify" description="PAN, Aadhaar, bank proof, education and experience proofs are used by payroll only once verified. Open the file, then verify it or say why it is rejected; the person sees the reason." state={p.state} onRetry={p.onRetry} what="documents to verify">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      {p.rows && (
        <DataTable
          label="Documents to verify"
          columns={columns}
          rows={p.rows}
          getRowId={(r) => r.id}
          rowNoun={['document', 'documents']}
          cardSummary
          empty={<EmptyState compact title="Nothing to verify." description="Uploaded documents that need checking appear here." />}
          rowButtons={(r) =>
            r.file?.scanStatus === 'clean' ? (
              <>
                <Button size="sm" loading={busy === `dl-${r.id}`} onClick={() => void run(`dl-${r.id}`, () => p.onDownload(r))}>
                  Open file
                </Button>
                <Button size="sm" variant="primary" loading={busy === `ok-${r.id}`} onClick={() => void run(`ok-${r.id}`, () => p.onDecide(r, 'verify'))}>
                  Verify
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setReason('');
                    setRejecting(r);
                  }}
                >
                  Reject
                </Button>
              </>
            ) : null
          }
        />
      )}
      {rejecting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRejecting(null)}
          size="md"
          title={`Reject ${rejecting.person}'s ${rejecting.typeName}?`}
          consequence="They are asked to upload it again and see your reason."
          confirmLabel="Reject"
          confirmDisabled={reason.trim().length < 3}
          onConfirm={async () => {
            await p.onDecide(rejecting, 'reject', reason.trim());
            setRejecting(null);
          }}
        >
          <FormField id="rj-reason" label="Reason" required>
            <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
          </FormField>
        </ConfirmDialog>
      )}
    </LivePage>
  );
}
