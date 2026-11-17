// Assessments AS-2 (answers 2007, 2008; PRC-04, PRC-06): the designed test builder and score report with live data. The
// designed TestBuilderScreen and ScoreReportScreen in bank-tests.tsx render these when the page passes `live`. Same
// layout, kit parts and words as the designs; only what the server holds is shown, and the server checks every action
// again (a published or started test is locked, the approver is never the author or the one who asked).
import { useState } from 'react';
import { Copy, ListChecks, MonitorPlay, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/overlay';
import { MultiSelect, Select } from '../../components/select';
import { Drawer } from '../../components/drawer';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { DataTable } from '../../components/table';
import { EmptyState, ErrorState, InlineAlert, Meter } from '../../components/feedback';
import { ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { RadioGroup, Switch } from '../../components/choice';
import { REVIEW_ID, Stepper } from '../../components/stepper';
import { BarChart } from '../../components/charts';
import { formatDate } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { useSay } from '../ops/ops-kit';
import { PrcFrame } from './proctoring-shared';
import type { BankLoad } from './bank-live';

/* ------------------------------------------------------------------ the server's shapes */

export type ProctorMode = 'open' | 'ai' | 'record';

export interface TestCheck {
  id: string;
  label: string;
  ok: boolean;
  problem: string | null;
}

export interface TestSection {
  id: string;
  title: string;
  weightPercent: number;
  mode: 'fixed' | 'pool';
  questions: number;
  poolSize: number | null;
  poolDifficulty: string | null;
  poolTags: string[];
  /** Answer 2284: the pool's skill ids (for the skills picker). */
  poolTagIds?: string[];
  available: number | null;
  requiredCount: number | null;
  targetMinutes: number | null;
  /** Answer 2154: the least percentage of this section's own marks to pass; null = none (absent on an older API). */
  cutoffPercent?: number | null;
}

/** GET /asmt/tests/:id. */
export interface BuilderTestView {
  id: string;
  title: string;
  status: string;
  durationMinutes: number;
  passMark: number;
  expectedCandidates: number | null;
  proctoringMode: ProctorMode | 'custom';
  /** AS-6 part 2 (answer 2272): candidates may use the approved assistant; every message is logged. */
  aiAllowed?: boolean;
  sections: TestSection[];
  checks: TestCheck[];
  editable: boolean;
  approval: { needed: boolean; threshold: number; requestedBy: string | null; requestedAt: string | null; approvedBy: string | null; approvedAt: string | null; current: boolean; canApprove: boolean };
  createdAt: string;
}

/** Answer 2284: a bank question as the picker shows it (never its answer key). */
export interface QuestionChoice {
  id: string;
  text: string;
  type: string;
  difficulty: string;
  marks: number;
  skills: string[];
}

export interface ChoiceFilter {
  search: string;
  difficulty: string | null;
  tagId: string | null;
}

export interface TestListRow {
  id: string;
  title: string;
  status: string;
  /** Candidates invited so far. */
  invited: number;
  createdAt: string;
}

export interface TestDetails {
  title: string;
  durationMinutes: number;
  passMark: number;
  expectedCandidates: number | null;
}

export interface LiveTestBuilder {
  state: BankLoad;
  onRetry: () => void;
  /** The test being built; null on "New test" (the start step only). */
  test: BuilderTestView | null;
  /** The company's tests to start from (Our tests). */
  tests: TestListRow[];
  /** The company's default proctoring mode (Settings 6.5), named on a new test. */
  defaultMode: ProctorMode;
  onNew: (title: string) => Promise<void>;
  onCopy: (id: string) => Promise<void>;
  onOpen: (id: string) => void;
  onSaveDetails: (d: TestDetails) => Promise<void>;
  onSetMode: (mode: ProctorMode) => Promise<void>;
  /** Answer 2154: a section's cut-off (null clears it). Absent: the cut-offs are read only. */
  onSetCutoff?: (sectionId: string, percent: number | null) => Promise<void>;
  /**
   * Answer 2284: the Sections step's pickers (the older editor is retired). A fixed section's chosen questions and the
   * bank's questions it may add; saving the chosen ones; a pool's skills, draw and difficulty. Absent: read only.
   */
  onLoadChoices?: (sectionId: string, f: ChoiceFilter) => Promise<{ chosen: QuestionChoice[]; choices: QuestionChoice[] }>;
  onSetQuestions?: (sectionId: string, questionIds: string[]) => Promise<void>;
  onSetPool?: (sectionId: string, v: { tagIds: string[]; poolSize: number; poolDifficulty: string | null }) => Promise<void>;
  /** Answer 2153: the designed steps edit sections. Absent: read only. */
  onAddSection?: (title: string) => Promise<void>;
  onSaveSection?: (id: string, v: { title: string; weightPercent: number }) => Promise<void>;
  onDeleteSection?: (id: string) => Promise<void>;
  onSavePool?: (id: string, v: { poolSize: number; poolDifficulty: string | null }) => Promise<void>;
  /** Answer 2151: build from a job description (only when the company's AI drafts are on). Absent: no such tab. */
  onProposeFromJd?: (jobDescription: string) => Promise<{ level: JdLevel; skills: JdSkill[] }>;
  onCreateFromJd?: (d: { title: string; level: JdLevel; total: number; skills: { tagId: string; percent: number }[] }) => Promise<void>;
  /** The company's skills (question tags), to map the job description's skills to. */
  skills?: { id: string; name: string }[];
  onRequestApproval: () => Promise<void>;
  onApprove: () => Promise<void>;
  onPublish: () => Promise<void>;
  /** AS-6 part 2 (answer 2272): the AI-allowed switch (PRC-12). */
  onSetAiAllowed?: (allowed: boolean) => Promise<void>;
  /** Answer 2267: opens the live console (PRC-13) of a published test; absent for people who cannot proctor. */
  onLiveConsole?: () => void;
}

export const MODE_WORDS: Record<ProctorMode, { label: string; description: string }> = {
  open: { label: 'Open', description: 'No proctoring. For practice and training.' },
  ai: { label: 'AI-only', description: 'Camera stills and short clips around flags; a reviewer checks flags afterwards.' },
  record: { label: 'Record & review', description: 'Records camera and screen; a reviewer checks flagged moments.' },
};

const STATUS: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'success' },
  archived: { label: 'Archived', tone: 'warning' },
};
const statusOf = (s: string) => STATUS[s] ?? { label: s, tone: 'neutral' as const };
const DIFFICULTY: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** A pool cell's state, as the engine checks it at publish: at least as many approved questions as are drawn. */
export const poolShort = (s: TestSection) => s.mode === 'pool' && (s.available ?? 0) < (s.poolSize ?? 0);

/* ------------------------------------------------------------------ PRC-04 · Test builder */

/**
 * Answer 2154: a section may need its own least percentage. A candidate below it fails the test, whatever the total;
 * the score report says which section. Empty = no cut-off.
 */
function SectionCutoffs({ sections, locked, busy, onSave }: { sections: TestSection[]; locked: boolean; busy: string | null; onSave: (id: string, v: number | null) => void }) {
  const [draft, setDraft] = useState<Record<string, number | null>>({});
  const value = (s: TestSection) => (s.id in draft ? draft[s.id]! : (s.cutoffPercent ?? null));
  return (
    <section className="yx-prc-box" aria-label="Section cut-offs">
      <h2 className="yx-prc-h">Section cut-offs</h2>
      <p className="yx-prc-small yx-prc-muted">A candidate below a section's cut-off fails the test, whatever the total. Leave empty for none.</p>
      <ul className="yx-prc-plain">
        {sections.map((s) => (
          <li key={s.id}>
            <span>{s.title}</span>
            <span className="yx-prc-row">
              <NumberField aria-label={`Cut-off for ${s.title}`} value={value(s)} onChange={(v) => setDraft({ ...draft, [s.id]: v == null || Number(v) < 1 ? null : Math.min(100, Number(v)) })} suffix="%" readOnly={locked} size="sm" />
              {!locked && (
                <Button size="sm" loading={busy === `cut:${s.id}`} onClick={() => onSave(s.id, value(s))}>
                  Save
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Answer 2151: a skill the job description asks for, matched to one of the company's skills (null = not yet). */
export interface JdSkill {
  name: string;
  tagId: string | null;
  percent: number;
}
export type JdLevel = 'easy' | 'medium' | 'hard';

/** Answer 2151: the designed "Build from job description" tab. Only the text and the skill names go to AI; always a draft. */
function FromJobDescription({ live, busy, run }: { live: LiveTestBuilder; busy: string | null; run: (k: string, fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [plan, setPlan] = useState<{ level: JdLevel; skills: JdSkill[] } | null>(null);
  const [total, setTotal] = useState<number | null>(20);
  const [tried, setTried] = useState(false);
  const { done } = useSay();
  const skills = live.skills ?? [];
  const sum = plan ? plan.skills.reduce((n, s) => n + s.percent, 0) : 0;
  const unmapped = plan ? plan.skills.filter((s) => !s.tagId).length : 0;
  const twice = plan ? plan.skills.length !== new Set(plan.skills.map((s) => s.tagId).filter(Boolean)).size + unmapped : false;
  const setSkill = (i: number, v: Partial<JdSkill>) => plan && setPlan({ ...plan, skills: plan.skills.map((s, j) => (j === i ? { ...s, ...v } : s)) });
  const problem = !plan ? null : !plan.skills.length ? 'Keep at least one skill.' : unmapped ? `Map ${unmapped === 1 ? 'the skill' : `${unmapped} skills`} not in your library, or remove ${unmapped === 1 ? 'it' : 'them'}.` : twice ? 'Each of your skills can be in the test once.' : sum !== 100 ? `The shares add up to ${sum} %; make them 100 %.` : !title.trim() ? 'Name the test.' : !total ? 'Say how many questions the test draws.' : null;
  return (
    <div className="yx-prc-stack">
      <FormField label="Job description" helper="Only this text and your skill names go to AI. No candidate data.">
        <TextArea rows={5} value={text} onChange={setText} maxLength={8000} />
      </FormField>
      <div className="yx-prc-row">
        <Button loading={busy === 'jd:propose'} disabled={text.trim().length < 40} onClick={() => void run('jd:propose', async () => setPlan(await live.onProposeFromJd!(text.trim())))}>
          Find the skills
        </Button>
      </div>
      {plan && (
        <>
          <InlineAlert tone="ai" title="Skills found in the job description">
            You confirm the list; the test is always a draft, built from pools of your approved questions.
          </InlineAlert>
          <ul className="yx-prc-plain" aria-label="Skills for the test">
            {plan.skills.map((s, i) => (
              <li key={`${s.name}:${i}`}>
                <span>{s.name}{!s.tagId && <Badge tone="warning">Not in your library</Badge>}</span>
                <span className="yx-prc-row">
                  <Select aria-label={`Your skill for ${s.name}`} value={s.tagId} onChange={(v) => setSkill(i, { tagId: v })} options={skills.map((k) => ({ value: k.id, label: k.name }))} placeholder="Map to your skill" searchable />
                  <NumberField aria-label={`Share of ${s.name}`} value={s.percent} onChange={(v) => setSkill(i, { percent: Math.max(0, Math.min(100, Math.round(Number(v ?? 0)))) })} suffix="%" size="sm" />
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => setPlan({ ...plan, skills: plan.skills.filter((_, j) => j !== i) })}>
                    Remove
                  </Button>
                </span>
              </li>
            ))}
            <li>
              <span>Total</span> <Badge tone={sum === 100 ? 'success' : 'danger'}>{sum} %</Badge>
            </li>
          </ul>
          <Segment label="Level" options={[{ value: 'easy' as const, label: 'Easy' }, { value: 'medium' as const, label: 'Medium' }, { value: 'hard' as const, label: 'Hard' }]} value={plan.level} onChange={(v) => setPlan({ ...plan, level: v })} />
          <div className="yx-prc-row">
            <FormField label="Test name">
              <TextField value={title} onChange={setTitle} maxLength={200} placeholder="e.g. Backend developer · L3" />
            </FormField>
            <FormField label="Questions drawn in all">
              <NumberField value={total} onChange={(v) => setTotal(v == null ? null : Math.max(5, Math.min(100, Math.round(Number(v)))))} />
            </FormField>
          </div>
          {tried && problem && <InlineAlert tone="danger" title={problem} />}
          <div className="yx-prc-row">
            <Button
              variant="primary"
              icon={Plus}
              loading={busy === 'jd:create'}
              onClick={() => {
                setTried(true);
                if (problem) return;
                void run('jd:create', () => live.onCreateFromJd!({ title: title.trim(), level: plan.level, total: total!, skills: plan.skills.map((s) => ({ tagId: s.tagId!, percent: s.percent })) })).then((ok) => ok && done('Draft test created'));
              }}
            >
              Create draft test
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Answer 2153: the designed Sections step edits the sections themselves (name and weight; add and remove). */
function SectionsEditor({ sections, busy, onSave, onAdd, onDelete, onQuestions }: { sections: TestSection[]; busy: string | null; onSave: (id: string, v: { title: string; weightPercent: number }) => void; onAdd: (title: string) => Promise<boolean>; onDelete: (id: string) => void; onQuestions?: (s: TestSection) => void }) {
  const [draft, setDraft] = useState<Record<string, { title: string; weightPercent: number }>>({});
  const [newTitle, setNewTitle] = useState('');
  const [tried, setTried] = useState(false);
  const [removing, setRemoving] = useState<TestSection | null>(null);
  const value = (s: TestSection) => draft[s.id] ?? { title: s.title, weightPercent: s.weightPercent };
  const set = (s: TestSection, v: Partial<{ title: string; weightPercent: number }>) => setDraft({ ...draft, [s.id]: { ...value(s), ...v } });
  const weights = sections.reduce((n, s) => n + value(s).weightPercent, 0);
  return (
    <div className="yx-prc-stack">
      <ul className="yx-prc-plain">
        {sections.map((s) => {
          const v = value(s);
          return (
            <li key={s.id}>
              <span className="yx-prc-row">
                <TextField aria-label={`Name of ${s.title}`} value={v.title} onChange={(t) => set(s, { title: t })} maxLength={200} size="sm" />
                <NumberField aria-label={`Weight of ${s.title}`} value={v.weightPercent} onChange={(w) => set(s, { weightPercent: Math.max(0, Math.min(100, Number(w ?? 0))) })} suffix="%" size="sm" />
              </span>
              <span className="yx-prc-small yx-prc-muted">
                {s.mode === 'pool' ? `draws ${s.poolSize ?? 0} from a pool` : `${s.questions} ${s.questions === 1 ? 'question' : 'questions'}`}
                {s.requiredCount != null ? ` · answer any ${s.requiredCount}` : ''}
              </span>
              <span className="yx-prc-row">
                <Button size="sm" loading={busy === `sec:${s.id}`} disabled={!v.title.trim()} onClick={() => onSave(s.id, { title: v.title.trim(), weightPercent: v.weightPercent })}>
                  Save
                </Button>
                {onQuestions && (
                  <Button size="sm" icon={ListChecks} onClick={() => onQuestions(s)}>
                    {s.mode === 'pool' ? 'Skills' : 'Questions'}
                  </Button>
                )}
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => setRemoving(s)}>
                  Remove
                </Button>
              </span>
            </li>
          );
        })}
        <li>
          <span>Total weight</span> <Badge tone={weights === 100 ? 'success' : 'danger'}>{weights} %</Badge>
        </li>
      </ul>
      <div className="yx-prc-row">
        <FormField label="New section" error={tried && !newTitle.trim() ? 'Give the section a name.' : undefined}>
          <TextField value={newTitle} onChange={setNewTitle} maxLength={200} placeholder="For example, SQL" />
        </FormField>
        <Button
          icon={Plus}
          loading={busy === 'sec:add'}
          onClick={() => {
            setTried(true);
            if (newTitle.trim())
              void onAdd(newTitle.trim()).then((ok) => {
                if (ok) {
                  setNewTitle('');
                  setTried(false);
                }
              });
          }}
        >
          Add section
        </Button>
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.title ?? 'this section'}?`}
        consequence="Its questions stay in the question bank; only this test changes."
        confirmLabel="Remove section"
        destructive
        onConfirm={() => {
          if (removing) onDelete(removing.id);
          setRemoving(null);
        }}
      />
    </div>
  );
}

const LEVELS = [{ value: 'any', label: 'Any' }, ...Object.entries(DIFFICULTY).map(([value, label]) => ({ value, label }))];

/**
 * Answer 2284: a section's questions, in the designed Sections step. "Chosen questions" picks bank questions one by one
 * (searched by words, difficulty and skill); "Pool by skill" draws a number of questions at random from skills.
 */
function SectionQuestionsDrawer({ section, skills, onClose, onLoad, onSetQuestions, onSetPool, onDone }: { section: TestSection; skills: { id: string; name: string }[]; onClose: () => void; onLoad: NonNullable<LiveTestBuilder['onLoadChoices']>; onSetQuestions: NonNullable<LiveTestBuilder['onSetQuestions']>; onSetPool: NonNullable<LiveTestBuilder['onSetPool']>; onDone: (text: string) => void }) {
  const [mode, setMode] = useState<'fixed' | 'pool'>(section.mode);
  const [filter, setFilter] = useState<ChoiceFilter>({ search: '', difficulty: null, tagId: null });
  const [chosen, setChosen] = useState<QuestionChoice[] | null>(null);
  const [choices, setChoices] = useState<QuestionChoice[]>([]);
  const [tags, setTags] = useState<string[]>(section.poolTagIds ?? []);
  const [size, setSize] = useState<number | null>(section.poolSize ?? 5);
  const [level, setLevel] = useState<string>(section.poolDifficulty ?? 'any');
  const [tried, setTried] = useState(false);
  const { busy, run, error } = useRun();
  const load = (f: ChoiceFilter, keepChosen: boolean) =>
    void run('load', async () => {
      const r = await onLoad(section.id, f);
      setChoices(r.choices.filter((q) => !(keepChosen && chosen ? chosen.some((c) => c.id === q.id) : r.chosen.some((c) => c.id === q.id))));
      if (!keepChosen || !chosen) setChosen(r.chosen);
    });
  if (chosen === null && busy !== 'load' && !error) load(filter, false);
  const picked = chosen ?? [];
  const add = (q: QuestionChoice) => {
    setChosen([...picked, q]);
    setChoices(choices.filter((c) => c.id !== q.id));
  };
  const drop = (q: QuestionChoice) => {
    setChosen(picked.filter((c) => c.id !== q.id));
    setChoices([q, ...choices]);
  };
  const poolProblem = !tags.length ? 'Choose at least one skill.' : !size || size < 1 ? 'Draw at least one question.' : null;
  const save = () => {
    setTried(true);
    if (mode === 'pool') {
      if (poolProblem) return;
      void run('save', () => onSetPool(section.id, { tagIds: tags, poolSize: size!, poolDifficulty: level === 'any' ? null : level })).then((ok) => ok && onDone('Pool saved'));
    } else void run('save', () => onSetQuestions(section.id, picked.map((q) => q.id))).then((ok) => ok && onDone('Questions saved'));
  };
  const row = (q: QuestionChoice, action: 'add' | 'drop') => (
    <li key={q.id}>
      <span className="yx-prc-stack" data-gap="sm">
        <span>{q.text || 'Question without text'}</span>
        <span className="yx-prc-small yx-prc-muted">{[DIFFICULTY[q.difficulty] ?? q.difficulty, `${q.marks} ${q.marks === 1 ? 'mark' : 'marks'}`, ...q.skills].join(' · ')}</span>
      </span>
      {action === 'add' ? (
        <Button size="sm" icon={Plus} onClick={() => add(q)} aria-label={`Add: ${q.text.slice(0, 60)}`}>
          Add
        </Button>
      ) : (
        <Button size="sm" icon={Trash2} onClick={() => drop(q)} aria-label={`Take out: ${q.text.slice(0, 60)}`}>
          Take out
        </Button>
      )}
    </li>
  );
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Questions in ${section.title}`}
      subtitle="Only questions live in the question bank can be chosen; a question is in one section of a test at most."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={save}>
            {mode === 'pool' ? 'Save the pool' : `Save ${picked.length} ${picked.length === 1 ? 'question' : 'questions'}`}
          </Button>
        </>
      }
    >
      <div className="yx-prc-stack">
        {error && (
          <InlineAlert tone="danger" title="That did not work">
            {error}
          </InlineAlert>
        )}
        <Segment label="How the questions are chosen" value={mode} onChange={setMode} options={[{ value: 'fixed', label: 'Chosen questions' }, { value: 'pool', label: 'Pool by skill' }]} />
        {mode === 'pool' ? (
          <>
            <FormField label="Skills" required error={tried && !tags.length ? 'Choose at least one skill.' : undefined} helper="Each candidate gets questions that have all of these skills.">
              <MultiSelect aria-label="Skills" value={tags} onChange={setTags} options={skills.map((k) => ({ value: k.id, label: k.name }))} searchable />
            </FormField>
            <div className="yx-prc-grid2">
              <FormField label="Questions drawn" required error={tried && (!size || size < 1) ? 'Draw at least one question.' : undefined}>
                <NumberField value={size} onChange={(v) => setSize(v == null ? null : Math.max(1, Math.round(Number(v))))} />
              </FormField>
              <FormField label="Difficulty">
                <Segment label="Difficulty" value={level} onChange={setLevel} options={LEVELS} />
              </FormField>
            </div>
            {!skills.length && <InlineAlert tone="info">There are no skills yet. Skills come from the question bank's tags.</InlineAlert>}
          </>
        ) : (
          <>
            <section className="yx-prc-box" aria-label="Chosen questions">
              <strong>{`Chosen (${picked.length})`}</strong>
              {chosen === null ? <p className="yx-prc-small yx-prc-muted">Loading…</p> : picked.length === 0 ? <p className="yx-prc-small yx-prc-muted">No questions chosen yet. Add them from the bank below.</p> : <ul className="yx-prc-plain">{picked.map((q) => row(q, 'drop'))}</ul>}
            </section>
            <section className="yx-prc-stack" aria-label="Question bank">
              <div className="yx-prc-grid3">
                <FormField label="Words in the question">
                  <TextField value={filter.search} onChange={(v) => setFilter({ ...filter, search: v })} maxLength={100} />
                </FormField>
                <FormField label="Difficulty">
                  <Segment label="Difficulty" value={filter.difficulty ?? 'any'} onChange={(v) => setFilter({ ...filter, difficulty: v === 'any' ? null : v })} options={LEVELS} />
                </FormField>
                <FormField label="Skill">
                  <Select aria-label="Skill" value={filter.tagId} onChange={(v) => setFilter({ ...filter, tagId: v })} options={skills.map((k) => ({ value: k.id, label: k.name }))} clearable searchable />
                </FormField>
              </div>
              <div className="yx-prc-row">
                <Button icon={Search} loading={busy === 'load'} onClick={() => load(filter, true)}>
                  Search the bank
                </Button>
              </div>
              {choices.length === 0 ? <EmptyState title="No questions found" description="Change the words, difficulty or skill. Only live questions of the bank are shown." /> : <ul className="yx-prc-plain" aria-label="Questions you can add">{choices.map((q) => row(q, 'add'))}</ul>}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}

/** Answer 2153: the Blueprint step sets how many questions each pool draws, and at what difficulty. */
function PoolEditor({ s, busy, onSave }: { s: TestSection; busy: string | null; onSave: (id: string, v: { poolSize: number; poolDifficulty: string | null }) => void }) {
  const [size, setSize] = useState<number | null>(s.poolSize);
  const [level, setLevel] = useState<string>(s.poolDifficulty ?? 'any');
  return (
    <span className="yx-prc-row">
      <NumberField aria-label={`Questions drawn in ${s.title}`} value={size} onChange={(v) => setSize(v == null ? null : Math.max(1, Math.round(Number(v))))} size="sm" />
      <Select aria-label={`Difficulty in ${s.title}`} value={level} onChange={(v) => setLevel(v ?? 'any')} options={[{ value: 'any', label: 'Any' }, ...Object.entries(DIFFICULTY).map(([value, label]) => ({ value, label }))]} />
      <Button size="sm" loading={busy === `pool:${s.id}`} disabled={!size} onClick={() => onSave(s.id, { poolSize: size!, poolDifficulty: level === 'any' ? null : level })}>
        Save
      </Button>
    </span>
  );
}

export function LiveTestBuilderScreen({ live }: { live: LiveTestBuilder }) {
  const t = live.test;
  const fromTest = (x: BuilderTestView | null): TestDetails | null => (x ? { title: x.title, durationMinutes: x.durationMinutes, passMark: x.passMark, expectedCandidates: x.expectedCandidates } : null);
  const key = t ? `${t.id}:${t.title}:${t.durationMinutes}:${t.passMark}:${t.expectedCandidates}` : null;
  const [details, setDetails] = useState<TestDetails | null>(() => fromTest(t));
  const [loadedFor, setLoadedFor] = useState<string | null>(key);
  const [title, setTitle] = useState('');
  const [tried, setTried] = useState(false);
  const [step, setStep] = useState('sections');
  const [picking, setPicking] = useState<TestSection | null>(null);
  const { busy, run, error, clearError } = useRun();
  const { done, say } = useSay();
  if (key !== loadedFor) {
    // The server's copy changed (saved): show it.
    setLoadedFor(key);
    setDetails(fromTest(t));
  }
  if (live.state === 'error')
    return (
      <PrcFrame page="Tests">
        <ErrorState title="We couldn't load this test." onRetry={live.onRetry} />
      </PrcFrame>
    );
  if (live.state === 'loading')
    return (
      <PrcFrame page="Tests">
        <PageHeader title="Test" description="Loading…" />
      </PrcFrame>
    );

  const act = async (k: string, fn: () => Promise<void>, ok: string) => {
    if (await run(k, fn)) done(ok);
  };

  const start = (
    <div className="yx-prc-stack">
      <Tabs defaultValue="ours">
        <TabsList aria-label="Start from">
          <TabsTrigger value="ours">Our tests</TabsTrigger>
          <TabsTrigger value="starter">YukthiX starter</TabsTrigger>
          {live.onProposeFromJd && live.onCreateFromJd && <TabsTrigger value="jd">Build from job description</TabsTrigger>}
        </TabsList>
        <TabsContent value="ours">
          <div className="yx-prc-stack">
            <div className="yx-prc-row">
              <FormField label="New test" helper={`Starts empty, proctored as ${MODE_WORDS[live.defaultMode].label} (the company default).`} error={tried && !title.trim() ? 'Name the test.' : undefined}>
                <TextField value={title} onChange={setTitle} placeholder="e.g. Java Backend Developer · L2" />
              </FormField>
              <Button
                icon={Plus}
                loading={busy === 'new'}
                onClick={() => {
                  setTried(true);
                  if (!title.trim()) return say('Name the test first.');
                  void act('new', () => live.onNew(title.trim()), 'Test created');
                }}
              >
                Create test
              </Button>
            </div>
            {live.tests.length === 0 ? (
              <EmptyState title="No tests yet" description="Create the first one above." />
            ) : (
              <DataTable
                label="Our tests"
                columns={[
                  { key: 'title', header: 'Test', value: (r: TestListRow) => r.title, width: 320 },
                  { key: 'status', header: 'Status', value: (r: TestListRow) => statusOf(r.status).label, render: (r) => <Badge tone={statusOf(r.status).tone}>{statusOf(r.status).label}</Badge>, width: 120 },
                  { key: 'invited', header: 'Invited', type: 'number', value: (r: TestListRow) => r.invited, width: 100 },
                  { key: 'created', header: 'Created', value: (r: TestListRow) => r.createdAt, render: (r) => formatDate(new Date(r.createdAt)), width: 130 },
                  {
                    key: 'act',
                    header: '',
                    value: () => '',
                    render: (r) => (
                      <span className="yx-prc-row">
                        <Button size="sm" icon={Pencil} onClick={() => live.onOpen(r.id)}>
                          Open
                        </Button>
                        <Button size="sm" icon={Copy} loading={busy === `copy:${r.id}`} onClick={() => void act(`copy:${r.id}`, () => live.onCopy(r.id), 'Copy created as a draft')}>
                          Copy and edit
                        </Button>
                      </span>
                    ),
                    width: 240,
                  },
                ]}
                rows={live.tests}
                getRowId={(r) => r.id}
              />
            )}
          </div>
        </TabsContent>
        <TabsContent value="starter">
          <p className="yx-prc-muted">YukthiX is writing the starter tests with the starter question packs. They appear here when ready.</p>
        </TabsContent>
        {live.onProposeFromJd && live.onCreateFromJd && (
          <TabsContent value="jd">
            <FromJobDescription live={live} busy={busy} run={run} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );

  if (!t)
    return (
      <PrcFrame page="Tests">
        <PageHeader title="Tests" description="Start from one of your tests or a new one." />
        {error && <InlineAlert tone="danger" title={error} actions={<Button size="sm" onClick={clearError}>Dismiss</Button>} />}
        {start}
      </PrcFrame>
    );

  const d = details ?? fromTest(t)!;
  const locked = !t.editable;
  const pools = t.sections.filter((s) => s.mode === 'pool');
  const short = pools.filter(poolShort).length;
  const weights = t.sections.reduce((n, s) => n + s.weightPercent, 0);
  const blocked = t.checks.filter((c) => !c.ok);
  const saveDetails = () => {
    if (!d.title.trim()) return say('Name the test first.');
    void act('details', () => live.onSaveDetails({ ...d, title: d.title.trim() }), 'Test saved');
  };
  const detailsNote = locked ? <InlineAlert tone="info" title="This test is locked">It is published or someone has started it. Copy it to make changes.</InlineAlert> : null;
  const saveButton = !locked && (
    <div className="yx-prc-row">
      <Button loading={busy === 'details'} onClick={saveDetails}>
        Save
      </Button>
    </div>
  );

  const steps = [
    { id: 'template', title: 'Template', content: start },
    {
      id: 'sections',
      title: 'Sections',
      content: (
        <div className="yx-prc-stack">
          {detailsNote}
          {!locked && live.onSaveSection && live.onAddSection && live.onDeleteSection ? (
            <SectionsEditor
              sections={t.sections}
              busy={busy}
              onSave={(id, v) => void act(`sec:${id}`, () => live.onSaveSection!(id, v), 'Section saved')}
              onAdd={(title) => run('sec:add', () => live.onAddSection!(title)).then((ok) => (ok && done('Section added'), ok))}
              onDelete={(id) => void act(`sec:del:${id}`, () => live.onDeleteSection!(id), 'Section removed')}
              onQuestions={live.onLoadChoices && live.onSetQuestions && live.onSetPool ? setPicking : undefined}
            />
          ) : t.sections.length === 0 ? (
            <EmptyState title="No sections yet" description="Add sections and their questions or pools." />
          ) : (
            <ul className="yx-prc-plain">
              {t.sections.map((s) => (
                <li key={s.id}>
                  <strong>{s.title}</strong>
                  <span>
                    Weight {s.weightPercent} % · {s.mode === 'pool' ? `draws ${s.poolSize ?? 0} from a pool` : `${s.questions} ${s.questions === 1 ? 'question' : 'questions'}`}
                    {s.requiredCount != null ? ` · answer any ${s.requiredCount}` : ''}
                  </span>
                </li>
              ))}
              <li>
                <span>Total weight</span> <Badge tone={weights === 100 ? 'success' : 'danger'}>{weights} %</Badge>
              </li>
            </ul>
          )}
          {picking && live.onLoadChoices && live.onSetQuestions && live.onSetPool && (
            <SectionQuestionsDrawer
              section={picking}
              skills={live.skills ?? []}
              onClose={() => setPicking(null)}
              onLoad={live.onLoadChoices}
              onSetQuestions={live.onSetQuestions}
              onSetPool={live.onSetPool}
              onDone={(text) => {
                done(text);
                setPicking(null);
              }}
            />
          )}
        </div>
      ),
    },
    {
      id: 'blueprint',
      title: 'Blueprint',
      status: short > 0 ? ('error' as const) : undefined,
      statusNote: short > 0 ? `${short} ${short === 1 ? 'pool is' : 'pools are'} below pool depth` : undefined,
      content: (
        <div className="yx-prc-stack">
          {short > 0 && (
            <InlineAlert tone="danger" title={`${short} ${short === 1 ? 'pool is' : 'pools are'} below pool depth`}>
              A pool needs at least as many approved questions as it draws. Lower the count or add questions; publishing is blocked until then.
            </InlineAlert>
          )}
          {pools.length === 0 ? (
            <EmptyState title="No pool sections" description="Every section has its own questions. Pools by skill and difficulty draw different questions for each candidate." />
          ) : (
            <DataTable
              label="Blueprint: questions drawn and approved questions available, per skill and difficulty"
              columns={[
                { key: 'section', header: 'Section', value: (s: TestSection) => s.title, width: 180 },
                { key: 'skills', header: 'Skills', value: (s: TestSection) => s.poolTags.join(', ') || 'Any', width: 220 },
                { key: 'level', header: 'Difficulty', value: (s: TestSection) => (s.poolDifficulty ? (DIFFICULTY[s.poolDifficulty] ?? s.poolDifficulty) : 'Any'), width: 120 },
                { key: 'drawn', header: 'Drawn', type: 'number', value: (s: TestSection) => s.poolSize ?? 0, width: 90 },
                ...(!locked && live.onSavePool
                  ? [{ key: 'edit', header: 'Change the draw', value: (s: TestSection) => s.poolSize ?? 0, render: (s: TestSection) => <PoolEditor key={`${s.id}:${s.poolSize}:${s.poolDifficulty}`} s={s} busy={busy} onSave={(id, v) => void act(`pool:${id}`, () => live.onSavePool!(id, v), 'Pool saved')} />, width: 320 }]
                  : []),
                { key: 'available', header: 'Available', type: 'number', value: (s: TestSection) => s.available ?? 0, width: 100 },
                { key: 'state', header: 'Pool depth', value: (s: TestSection) => (poolShort(s) ? 'Below' : 'Enough'), render: (s) => (poolShort(s) ? <Badge tone="danger">Needs {s.poolSize}</Badge> : <Badge tone="success">Enough</Badge>), width: 130 },
              ]}
              rows={pools}
              getRowId={(s) => s.id}
            />
          )}
        </div>
      ),
    },
    {
      id: 'timing',
      title: 'Timing and navigation',
      content: (
        <div className="yx-prc-stack">
          {detailsNote}
          <div className="yx-prc-grid3">
            <FormField label="Test time" helper="Candidates are submitted when it runs out.">
              <NumberField value={d.durationMinutes} onChange={(v) => setDetails({ ...d, durationMinutes: Number(v) || 1 })} suffix="minutes" readOnly={locked} />
            </FormField>
          </div>
          {saveButton}
        </div>
      ),
    },
    {
      id: 'scoring',
      title: 'Scoring',
      content: (
        <div className="yx-prc-stack">
          {detailsNote}
          <div className="yx-prc-grid3">
            <FormField label="Pass mark (0–100)">
              <NumberField value={d.passMark} onChange={(v) => setDetails({ ...d, passMark: Math.max(0, Math.min(100, Number(v) || 0)) })} readOnly={locked} />
            </FormField>
            <FormField label="Candidates expected" optional helper={`Over ${t.approval.threshold} needs a second person to approve before publishing.`}>
              <NumberField value={d.expectedCandidates} onChange={(v) => setDetails({ ...d, expectedCandidates: v === undefined || v === null || Number(v) < 1 ? null : Number(v) })} suffix="candidates" readOnly={locked} />
            </FormField>
          </div>
          {saveButton}
          {t.sections.length > 0 && (
            <SectionCutoffs
              sections={t.sections}
              locked={locked || !live.onSetCutoff}
              busy={busy}
              onSave={(id, v) => void act(`cut:${id}`, () => live.onSetCutoff!(id, v), v == null ? 'Cut-off removed' : 'Cut-off saved')}
            />
          )}
        </div>
      ),
    },
    {
      id: 'proctoring',
      title: 'Proctoring',
      content: (
        <div className="yx-prc-stack">
          {t.proctoringMode === 'custom' && (
            <InlineAlert tone="info" title="Set switch by switch">
              This test's proctoring was set one switch at a time on the older screen. Pick a mode to use one of the three.
            </InlineAlert>
          )}
          <RadioGroup
            aria-label="Proctoring mode"
            value={t.proctoringMode === 'custom' ? '' : t.proctoringMode}
            onChange={(m) => {
              if (locked) return say('This test is locked. Copy it to change proctoring.');
              void act(`mode`, () => live.onSetMode(m as ProctorMode), `Proctoring set to ${MODE_WORDS[m as ProctorMode].label}`)
            }}
            options={(['open', 'ai', 'record'] as const).map((m) => ({ value: m, label: MODE_WORDS[m].label, description: MODE_WORDS[m].description }))}
          />
          {live.onSetAiAllowed && (
            <Switch
              label="AI-allowed test"
              description="Candidates may use the approved assistant inside the runner; every prompt is logged. AI-assistance flags are turned off for this test."
              checked={Boolean(t.aiAllowed)}
              onChange={(on) => {
                if (locked) return say('This test is locked. Copy it to change proctoring.');
                void act('ai', () => live.onSetAiAllowed!(on), on ? 'AI-allowed test: the assistant is on' : 'The assistant is off')
              }}
            />
          )}
          <p className="yx-prc-muted yx-prc-small">Live proctoring by a person comes with certification tests.</p>
        </div>
      ),
    },
  ];

  const approval = t.approval;
  // As drawn: the checklist (and the approver) inside the review step, so every step fits the screen.
  const checklist = (
    <div className="yx-prc-stack">
        <ul className="yx-prc-plain" aria-label="Publish checks">
          {t.checks.map((c) => (
            <li key={c.id}>
              <span>{c.ok ? c.label : (c.problem ?? c.label)}</span>
              <Badge tone={c.ok ? 'success' : 'danger'}>{c.ok ? 'Ready' : 'Blocks publishing'}</Badge>
            </li>
          ))}
        </ul>
        {approval.needed && t.status === 'draft' && (
          <div className="yx-prc-stack">
            {approval.current ? (
              <InlineAlert tone="success" title={`Approved by ${approval.approvedBy}`}>
                {approval.approvedAt ? `On ${formatDate(new Date(approval.approvedAt))}. ` : ''}A change to the test asks for approval again.
              </InlineAlert>
            ) : approval.requestedBy ? (
              <InlineAlert tone="warning" title={`Waiting for approval (asked by ${approval.requestedBy})`}>
                {approval.approvedBy ? 'The test changed after it was approved. ' : ''}Another person with the tests key approves it: not the one who asked, and not its author.
              </InlineAlert>
            ) : (
              <InlineAlert tone="info" title={`For more than ${approval.threshold} candidates`}>
                Another person must approve this test before it is published.
              </InlineAlert>
            )}
            <div className="yx-prc-row">
              {!approval.current && (
                <Button loading={busy === 'ask'} onClick={() => void act('ask', live.onRequestApproval, 'Approval asked for')}>
                  {approval.requestedBy ? 'Ask again' : 'Ask for approval'}
                </Button>
              )}
              {approval.canApprove && (
                <Button variant="primary" loading={busy === 'approve'} onClick={() => void act('approve', live.onApprove, 'Test approved')}>
                  Approve
                </Button>
              )}
            </div>
          </div>
        )}
    </div>
  );
  return (
    <PrcFrame page="Tests">
      <PageHeader
        title={t.title}
        description={`${statusOf(t.status).label} · ${t.sections.length} ${t.sections.length === 1 ? 'section' : 'sections'}`}
        status={<Badge tone={statusOf(t.status).tone}>{statusOf(t.status).label}</Badge>}
        actions={
          t.status !== 'draft' && live.onLiveConsole ? (
            <Button icon={MonitorPlay} onClick={live.onLiveConsole}>
              Live console
            </Button>
          ) : undefined
        }
      />
      {error && <InlineAlert tone="danger" title={error} actions={<Button size="sm" onClick={clearError}>Dismiss</Button>} />}
      <Stepper
        title="Build test"
        steps={steps}
        current={step}
        onCurrentChange={setStep}
        review={{ title: 'Pre-publish checklist', description: 'Publishing locks the test. Copy it to make a new version.', note: checklist }}
        finishLabel="Publish"
        finishing={busy === 'publish'}
        onFinish={() => {
          if (t.status !== 'draft') return say('This test is already published.');
          if (blocked.length) return say(blocked[0]!.problem ?? 'Fix the checklist first.');
          void act('publish', live.onPublish, 'Test published');
        }}
      />
    </PrcFrame>
  );
}

/* ------------------------------------------------------------------ PRC-06 · Candidate score report */

/** GET /reports/:examId/candidates/:candidateId/report, with the test's pass mark and the viewer. */
export interface LiveScoreReport {
  state: BankLoad;
  onRetry: () => void;
  /** Test writers see raw marks; everyone else (recruiters, hiring managers) the percentage only. */
  viewer: 'owner' | 'recruiter';
  testTitle: string;
  passMark: number;
  report: {
    candidateName: string;
    status: string;
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
    passFail: string | null;
    releaseOverride: string | null;
    released: boolean;
    submittedAt: string | null;
    integrity: string;
    /** cutoffPercent / cutoffMissed: answer 2154 (absent on an older API). */
    sections: { title: string; percentage: number | null; cutoffPercent?: number | null; cutoffMissed?: boolean }[];
  } | null;
}

export function LiveScoreReportScreen({ live }: { live: LiveScoreReport }) {
  if (live.state === 'error')
    return (
      <PrcFrame page="Results & reports">
        <ErrorState title="We couldn't load this report." onRetry={live.onRetry} />
      </PrcFrame>
    );
  const r = live.report;
  if (live.state === 'loading' || !r)
    return (
      <PrcFrame page="Results & reports">
        <PageHeader title="Score report" description={live.state === 'loading' ? 'Loading…' : 'No attempt yet.'} />
      </PrcFrame>
    );
  const held = r.releaseOverride === 'held';
  const pct = r.percentage == null ? null : Math.round(r.percentage);
  const passed = r.passFail === 'pass';
  return (
    <PrcFrame page="Results & reports">
      <ObjectHeader
        name={r.candidateName}
        person
        secondary={live.testTitle}
        status={held ? <Badge tone="warning">Result held</Badge> : r.passFail == null ? <Badge>Not marked yet</Badge> : passed ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Not passed</Badge>}
        facts={[
          { label: 'Submitted', value: r.submittedAt ? formatDate(new Date(r.submittedAt)) : 'Not yet' },
          { label: 'Integrity', value: r.integrity },
          { label: 'Release', value: held ? 'Held' : r.released ? 'Released' : 'Not released' },
        ]}
      />
      {r.sections.some((s) => s.cutoffMissed) && (
        <InlineAlert tone="warning" title="Cut-off not met">
          {r.sections
            .filter((s) => s.cutoffMissed)
            .map((s) => `${s.title}: ${Math.round(s.percentage ?? 0)} % against a cut-off of ${s.cutoffPercent ?? 0} %`)
            .join('. ')}
          . A section below its cut-off fails the test, whatever the total.
        </InlineAlert>
      )}
      {held && (
        <InlineAlert tone="warning" title="Held while it is reviewed">
          Nothing is released to the candidate until the hold is lifted, and the evidence is kept until then.
        </InlineAlert>
      )}
      <div className="yx-prc-grid4">
        <div className="yx-prc-box">
          <span className="yx-prc-muted yx-prc-small">Score</span>
          <strong className="yx-prc-mono">{pct == null ? '—' : `${pct} / 100`}</strong>
        </div>
        <div className="yx-prc-box">
          <span className="yx-prc-muted yx-prc-small">Pass mark</span>
          <strong className="yx-prc-mono">{live.passMark} / 100</strong>
        </div>
        {live.viewer === 'owner' ? (
          <div className="yx-prc-box">
            <span className="yx-prc-muted yx-prc-small">Raw marks (test writers only)</span>
            <strong className="yx-prc-mono">{r.score != null && r.maxScore != null ? `${r.score} / ${r.maxScore}` : '—'}</strong>
          </div>
        ) : (
          <div className="yx-prc-box">
            <span className="yx-prc-muted yx-prc-small">Raw marks</span>
            <span className="yx-prc-small">Not shown to recruiters. Compare candidates on the score.</span>
          </div>
        )}
      </div>
      {r.sections.length > 0 && (
        <BarChart title="Sections" orientation="horizontal" categories={r.sections.map((s) => s.title)} series={[{ name: 'Score %', values: r.sections.map((s) => Math.round(s.percentage ?? 0)) }]} valueLabels />
      )}
      {pct != null && <Meter value={pct} max={100} label={`Score against pass mark ${live.passMark}`} warnAt={live.passMark} />}
    </PrcFrame>
  );
}
