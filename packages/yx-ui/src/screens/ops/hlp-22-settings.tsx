// Helpdesk HLP-22 · Changes and problems, ITSM-1: the IT desk's change and problem settings (Desk set-up › Changes),
// each with its default (answers 1933-1939), and the company's change window and freezes (answer 1936). The desk's
// admins change the desk's settings; the company's Service Desk owner changes the window. Drawn here first, then live.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Text } from '../../components/foundations';
import { Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Card } from '../../components/shell';
import { useToast } from '../../components/notify';
import { useRun } from '../org/org-kit';

export type ItsmRoute = 'lead' | 'lead_owner' | 'board';
export interface ItsmQuestion {
  id: string;
  label: string;
  options: { value: string; label: string }[];
}
export interface ItsmWindow {
  weekdayFrom: string;
  weekdayTo: string;
  weekends: boolean;
  freezeFirstDays: number;
  freezeLastDays: number;
  freezeDates: number[];
}
export interface ItsmSettingsValue {
  version: number;
  routeLow: ItsmRoute;
  routeMedium: ItsmRoute;
  routeHigh: ItsmRoute;
  board: { id: string; name: string }[];
  boardRule: 'majority' | 'all';
  emergencyReviewDays: number;
  bannerOn: boolean;
  bannerHours: number;
  reviewDays: number;
  repeatCount: number;
  repeatDays: number;
  riskQuestions: ItsmQuestion[];
  riskQuestionsAreDefault: boolean;
  window: ItsmWindow;
  canEdit: boolean;
  canEditWindow: boolean;
}
export interface ItsmSettingsChange {
  version: number;
  routeLow?: ItsmRoute;
  routeMedium?: ItsmRoute;
  routeHigh?: ItsmRoute;
  boardUserIds?: string[];
  boardRule?: 'majority' | 'all';
  emergencyReviewDays?: number;
  bannerOn?: boolean;
  bannerHours?: number;
  reviewDays?: number;
  repeatCount?: number;
  repeatDays?: number;
  /** null: back to the five starter questions. */
  riskQuestions?: ItsmQuestion[] | null;
}
export interface ItsmWindowChange {
  weekdayFrom?: string;
  weekdayTo?: string;
  weekends?: boolean;
  freezeFirstDays?: number;
  freezeLastDays?: number;
  freezeDates?: string;
}

export interface ItsmSettingsPanelProps {
  value: ItsmSettingsValue;
  /** Active people of the company for the change board (search as you type). */
  onSearchPeople: (q: string) => Promise<{ id: string; name: string }[]>;
  onSave: (change: ItsmSettingsChange) => Promise<unknown>;
  onSaveWindow: (change: ItsmWindowChange) => Promise<unknown>;
  /** Answer 1935: the desk's standard changes (pre-approved change templates). */
  standard?: { templates: StandardTemplate[]; onSave: (id: string | null, input: { name: string; checklist: string[]; preApproved: boolean }) => Promise<unknown> };
}
export interface StandardTemplate {
  id: string;
  name: string;
  checklist: string[];
  preApproved: boolean;
}

const ROUTES: { value: ItsmRoute; label: string }[] = [
  { value: 'lead', label: 'An IT lead' },
  { value: 'lead_owner', label: 'Lead, then service owner' },
  { value: 'board', label: 'Change board' },
];
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const POINTS = [{ value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }];
const RO = 'You can see these settings. Only this desk’s admins change them.';

export function ItsmSettingsPanel({ value, onSearchPeople, onSave, onSaveWindow, standard }: ItsmSettingsPanelProps) {
  return (
    <div className="yx-ops-stack">
      <ApprovalCard key={`a${value.version}`} value={value} onSearchPeople={onSearchPeople} onSave={onSave} />
      {standard && <StandardCard can={value.canEdit} {...standard} />}
      <QuestionsCard key={`q${value.version}`} value={value} onSave={onSave} />
      <AfterCard key={`r${value.version}`} value={value} onSave={onSave} />
      <WindowCard key={JSON.stringify(value.window)} value={value} onSaveWindow={onSaveWindow} />
    </div>
  );
}

function SaveRow({ can, busy, onSave }: { can: boolean; busy: boolean; onSave: () => void }) {
  return can ? (
    <div className="yx-ops-row">
      <Button variant="primary" loading={busy} onClick={onSave}>
        Save
      </Button>
    </div>
  ) : null;
}

/** Answer 1934: who approves each risk, and the change board. An emergency is approved by one IT lead now, and the board reviews it after. */
function ApprovalCard({ value, onSearchPeople, onSave }: Pick<ItsmSettingsPanelProps, 'value' | 'onSearchPeople' | 'onSave'>) {
  const [low, setLow] = useState(value.routeLow);
  const [medium, setMedium] = useState(value.routeMedium);
  const [high, setHigh] = useState(value.routeHigh);
  const [board, setBoard] = useState(value.board.map((b) => b.id));
  const [known, setKnown] = useState(value.board);
  const [rule, setRule] = useState(value.boardRule);
  const [emergencyDays, setEmergencyDays] = useState<number | null>(value.emergencyReviewDays);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const can = value.canEdit;
  const search = (q: string) =>
    void onSearchPeople(q).then((found) => setKnown((k) => [...k, ...found.filter((f) => !k.some((x) => x.id === f.id))]));
  const route = (label: string, v: ItsmRoute, set: (r: ItsmRoute) => void) => (
    <FormField label={label}>
      <Segment label={label} options={ROUTES} value={v} onChange={(r) => can && set(r)} />
    </FormField>
  );
  return (
    <Card title="Who approves a change">
      <div className="yx-ops-stack">
        {!can && <InlineAlert tone="info">{RO}</InlineAlert>}
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        {route('Low risk', low, setLow)}
        {route('Medium risk', medium, setMedium)}
        {route('High risk', high, setHigh)}
        <FormField label="Change board" helper="The people who approve high-risk changes and review emergency changes afterwards. Nobody ever approves their own change." required={[low, medium, high].includes('board')}>
          <MultiSelect aria-label="Change board" searchable onSearchChange={search} options={known.map((p) => ({ value: p.id, label: p.name }))} value={board} onChange={(v) => can && setBoard(v)} placeholder="Add people" />
        </FormField>
        <FieldRow>
          <FormField label="The board approves when">
            <Segment label="The board approves when" options={[{ value: 'majority', label: 'Most of them agree' }, { value: 'all', label: 'All of them agree' }]} value={rule} onChange={(v) => can && setRule(v)} />
          </FormField>
          <FormField label="The board reviews an emergency change within (working days)" helper="One IT lead approves an emergency change at once.">
            <NumberField value={emergencyDays} onChange={setEmergencyDays} min={1} max={10} disabled={!can} />
          </FormField>
        </FieldRow>
        <SaveRow
          can={can}
          busy={busy === 'save'}
          onSave={() =>
            void run('save', async () => {
              await onSave({ version: value.version, routeLow: low, routeMedium: medium, routeHigh: high, boardUserIds: board, boardRule: rule, emergencyReviewDays: emergencyDays ?? 2 });
              toast({ tone: 'success', title: 'Approval settings saved.' });
            })
          }
        />
      </div>
    </Card>
  );
}

/** Answer 1933: the questions that set a change's risk (each answer 0 to 2 points; Low under 3, Medium 3 to 5, High 6 or more). */
function QuestionsCard({ value, onSave }: Pick<ItsmSettingsPanelProps, 'value' | 'onSave'>) {
  const [qs, setQs] = useState<ItsmQuestion[]>(value.riskQuestions);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const can = value.canEdit;
  const setQ = (i: number, q: ItsmQuestion) => setQs(qs.map((x, j) => (j === i ? q : x)));
  return (
    <Card title="Risk questions">
      <div className="yx-ops-stack">
        <InlineAlert tone="info">Each answer is worth 0, 1 or 2 points. Under 3 points is low risk, 3 to 5 medium, 6 or more high. Someone who sets a lower risk than the answers give must say why.</InlineAlert>
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        {qs.map((q, i) => (
          <section key={q.id} className="yx-ops-stack" aria-label={`Question ${i + 1}`}>
            <div className="yx-ops-stack">
              <FormField label={`Question ${i + 1}`} required>
                <TextField value={q.label} onChange={(v) => setQ(i, { ...q, label: v })} maxLength={120} disabled={!can} />
              </FormField>
              {q.options.map((o, k) => (
                <FieldRow key={k}>
                  <FormField label={`Answer ${k + 1}`} required>
                    <TextField value={o.label} onChange={(v) => setQ(i, { ...q, options: q.options.map((x, m) => (m === k ? { ...x, label: v } : x)) })} maxLength={80} disabled={!can} />
                  </FormField>
                  <FormField label="Points">
                    <Segment label={`Points for answer ${k + 1}`} options={POINTS} value={o.value} onChange={(v) => can && setQ(i, { ...q, options: q.options.map((x, m) => (m === k ? { ...x, value: v } : x)) })} />
                  </FormField>
                </FieldRow>
              ))}
              {can && (
                <div className="yx-ops-row">
                  {q.options.length < 4 && <Button size="sm" icon={Plus} onClick={() => setQ(i, { ...q, options: [...q.options, { value: '0', label: '' }] })}>Add an answer</Button>}
                  {q.options.length > 2 && <Button size="sm" onClick={() => setQ(i, { ...q, options: q.options.slice(0, -1) })}>Remove the last answer</Button>}
                  {qs.length > 1 && <Button size="sm" icon={Trash2} onClick={() => setQs(qs.filter((_, j) => j !== i))}>Remove this question</Button>}
                </div>
              )}
            </div>
          </section>
        ))}
        {can && (
          <div className="yx-ops-row">
            {qs.length < 8 && <Button icon={Plus} onClick={() => setQs([...qs, { id: `q${Date.now().toString(36).slice(-6)}`, label: '', options: [{ value: '0', label: '' }, { value: '2', label: '' }] }])}>Add a question</Button>}
            <Button variant="primary" loading={busy === 'save'} onClick={() => void run('save', async () => (await onSave({ version: value.version, riskQuestions: qs }), toast({ tone: 'success', title: 'Risk questions saved.' })))}>
              Save questions
            </Button>
            {!value.riskQuestionsAreDefault && (
              <Button loading={busy === 'reset'} onClick={() => void run('reset', async () => (await onSave({ version: value.version, riskQuestions: null }), toast({ tone: 'success', title: 'Back to the five starter questions.' })))}>
                Use the starter questions
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Answers 1937-1939: the known-issue banner, the review after a change, and when to suggest a problem. */
function AfterCard({ value, onSave }: Pick<ItsmSettingsPanelProps, 'value' | 'onSave'>) {
  const [bannerOn, setBannerOn] = useState(value.bannerOn);
  const [bannerHours, setBannerHours] = useState<number | null>(value.bannerHours);
  const [reviewDays, setReviewDays] = useState<number | null>(value.reviewDays);
  const [repeatCount, setRepeatCount] = useState<number | null>(value.repeatCount);
  const [repeatDays, setRepeatDays] = useState<number | null>(value.repeatDays);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const can = value.canEdit;
  return (
    <Card title="Banner, review and problems">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        <Switch label="Show a known-issue banner on the portal for a scheduled change, and email the service owner" checked={bannerOn} onChange={setBannerOn} disabled={!can} />
        <FieldRow>
          <FormField label="Show the banner from (hours before)" helper="Until the change window ends.">
            <NumberField value={bannerHours} onChange={setBannerHours} min={1} max={168} disabled={!can || !bannerOn} />
          </FormField>
          <FormField label="Review due within (working days)" helper="After a high-risk, emergency or failed change.">
            <NumberField value={reviewDays} onChange={setReviewDays} min={1} max={20} disabled={!can} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Suggest a problem after (similar incidents)">
            <NumberField value={repeatCount} onChange={setRepeatCount} min={2} max={20} disabled={!can} />
          </FormField>
          <FormField label="Within (days)">
            <NumberField value={repeatDays} onChange={setRepeatDays} min={1} max={30} disabled={!can} />
          </FormField>
        </FieldRow>
        <SaveRow
          can={can}
          busy={busy === 'save'}
          onSave={() =>
            void run('save', async () => {
              await onSave({ version: value.version, bannerOn, bannerHours: bannerHours ?? 24, reviewDays: reviewDays ?? 5, repeatCount: repeatCount ?? 3, repeatDays: repeatDays ?? 7 });
              toast({ tone: 'success', title: 'Settings saved.' });
            })
          }
        />
      </div>
    </Card>
  );
}

/** Answer 1936: when changes may run and the freeze days, for the whole company. */
function WindowCard({ value, onSaveWindow }: Pick<ItsmSettingsPanelProps, 'value' | 'onSaveWindow'>) {
  const w = value.window;
  const [from, setFrom] = useState(w.weekdayFrom);
  const [to, setTo] = useState(w.weekdayTo);
  const [weekends, setWeekends] = useState(w.weekends);
  const [first, setFirst] = useState<number | null>(w.freezeFirstDays);
  const [last, setLast] = useState<number | null>(w.freezeLastDays);
  const [dates, setDates] = useState(w.freezeDates.join(', '));
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const can = value.canEditWindow;
  return (
    <Card title="Change window and freezes">
      <div className="yx-ops-stack">
        <InlineAlert tone="info">{can ? 'For the whole company, every IT desk.' : 'For the whole company. Only the company’s Service Desk owner changes it.'} An emergency change may go into a freeze only with a reason.</InlineAlert>
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        <FieldRow>
          <FormField label="Weekdays from">
            <Select value={from} onChange={(v) => v && setFrom(v)} options={HALF_HOURS.map((h) => ({ value: h, label: h }))} disabled={!can} />
          </FormField>
          <FormField label="Until (the next morning)">
            <Select value={to} onChange={(v) => v && setTo(v)} options={HALF_HOURS.map((h) => ({ value: h, label: h }))} disabled={!can} />
          </FormField>
        </FieldRow>
        <Switch label="Changes may run all weekend" checked={weekends} onChange={setWeekends} disabled={!can} />
        <FieldRow>
          <FormField label="Freeze the first days of the month">
            <NumberField value={first} onChange={setFirst} min={0} max={10} disabled={!can} />
          </FormField>
          <FormField label="Freeze the last days of the month">
            <NumberField value={last} onChange={setLast} min={0} max={10} disabled={!can} />
          </FormField>
        </FieldRow>
        <FormField label="Also freeze on these dates" helper="Dates of the month, separated by commas, for example 7, 15, 20 (statutory due dates)." optional>
          <TextField value={dates} onChange={setDates} maxLength={60} disabled={!can} />
        </FormField>
        <SaveRow
          can={can}
          busy={busy === 'save'}
          onSave={() =>
            void run('save', async () => {
              await onSaveWindow({ weekdayFrom: from, weekdayTo: to, weekends, freezeFirstDays: first ?? 0, freezeLastDays: last ?? 0, freezeDates: dates });
              toast({ tone: 'success', title: 'Change window saved.' });
            })
          }
        />
      </div>
    </Card>
  );
}

/** Answer 1935: standard changes skip approval; one that fails loses its pre-approval until the desk admin gives it back. */
function StandardCard({ can, templates, onSave }: { can: boolean } & NonNullable<ItsmSettingsPanelProps['standard']>) {
  const [name, setName] = useState('');
  const [lines, setLines] = useState('');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const early = useTooEarly(name.trim().length < 2 ? [{ fieldId: 'std-name', message: 'Name the standard change.' }] : []);
  return (
    <Card title="Standard changes (pre-approved)">
      <div className="yx-ops-stack">
        <InlineAlert tone="info">A standard change from one of these templates is scheduled without approval. If one fails, its template stops being pre-approved until you turn it on again.</InlineAlert>
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        {templates.length === 0 && <Text tone="secondary">No standard changes yet.</Text>}
        {templates.map((t) => (
          <Switch
            key={t.id}
            label={t.name}
            description={t.checklist.length ? `Steps: ${t.checklist.join(' · ')}` : 'No steps'}
            checked={t.preApproved}
            disabled={!can}
            onChange={(on) => void run(t.id, async () => (await onSave(t.id, { name: t.name, checklist: t.checklist, preApproved: on }), toast({ tone: 'success', title: on ? `${t.name} is pre-approved.` : `${t.name} now needs approval.` })))}
          />
        ))}
        {can && (
          <>
            <FormField id="std-name" label="New standard change" required error={early.errorOf('std-name')}>
              <TextField value={name} onChange={setName} maxLength={100} placeholder="Monthly laptop patching" />
            </FormField>
            <FormField label="Steps" optional helper="One step per line (up to 30). They become the change's checklist.">
              <TextArea value={lines} onChange={setLines} rows={3} />
            </FormField>
            <div className="yx-ops-row">
              <Button
                loading={busy === 'add'}
                onClick={() =>
                  !early.stop() &&
                  void run('add', async () => {
                        await onSave(null, { name: name.trim(), checklist: lines.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 30), preApproved: true });
                        setName('');
                        setLines('');
                        toast({ tone: 'success', title: 'Standard change added.' });
                      })
                }
              >
                Add standard change
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
