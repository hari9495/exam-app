// Question bank, editor, review queue, test builder, item analysis, score report (T01, T02). PRC-01 … PRC-06.
import { useMemo, useState } from 'react';
import { Archive, Download, FileUp, Plus, Send } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, AiBadge, Tag, PersonLabel } from '../../components/display';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { RadioGroup, Switch } from '../../components/choice';
import { REVIEW_ID, Stepper } from '../../components/stepper';
import { Timeline } from '../../components/timeline';
import { BarChart, Heatmap, LineChart, StatCard } from '../../components/charts';
import { ButtonGroup } from '../../components/button';
import { formatDate } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { PrcFrame, type ViewState } from './proctoring-shared';
import { blueprintCell, overallOutcome, publishChecks } from './proctoring-logic';
import { BLUEPRINT, DIFFICULTY_LABEL, PEOPLE, SKILL_TREE, d, type QuestionRow } from './proctoring-data';

const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'info'> = { Approved: 'success', 'In review': 'warning', Draft: 'neutral', Retired: 'neutral' };

/* ================================================================== */
/* PRC-01 · Question bank explorer + library packs                     */
/* ================================================================== */

const Q_FIELDS: FilterFieldDef[] = [
  { key: 'type', label: 'Type', type: 'multi', options: opt(['Single choice', 'Code', 'SQL', 'Descriptive', 'Ordering', 'Fill in the blank', 'Typing', 'Role-play']) },
  { key: 'status', label: 'Status', type: 'multi', options: opt(['Draft', 'In review', 'Approved', 'Retired']) },
  { key: 'collection', label: 'Collection', type: 'multi', options: opt(['Backend L2', 'Campus aptitude', 'Quality supervisors', 'Customer care', 'Data analyst L1']) },
  { key: 'source', label: 'Source', type: 'multi', options: opt(['Our team', 'AI-drafted', 'Imported', 'YukthiX starter']) },
  { key: 'served', label: 'Times served', type: 'number' },
];

const Q_COLS: TableColumn<QuestionRow>[] = [
  { key: 'id', header: 'ID', type: 'id', value: (r) => r.id, width: 90 },
  {
    key: 'stem',
    header: 'Question',
    value: (r) => r.stem,
    render: (r) => (
      <span className="yx-prc-stack" data-gap="sm">
        <span>{r.stem}</span>
        <span className="yx-prc-row yx-prc-small yx-prc-muted">
          {r.type} · v{r.version} {r.source === 'AI-drafted' && <AiBadge />}
          {r.source === 'YukthiX starter' && <Badge tone="info">YukthiX starter</Badge>}
        </span>
      </span>
    ),
    width: 380,
  },
  { key: 'skill', header: 'Skill', value: (r) => r.skill, groupable: true, width: 190 },
  { key: 'difficulty', header: 'Difficulty', value: (r) => DIFFICULTY_LABEL[r.difficulty], width: 110 },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => STATUS_TONE[String(v)] ?? 'neutral', groupable: true, width: 110 },
  { key: 'languages', header: 'Languages', value: (r) => r.languages.join(', '), width: 150 },
  { key: 'served', header: 'Served', type: 'number', value: (r) => r.served, width: 90 },
  { key: 'pCorrect', header: '% correct', type: 'number', value: (r) => (r.pCorrect == null ? null : Math.round(r.pCorrect * 100)), width: 100 },
  { key: 'updated', header: 'Updated', type: 'date', value: (r) => r.updated, width: 120 },
];

export function ItemStatsPanel({ q }: { q: QuestionRow }) {
  if (q.served < 200)
    return (
      <InlineAlert tone="info" title="Not enough responses yet">
        {q.served} of the 200 responses needed before difficulty is calibrated. Stats below use authored difficulty.
      </InlineAlert>
    );
  return (
    <DescriptionList
      columns={2}
      items={[
        { label: 'Served', value: q.served.toLocaleString('en-IN') },
        { label: '% correct (p)', value: q.pCorrect == null ? 'Not scored' : `${Math.round(q.pCorrect * 100)} %` },
        { label: 'Discrimination (r)', value: q.discrimination == null ? '—' : q.discrimination.toFixed(2) + (q.discrimination < 0.2 ? ' · weak' : '') },
        { label: 'Exposure, 30 days', value: q.exposure == null ? '—' : `${Math.round(q.exposure * 100)} %${q.exposure > 0.3 ? ' · over the 30 % cap' : ''}` },
        { label: 'Authored difficulty', value: DIFFICULTY_LABEL[q.difficulty] },
        { label: 'Calibrated difficulty', value: q.pCorrect == null ? '—' : q.pCorrect > 0.7 ? 'Easy (b = −0.8)' : q.pCorrect > 0.5 ? 'Medium (b = 0.1)' : 'Hard (b = 0.9)' },
        { label: 'DIF grade', value: q.dif ? `${q.dif}${q.dif === 'C' ? ' · large, finding open' : q.dif === 'B' ? ' · moderate' : ' · negligible'}` : 'Not enough group data' },
      ]}
    />
  );
}

const LIBRARY_PACKS = [
  { name: 'Aptitude starter', desc: 'Numerical, verbal and logical reasoning. 1,240 questions, pre-calibrated.', langs: 'English, Hindi, Tamil, Telugu', included: true },
  { name: 'English proficiency (CEFR A1–C2)', desc: 'Reading, listening, speaking and writing items with CEFR rubrics.', langs: 'English', included: true },
  { name: 'Core IT skills', desc: 'Java, Python, SQL, web basics. Tagged by job-role profile.', langs: 'English', included: true },
  { name: 'Food safety certification pack', desc: 'Partner pack from Sahyadri Assessment Labs. Charged per use.', langs: 'English, Hindi', included: false },
];

export function QuestionBankScreen({ questions, state = 'ready', tab = 'bank', defaultSelected = [], defaultOpenId = null }: { questions: QuestionRow[]; state?: ViewState; tab?: 'bank' | 'library'; defaultSelected?: string[]; defaultOpenId?: string | null }) {
  // PRC-01
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [skill, setSkill] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);
  const rows = useMemo(
    () =>
      questions.filter(
        (r) =>
          (!skill || r.skill === skill) &&
          (!q || `${r.id} ${r.stem}`.toLowerCase().includes(q.toLowerCase())) &&
          filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f)),
      ),
    [questions, filters, q, skill],
  );
  const open = questions.find((x) => x.id === openId) ?? null;
  const isFiltered = filters.length > 0 || !!q || !!skill;
  return (
    <PrcFrame page="Question bank">
      <PageHeader
        title="Question bank"
        description="Reviewed, versioned questions. Only approved versions can go into a published test."
        actions={
          <>
            <Button icon={FileUp}>Import</Button>
            <Button>Draft with AI</Button>
            <Button variant="primary" icon={Plus}>
              Add question
            </Button>
          </>
        }
      />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Question sources">
          <TabsTrigger value="bank" count={questions.length}>
            Our questions
          </TabsTrigger>
          <TabsTrigger value="library" count={LIBRARY_PACKS.length}>
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
                    <Button size="sm" aria-pressed={!skill} onClick={() => setSkill(null)}>
                      All skills
                    </Button>
                  </li>
                  {SKILL_TREE.map((dmn) => (
                    <li key={dmn.domain} className="yx-prc-stack" data-gap="sm">
                      <strong>{dmn.domain}</strong>
                      {dmn.skills.map((s) => (
                        <label key={s} className="yx-prc-row">
                          <input type="radio" name="skill-facet" checked={skill === s} onChange={() => setSkill(s)} />
                          <span>{s.split(' › ')[1]}</span>
                          <span className="yx-prc-muted">{questions.filter((x) => x.skill === s).length}</span>
                        </label>
                      ))}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="yx-prc-facet">
                <h3>Difficulty</h3>
                <ul>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <li key={n}>
                      <span>{DIFFICULTY_LABEL[n]}</span>
                      <span className="yx-prc-muted">{questions.filter((x) => x.difficulty === n).length}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="yx-prc-facet">
                <h3>Language</h3>
                <ul>
                  {['English', 'Hindi', 'Tamil', 'Telugu'].map((l) => (
                    <li key={l}>
                      <span>{l}</span>
                      <span className="yx-prc-muted">{questions.filter((x) => x.languages.includes(l)).length}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
            <div className="yx-prc-stack">
              <FilterBar fields={Q_FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search question text or ID">
                <SavedViewMenu views={[{ id: 'all', name: 'All questions' }, { id: 'mine', name: 'My drafts' }, { id: 'weak', name: 'Weak items', shared: true }]} currentId="all" onSelect={() => {}} />
              </FilterBar>
              <DataTable
                label="Questions"
                columns={Q_COLS}
                rows={state === 'empty' ? [] : rows}
                getRowId={(r) => r.id}
                state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
                errorTitle="We couldn't load the question bank."
                errorReference="QB-LOAD-503"
                onRetry={() => {}}
                filtered={isFiltered}
                onClearFilters={() => {
                  setFilters([]);
                  setQ('');
                  setSkill(null);
                }}
                empty={<EmptyState title="No questions yet." description="Add your first question, import a CSV / XLSX / QTI file, or copy from a YukthiX library pack." action={<Button>Add question</Button>} />}
                selectable
                selectedIds={selected}
                onSelectedChange={setSelected}
                bulkActions={(ids) => (
                  <>
                    <Button size="sm" icon={Send}>
                      Submit {ids.length} for review
                    </Button>
                    <Button size="sm">Move to collection</Button>
                    <Button size="sm" icon={Download}>
                      Export (CSV, XLSX, QTI)
                    </Button>
                    <Button size="sm" variant="danger" icon={Archive}>
                      Retire
                    </Button>
                  </>
                )}
                onRowClick={(r) => setOpenId(r.id)}
                activeRowId={openId}
                pageSize={25}
              />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="library">
          <div className="yx-prc-grid2">
            {LIBRARY_PACKS.map((p) => (
              <Card key={p.name} title={p.name} actions={p.included ? <Badge tone="success">Included in your plan</Badge> : <Badge tone="info">Paid add-on</Badge>}>
                <div className="yx-prc-stack" data-gap="sm">
                  <p className="yx-prc-p">{p.desc}</p>
                  <p className="yx-prc-muted yx-prc-small">Languages: {p.langs} · Read-only. Copy questions to edit them.</p>
                  <div className="yx-prc-row">
                    <Button size="sm">Browse questions</Button>
                    {p.included ? <Button size="sm">Copy to our bank</Button> : <Button size="sm">Request access</Button>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      {open && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpenId(null)}
          title={`${open.id} · v${open.version}`}
          subtitle={open.stem}
          meta={<Badge tone={STATUS_TONE[open.status]}>{open.status}</Badge>}
          footer={
            <>
              <Button>Duplicate</Button>
              <Button variant="primary">Open in editor</Button>
            </>
          }
        >
          <div className="yx-prc-stack">
            <DescriptionList
              items={[
                { label: 'Type', value: open.type },
                { label: 'Skill', value: open.skill },
                { label: 'Collection', value: open.collection },
                { label: 'Languages', value: open.languages.join(', ') },
                { label: 'Source', value: open.source === 'AI-drafted' ? <span className="yx-prc-row">AI-drafted <AiBadge /></span> : open.source },
              ]}
            />
            <h3 className="yx-prc-h">Item stats</h3>
            <ItemStatsPanel q={open} />
            {open.status === 'Retired' && <InlineAlert tone="info">Retired on {formatDate(open.updated)}. Past attempts and reports keep it.</InlineAlert>}
          </div>
        </Drawer>
      )}
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-02 · Question editor                                            */
/* ================================================================== */

const BLOCKS = [
  { kind: 'Text', body: 'A packing line at the Hosur plant fills 1,200 pouches an hour. Read the extract and answer.' },
  { kind: 'LaTeX', body: 'yield = (good units ÷ units started) × 100' },
  { kind: 'Code', body: 'List<String> top = words.stream()\n  .collect(groupingBy(w -> w, counting()))\n  .entrySet().stream()…' },
  { kind: 'Image', body: 'line-layout.png · Alt text: "Packing line with 4 stations from hopper to carton sealer"' },
  { kind: 'Audio', body: 'supervisor-brief.mp3 · 0:48 · Transcript attached' },
  { kind: 'Attachment', body: 'deviation-log-sample.xlsx · 18 KB' },
];

const LANGS = ['English', 'Hindi', 'Tamil', 'Telugu'];

export interface QuestionEditorProps {
  question: QuestionRow;
  /** 'major' shows the new-version notice; 'duplicate' blocks approval; 'alt' shows missing alt text. */
  issue?: 'none' | 'major' | 'duplicate' | 'alt';
  defaultTab?: 'content' | 'answer' | 'translations' | 'versions' | 'stats';
  defaultDevice?: 'desktop' | 'mobile';
  defaultLanguage?: string;
}

export function QuestionEditorScreen({ question, issue = 'none', defaultTab = 'content', defaultDevice = 'desktop', defaultLanguage = 'English' }: QuestionEditorProps) {
  // PRC-02
  const [device, setDevice] = useState(defaultDevice);
  const [lang, setLang] = useState(defaultLanguage);
  const [difficulty, setDifficulty] = useState(String(question.difficulty));
  const [marks, setMarks] = useState<number | null>(2);
  const [neg, setNeg] = useState<number | null>(0.5);
  const [secs, setSecs] = useState<number | null>(90);
  const translated = question.languages.includes(lang);
  const blocked = issue === 'duplicate' || issue === 'alt';
  return (
    <PrcFrame page="Question bank">
      <ObjectHeader
        name={`${question.id} · ${question.type}`}
        secondary={question.skill}
        status={
          <span className="yx-prc-row">
            <Badge tone={STATUS_TONE[question.status]}>{question.status}</Badge>
            <Badge>v{question.version}</Badge>
            {question.source === 'AI-drafted' && <AiBadge />}
          </span>
        }
        facts={[
          { label: 'Collection', value: question.collection },
          { label: 'Author', value: PEOPLE.author },
          { label: 'Reviewer', value: PEOPLE.reviewer },
          { label: 'Updated', value: formatDate(question.updated) },
        ]}
        actions={
          <>
            <Button>Save draft</Button>
            <Button variant="primary" disabled={blocked}>
              Submit for review
            </Button>
          </>
        }
      />
      {issue === 'major' && (
        <InlineAlert tone="warning" title="This is a major change">
          You changed the answer key of an approved question. Saving creates version {question.version + 1} as a draft and sends it for review. Published tests keep v{question.version} until their owner upgrades. 214 past attempts can be re-graded after approval; released results do not change until the re-grade is released.
        </InlineAlert>
      )}
      {issue === 'duplicate' && (
        <InlineAlert tone="danger" title="Possible duplicate: 95 % similar to Q-0987" actions={<Button size="sm">Compare</Button>}>
          A reviewer must confirm "not a duplicate" before this question can be approved.
        </InlineAlert>
      )}
      {issue === 'alt' && (
        <InlineAlert tone="danger" title="2 media items need accessibility text">
          Add alt text to the image and a transcript to the audio before you submit for review.
        </InlineAlert>
      )}
      {question.source === 'AI-drafted' && (
        <InlineAlert tone="ai" title="Drafted by AI">
          Check every fact and the answer key. It stays a draft until a reviewer approves it.
        </InlineAlert>
      )}
      <div className="yx-prc-split" data-wide-aside>
        <Tabs defaultValue={defaultTab}>
          <TabsList aria-label="Question editor">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="answer">Answer key</TabsTrigger>
            <TabsTrigger value="translations" count={question.languages.length}>
              Translations
            </TabsTrigger>
            <TabsTrigger value="versions" count={question.version}>
              Versions
            </TabsTrigger>
            <TabsTrigger value="stats">Item stats</TabsTrigger>
          </TabsList>
          <TabsContent value="content">
            <div className="yx-prc-stack">
              {BLOCKS.map((b) => (
                <div key={b.kind} className="yx-prc-block">
                  <span className="yx-prc-block__kind">{b.kind}</span>
                  <div className="yx-prc-block__body">
                    {b.kind === 'Code' || b.kind === 'LaTeX' ? <pre className="yx-anl-formula" tabIndex={0} role="region" aria-label={`${b.kind} block`}>{b.body}</pre> : <p className="yx-prc-p">{b.body}</p>}
                    {issue === 'alt' && (b.kind === 'Image' || b.kind === 'Audio') && <p className="yx-prc-small yx-prc-danger">{b.kind === 'Image' ? 'Alt text missing' : 'Transcript missing'}</p>}
                  </div>
                </div>
              ))}
              <div className="yx-prc-row">
                <span className="yx-prc-muted yx-prc-small">Add block:</span>
                {['Text', 'LaTeX', 'Code', 'Image', 'Audio', 'Video', 'Attachment'].map((k) => (
                  <Button key={k} size="sm" icon={Plus}>
                    {k}
                  </Button>
                ))}
              </div>
              <div className="yx-prc-grid3">
                <FormField label="Difficulty" required>
                  <Select value={difficulty} onChange={(v) => setDifficulty(v ?? '3')} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: DIFFICULTY_LABEL[n] }))} />
                </FormField>
                <FormField label="Marks" required>
                  <NumberField value={marks} onChange={setMarks} min={0} />
                </FormField>
                <FormField label="Negative marks" helper="Per wrong answer">
                  <NumberField value={neg} onChange={setNeg} decimals min={0} />
                </FormField>
                <FormField label="Expected time" helper="Seconds; feeds the response-time signal">
                  <NumberField value={secs} onChange={setSecs} min={10} suffix="s" />
                </FormField>
                <FormField label="Skill" required helper="From the company skills library">
                  <TextField value={question.skill} readOnly />
                </FormField>
                <FormField label="Tags" optional>
                  <span className="yx-prc-row">
                    <Tag>packing</Tag>
                    <Tag>yield</Tag>
                  </span>
                </FormField>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="answer">
            <div className="yx-prc-stack">
              <InlineAlert tone="info">Answer keys, test cases and model answers never reach the candidate's browser before submission.</InlineAlert>
              <RadioGroup aria-label="Correct option" defaultValue="b" options={[{ value: 'a', label: 'A. filter() is terminal' }, { value: 'b', label: 'B. map() is lazy and returns a new stream' }, { value: 'c', label: 'C. collect() is lazy' }, { value: 'd', label: 'D. forEach() returns a stream' }]} />
              <FormField label="Explanation shown after release (training tests only)">
                <TextArea defaultValue="Intermediate operations such as map() and filter() are lazy; they run only when a terminal operation starts the pipeline." rows={3} />
              </FormField>
            </div>
          </TabsContent>
          <TabsContent value="translations">
            <ul className="yx-prc-plain">
              {LANGS.map((l) => (
                <li key={l}>
                  <strong>{l}</strong>
                  {question.languages.includes(l) ? <Badge tone="success">Approved by bilingual reviewer</Badge> : l === 'Tamil' ? <Badge tone="warning">AI-assisted draft, in review</Badge> : <Badge>Not translated</Badge>}
                  <Button size="sm">{question.languages.includes(l) ? 'View' : 'Draft translation'}</Button>
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="versions">
            <Timeline
              items={[
                { id: 'v3', actor: { name: PEOPLE.author }, action: 'Created v3 draft: changed option B (major)', at: d(28, 8, 16, 20) },
                { id: 'v2', actor: { name: PEOPLE.reviewer }, action: 'Approved v2', at: d(14, 8, 11) },
                { id: 'v2m', actor: { name: PEOPLE.author }, action: 'Minor edit: fixed a typo in the stem (no new version)', at: d(10, 8, 15, 5) },
                { id: 'v1', actor: { name: PEOPLE.reviewer }, action: 'Approved v1', at: d(2, 6, 10) },
              ]}
            />
          </TabsContent>
          <TabsContent value="stats">
            <ItemStatsPanel q={question} />
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
            <Select value={lang} onChange={(v) => setLang(v ?? 'English')} options={opt(LANGS)} size="sm" />
          </FormField>
          {!translated && <InlineAlert tone="info">No approved {lang} translation. Candidates who choose {lang} will see English for this question.</InlineAlert>}
          <div className="yx-prc-preview" data-device={device}>
            <p className="yx-prc-muted yx-prc-small">Question 1 of 1 · 2 marks</p>
            <p className="yx-prc-p">{translated && lang === 'Hindi' ? 'कौन सा Java Stream ऑपरेशन lazy है और नया stream लौटाता है?' : question.stem}</p>
            <ul className="yx-prc-list">
              <li>filter() is terminal</li>
              <li>map() is lazy and returns a new stream</li>
              <li>collect() is lazy</li>
              <li>forEach() returns a stream</li>
            </ul>
          </div>
        </aside>
      </div>
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-03 · Question review queue                                      */
/* ================================================================== */

interface ReviewItem {
  id: string;
  question: string;
  author: string;
  kind: 'Major' | 'New' | 'Translation';
  submitted: Date;
  duplicate?: number;
}
export const REVIEW_ITEMS: ReviewItem[] = [
  { id: 'Q-1060', question: 'Explain how you would reduce food-safety deviations on a packing line.', author: PEOPLE.author, kind: 'Major', submitted: d(28, 8, 16) },
  { id: 'Q-1071', question: 'Reply to the upset distributor in the chat simulation.', author: 'Sonal Mehta', kind: 'New', submitted: d(27, 8, 11), duplicate: 0 },
  { id: 'Q-1051·ta', question: 'Tamil translation: dispatch van speed question', author: 'AI-assisted, Kavin Raj', kind: 'Translation', submitted: d(26, 8, 10) },
  { id: 'Q-1088', question: 'Which document records a CCP deviation?', author: PEOPLE.author, kind: 'New', submitted: d(25, 8, 9), duplicate: 95 },
];

const DIFF_FIELDS = [
  { field: 'Stem', before: 'Explain how you would reduce deviations on a packing line.', after: 'Explain how you would reduce food-safety deviations on a packing line.', changed: true },
  { field: 'Rubric: criterion 2', before: 'Mentions root cause (2 points)', after: 'Names a root-cause method such as 5 Whys (3 points)', changed: true },
  { field: 'Marks', before: '8', after: '9', changed: true },
  { field: 'Skill', before: 'Quality › Food safety', after: 'Quality › Food safety', changed: false },
];

export function QuestionReviewQueueScreen({ items, state = 'ready', defaultOpenId = 'Q-1060', decided }: { items: ReviewItem[]; state?: ViewState; defaultOpenId?: string | null; decided?: 'approved' | 'changes' }) {
  // PRC-03
  const [openId, setOpenId] = useState(defaultOpenId);
  const [comments, setComments] = useState<Record<string, string>>({ 'Rubric: criterion 2': 'Good. Add one example answer at level 3.' });
  const open = items.find((i) => i.id === openId);
  return (
    <PrcFrame page="Review queue">
      <PageHeader title="Question review" description="Approve or request changes. Major edits and translations need a reviewer before they can be used in a test." />
      <div className="yx-prc-split" data-wide-aside>
        <DataTable
          label="Questions waiting for review"
          columns={[
            { key: 'id', header: 'ID', type: 'id', value: (r: ReviewItem) => r.id, width: 100 },
            { key: 'question', header: 'Question', value: (r: ReviewItem) => r.question, width: 300 },
            { key: 'kind', header: 'Change', type: 'status', value: (r: ReviewItem) => r.kind, statusTone: (v) => (v === 'Major' ? 'warning' : 'neutral'), width: 110 },
            { key: 'author', header: 'Author', value: (r: ReviewItem) => r.author, width: 160 },
            { key: 'submitted', header: 'Submitted', type: 'date', value: (r: ReviewItem) => r.submitted, width: 120 },
          ]}
          rows={state === 'empty' ? [] : items}
          getRowId={(r) => r.id}
          state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
          empty={<EmptyState title="Nothing waiting for review." description="Questions submitted by authors in your collections appear here." />}
          onRowClick={(r) => setOpenId(r.id)}
          activeRowId={openId}
        />
        {open && state === 'ready' && (
          <section className="yx-prc-box" aria-label={`Review ${open.id}`}>
            <div className="yx-prc-row" data-between>
              <h2 className="yx-prc-h">
                {open.id} · v2 → v3
              </h2>
              <Badge tone="warning">{open.kind}</Badge>
            </div>
            {open.duplicate ? (
              <InlineAlert tone="danger" title={`${open.duplicate} % similar to Q-0987`} actions={<Button size="sm">Mark "not a duplicate"</Button>}>
                Confirm it is not a duplicate before you approve.
              </InlineAlert>
            ) : null}
            {decided === 'approved' && <InlineAlert tone="success">Approved. v3 is now available to test builders; 2 tests show "newer version available".</InlineAlert>}
            {decided === 'changes' && <InlineAlert tone="info">Changes requested. {open.author} has been notified with your 2 field comments.</InlineAlert>}
            {DIFF_FIELDS.map((f) => (
              <div key={f.field} className="yx-prc-field" data-changed={f.changed || undefined}>
                <span className="yx-prc-field__label">
                  {f.field}
                  {f.changed ? ' · changed' : ''}
                </span>
                <div className="yx-prc-diff">
                  <div>
                    <span className="yx-prc-muted yx-prc-small">v2</span>
                    <p className="yx-prc-p">{f.changed ? <del>{f.before}</del> : f.before}</p>
                  </div>
                  <div>
                    <span className="yx-prc-muted yx-prc-small">v3</span>
                    <p className="yx-prc-p">{f.changed ? <ins>{f.after}</ins> : f.after}</p>
                  </div>
                </div>
                {f.changed && (
                  <FormField label={`Comment on ${f.field.toLowerCase()}`} optional>
                    <TextField value={comments[f.field] ?? ''} onChange={(v) => setComments({ ...comments, [f.field]: v })} size="sm" />
                  </FormField>
                )}
              </div>
            ))}
            {!decided && (
              <div className="yx-prc-row">
                <Button>Request changes</Button>
                <Button variant="primary" disabled={!!open.duplicate}>
                  Approve v3
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-04 · Test builder + adaptive config                             */
/* ================================================================== */

function BlueprintGrid({ cells, onChange }: { cells: typeof BLUEPRINT; onChange?: (skill: string, level: number, value: number) => void }) {
  return (
    <div className="yx-prc-scroll">
      <table className="yx-prc-table" aria-label="Blueprint: questions needed / approved available, per skill and difficulty">
        <caption className="yx-prc-muted yx-prc-small" style={{ textAlign: 'left', captionSide: 'bottom', paddingTop: 'var(--yx-space-2)' }}>
          Each cell shows needed / available. A cell needs 3 × the questions drawn so candidates don't all see the same items.
        </caption>
        <thead>
          <tr>
            <th scope="col">Skill</th>
            {[1, 2, 3, 4, 5].map((n) => (
              <th key={n} scope="col">
                {DIFFICULTY_LABEL[n]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cells.map((row) => (
            <tr key={row.skill}>
              <th scope="row">{row.skill}</th>
              {row.counts.map(([needed, available], i) => {
                const c = blueprintCell(needed, available);
                return (
                  <td key={i} className="yx-prc-cell" data-state={needed === 0 ? 'none' : c.ok ? 'ok' : 'short'}>
                    <span className="yx-prc-row">
                      <input
                        type="number"
                        min={0}
                        value={needed}
                        aria-label={`${row.skill}, ${DIFFICULTY_LABEL[i + 1]}: questions needed`}
                        onChange={(e) => onChange?.(row.skill, i, Number(e.target.value))}
                        style={{ width: 'calc(var(--yx-space-12))' }}
                      />
                      <span className="yx-prc-mono">/ {available}</span>
                    </span>
                    {needed > 0 && !c.ok && <span className="yx-prc-small">Needs {c.required}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdaptiveConfigPanel({ simulated = false }: { simulated?: boolean }) {
  const [ran, setRan] = useState(simulated);
  const [engine, setEngine] = useState('staircase');
  return (
    <div className="yx-prc-stack">
      <RadioGroup
        aria-label="Adaptive engine"
        value={engine}
        onChange={setEngine}
        options={[
          { value: 'staircase', label: 'Rule-based staircase', description: 'Step up after 2 correct, down after 1 wrong, on authored difficulty. Usable now.' },
          { value: 'irt', label: 'IRT-based (CAT)', description: 'Selects by information and stops at a standard-error threshold. Needs a calibrated pool.', disabled: true },
        ]}
      />
      <p className="yx-prc-muted yx-prc-small">IRT is locked: 212 of 340 items are calibrated (200 responses each). All items must be calibrated.</p>
      <div className="yx-prc-grid3">
        <FormField label="Start level">
          <Select value="3" onChange={() => {}} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: DIFFICULTY_LABEL[n] }))} />
        </FormField>
        <FormField label="Floor / ceiling">
          <TextField value="Easy – Very hard" readOnly />
        </FormField>
        <FormField label="Stop after" helper="Or when time runs out">
          <NumberField value={20} onChange={() => {}} suffix="items" />
        </FormField>
      </div>
      <div className="yx-prc-row">
        <Button onClick={() => setRan(true)}>Run simulation with 100 candidates</Button>
      </div>
      {ran && (
        <div className="yx-prc-grid3" aria-live="polite">
          <StatCard label="Average items used" value={18.4} drill={{ label: 'See paths', href: '#paths' }} />
          <StatCard label="Standard error at stop" value={0.29} drill={{ label: 'See distribution', href: '#se' }} />
          <StatCard label="Highest item exposure" value={24} unit="%" drill={{ label: 'See items', href: '#exposure' }} />
        </div>
      )}
    </div>
  );
}

export interface TestBuilderProps {
  step?: 'template' | 'sections' | 'blueprint' | 'timing' | 'scoring' | 'retakes' | 'proctoring' | 'preview' | 'review';
  mode?: 'Randomised' | 'Adaptive';
  shortCells?: boolean;
  jd?: boolean;
  simulated?: boolean;
}

export function TestBuilderScreen({ step = 'blueprint', mode = 'Randomised', shortCells = false, jd = false, simulated }: TestBuilderProps) {
  // PRC-04
  const [cells, setCells] = useState(() => (shortCells ? BLUEPRINT.map((r, i) => (i === 0 ? { ...r, counts: r.counts.map(([n, a], j) => (j === 3 ? [5, a] : [n, a])) as [number, number][] } : r)) : BLUEPRINT));
  const short = cells.reduce((n, r) => n + r.counts.filter(([need, av]) => !blueprintCell(need, av).ok).length, 0);
  const checks = publishChecks({ draftQuestions: shortCells ? 2 : 0, weightsTotal: 100, cellsShort: short, certification: false, cutScoreApproved: false });
  const [proctor, setProctor] = useState('record');
  const steps = [
    {
      id: 'template',
      title: 'Template',
      content: (
        <div className="yx-prc-stack">
          <Tabs defaultValue={jd ? 'jd' : 'starter'}>
            <TabsList aria-label="Start from">
              <TabsTrigger value="starter">YukthiX starter</TabsTrigger>
              <TabsTrigger value="ours">Our templates</TabsTrigger>
              <TabsTrigger value="jd">Build from job description</TabsTrigger>
            </TabsList>
            <TabsContent value="starter">
              <ul className="yx-prc-plain">
                {['Java Backend Developer · L2', 'Data Analyst · L1', 'Customer care · job simulation', 'Quality supervisor · L1'].map((t) => (
                  <li key={t}>
                    <span>{t}</span>
                    <Badge tone="info">YukthiX starter</Badge>
                    <Button size="sm">Copy and edit</Button>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="ours">
              <p className="yx-prc-muted">3 templates made by your team.</p>
            </TabsContent>
            <TabsContent value="jd">
              <div className="yx-prc-stack">
                <FormField label="Job description" helper="Only this text and your skill names go to AI. No candidate data.">
                  <TextArea rows={4} defaultValue="Senior backend developer, 4–6 years, Java 17, Spring Boot, SQL, event-driven services for our distributor app." />
                </FormField>
                <InlineAlert tone="ai" title="Skills found in the job description">
                  Java › Streams API (30 %), Java › Collections (25 %), Data › SQL joins (25 %), Spring (20 %, not in your library: map it before continuing). Level: L3. You confirm the list; the test is always a draft.
                </InlineAlert>
                <div className="yx-prc-row">
                  <Button>Edit skills</Button>
                  <Button>Propose blueprint</Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      ),
    },
    {
      id: 'sections',
      title: 'Sections',
      content: (
        <ul className="yx-prc-plain">
          <li>
            <strong>Aptitude</strong> <span>Weight 30 % · cut-off 50 %</span>
          </li>
          <li>
            <strong>Java</strong> <span>Weight 50 % · cut-off 60 %</span>
          </li>
          <li>
            <strong>SQL</strong> <span>Weight 20 % · no cut-off</span>
          </li>
          <li>
            <span>Total weight</span> <Badge tone="success">100 %</Badge>
          </li>
        </ul>
      ),
    },
    {
      id: 'blueprint',
      title: mode === 'Adaptive' ? 'Adaptive rules' : 'Blueprint',
      status: short > 0 ? ('error' as const) : undefined,
      statusNote: short > 0 ? `${short} cells below pool depth` : undefined,
      content:
        mode === 'Adaptive' ? (
          <AdaptiveConfigPanel simulated={simulated} />
        ) : (
          <div className="yx-prc-stack">
            {short > 0 && (
              <InlineAlert tone="danger" title={`${short} ${short === 1 ? 'cell is' : 'cells are'} below pool depth`} actions={<Button size="sm">Request AI drafts for gaps</Button>}>
                Java › Streams API, Hard needs 15 approved questions for 5 drawn. You have 5. Lower the count or add questions; publishing is blocked until then.
              </InlineAlert>
            )}
            <BlueprintGrid
              cells={cells}
              onChange={(skill, level, v) => setCells((cs) => cs.map((r) => (r.skill === skill ? { ...r, counts: r.counts.map((c, j) => (j === level ? [Math.max(0, v), c[1]] : c)) as [number, number][] } : r)))}
            />
          </div>
        ),
    },
    {
      id: 'timing',
      title: 'Timing and navigation',
      content: (
        <div className="yx-prc-grid2">
          <FormField label="Aptitude: 20 minutes">
            <RadioGroup aria-label="Aptitude timer" defaultValue="enforced" options={[{ value: 'advisory', label: 'Advisory (warns only)' }, { value: 'enforced', label: 'Enforced (auto-submit at zero)' }]} />
          </FormField>
          <FormField label="Java: navigation">
            <RadioGroup aria-label="Java navigation" defaultValue="free" options={[{ value: 'free', label: 'Free, with mark for review' }, { value: 'forward', label: 'Forward only' }]} />
          </FormField>
          <Switch label="Scheduled break between sections" description="5 minutes, timer paused, face re-check on return" defaultChecked />
          <Switch label="Allow unscheduled breaks" description="1 break, up to 3 minutes; timer keeps running" />
        </div>
      ),
    },
    {
      id: 'scoring',
      title: 'Scoring',
      content: (
        <div className="yx-prc-grid3">
          <FormField label="Pass mark (scaled 0–100)">
            <NumberField value={60} onChange={() => {}} />
          </FormField>
          <FormField label="Bands">
            <TextField value="Below < 50 · Meets 50–74 · Strong 75+" readOnly />
          </FormField>
          <FormField label="Cost per test taken" helper="From the billing meter">
            <TextField value="₹180 per completed attempt" readOnly />
          </FormField>
        </div>
      ),
    },
    {
      id: 'retakes',
      title: 'Retakes',
      content: (
        <div className="yx-prc-grid3">
          <FormField label="Attempts allowed">
            <NumberField value={1} onChange={() => {}} />
          </FormField>
          <FormField label="Cooldown">
            <NumberField value={90} onChange={() => {}} suffix="days" />
          </FormField>
          <FormField label="Score that counts">
            <Select value="latest" onChange={() => {}} options={opt(['latest', 'best', 'average']).map((o) => ({ ...o, label: o.label[0].toUpperCase() + o.label.slice(1) }))} />
          </FormField>
        </div>
      ),
    },
    {
      id: 'proctoring',
      title: 'Proctoring',
      content: (
        <RadioGroup
          aria-label="Proctoring mode"
          value={proctor}
          onChange={setProctor}
          options={[
            { value: 'open', label: 'Open', description: 'No proctoring. For practice and training.' },
            { value: 'ai', label: 'AI-only', description: 'Camera stills and short clips around flags; a reviewer checks flags afterwards.' },
            { value: 'record', label: 'Record & review', description: 'Records camera, screen and audio; a reviewer checks flagged moments.' },
            { value: 'live', label: 'Live', description: 'A proctor watches up to 12 candidates at once. ID check required.' },
          ]}
        />
      ),
    },
    { id: 'preview', title: 'Preview as candidate', content: <p className="yx-prc-p">Opens the test runner with a sample draw. Nothing is recorded.</p> },
  ];
  return (
    <PrcFrame page="Tests">
      <PageHeader title="Java Backend Developer · L2" description={`Draft v4 · ${mode}`} status={<Badge>Draft</Badge>} />
      <Stepper
        title="Build test"
        steps={steps}
        defaultCurrent={step === 'review' ? REVIEW_ID : step}
        review={{ title: 'Pre-publish checklist', description: 'Publishing creates an immutable version. Candidates already invited stay on v3.' }}
        finishLabel="Publish v4"
        onFinish={() => {}}
      />
      {step === 'review' && (
        <ul className="yx-prc-plain" aria-label="Publish checks">
          {checks.map((c) => (
            <li key={c.id}>
              <span>{c.label}</span>
              <Badge tone={c.ok ? 'success' : 'danger'}>{c.ok ? 'Ready' : 'Blocks publishing'}</Badge>
            </li>
          ))}
        </ul>
      )}
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-05 · Item analysis dashboard                                    */
/* ================================================================== */

export function ItemAnalysisScreen({ questions, state = 'ready' }: { questions: QuestionRow[]; state?: 'ready' | 'loading' | 'provisional' }) {
  // PRC-05
  const scored = questions.filter((q) => q.pCorrect != null);
  const [sel, setSel] = useState(scored[0]?.id ?? '');
  const item = scored.find((q) => q.id === sel);
  const loading = state === 'loading';
  return (
    <PrcFrame page="Item analysis">
      <PageHeader
        title="Item analysis"
        description="Java Backend Developer · L2, v3 · 842 attempts · data as of today 2:00 am"
        actions={<Select aria-label="Test" value="T-21" onChange={() => {}} options={[{ value: 'T-21', label: 'Java Backend Developer · L2' }, { value: 'T-22', label: 'Campus aptitude 2026' }]} size="sm" />}
      />
      {state === 'provisional' && <InlineAlert tone="info" title="Provisional statistics">Fewer than 200 attempts. Reliability and IRT parameters appear once the minimum is reached; scores use authored difficulty.</InlineAlert>}
      <div className="yx-prc-grid4">
        <StatCard label="Reliability (Cronbach's α)" value={0.84} previous={0.81} previousLabel="v2" drill={{ label: 'How it is computed', href: '#alpha' }} loading={loading} />
        <StatCard label="Attempts" value={842} drill={{ label: 'View attempts', href: '#attempts' }} loading={loading} />
        <StatCard label="Mean scaled score" value={58} previous={55} previousLabel="v2" drill={{ label: 'View distribution', href: '#dist' }} loading={loading} />
        <StatCard label="Items flagged" value={3} drill={{ label: 'View flagged items', href: '#flagged' }} loading={loading} />
      </div>
      <div className="yx-prc-grid2">
        <BarChart title="Score distribution" description="Scaled score bands, all attempts" categories={['0–19', '20–39', '40–59', '60–79', '80–100']} series={[{ name: 'Candidates', values: [38, 164, 302, 251, 87] }]} loading={loading} />
        <Heatmap title="Section correlation" columns={['Aptitude', 'Java', 'SQL']} rows={[{ label: 'Aptitude', values: [1, 0.42, 0.38] }, { label: 'Java', values: [0.42, 1, 0.55] }, { label: 'SQL', values: [0.38, 0.55, 1] }]} max={1} format={(v) => v.toFixed(2)} loading={loading} />
      </div>
      <DataTable
        label="Items"
        columns={[
          { key: 'id', header: 'Item', type: 'id', value: (r: QuestionRow) => r.id, width: 90 },
          { key: 'stem', header: 'Question', value: (r: QuestionRow) => r.stem, width: 300 },
          { key: 'p', header: 'p', type: 'number', value: (r: QuestionRow) => r.pCorrect, render: (r) => r.pCorrect?.toFixed(2), width: 70 },
          { key: 'r', header: 'r', type: 'number', value: (r: QuestionRow) => r.discrimination, render: (r) => r.discrimination?.toFixed(2), width: 70 },
          { key: 'exp', header: 'Exposure', type: 'number', value: (r: QuestionRow) => Math.round((r.exposure ?? 0) * 100), render: (r) => `${Math.round((r.exposure ?? 0) * 100)} %`, width: 100 },
          { key: 'dif', header: 'DIF', value: (r: QuestionRow) => r.dif ?? '—', width: 70 },
          {
            key: 'flag',
            header: 'Flags',
            value: (r: QuestionRow) => [r.discrimination != null && r.discrimination < 0.2 ? 'Weak discrimination' : '', (r.exposure ?? 0) > 0.3 ? 'Over exposure cap' : '', r.dif === 'C' ? 'Large DIF' : ''].filter(Boolean).join(', ') || 'None',
            width: 220,
          },
        ]}
        rows={scored}
        getRowId={(r) => r.id}
        state={loading ? 'loading' : 'ready'}
        onRowClick={(r) => setSel(r.id)}
        activeRowId={sel}
      />
      {item && !loading && (
        <div className="yx-prc-grid2">
          <BarChart title={`Distractors · ${item.id}`} description="Share of candidates choosing each option; the key is B" categories={['A', 'B (key)', 'C', 'D', 'Skipped']} series={[{ name: 'Top 27 %', values: [4, 82, 9, 3, 2] }, { name: 'Bottom 27 %', values: [21, 38, 27, 9, 5] }]} emphasis="Top 27 %" />
          <LineChart title={`Item characteristic curve · ${item.id}`} description="2PL: a = 1.2, b = 0.1, calibrated on 842 responses" categories={['−3', '−2', '−1', '0', '1', '2', '3']} series={[{ name: 'Chance of a correct answer (%)', values: [3, 10, 27, 52, 77, 91, 97] }]} xLabel="Ability (θ)" />
        </div>
      )}
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-06 · Candidate score report                                     */
/* ================================================================== */

export function ScoreReportScreen({ held = false, viewer = 'owner', adaptive = false }: { held?: boolean; viewer?: 'owner' | 'recruiter'; adaptive?: boolean }) {
  // PRC-06
  const sections = [
    { name: 'Aptitude', score: 45, cutoff: 50 },
    { name: 'Java', score: 81, cutoff: 60 },
    { name: 'SQL', score: 74 },
  ];
  const outcome = overallOutcome(72, 60, sections);
  return (
    <PrcFrame page="Results & reports">
      <ObjectHeader
        name={PEOPLE.candidate}
        person
        secondary="Java Backend Developer · L2, v3 · Backend hiring Q3"
        status={held ? <Badge tone="warning">Result held: incident open</Badge> : outcome.pass ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Not passed</Badge>}
        facts={[
          { label: 'Submitted', value: '28 Sep 2026, 11:52 am' },
          { label: 'Form', value: adaptive ? 'Adaptive path, 19 items' : 'Form B (equated)' },
          { label: 'Integrity', value: held ? 'Under review' : 'Clear, 92 / 100' },
          { label: 'Release', value: held ? 'Held' : 'Released 28 Sep' },
        ]}
        actions={
          <>
            <Button icon={Download}>Session report PDF</Button>
            <Button variant="primary" disabled={held}>
              Move to next stage
            </Button>
          </>
        }
      />
      {held && (
        <InlineAlert tone="warning" title="Held while INC-5521 is open">
          Nothing is released and no hiring stage moves until the incident is closed. The candidate sees "Result under review".
        </InlineAlert>
      )}
      <div className="yx-prc-grid4">
        <StatCard label="Scaled score" value={72} unit="/ 100" drill={{ label: 'How scaling works', href: '#scaled' }} />
        <StatCard label="Percentile (this drive)" value={81} unit="th" drill={{ label: 'View cohort', href: '#cohort' }} />
        <div className="yx-prc-box">
          <span className="yx-prc-muted yx-prc-small">Band</span>
          <strong>Meets</strong>
          <span className="yx-prc-small">Below &lt; 50 · Meets 50–74 · Strong 75+</span>
        </div>
        {viewer === 'owner' ? (
          <div className="yx-prc-box">
            <span className="yx-prc-muted yx-prc-small">{adaptive ? 'Ability estimate (θ ± SE)' : 'Raw marks (admins only)'}</span>
            <strong className="yx-prc-mono">{adaptive ? '0.62 ± 0.28' : '58 / 80'}</strong>
          </div>
        ) : (
          <div className="yx-prc-box">
            <span className="yx-prc-muted yx-prc-small">Raw marks</span>
            <span className="yx-prc-small">Not shown to recruiters. Rank candidates on the scaled score.</span>
          </div>
        )}
      </div>
      <div className="yx-prc-grid2">
        <Card title="Sections and cut-offs">
          <ul className="yx-prc-plain">
            {sections.map((s) => (
              <li key={s.name}>
                <span>{s.name}</span>
                <span className="yx-prc-mono">
                  {s.score} %{s.cutoff != null && ` · cut-off ${s.cutoff} %`}
                </span>
                {s.cutoff == null ? <Badge>No cut-off</Badge> : s.score >= s.cutoff ? <Badge tone="success">Met</Badge> : <Badge tone="danger">Not met</Badge>}
              </li>
            ))}
          </ul>
          {!outcome.pass && <p className="yx-prc-small">Overall 72 is above the pass mark of 60, but the {outcome.failed.join(', ')} cut-off was not met, so the result is "not passed".</p>}
        </Card>
        <BarChart title="Skill breakdown" orientation="horizontal" categories={['Streams API', 'Collections', 'SQL joins', 'Percentages', 'Logical reasoning']} series={[{ name: 'Score %', values: [84, 78, 74, 48, 42] }]} valueLabels />
      </div>
      <Card title="What the candidate sees">
        <div className="yx-prc-grid3">
          <Switch label="Status (pass / not passed / under review)" defaultChecked />
          <Switch label="Band" defaultChecked />
          <Switch label="Scaled score" />
          <Switch label="Percentile" />
          <Switch label="Skill breakdown" />
          <Switch label="Correct answers" disabled description="Hiring tests never show answers" />
        </div>
      </Card>
      <Meter value={72} max={100} label="Scaled score against pass mark 60" warnAt={60} />
      <PersonLabel name={PEOPLE.owner} secondary="Test owner" />
    </PrcFrame>
  );
}
