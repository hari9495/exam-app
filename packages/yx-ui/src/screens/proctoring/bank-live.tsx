// Assessments AS-1 (answers 2009, 2010, 2017): the designed question bank screens with live data. The designed
// QuestionBankScreen (PRC-01), QuestionEditorScreen (PRC-02), QuestionReviewQueueScreen (PRC-03) and
// ItemAnalysisScreen (PRC-05) in bank-tests.tsx render these when the page passes `live`. Same layout, kit parts and
// words as the designs; only what the server holds is shown, and the server checks every action again.
import { useMemo, useState } from 'react';
import { Archive, FileUp, Plus, Send } from 'lucide-react';
import { Button } from '../../components/button';
import { AiBadge, Badge, type BadgeTone } from '../../components/display';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox } from '../../components/choice';
import { Dialog } from '../../components/overlay';
import { Timeline } from '../../components/timeline';
import { BarChart, StatCard } from '../../components/charts';
import { ButtonGroup } from '../../components/button';
import { formatDate } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { useRun } from '../org/org-kit';
import { useSay } from '../ops/ops-kit';
import { PrcFrame } from './proctoring-shared';

/* ------------------------------------------------------------------ the server's shapes */

export type BankLoad = 'loading' | 'error' | 'ready';
export type BankStatus = 'draft' | 'in_review' | 'approved' | 'retired';
export type BankLanguage = 'hi' | 'ta' | 'te';

/** A question as written (the API's question payload plus alt text). Answer keys are absent for readers. */
export interface BankContent {
  type: string;
  text: string;
  topic?: string | null;
  category?: string | null;
  difficulty: string;
  marks: number;
  negativeMarks?: number;
  partialCredit?: boolean;
  tags?: string[];
  languageMode?: string;
  allowedLanguages?: string[];
  starterCode?: string | null;
  allowStdin?: boolean;
  modelAnswer?: string | null;
  snippetCode?: string | null;
  snippetLanguage?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  options: { text: string; isCorrect?: boolean; imageUrl?: string | null }[];
  optionAlts?: (string | null)[];
  codeTests?: unknown[] | null;
}

export interface BankRow {
  id: string;
  text: string;
  type: string;
  topic: string | null;
  collection: string | null;
  difficulty: string;
  status: BankStatus;
  version: number;
  openChange: { state: string; kind: string } | null;
  languages: string[];
  aiDrafted: boolean;
  updatedAt: string;
}

export interface BankSettings {
  languages: BankLanguage[];
  secondApproverCollections: string[];
  duplicatePercent: number;
  provisionalAnswers: number;
  packs: string[];
}

export interface BankTranslation {
  id: string;
  language: string;
  version: number;
  state: string;
  text: string;
  options: unknown;
  aiAssisted: boolean;
  author: string;
  reviewer: string | null;
  mine: boolean;
  note: string | null;
  rowVersion: number;
}

export interface BankQuestion {
  id: string;
  status: BankStatus;
  version: number;
  aiDrafted: boolean;
  author: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  content: BankContent;
  openChange: {
    id: string;
    kind: string;
    state: string;
    version: number;
    content: BankContent;
    mine: boolean;
    note: string | null;
    fieldComments: unknown;
    duplicate: { percent: number; questionId: string | null; cleared: boolean } | null;
    rowVersion: number;
  } | null;
  history: { id: string; kind: string; state: string; version: number; author: string; reviewer: string | null; secondReviewer: string | null; at: string; note: string | null }[];
  translations: BankTranslation[];
  /** Answer 2143: short-lived signed links to the stored images, keyed by the stored value (for the candidate preview). */
  images?: Record<string, string>;
}

/** /analytics/questions/:id (the older item statistics). */
export interface ItemStats {
  questionId: string;
  responses: number;
  percentCorrect: number | null;
  discrimination: number | null;
  flags: { code: string; severity: string; message: string }[];
  options: { optionId: string; text: string; isCorrect: boolean; selections: number }[];
  hasEnoughData: boolean;
}

export interface ReviewChange {
  id: string;
  questionId: string;
  kind: 'new' | 'major' | 'minor';
  fromVersion: number | null;
  toVersion: number;
  author: string;
  aiDrafted: boolean;
  submittedAt: string;
  before: BankContent | null;
  after: BankContent;
  changed: string[];
  duplicate: { percent: number; questionId: string | null; text: string; cleared: boolean } | null;
  secondApproval: { firstBy: string | null } | null;
  rowVersion: number;
}

export interface ReviewTranslation {
  id: string;
  questionId: string;
  language: string;
  version: number;
  english: { text: string; options: string[] };
  text: string;
  options: unknown;
  aiAssisted: boolean;
  author: string;
  submittedAt: string;
  rowVersion: number;
}

export interface ItemRow {
  questionId: string;
  text: string;
  responses: number;
  percentCorrect: number;
  discrimination: number | null;
  flags: string[];
  declared: string;
  observed: string;
}

/* ------------------------------------------------------------------ words */

export const TYPE_LABEL: Record<string, string> = { single_mcq: 'Single choice', multi_mcq: 'Multiple choice', true_false: 'True or false', code: 'Code', essay: 'Descriptive', file_upload: 'File upload', spoken: 'Spoken' };
export const STATUS_LABEL: Record<BankStatus, string> = { draft: 'Draft', in_review: 'In review', approved: 'Approved', retired: 'Retired' };
const STATUS_TONE: Record<BankStatus, BadgeTone> = { approved: 'success', in_review: 'warning', draft: 'neutral', retired: 'neutral' };
export const LANGUAGE_NAME: Record<string, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu' };
const DIFFICULTY: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const KIND_LABEL: Record<string, string> = { new: 'New', major: 'Major', minor: 'Minor', translation: 'Translation' };
const PACK_LABEL: Record<string, { name: string; desc: string }> = {
  aptitude: { name: 'Aptitude starter', desc: 'Numerical, verbal and logical reasoning.' },
  english: { name: 'English proficiency', desc: 'Reading, grammar and comprehension.' },
  core_it: { name: 'Core IT skills', desc: 'Java, Python, SQL and web basics.' },
};
const FIELD_LABEL: Record<string, string> = { type: 'Type', text: 'Question', options: 'Options and answer key', modelAnswer: 'Model answer', codeTests: 'Code tests', marks: 'Marks', negativeMarks: 'Negative marks', difficulty: 'Difficulty', topic: 'Skill', category: 'Collection', imageUrl: 'Image', imageAlt: 'Image alt text', tags: 'Tags', optionAlts: 'Option alt text' };
/** The types the editor writes; the others (code, file upload, spoken) keep their test cases and settings as they are. */
const EDITABLE_TYPES = ['single_mcq', 'multi_mcq', 'true_false', 'essay'];
const CHOICE_TYPES = ['single_mcq', 'multi_mcq', 'true_false'];
const letter = (i: number) => String.fromCharCode(65 + i);
const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

/** What still stops submission for accessibility (the server checks the same): every image needs alt text. */
export function missingAlt(c: BankContent): string[] {
  const out: string[] = [];
  if (c.imageUrl && !(c.imageAlt ?? '').trim()) out.push('the question image');
  c.options.forEach((o, i) => {
    if (o.imageUrl && !(c.optionAlts?.[i] ?? '').trim()) out.push(`option ${letter(i)}'s image`);
  });
  return out;
}

/** One field of a question as plain text, for the review's side-by-side. */
function fieldText(c: BankContent | null, field: string): string {
  if (!c) return '';
  if (field === 'options') return c.options.map((o, i) => `${letter(i)}. ${o.text}${o.isCorrect ? ' (correct)' : ''}`).join('\n');
  if (field === 'tags') return (c.tags ?? []).join(', ');
  if (field === 'optionAlts') return (c.optionAlts ?? []).map((a, i) => (a ? `${letter(i)}: ${a}` : '')).filter(Boolean).join('\n');
  if (field === 'codeTests') return `${(c.codeTests ?? []).length} test cases`;
  if (field === 'type') return TYPE_LABEL[c.type] ?? c.type;
  if (field === 'difficulty') return DIFFICULTY[c.difficulty] ?? c.difficulty;
  const v = (c as unknown as Record<string, unknown>)[field];
  return v == null || v === '' ? '—' : String(v);
}

function translationOptions(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

/* ================================================================== */
/* PRC-01 · Question bank                                              */
/* ================================================================== */

export interface LiveBank {
  state: BankLoad;
  onRetry: () => void;
  rows: BankRow[];
  /** Responses and % correct per question, from the item statistics (only questions with enough answers). */
  stats: Record<string, { responses: number; percentCorrect: number }>;
  settings: BankSettings | null;
  onOpen: (id: string | 'new') => void;
  /** The older pages for importing a file and drafting with AI (they land as drafts here, reviewed like any other). */
  onImport?: () => void;
  onDraftWithAi?: () => void;
  onSubmit: (id: string) => Promise<unknown>;
  onRetire: (id: string) => Promise<unknown>;
  onLoadStats: (id: string) => Promise<ItemStats>;
}

export function LiveQuestionBank({ live }: { live: LiveBank }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [stats, setStats] = useState<ItemStats | 'loading' | 'error' | null>(null);
  const { busy, run } = useRun();
  const { done, fail } = useSay();
  const rows = live.rows.map((r) => ({ ...r, statusLabel: STATUS_LABEL[r.status], typeLabel: TYPE_LABEL[r.type] ?? r.type, source: r.aiDrafted ? 'AI-drafted' : 'Our team', served: live.stats[r.id]?.responses ?? 0 }));
  type Row = (typeof rows)[number];
  const topics = [...new Set(live.rows.map((r) => r.topic).filter((t): t is string => Boolean(t)))].sort();
  const collections = [...new Set(live.rows.map((r) => r.collection).filter((t): t is string => Boolean(t)))].sort();
  const fields: FilterFieldDef[] = [
    { key: 'typeLabel', label: 'Type', type: 'multi', options: opt([...new Set(rows.map((r) => r.typeLabel))]) },
    { key: 'statusLabel', label: 'Status', type: 'multi', options: opt(Object.values(STATUS_LABEL)) },
    { key: 'collection', label: 'Collection', type: 'multi', options: opt(collections) },
    { key: 'source', label: 'Source', type: 'multi', options: opt(['Our team', 'AI-drafted']) },
    { key: 'served', label: 'Times answered', type: 'number' },
  ];
  const shown = rows.filter((r) => (!topic || r.topic === topic) && (!q || r.text.toLowerCase().includes(q.toLowerCase())) && filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f)));
  const open = rows.find((r) => r.id === openId) ?? null;
  const cols: TableColumn<Row>[] = [
    {
      key: 'text',
      header: 'Question',
      value: (r) => r.text,
      render: (r) => (
        <span className="yx-prc-stack" data-gap="sm">
          <span>{r.text}</span>
          <span className="yx-prc-row yx-prc-small yx-prc-muted">
            {r.typeLabel} · v{r.version} {r.aiDrafted && <AiBadge />}
            {r.openChange && r.status === 'approved' && <Badge tone="info">{r.openChange.kind === 'major' ? `v${r.version + 1} in progress` : 'Change in progress'}</Badge>}
          </span>
        </span>
      ),
      width: 380,
    },
    { key: 'topic', header: 'Skill', value: (r) => r.topic ?? '—', groupable: true, width: 170 },
    { key: 'difficulty', header: 'Difficulty', value: (r) => DIFFICULTY[r.difficulty] ?? r.difficulty, width: 110 },
    { key: 'statusLabel', header: 'Status', type: 'status', value: (r) => r.statusLabel, statusTone: (v) => STATUS_TONE[(Object.entries(STATUS_LABEL).find(([, l]) => l === v)?.[0] ?? 'draft') as BankStatus], groupable: true, width: 110 },
    { key: 'languages', header: 'Languages', value: (r) => r.languages.map((l) => LANGUAGE_NAME[l] ?? l).join(', '), width: 150 },
    { key: 'served', header: 'Answered', type: 'number', value: (r) => r.served, width: 100 },
    { key: 'pCorrect', header: '% correct', type: 'number', value: (r) => live.stats[r.id]?.percentCorrect ?? null, width: 100 },
    { key: 'updated', header: 'Updated', type: 'date', value: (r) => new Date(r.updatedAt), width: 120 },
  ];
  const openRow = (id: string) => {
    setOpenId(id);
    setStats('loading');
    live.onLoadStats(id).then(setStats, () => setStats('error'));
  };
  const bulk = async (ids: string[], what: 'submit' | 'retire') => {
    let ok = 0;
    const failed: string[] = [];
    await run(what, async () => {
      for (const id of ids) {
        try {
          await (what === 'submit' ? live.onSubmit(id) : live.onRetire(id));
          ok++;
        } catch (e) {
          failed.push(`${rows.find((r) => r.id === id)?.text.slice(0, 40) ?? id}: ${e instanceof Error ? e.message : 'not done'}`);
        }
      }
    });
    if (ok) done(what === 'submit' ? `${ok} sent for review` : `${ok} retired`);
    if (failed.length) fail(`${failed.length} not done. ${failed[0]}`);
    setSelected([]);
  };
  return (
    <PrcFrame page="Question bank">
      <PageHeader
        title="Question bank"
        description="Reviewed, versioned questions. Only approved versions can go into a published test."
        actions={
          <>
            {live.onImport && (
              <Button icon={FileUp} onClick={live.onImport}>
                Import
              </Button>
            )}
            {live.onDraftWithAi && <Button onClick={live.onDraftWithAi}>Draft with AI</Button>}
            <Button variant="primary" icon={Plus} onClick={() => live.onOpen('new')}>
              Add question
            </Button>
          </>
        }
      />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the question bank." onRetry={live.onRetry} />
      ) : (
        <Tabs defaultValue="bank">
          <TabsList aria-label="Question sources">
            <TabsTrigger value="bank" count={live.rows.length}>
              Our questions
            </TabsTrigger>
            <TabsTrigger value="library" count={live.settings?.packs.length ?? 0}>
              Library packs
            </TabsTrigger>
          </TabsList>
          <TabsContent value="bank">
            <div className="yx-prc-facets">
              <aside className="yx-prc-stack" aria-label="Skill facets">
                <section className="yx-prc-facet">
                  <h3>Skill</h3>
                  <ul>
                    <li>
                      <Button size="sm" aria-pressed={!topic} onClick={() => setTopic(null)}>
                        All skills
                      </Button>
                    </li>
                    {topics.map((t) => (
                      <li key={t}>
                        <Button size="sm" aria-pressed={topic === t} onClick={() => setTopic(t)}>
                          {t}
                        </Button>
                        <span className="yx-prc-muted">{live.rows.filter((x) => x.topic === t).length}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="yx-prc-facet">
                  <h3>Difficulty</h3>
                  <ul>
                    {Object.entries(DIFFICULTY).map(([k, l]) => (
                      <li key={k}>
                        <span>{l}</span>
                        <span className="yx-prc-muted">{live.rows.filter((x) => x.difficulty === k).length}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="yx-prc-facet">
                  <h3>Language</h3>
                  <ul>
                    {['en', ...(live.settings?.languages ?? [])].map((l) => (
                      <li key={l}>
                        <span>{LANGUAGE_NAME[l]}</span>
                        <span className="yx-prc-muted">{live.rows.filter((x) => x.languages.includes(l)).length}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </aside>
              <div className="yx-prc-stack">
                <FilterBar fields={fields} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search question text" />
                <DataTable
                  label="Questions"
                  columns={cols}
                  rows={shown}
                  getRowId={(r) => r.id}
                  state={live.state === 'loading' ? 'loading' : 'ready'}
                  filtered={filters.length > 0 || !!q || !!topic}
                  onClearFilters={() => {
                    setFilters([]);
                    setQ('');
                    setTopic(null);
                  }}
                  empty={
                    <EmptyState
                      title="No questions yet."
                      description="Add your first question. Every new question is reviewed by another person before a test can use it."
                      action={<Button onClick={() => live.onOpen('new')}>Add question</Button>}
                    />
                  }
                  selectable
                  selectedIds={selected}
                  onSelectedChange={setSelected}
                  bulkActions={(ids) => (
                    <>
                      <Button size="sm" icon={Send} loading={busy === 'submit'} onClick={() => void bulk(ids, 'submit')}>
                        Submit {ids.length} for review
                      </Button>
                      <Button size="sm" variant="danger" icon={Archive} loading={busy === 'retire'} onClick={() => void bulk(ids, 'retire')}>
                        Retire
                      </Button>
                    </>
                  )}
                  onRowClick={(r) => openRow(r.id)}
                  activeRowId={openId}
                  pageSize={25}
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="library">
            <div className="yx-prc-grid2">
              {Object.entries(PACK_LABEL).map(([key, p]) => {
                const on = live.settings?.packs.includes(key) ?? false;
                return (
                  <Card key={key} title={p.name} actions={on ? <Badge tone="success">Switched on</Badge> : <Badge>Switched off</Badge>}>
                    <div className="yx-prc-stack" data-gap="sm">
                      <p className="yx-prc-p">{p.desc}</p>
                      <p className="yx-prc-muted yx-prc-small">YukthiX is writing this pack. Its reviewed questions appear here when it is ready; Settings › Assessments switches packs on or off.</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      )}
      {open && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpenId(null)}
          title={`v${open.version} · ${open.typeLabel}`}
          subtitle={open.text}
          meta={<Badge tone={STATUS_TONE[open.status]}>{open.statusLabel}</Badge>}
          footer={
            <Button variant="primary" onClick={() => live.onOpen(open.id)}>
              Open in editor
            </Button>
          }
        >
          <div className="yx-prc-stack">
            <DescriptionList
              items={[
                { label: 'Type', value: open.typeLabel },
                { label: 'Skill', value: open.topic ?? '—' },
                { label: 'Collection', value: open.collection ?? '—' },
                { label: 'Languages', value: open.languages.map((l) => LANGUAGE_NAME[l] ?? l).join(', ') },
                { label: 'Source', value: open.aiDrafted ? <span className="yx-prc-row">AI-drafted <AiBadge /></span> : 'Our team' },
              ]}
            />
            <h3 className="yx-prc-h">Item stats</h3>
            <ItemStatsBlock stats={stats} provisional={live.settings?.provisionalAnswers ?? 200} />
            {open.status === 'retired' && <InlineAlert tone="info">Retired on {formatDate(new Date(open.updatedAt))}. Past attempts and reports keep it.</InlineAlert>}
          </div>
        </Drawer>
      )}
    </PrcFrame>
  );
}

/** The item statistics of one question, as the design's ItemStatsPanel words them. */
function ItemStatsBlock({ stats, provisional }: { stats: ItemStats | 'loading' | 'error' | null; provisional: number }) {
  if (stats === 'loading' || stats === null) return <p className="yx-prc-muted">Loading item stats…</p>;
  if (stats === 'error') return <InlineAlert tone="warning">We couldn't load the item stats. Close and open the question again.</InlineAlert>;
  if (!stats.hasEnoughData)
    return (
      <InlineAlert tone="info" title="Not enough responses yet">
        {stats.responses} of the 20 responses needed before any statistic is shown. Scores use the authored difficulty.
      </InlineAlert>
    );
  return (
    <div className="yx-prc-stack" data-gap="sm">
      {stats.responses < provisional && (
        <InlineAlert tone="info" title="Provisional statistics">
          {stats.responses} of the {provisional} responses needed before these are reliable.
        </InlineAlert>
      )}
      <DescriptionList
        columns={2}
        items={[
          { label: 'Answered', value: stats.responses.toLocaleString('en-IN') },
          { label: '% correct (p)', value: stats.percentCorrect == null ? 'Not scored' : `${Math.round(stats.percentCorrect)} %` },
          { label: 'Discrimination (r)', value: stats.discrimination == null ? '—' : stats.discrimination.toFixed(2) + (stats.discrimination < 0.2 ? ' · weak' : '') },
          { label: 'Flags', value: stats.flags.length ? stats.flags.map((f) => f.message).join(' ') : 'None' },
        ]}
      />
    </div>
  );
}

/* ================================================================== */
/* PRC-02 · Question editor                                            */
/* ================================================================== */

export interface LiveEditor {
  state: BankLoad;
  onRetry: () => void;
  /** null: a new question. */
  question: BankQuestion | null;
  settings: BankSettings | null;
  stats: ItemStats | null;
  onBack: () => void;
  /** New: creates the draft (returns its id). Existing: saves the draft, or the change of an approved question. */
  onSave: (c: BankContent) => Promise<{ id?: string; saved?: 'draft' | 'major' | 'minor'; version?: number }>;
  onSubmit: () => Promise<{ duplicate: { id: string; percent: number } | null; needsSecond: boolean }>;
  onWithdraw: () => Promise<unknown>;
  onSaveTranslation: (lang: string, t: { text: string; options: string[]; aiAssisted: boolean }) => Promise<unknown>;
  onSubmitTranslation: (lang: string) => Promise<unknown>;
  onOpenQuestion: (id: string) => void;
}

const BLANK: BankContent = { type: 'single_mcq', text: '', difficulty: 'medium', marks: 1, negativeMarks: 0, tags: [], options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }], optionAlts: [] };

export function LiveQuestionEditor({ live }: { live: LiveEditor }) {
  const qn = live.question;
  const start = qn?.openChange?.content ?? qn?.content ?? BLANK;
  const [c, setC] = useState<BankContent>(start);
  const [loadedFor, setLoadedFor] = useState(qn ? `${qn.id}:${qn.openChange?.rowVersion ?? 0}:${qn.version}` : 'new');
  const key = qn ? `${qn.id}:${qn.openChange?.rowVersion ?? 0}:${qn.version}` : 'new';
  if (key !== loadedFor) {
    // The server's copy changed (saved, approved): show it.
    setLoadedFor(key);
    setC(start);
  }
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [lang, setLang] = useState('en');
  const [translating, setTranslating] = useState<string | null>(null);
  const { busy, run, error } = useRun();
  const { done, say, fail } = useSay();
  const [tried, setTried] = useState(false);
  if (live.state === 'error')
    return (
      <PrcFrame page="Question bank">
        <ErrorState title="We couldn't load this question." onRetry={live.onRetry} />
      </PrcFrame>
    );
  if (live.state === 'loading')
    return (
      <PrcFrame page="Question bank">
        <PageHeader title="Question" description="Loading…" />
      </PrcFrame>
    );
  const open = qn?.openChange ?? null;
  const inReview = open?.state === 'in_review' || qn?.status === 'in_review';
  const keysHidden = c.options.length > 0 && c.options.every((o) => o.isCorrect === undefined);
  const editableType = EDITABLE_TYPES.includes(c.type);
  const set = (patch: Partial<BankContent>) => setC((x) => ({ ...x, ...patch }));
  const setOption = (i: number, patch: Partial<BankContent['options'][number]>) => set({ options: c.options.map((o, j) => (j === i ? { ...o, ...patch } : c.type === 'multi_mcq' || patch.isCorrect !== true ? o : { ...o, isCorrect: false })) });
  const textError = tried && !c.text.trim() ? 'Write the question.' : null;
  const optionsError = tried && CHOICE_TYPES.includes(c.type) && (c.options.length < 2 || c.options.some((o) => !o.text.trim()) || !c.options.some((o) => o.isCorrect)) ? 'Write every option and mark the correct one.' : null;
  const alt = missingAlt(c);
  const approvedTranslations = (qn?.translations ?? []).filter((t) => t.state === 'approved' && t.version === qn?.version);
  const previewT = approvedTranslations.find((t) => t.language === lang);
  const save = async () => {
    setTried(true);
    if (!c.text.trim() || (CHOICE_TYPES.includes(c.type) && (c.options.length < 2 || c.options.some((o) => !o.text.trim()) || !c.options.some((o) => o.isCorrect)))) return say('Fill in what is marked, then save.');
    let out: Awaited<ReturnType<LiveEditor['onSave']>> = {};
    if (await run('save', async () => void (out = await live.onSave(c)))) {
      done(out.saved === 'major' ? `Saved as version ${out.version}. Submit it for review.` : out.saved === 'minor' ? 'Change saved. Submit it for review.' : 'Draft saved');
      setTried(false);
    }
  };
  const submit = async () => {
    if (alt.length) return say(`Add alt text to ${alt.join(' and ')} before you submit.`);
    let out: Awaited<ReturnType<LiveEditor['onSubmit']>> | null = null;
    if (await run('submit', async () => void (out = await live.onSubmit()))) {
      const o = out as Awaited<ReturnType<LiveEditor['onSubmit']>> | null;
      done(o?.duplicate ? `Sent for review. It is ${o.duplicate.percent} % like another question; the reviewer checks it.` : o?.needsSecond ? 'Sent for review. This collection needs two approvers.' : 'Sent for review');
    }
  };
  const statusBadge = qn ? STATUS_LABEL[qn.status] : 'Draft';
  return (
    <PrcFrame page="Question bank">
      <ObjectHeader
        name={qn ? `${TYPE_LABEL[qn.content.type] ?? qn.content.type} · v${qn.version}` : 'New question'}
        secondary={c.topic ?? undefined}
        status={
          <span className="yx-prc-row">
            <Badge tone={qn ? STATUS_TONE[qn.status] : 'neutral'}>{statusBadge}</Badge>
            {qn && <Badge>v{qn.version}</Badge>}
            {qn?.aiDrafted && <AiBadge />}
          </span>
        }
        facts={[
          { label: 'Collection', value: c.category || '—' },
          { label: 'Author', value: qn?.author ?? 'You' },
          { label: 'Approved by', value: qn?.approvedBy ?? '—' },
          { label: 'Updated', value: qn?.approvedAt ? formatDate(new Date(qn.approvedAt)) : '—' },
        ]}
        actions={
          <>
            <Button onClick={live.onBack}>Back to bank</Button>
            {inReview ? (
              open?.mine && (
                <Button loading={busy === 'withdraw'} onClick={() => void run('withdraw', live.onWithdraw).then((ok) => ok && done('Taken back from review'))}>
                  Withdraw from review
                </Button>
              )
            ) : (
              <>
                <Button loading={busy === 'save'} onClick={() => void save()}>
                  Save draft
                </Button>
                {qn && (
                  <Button variant="primary" loading={busy === 'submit'} onClick={() => (qn.status === 'approved' && !open ? say('Change the question and save it first; then submit the change.') : void submit())}>
                    Submit for review
                  </Button>
                )}
              </>
            )}
          </>
        }
      />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {open?.kind === 'major' && (
        <InlineAlert tone="warning" title="This is a major change">
          You changed the question, its options or its answer key. Approval makes version {open.version}; tests and past attempts keep version {qn?.version} until then, and item statistics start again for the new version.
        </InlineAlert>
      )}
      {open?.state === 'changes_requested' && (
        <InlineAlert tone="warning" title="The reviewer asked for changes">
          {open.note}
        </InlineAlert>
      )}
      {open?.duplicate && !open.duplicate.cleared && (
        <InlineAlert
          tone="danger"
          title={`Possible duplicate: ${open.duplicate.percent} % similar to another question`}
          actions={
            open.duplicate.questionId ? (
              <Button size="sm" onClick={() => live.onOpenQuestion(open.duplicate!.questionId!)}>
                Compare
              </Button>
            ) : undefined
          }
        >
          A reviewer must confirm "not a duplicate" before this question can be approved.
        </InlineAlert>
      )}
      {alt.length > 0 && (
        <InlineAlert tone="danger" title={`${alt.length} image${alt.length > 1 ? 's need' : ' needs'} accessibility text`}>
          Add alt text to {alt.join(' and ')} before you submit for review.
        </InlineAlert>
      )}
      {qn?.aiDrafted && (
        <InlineAlert tone="ai" title="Drafted by AI">
          Check every fact and the answer key. It stays a draft until a reviewer approves it.
        </InlineAlert>
      )}
      {inReview && <InlineAlert tone="info">In review. Withdraw it to change it again.</InlineAlert>}
      <div className="yx-prc-split" data-wide-aside>
        <Tabs defaultValue="content">
          <TabsList aria-label="Question editor">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="answer">Answer key</TabsTrigger>
            <TabsTrigger value="translations" count={approvedTranslations.length + 1}>
              Translations
            </TabsTrigger>
            <TabsTrigger value="versions" count={qn?.version ?? 0}>
              Versions
            </TabsTrigger>
            <TabsTrigger value="stats">Item stats</TabsTrigger>
          </TabsList>
          <TabsContent value="content">
            <div className="yx-prc-stack">
              <FormField label="Type" required>
                {editableType || !qn ? (
                  <Select value={c.type} onChange={(v) => set({ type: v ?? 'single_mcq', ...(v === 'true_false' ? { options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }] } : v === 'essay' ? { options: [] } : c.options.length ? {} : { options: BLANK.options }) })} options={EDITABLE_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t]! }))} />
                ) : (
                  <TextField value={TYPE_LABEL[c.type] ?? c.type} readOnly />
                )}
              </FormField>
              <FormField label="Question" required error={textError}>
                <TextArea value={c.text} onChange={(v) => set({ text: v })} rows={4} readOnly={inReview} />
              </FormField>
              {c.imageUrl && (
                <FormField label="Image alt text" required helper="Says what the image shows, for candidates who use a screen reader." error={alt.includes('the question image') ? 'Add alt text to the image.' : null}>
                  <TextField value={c.imageAlt ?? ''} onChange={(v) => set({ imageAlt: v })} maxLength={500} readOnly={inReview} />
                </FormField>
              )}
              <div className="yx-prc-grid3">
                <FormField label="Difficulty" required>
                  <Select value={c.difficulty} onChange={(v) => set({ difficulty: v ?? 'medium' })} options={Object.entries(DIFFICULTY).map(([value, label]) => ({ value, label }))} />
                </FormField>
                <FormField label="Marks" required>
                  <NumberField value={c.marks} onChange={(v) => set({ marks: v ?? 0 })} min={0} />
                </FormField>
                <FormField label="Negative marks" helper="Per wrong answer">
                  <NumberField value={c.negativeMarks ?? 0} onChange={(v) => set({ negativeMarks: v ?? 0 })} decimals min={0} />
                </FormField>
                <FormField label="Skill" optional>
                  <TextField value={c.topic ?? ''} onChange={(v) => set({ topic: v || null })} maxLength={200} />
                </FormField>
                <FormField label="Collection" optional helper={live.settings?.secondApproverCollections.some((x) => x.toLowerCase() === (c.category ?? '').toLowerCase()) ? 'This collection needs a second approver.' : undefined}>
                  <TextField value={c.category ?? ''} onChange={(v) => set({ category: v || null })} maxLength={200} />
                </FormField>
                <FormField label="Tags" optional helper="Separate with commas">
                  <TextField value={(c.tags ?? []).join(', ')} onChange={(v) => set({ tags: v.split(',').map((t) => t.trim()).filter(Boolean) })} />
                </FormField>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="answer">
            <div className="yx-prc-stack">
              <InlineAlert tone="info">Answer keys, test cases and model answers never reach the candidate's browser before submission.</InlineAlert>
              {keysHidden && <InlineAlert tone="warning">The answer key is hidden while you act for someone else.</InlineAlert>}
              {CHOICE_TYPES.includes(c.type) && (
                <div className="yx-prc-stack" role="group" aria-label="Options">
                  {optionsError && <InlineAlert tone="danger">{optionsError}</InlineAlert>}
                  {c.options.map((o, i) => (
                    <div key={i} className="yx-prc-box">
                      <div className="yx-prc-row" data-between>
                        <FormField label={`Option ${letter(i)}`} required>
                          <TextField value={o.text} onChange={(v) => setOption(i, { text: v })} readOnly={inReview || c.type === 'true_false'} />
                        </FormField>
                        <Checkbox label="Correct" checked={Boolean(o.isCorrect)} onChange={(v) => setOption(i, { isCorrect: v })} disabled={inReview || keysHidden} />
                        {c.type !== 'true_false' && !inReview && c.options.length > 2 && (
                          <Button size="sm" onClick={() => set({ options: c.options.filter((_, j) => j !== i), optionAlts: (c.optionAlts ?? []).filter((_, j) => j !== i) })}>
                            Remove
                          </Button>
                        )}
                      </div>
                      {o.imageUrl && (
                        <FormField label={`Option ${letter(i)} image alt text`} required error={alt.includes(`option ${letter(i)}'s image`) ? 'Add alt text to this image.' : null}>
                          <TextField value={c.optionAlts?.[i] ?? ''} onChange={(v) => set({ optionAlts: c.options.map((_, j) => (j === i ? v : c.optionAlts?.[j] ?? '')) })} maxLength={500} />
                        </FormField>
                      )}
                    </div>
                  ))}
                  {c.type !== 'true_false' && !inReview && (
                    <span className="yx-prc-row">
                      <Button size="sm" icon={Plus} onClick={() => (c.options.length >= 10 ? say('A question has at most 10 options.') : set({ options: [...c.options, { text: '', isCorrect: false }] }))}>
                        Add option
                      </Button>
                    </span>
                  )}
                </div>
              )}
              {c.type === 'essay' && (
                <FormField label="Model answer" optional helper="Shown to markers only">
                  <TextArea value={c.modelAnswer ?? ''} onChange={(v) => set({ modelAnswer: v || null })} rows={4} readOnly={inReview} />
                </FormField>
              )}
              {!editableType && <InlineAlert tone="info">{TYPE_LABEL[c.type] ?? c.type} questions keep their test cases and settings as they are; this editor changes the question, marks, difficulty, skill and collection.</InlineAlert>}
            </div>
          </TabsContent>
          <TabsContent value="translations">
            {!qn ? (
              <InlineAlert tone="info">Save and get the question approved first; translations are of an approved version.</InlineAlert>
            ) : !live.settings?.languages.length ? (
              <InlineAlert tone="info">Questions are in English only. Settings › Assessments adds other languages; every translation is then reviewed by a person.</InlineAlert>
            ) : (
              <ul className="yx-prc-plain">
                <li>
                  <strong>English</strong>
                  <Badge tone="success">Original</Badge>
                </li>
                {live.settings.languages.map((l) => {
                  const t = qn.translations.find((x) => x.language === l && x.version === qn.version);
                  const tone: BadgeTone = t?.state === 'approved' ? 'success' : t?.state === 'in_review' ? 'warning' : t?.state === 'changes_requested' ? 'danger' : 'neutral';
                  const label = !t ? 'Not translated' : t.state === 'approved' ? `Approved by ${t.reviewer ?? 'a reviewer'}` : t.state === 'in_review' ? `${t.aiAssisted ? 'AI-assisted draft' : 'Draft'}, in review` : t.state === 'changes_requested' ? 'Changes asked for' : 'Draft';
                  return (
                    <li key={l}>
                      <strong>{LANGUAGE_NAME[l]}</strong>
                      <Badge tone={tone}>{label}</Badge>
                      {t?.state === 'changes_requested' && t.note && <span className="yx-prc-small yx-prc-muted">{t.note}</span>}
                      <span className="yx-prc-row">
                        <Button size="sm" onClick={() => (qn.status !== 'approved' ? say('Translate an approved question.') : t?.state === 'in_review' ? say('This translation is in review.') : setTranslating(l))}>
                          {t ? 'Change translation' : 'Draft translation'}
                        </Button>
                        {t && t.mine && (t.state === 'draft' || t.state === 'changes_requested') && (
                          <Button size="sm" loading={busy === `t-${l}`} onClick={() => void run(`t-${l}`, () => live.onSubmitTranslation(l)).then((ok) => ok && done(`${LANGUAGE_NAME[l]} translation sent for review`))}>
                            Submit for review
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="versions">
            {qn?.history.length ? (
              <Timeline
                items={qn.history.map((h) => ({
                  id: h.id,
                  actor: { name: h.state === 'approved' ? h.secondReviewer ?? h.reviewer ?? h.author : h.author },
                  action:
                    h.state === 'approved'
                      ? `${h.kind === 'minor' ? `Approved a minor change (v${h.version} kept)` : `Approved v${h.version}`}${h.secondReviewer ? ` (second approval; first by ${h.reviewer})` : ''}`
                      : h.state === 'withdrawn'
                        ? `Withdrew a ${h.kind} change`
                        : h.state === 'changes_requested'
                          ? `Changes asked for: ${h.note ?? ''}`
                          : `${KIND_LABEL[h.kind]} change, ${h.state === 'in_review' ? 'in review' : 'draft'} (v${h.version})`,
                  at: new Date(h.at),
                }))}
              />
            ) : (
              <p className="yx-prc-muted">No versions yet. Version 1 is made when another person approves the question.</p>
            )}
          </TabsContent>
          <TabsContent value="stats">
            <ItemStatsBlock stats={qn ? live.stats ?? { questionId: qn.id, responses: 0, percentCorrect: null, discrimination: null, flags: [], options: [], hasEnoughData: false } : { questionId: '', responses: 0, percentCorrect: null, discrimination: null, flags: [], options: [], hasEnoughData: false }} provisional={live.settings?.provisionalAnswers ?? 200} />
          </TabsContent>
        </Tabs>
        <aside className="yx-prc-stack" aria-label="Candidate preview">
          <div className="yx-prc-row" data-between>
            <h2 className="yx-prc-h">Candidate preview</h2>
            <ButtonGroup aria-label="Preview device">
              <Button size="sm" onClick={() => setDevice('desktop')} aria-pressed={device === 'desktop'}>
                Desktop
              </Button>
              <Button size="sm" onClick={() => setDevice('mobile')} aria-pressed={device === 'mobile'}>
                Mobile
              </Button>
            </ButtonGroup>
          </div>
          <FormField label="Language">
            <Select value={lang} onChange={(v) => setLang(v ?? 'en')} options={['en', ...(live.settings?.languages ?? [])].map((l) => ({ value: l, label: LANGUAGE_NAME[l]! }))} size="sm" />
          </FormField>
          {lang !== 'en' && !previewT && <InlineAlert tone="info">No approved {LANGUAGE_NAME[lang]} translation. Candidates who choose {LANGUAGE_NAME[lang]} will see English for this question.</InlineAlert>}
          <div className="yx-prc-preview" data-device={device}>
            <p className="yx-prc-muted yx-prc-small">Question 1 of 1 · {c.marks} marks</p>
            <p className="yx-prc-p">{previewT ? previewT.text : c.text || 'Your question appears here.'}</p>
            {/* Answer 2143: the images as candidates see them, through short-lived signed links; one not saved yet says so. */}
            {c.imageUrl &&
              (qn?.images?.[c.imageUrl] ? (
                <img className="yx-prc-preview__img" src={qn.images[c.imageUrl]} alt={c.imageAlt ?? ''} />
              ) : (
                <p className="yx-prc-muted yx-prc-small">The image shows here once the question is saved.</p>
              ))}
            {c.options.length > 0 && (
              <ul className="yx-prc-list">
                {(previewT ? translationOptions(previewT.options) : c.options.map((o) => o.text)).map((t, i) => {
                  const img = c.options[i]?.imageUrl;
                  return (
                    <li key={i}>
                      {t}
                      {img && qn?.images?.[img] && <img className="yx-prc-preview__img" src={qn.images[img]} alt={c.optionAlts?.[i] ?? ''} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
      {translating && qn && (
        <TranslationDialog
          language={translating}
          english={qn.content}
          existing={qn.translations.find((x) => x.language === translating && x.version === qn.version) ?? null}
          onClose={() => setTranslating(null)}
          onSave={async (t) => {
            await live.onSaveTranslation(translating, t);
            done(`${LANGUAGE_NAME[translating]} translation saved as a draft`);
            setTranslating(null);
          }}
          onFail={fail}
        />
      )}
    </PrcFrame>
  );
}

function TranslationDialog({ language, english, existing, onClose, onSave, onFail }: { language: string; english: BankContent; existing: BankTranslation | null; onClose: () => void; onSave: (t: { text: string; options: string[]; aiAssisted: boolean }) => Promise<void>; onFail: (m: string) => void }) {
  const [text, setText] = useState(existing?.text ?? '');
  const [options, setOptions] = useState<string[]>(() => english.options.map((_, i) => translationOptions(existing?.options)[i] ?? ''));
  const [ai, setAi] = useState(existing?.aiAssisted ?? false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const missing = !text.trim() || options.some((o) => !o.trim());
  return (
    <Dialog
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title={`${LANGUAGE_NAME[language]} translation`}
      description="Another person who reads this language reviews it before candidates see it."
      preventClose={busy}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setTried(true);
              if (missing) return;
              setBusy(true);
              try {
                await onSave({ text: text.trim(), options: options.map((o) => o.trim()), aiAssisted: ai });
              } catch (e) {
                onFail(e instanceof Error ? e.message : 'That didn’t work. Nothing has changed.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save draft
          </Button>
        </>
      }
    >
      <div className="yx-prc-stack">
        <p className="yx-prc-small yx-prc-muted">English: {english.text}</p>
        <FormField label="Question" required error={tried && !text.trim() ? 'Write the translated question.' : null}>
          <TextArea value={text} onChange={setText} rows={3} />
        </FormField>
        {english.options.map((o, i) => (
          <FormField key={i} label={`Option ${letter(i)}`} helper={`English: ${o.text}`} required error={tried && !options[i]?.trim() ? 'Translate this option.' : null}>
            <TextField value={options[i] ?? ''} onChange={(v) => setOptions(options.map((x, j) => (j === i ? v : x)))} />
          </FormField>
        ))}
        <Checkbox label="Drafted with AI help" description="The reviewer sees this." checked={ai} onChange={setAi} />
      </div>
    </Dialog>
  );
}

/* ================================================================== */
/* PRC-03 · Question review queue                                      */
/* ================================================================== */

export interface LiveReviews {
  state: BankLoad;
  onRetry: () => void;
  changes: ReviewChange[];
  translations: ReviewTranslation[];
  onOpenQuestion: (id: string) => void;
  onApprove: (c: ReviewChange, comments: Record<string, string>) => Promise<{ state: string; version?: number; waitingFor?: string }>;
  onRequestChanges: (c: ReviewChange, note: string, comments: Record<string, string>) => Promise<unknown>;
  onClearDuplicate: (c: ReviewChange) => Promise<unknown>;
  onDecideTranslation: (t: ReviewTranslation, approve: boolean, note?: string) => Promise<unknown>;
}

interface QueueRow {
  id: string;
  question: string;
  kind: string;
  author: string;
  submitted: Date;
  change?: ReviewChange;
  translation?: ReviewTranslation;
}

export function LiveReviewQueue({ live }: { live: LiveReviews }) {
  const rows: QueueRow[] = [
    ...live.changes.map((c) => ({ id: c.id, question: c.after.text, kind: KIND_LABEL[c.kind]!, author: c.author, submitted: new Date(c.submittedAt), change: c })),
    ...live.translations.map((t) => ({ id: t.id, question: `${LANGUAGE_NAME[t.language]} translation: ${t.english.text}`, kind: 'Translation', author: t.aiAssisted ? `AI-assisted, ${t.author}` : t.author, submitted: new Date(t.submittedAt), translation: t })),
  ].sort((a, b) => a.submitted.getTime() - b.submitted.getTime());
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? rows[0] ?? null;
  return (
    <PrcFrame page="Review queue">
      <PageHeader title="Question review" description="Approve or request changes. New questions, changes and translations need another person's review before they can be used in a test." />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the review queue." onRetry={live.onRetry} />
      ) : (
        <div className="yx-prc-split" data-wide-aside>
          <DataTable
            label="Questions waiting for review"
            columns={[
              { key: 'question', header: 'Question', value: (r: QueueRow) => r.question, width: 300 },
              { key: 'kind', header: 'Change', type: 'status', value: (r: QueueRow) => r.kind, statusTone: (v) => (v === 'Major' ? 'warning' : 'neutral'), width: 110 },
              { key: 'author', header: 'Author', value: (r: QueueRow) => r.author, width: 160 },
              { key: 'submitted', header: 'Submitted', type: 'date', value: (r: QueueRow) => r.submitted, width: 120 },
            ]}
            rows={rows}
            getRowId={(r) => r.id}
            state={live.state === 'loading' ? 'loading' : 'ready'}
            empty={<EmptyState title="Nothing waiting for review." description="Questions and translations other people submit appear here. Your own go to someone else." />}
            onRowClick={(r) => setOpenId(r.id)}
            activeRowId={open?.id ?? null}
          />
          {open?.change && live.state === 'ready' && <ChangeReview key={`${open.id}:${open.change.rowVersion}`} c={open.change} live={live} />}
          {open?.translation && live.state === 'ready' && <TranslationReview key={`${open.id}:${open.translation.rowVersion}`} t={open.translation} live={live} />}
        </div>
      )}
    </PrcFrame>
  );
}

function ChangeReview({ c, live }: { c: ReviewChange; live: LiveReviews }) {
  const [comments, setComments] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const { busy, run, error } = useRun();
  const { done, say } = useSay();
  const fields = c.kind === 'new' ? ['type', 'text', 'options', 'modelAnswer', 'marks', 'difficulty', 'topic', 'category', 'imageAlt'].filter((f) => fieldText(c.after, f) !== '—' && fieldText(c.after, f) !== '') : [...c.changed, ...['text', 'marks', 'topic'].filter((f) => !c.changed.includes(f))];
  const dupOpen = Boolean(c.duplicate && !c.duplicate.cleared);
  const heading = c.kind === 'new' ? 'New question' : c.kind === 'major' ? `v${c.fromVersion} → v${c.toVersion}` : `v${c.toVersion} · minor change`;
  const filled = Object.fromEntries(Object.entries(comments).filter(([, v]) => v.trim()));
  const approve = async () => {
    if (dupOpen) return say('Confirm "not a duplicate" first.');
    let out: Awaited<ReturnType<LiveReviews['onApprove']>> | null = null;
    if (await run('approve', async () => void (out = await live.onApprove(c, filled)))) {
      const o = out as Awaited<ReturnType<LiveReviews['onApprove']>> | null;
      done(o?.state === 'approved' ? `Approved. Version ${o.version} can now go into tests.` : 'First approval given. A second approver decides next.');
    }
  };
  return (
    <section className="yx-prc-box" aria-label={`Review ${c.after.text.slice(0, 60)}`}>
      <div className="yx-prc-row" data-between>
        <h2 className="yx-prc-h">{heading}</h2>
        <span className="yx-prc-row">
          <Badge tone={c.kind === 'major' ? 'warning' : 'neutral'}>{KIND_LABEL[c.kind]}</Badge>
          {c.aiDrafted && <AiBadge />}
        </span>
      </div>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {c.duplicate && (
        <InlineAlert
          tone={dupOpen ? 'danger' : 'info'}
          title={`${c.duplicate.percent} % similar to another question`}
          actions={
            <span className="yx-prc-row">
              {c.duplicate.questionId && (
                <Button size="sm" onClick={() => live.onOpenQuestion(c.duplicate!.questionId!)}>
                  Compare
                </Button>
              )}
              {dupOpen && (
                <Button size="sm" loading={busy === 'dup'} onClick={() => void run('dup', () => live.onClearDuplicate(c)).then((ok) => ok && done('Marked "not a duplicate"'))}>
                  Mark "not a duplicate"
                </Button>
              )}
            </span>
          }
        >
          {dupOpen ? `Confirm it is not a duplicate before you approve. The other question: "${c.duplicate.text}"` : 'A reviewer confirmed it is not a duplicate.'}
        </InlineAlert>
      )}
      {c.secondApproval && (
        <InlineAlert tone="info" title="This collection needs two approvers">
          {c.secondApproval.firstBy ? `${c.secondApproval.firstBy} gave the first approval. Yours is the second.` : 'Your approval is the first; another person gives the second.'}
        </InlineAlert>
      )}
      {fields.map((f) => {
        const changed = c.kind !== 'new' && c.changed.includes(f);
        return (
          <div key={f} className="yx-prc-field" data-changed={changed || undefined}>
            <span className="yx-prc-field__label">
              {FIELD_LABEL[f] ?? f}
              {changed ? ' · changed' : ''}
            </span>
            {c.kind === 'new' ? (
              <p className="yx-prc-p">{fieldText(c.after, f)}</p>
            ) : (
              <div className="yx-prc-diff">
                <div>
                  <span className="yx-prc-muted yx-prc-small">v{c.fromVersion}</span>
                  <p className="yx-prc-p">{changed ? <del>{fieldText(c.before, f)}</del> : fieldText(c.before, f)}</p>
                </div>
                <div>
                  <span className="yx-prc-muted yx-prc-small">{c.kind === 'major' ? `v${c.toVersion}` : 'Proposed'}</span>
                  <p className="yx-prc-p">{changed ? <ins>{fieldText(c.after, f)}</ins> : fieldText(c.after, f)}</p>
                </div>
              </div>
            )}
            {(changed || c.kind === 'new') && (
              <FormField label={`Comment on ${(FIELD_LABEL[f] ?? f).toLowerCase()}`} optional>
                <TextField value={comments[f] ?? ''} onChange={(v) => setComments({ ...comments, [f]: v })} size="sm" maxLength={1000} />
              </FormField>
            )}
          </div>
        );
      })}
      <div className="yx-prc-row">
        <Button onClick={() => setAsking(true)}>Request changes</Button>
        <Button variant="primary" loading={busy === 'approve'} onClick={() => void approve()}>
          {c.kind === 'new' ? 'Approve' : c.kind === 'major' ? `Approve v${c.toVersion}` : 'Approve change'}
        </Button>
      </div>
      {asking && (
        <Dialog
          open
          onOpenChange={(o) => !o && setAsking(false)}
          title="Request changes"
          description={`${c.author} is told in the app, with your note and field comments.`}
          preventClose={busy === 'changes'}
          footer={
            <>
              <Button onClick={() => setAsking(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={busy === 'changes'}
                onClick={async () => {
                  setTried(true);
                  if (note.trim().length < 5) return;
                  if (await run('changes', () => live.onRequestChanges(c, note.trim(), filled))) {
                    setAsking(false);
                    done(`Changes requested. ${c.author} has been told.`);
                  }
                }}
              >
                Send to author
              </Button>
            </>
          }
        >
          <FormField label="What to change" required rule="At least 5 characters." error={tried && note.trim().length < 5 ? 'Say what to change (at least 5 characters).' : null}>
            <TextArea value={note} onChange={setNote} rows={3} maxLength={1000} />
          </FormField>
        </Dialog>
      )}
    </section>
  );
}

function TranslationReview({ t, live }: { t: ReviewTranslation; live: LiveReviews }) {
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const { busy, run, error } = useRun();
  const { done } = useSay();
  const options = translationOptions(t.options);
  return (
    <section className="yx-prc-box" aria-label={`Review ${LANGUAGE_NAME[t.language]} translation`}>
      <div className="yx-prc-row" data-between>
        <h2 className="yx-prc-h">
          {LANGUAGE_NAME[t.language]} translation · v{t.version}
        </h2>
        <span className="yx-prc-row">
          <Badge>Translation</Badge>
          {t.aiAssisted && <AiBadge />}
        </span>
      </div>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {t.aiAssisted && <InlineAlert tone="ai">Drafted with AI help. Check the meaning of every line against the English.</InlineAlert>}
      <div className="yx-prc-field">
        <span className="yx-prc-field__label">Question</span>
        <div className="yx-prc-diff">
          <div>
            <span className="yx-prc-muted yx-prc-small">English</span>
            <p className="yx-prc-p">{t.english.text}</p>
          </div>
          <div>
            <span className="yx-prc-muted yx-prc-small">{LANGUAGE_NAME[t.language]}</span>
            <p className="yx-prc-p">{t.text}</p>
          </div>
        </div>
      </div>
      {t.english.options.map((o, i) => (
        <div key={i} className="yx-prc-field">
          <span className="yx-prc-field__label">Option {letter(i)}</span>
          <div className="yx-prc-diff">
            <p className="yx-prc-p">{o}</p>
            <p className="yx-prc-p">{options[i] ?? '—'}</p>
          </div>
        </div>
      ))}
      <FormField label="Note to the translator" optional helper="Needed when you request changes." error={tried && !note.trim() ? 'Say what to change.' : null}>
        <TextField value={note} onChange={setNote} size="sm" maxLength={1000} />
      </FormField>
      <div className="yx-prc-row">
        <Button
          loading={busy === 'no'}
          onClick={async () => {
            setTried(true);
            if (!note.trim()) return;
            if (await run('no', () => live.onDecideTranslation(t, false, note.trim()))) done(`Changes requested. ${t.author} has been told.`);
          }}
        >
          Request changes
        </Button>
        <Button variant="primary" loading={busy === 'yes'} onClick={() => void run('yes', () => live.onDecideTranslation(t, true)).then((ok) => ok && done(`${LANGUAGE_NAME[t.language]} translation approved`))}>
          Approve translation
        </Button>
      </div>
    </section>
  );
}

/* ================================================================== */
/* PRC-05 · Item analysis                                              */
/* ================================================================== */

export interface LiveItemAnalysis {
  state: BankLoad;
  onRetry: () => void;
  /** Questions with at least 20 scored answers (fewer show nothing: one answer proves nothing). */
  rows: ItemRow[];
  provisionalAnswers: number;
  onLoadItem: (id: string) => Promise<ItemStats>;
  onOpenQuestion: (id: string) => void;
}

export function LiveItemAnalysisScreen({ live }: { live: LiveItemAnalysis }) {
  const [sel, setSel] = useState<string | null>(null);
  const [item, setItem] = useState<ItemStats | 'loading' | 'error' | null>(null);
  const loading = live.state === 'loading';
  const flagged = live.rows.filter((r) => r.flags.length);
  const provisional = live.rows.filter((r) => r.responses < live.provisionalAnswers);
  const responses = live.rows.reduce((n, r) => n + r.responses, 0);
  const selected = live.rows.find((r) => r.questionId === sel) ?? null;
  const pick = (id: string) => {
    setSel(id);
    setItem('loading');
    live.onLoadItem(id).then(setItem, () => setItem('error'));
  };
  const options = useMemo(() => (item && typeof item === 'object' ? item.options : []), [item]);
  const total = options.reduce((n, o) => n + o.selections, 0) || 1;
  return (
    <PrcFrame page="Item analysis">
      <PageHeader title="Item analysis" description={`Every question with at least 20 scored answers, across your tests. Under ${live.provisionalAnswers} answers the figures are provisional.`} />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the item statistics." onRetry={live.onRetry} />
      ) : (
        <>
          {!loading && provisional.length > 0 && (
            <InlineAlert tone="info" title="Provisional statistics">
              {provisional.length} of {live.rows.length} questions have fewer than {live.provisionalAnswers} answers. Their figures can still move a lot; scores use the authored difficulty.
            </InlineAlert>
          )}
          <div className="yx-prc-grid4">
            <StatCard label="Questions with statistics" value={live.rows.length} drill={{ label: 'View items', href: '#items' }} loading={loading} />
            <StatCard label="Answers counted" value={responses} drill={{ label: 'View items', href: '#items' }} loading={loading} />
            <StatCard label="Items flagged" value={flagged.length} drill={{ label: 'View flagged items', href: '#items' }} loading={loading} />
            <StatCard label="Provisional items" value={provisional.length} drill={{ label: 'View items', href: '#items' }} loading={loading} />
          </div>
          <div id="items">
            <DataTable
              label="Items"
              columns={[
                { key: 'text', header: 'Question', value: (r: ItemRow) => r.text, width: 300 },
                { key: 'n', header: 'Answers', type: 'number', value: (r: ItemRow) => r.responses, width: 90 },
                { key: 'p', header: 'p', type: 'number', value: (r: ItemRow) => r.percentCorrect / 100, render: (r) => (r.percentCorrect / 100).toFixed(2), width: 70 },
                { key: 'r', header: 'r', type: 'number', value: (r: ItemRow) => r.discrimination, render: (r) => r.discrimination?.toFixed(2) ?? '—', width: 70 },
                { key: 'difficulty', header: 'Authored → observed', value: (r: ItemRow) => `${DIFFICULTY[r.declared] ?? r.declared} → ${DIFFICULTY[r.observed] ?? r.observed}`, width: 170 },
                { key: 'band', header: 'Band', type: 'status', value: (r: ItemRow) => (r.responses < live.provisionalAnswers ? 'Provisional' : 'Calibrated'), statusTone: (v) => (v === 'Provisional' ? 'info' : 'success'), width: 120 },
                { key: 'flag', header: 'Flags', value: (r: ItemRow) => r.flags.join(', ') || 'None', width: 220 },
              ]}
              rows={live.rows}
              getRowId={(r) => r.questionId}
              state={loading ? 'loading' : 'ready'}
              empty={<EmptyState title="No statistics yet." description="A question shows here once 20 candidates have answered it in a test." />}
              onRowClick={(r) => pick(r.questionId)}
              activeRowId={sel}
            />
          </div>
          {selected && !loading && (
            <div className="yx-prc-grid2">
              {item === 'loading' || item === null ? (
                <p className="yx-prc-muted">Loading the options…</p>
              ) : item === 'error' ? (
                <InlineAlert tone="warning">We couldn't load this question's options.</InlineAlert>
              ) : options.length ? (
                <BarChart
                  title="Distractors"
                  description={`Share of candidates choosing each option; the key is ${options.map((o, i) => (o.isCorrect ? letter(i) : '')).filter(Boolean).join(', ') || 'not shown'}`}
                  categories={options.map((o, i) => `${letter(i)}${o.isCorrect ? ' (key)' : ''}`)}
                  series={[{ name: 'Candidates (%)', values: options.map((o) => Math.round((100 * o.selections) / total)) }]}
                />
              ) : (
                <InlineAlert tone="info">This question has no options to compare.</InlineAlert>
              )}
              <Card title="This question" actions={<Button size="sm" onClick={() => live.onOpenQuestion(selected.questionId)}>Open in editor</Button>}>
                <div className="yx-prc-stack" data-gap="sm">
                  <p className="yx-prc-p">{selected.text}</p>
                  {item && typeof item === 'object' && item.flags.map((f) => <InlineAlert key={f.code} tone={f.severity === 'critical' ? 'danger' : f.severity === 'warning' ? 'warning' : 'info'}>{f.message}</InlineAlert>)}
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </PrcFrame>
  );
}
