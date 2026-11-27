// Batch G2 item 74 (M09 Q3, Q8; answer 2604): ENG-04 surveys list and builder, ENG-05 take a survey, ENG-06 results and
// ENG-07 action plans with real records, drawn in the designed layouts. The designed screens (engage-surveys.tsx)
// render these when given `live`.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Lock, Plus, Send, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Meter, NoAccessState, Skeleton } from '../../components/feedback';
import { Card, PageHeader } from '../../components/shell';
import { Heatmap } from '../../components/charts';
import { DataTable, type TableColumn } from '../../components/table';
import { Stepper } from '../../components/stepper';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Segment } from '../../components/segment';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { EnpsScale, GrowthFrame, SplitLayout, SuppressedNotice } from './growth-kit';

export type LiveQuestionKind = 'enps' | 'rating' | 'single' | 'multiple' | 'text';
export interface LiveQuestion {
  id: string;
  text: string;
  kind: LiveQuestionKind;
  options?: string[];
  theme?: string;
}
export type SurveyType = 'engagement' | 'pulse' | 'enps' | 'onboarding' | 'exit';
const KIND_WORDS: Record<LiveQuestionKind, string> = { enps: 'eNPS (0–10)', rating: 'Rating (1–5)', single: 'Single choice', multiple: 'Multiple choice', text: 'Text' };
const TYPE_WORDS: Record<SurveyType, string> = { engagement: 'Engagement', pulse: 'Pulse', enps: 'eNPS', onboarding: 'Onboarding', exit: 'Exit' };
const STATUS_WORDS = { draft: 'Draft', scheduled: 'Scheduled', open: 'Open', closed: 'Closed' } as const;
const day = (s: string) => new Date(`${s}T00:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function Hr({ children, active = 'Surveys', persona = 'hr' }: { children: React.ReactNode; active?: string; persona?: 'hr' | 'mgr' | 'emp' }) {
  return (
    <GrowthFrame area="engage" active={active} persona={persona}>
      {children}
    </GrowthFrame>
  );
}

/* ------------------------------------------------------------------ ENG-04 list */

export interface LiveSurveyRow {
  id: string;
  name: string;
  type: SurveyType;
  anonymous: boolean;
  audience: string;
  status: keyof typeof STATUS_WORDS;
  invited: number;
  responded: number;
  opensOn: string;
  closesOn: string;
}
export interface LiveSurveysList {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  rows: LiveSurveyRow[];
  /** HR only; a manager's list (their team results) has no New survey. */
  onNew?: () => void;
  onOpen: (row: LiveSurveyRow) => void;
}

export function LiveSurveysListScreen({ live }: { live: LiveSurveysList }) {
  if (live.state === 'no-access')
    return (
      <Hr>
        <PageHeader title="Surveys" />
        <NoAccessState what="company surveys" grantedBy="your System Admin" />
      </Hr>
    );
  const cols: TableColumn<LiveSurveyRow>[] = [
    { key: 'name', header: 'Survey', value: (r) => r.name, width: 280 },
    { key: 'type', header: 'Type', value: (r) => TYPE_WORDS[r.type], groupable: true, width: 130 },
    { key: 'anon', header: 'Answers', value: (r) => (r.anonymous ? 'Anonymous' : 'Named'), width: 120 },
    { key: 'aud', header: 'Audience', value: (r) => r.audience, width: 200 },
    { key: 'rate', header: 'Responses', type: 'number', value: (r) => (r.invited ? r.responded / r.invited : 0), render: (r) => (r.invited ? `${r.responded} of ${r.invited} · ${Math.round((r.responded / r.invited) * 100)}%` : '—'), width: 170 },
    { key: 'closes', header: 'Closes', type: 'date', value: (r) => day(r.closesOn), width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => STATUS_WORDS[r.status], statusTone: (v) => (v === 'Open' ? 'success' : v === 'Scheduled' ? 'info' : 'neutral'), width: 120 },
  ];
  return (
    <Hr>
      <PageHeader title="Surveys" description="Anonymous surveys never store who answered what. Results show only for groups of the smallest size or more." actions={live.onNew && <Button variant="primary" icon={Plus} onClick={live.onNew}>New survey</Button>} />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the surveys." description="Try again in a moment." onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Surveys"
          columns={cols}
          rows={live.rows}
          getRowId={(r) => r.id}
          state={live.state === 'loading' ? 'loading' : 'ready'}
          onRowClick={live.onOpen}
          rowButtons={(r) => <Button size="sm" onClick={() => live.onOpen(r)}>{r.status === 'draft' ? 'Edit' : 'Results'}</Button>}
          empty={<EmptyState title="No surveys yet" description={live.onNew ? 'Start from a template: engagement, pulse, eNPS, onboarding or exit.' : 'Your team’s results show here once a survey has answers from your team.'} action={live.onNew && <Button icon={Plus} onClick={live.onNew}>New survey</Button>} />}
        />
      )}
    </Hr>
  );
}

/* ------------------------------------------------------------------ ENG-04 builder */

export interface SurveyInput {
  name: string;
  type: SurveyType;
  anonymous: boolean;
  minGroup: number;
  questions: LiveQuestion[];
  locationIds: string[];
  departmentIds: string[];
  /** T2-G 42: the company's groups in the audience. */
  groupIds?: string[];
  opensOn: string;
  closesOn: string;
  remind: boolean;
  /** Answer 2664: repeat every month or quarter; onboarding and exit surveys may invite people automatically instead. */
  repeat?: 'none' | 'monthly' | 'quarterly';
  autoInvite?: boolean;
  autoAfterDays?: number;
}
export interface LiveSurveyBuilder {
  options: { starters: Record<SurveyType, LiveQuestion[]>; minGroup: number; locations: { id: string; name: string }[]; departments: { id: string; name: string }[]; groups?: { id: string; name: string }[] } | null;
  /** A draft being changed. */
  initial?: SurveyInput & { id: string };
  today: Date;
  onSave: (input: SurveyInput, id?: string) => Promise<{ id: string }>;
  onLaunch: (id: string) => Promise<{ invited: number }>;
  onDone: () => void;
}

export function LiveSurveyBuilderScreen({ live }: { live: LiveSurveyBuilder }) {
  const { toast } = useToast();
  const o = live.options;
  const init = live.initial;
  const [id, setId] = useState<string | undefined>(init?.id);
  const [type, setType] = useState<SurveyType>(init?.type ?? 'pulse');
  const lifecycle = type === 'onboarding' || type === 'exit';
  const [name, setName] = useState(init?.name ?? '');
  const [questions, setQuestions] = useState<LiveQuestion[]>(init?.questions ?? o?.starters.pulse ?? []);
  const [anon, setAnon] = useState(init ? init.anonymous : true);
  const [min, setMin] = useState<string>(String(init?.minGroup ?? o?.minGroup ?? 5));
  const [audience, setAudience] = useState<string[]>(init ? [...init.locationIds.map((x) => `loc:${x}`), ...init.departmentIds.map((x) => `dep:${x}`), ...(init.groupIds ?? []).map((x) => `grp:${x}`)] : ['everyone']);
  const [opens, setOpens] = useState<Date | null>(init ? day(init.opensOn) : live.today);
  const [closes, setCloses] = useState<Date | null>(init ? day(init.closesOn) : null);
  const [remind, setRemind] = useState(init?.remind ?? true);
  const [repeat, setRepeat] = useState<'none' | 'monthly' | 'quarterly'>(init?.repeat ?? 'none');
  const [auto, setAuto] = useState(init?.autoInvite ?? false);
  const [autoDays, setAutoDays] = useState<string>(String(init?.autoAfterDays ?? 30));
  const [newQ, setNewQ] = useState('');
  const [newKind, setNewKind] = useState<LiveQuestionKind>('rating');
  const [newOptions, setNewOptions] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const namedOk = type === 'onboarding' || type === 'exit';
  const early = useTooEarly([
    ...(name.trim().length < 3 ? [{ fieldId: 'sv-name', message: 'Name the survey (at least 3 letters).' }] : []),
    ...(!questions.length ? [{ fieldId: 'sv-q', message: 'Add at least one question.' }] : []),
    ...(!closes ? [{ fieldId: 'sv-closes', message: 'Choose the closing day.' }] : []),
    ...(opens && closes && closes < opens ? [{ fieldId: 'sv-closes', message: 'The survey must close on or after the day it opens.' }] : []),
  ]);
  if (!o)
    return (
      <Hr>
        <Skeleton height={400} />
      </Hr>
    );
  const pickType = (t: string) => {
    const next = t as SurveyType;
    setType(next);
    setQuestions(o.starters[next]);
    if (!(next === 'onboarding' || next === 'exit')) setAnon(true);
  };
  const move = (i: number, by: -1 | 1) =>
    setQuestions((xs) => {
      const j = i + by;
      if (j < 0 || j >= xs.length) return xs;
      const n = [...xs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const choice = newKind === 'single' || newKind === 'multiple';
  const opts = newOptions.split('\n').map((x) => x.trim()).filter(Boolean);
  const addQuestion = () => {
    if (newQ.trim().length < 3 || (choice && opts.length < 2)) return;
    setQuestions((xs) => [...xs, { id: `q${Date.now().toString(36)}`, text: newQ.trim(), kind: newKind, ...(choice ? { options: opts } : {}) }]);
    setNewQ('');
    setNewOptions('');
  };
  const library = Object.values(o.starters).flat().filter((l, i, all) => all.findIndex((x) => x.id === l.id && x.text === l.text) === i && !questions.some((q) => q.text === l.text));
  const input = (): SurveyInput => {
    const everyone = audience.includes('everyone');
    return { name: name.trim(), type, anonymous: namedOk ? anon : true, minGroup: Number(min), questions, locationIds: everyone ? [] : audience.filter((x) => x.startsWith('loc:')).map((x) => x.slice(4)), departmentIds: everyone ? [] : audience.filter((x) => x.startsWith('dep:')).map((x) => x.slice(4)), groupIds: everyone ? [] : audience.filter((x) => x.startsWith('grp:')).map((x) => x.slice(4)), opensOn: iso(opens ?? live.today), closesOn: iso(closes!), remind, ...(lifecycle ? { repeat: 'none' as const, autoInvite: auto, autoAfterDays: Number(autoDays) || 0 } : { repeat, autoInvite: false }) };
  };
  const save = async (launch: boolean) => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      const out = await live.onSave(input(), id);
      setId(out.id);
      if (launch) {
        const r = await live.onLaunch(out.id);
        toast({ tone: 'success', title: `Survey launched to ${r.invited} people.` });
      } else toast({ tone: 'success', title: 'Draft saved.' });
      live.onDone();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Hr>
      <PageHeader title={name.trim() ? `New survey · ${name.trim()}` : 'New survey'} />
      {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
      <Stepper
        title="New survey"
        defaultCurrent="template"
        onSaveAndExit={() => void save(false)}
        review={{ title: 'Review and launch', description: 'The anonymity mode can’t change after launch.' }}
        finishLabel="Launch survey"
        finishing={busy}
        onFinish={() => void save(true)}
        steps={[
          {
            id: 'template',
            title: 'Template',
            description: 'Type and starting questions',
            content: (
              <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
                <FormField id="sv-name" label="Survey name" required error={early.errorOf('sv-name')}>
                  <TextField value={name} onChange={setName} maxLength={150} />
                </FormField>
                <RadioGroup
                  aria-label="Template"
                  value={type}
                  onChange={pickType}
                  options={[
                    { value: 'engagement', label: 'Engagement (yearly)', description: 'Pride, clarity, manager, growth, recognition and a comment' },
                    { value: 'pulse', label: 'Pulse (monthly)', description: '5 short questions' },
                    { value: 'enps', label: 'eNPS (quarterly)', description: '1 question and a comment' },
                    { value: 'onboarding', label: 'Onboarding', description: 'May be named' },
                    { value: 'exit', label: 'Exit', description: 'May be named' },
                  ]}
                />
              </div>
            ),
            summary: <Text>{TYPE_WORDS[type]}</Text>,
          },
          {
            id: 'questions',
            title: 'Questions',
            description: `${questions.length} questions`,
            content: (
              <div className="yx-growth-builder">
                <Card title="Question library">
                  <ul className="yx-growth-list">
                    {library.map((l) => (
                      <li key={`${l.id}-${l.text}`} className="yx-growth-list__item">
                        <span className="yx-growth-grow">
                          {l.text} <span className="yx-growth-meta">· {l.theme}</span>
                        </span>
                        <IconButton icon={Plus} label={`Add “${l.text}”`} size="sm" onClick={() => setQuestions((xs) => [...xs, { ...l, id: xs.some((x) => x.id === l.id) ? `${l.id}-${xs.length}` : l.id }])} />
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card title="This survey">
                  <div id="sv-q" tabIndex={-1} className="yx-growth-stack">
                    {early.errorOf('sv-q') && <InlineAlert tone="danger">{early.errorOf('sv-q')}</InlineAlert>}
                    {questions.length === 0 ? (
                      <EmptyState compact title="Add questions from the library" />
                    ) : (
                      <ol className="yx-growth-list">
                        {questions.map((q, i) => (
                          <li key={q.id} className="yx-growth-list__item">
                            <div className="yx-growth-list__main">
                              <span className="yx-growth-list__title">
                                {i + 1}. {q.text}
                              </span>
                              <span className="yx-growth-meta">{KIND_WORDS[q.kind]}</span>
                            </div>
                            <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                            <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={i === questions.length - 1} onClick={() => move(i, 1)} />
                            <IconButton icon={Trash2} label={`Remove question ${i + 1}`} size="sm" onClick={() => setQuestions((xs) => xs.filter((x) => x.id !== q.id))} />
                          </li>
                        ))}
                      </ol>
                    )}
                    <FormField label="Write a new question" helper={choice ? 'One option a line, at least 2.' : undefined}>
                      <TextField value={newQ} onChange={setNewQ} maxLength={300} />
                    </FormField>
                    <Select aria-label="Question kind" value={newKind} onChange={(v) => setNewKind((v ?? 'rating') as LiveQuestionKind)} options={(Object.keys(KIND_WORDS) as LiveQuestionKind[]).map((k) => ({ value: k, label: KIND_WORDS[k] }))} />
                    {choice && <TextArea aria-label="Options" value={newOptions} onChange={setNewOptions} rows={3} />}
                    <Button size="sm" icon={Plus} onClick={addQuestion}>
                      Add question
                    </Button>
                  </div>
                </Card>
                <Card title="Preview" className="yx-growth-builder__preview">
                  <Text size="sm" tone="secondary">
                    {anon || !namedOk ? `Your answers are anonymous. Results show only for groups of ${min} or more.` : 'Your name is shown with your answers.'}
                  </Text>
                  <ol className="yx-growth-list">
                    {questions.map((q, i) => (
                      <li key={q.id} className="yx-growth-list__item">
                        <span>
                          {i + 1}. {q.text} <span className="yx-growth-meta">({KIND_WORDS[q.kind]})</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>
            ),
            summary: <Text>{questions.length} questions</Text>,
          },
          {
            id: 'audience',
            title: 'Audience and schedule',
            description: 'Who, when, reminders',
            content: (
              <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
                <FormField label="Audience">
                  <MultiSelect
                    value={audience}
                    onChange={(a) => setAudience(a.includes('everyone') && !audience.includes('everyone') ? ['everyone'] : a.filter((x) => x !== 'everyone' || a.length === 1))}
                    options={[{ value: 'everyone', label: 'Everyone' }, ...o.locations.map((l) => ({ value: `loc:${l.id}`, label: `Location: ${l.name}` })), ...o.departments.map((d) => ({ value: `dep:${d.id}`, label: `Department: ${d.name}` })), ...(o.groups ?? []).map((g) => ({ value: `grp:${g.id}`, label: `Group: ${g.name}` }))]}
                  />
                </FormField>
                <FieldRow>
                  <FormField label="Opens">
                    <DatePicker value={opens} onChange={setOpens} min={live.today} />
                  </FormField>
                  <FormField id="sv-closes" label="Closes" required error={early.errorOf('sv-closes')}>
                    <DatePicker value={closes} onChange={setCloses} min={opens ?? live.today} />
                  </FormField>
                </FieldRow>
                <Checkbox checked={remind} onChange={setRemind} label="Remind people who haven’t answered, 3 days before closing" description="Reminders use only whether someone answered, never what they said." />
                {lifecycle ? (
                  <>
                    <Checkbox checked={auto} onChange={setAuto} label={type === 'onboarding' ? 'Send it to each new joiner automatically' : 'Send it to each person whose resignation is accepted'} description="It stays open until it closes; each person is invited once." />
                    {auto && type === 'onboarding' && (
                      <FormField label="Days after joining">
                        <Select value={autoDays} onChange={(v) => setAutoDays(v ?? '30')} options={['0', '7', '30', '60', '90'].map((v) => ({ value: v, label: v === '0' ? 'On the joining day' : `${v} days` }))} />
                      </FormField>
                    )}
                  </>
                ) : (
                  <FormField label="Repeat" helper="Each run is its own survey with its own results, sent to the audience of the day.">
                    <Segment<'none' | 'monthly' | 'quarterly'> label="Repeat" value={repeat} onChange={setRepeat} options={[{ value: 'none', label: 'Once' }, { value: 'monthly', label: 'Every month' }, { value: 'quarterly', label: 'Every quarter' }]} />
                  </FormField>
                )}
              </div>
            ),
            summary: <Text>{audience.includes('everyone') ? 'Everyone' : `${audience.length} groups`} · {opens ? formatDate(opens) : ''}–{closes ? formatDate(closes) : ''}</Text>,
          },
          {
            id: 'anonymity',
            title: 'Anonymity',
            description: 'Locked after launch',
            content: (
              <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
                <RadioGroup
                  aria-label="Anonymity"
                  value={anon || !namedOk ? 'anonymous' : 'named'}
                  onChange={(v) => setAnon(v === 'anonymous')}
                  options={[
                    { value: 'anonymous', label: 'Anonymous', description: 'No identity stored with answers. Nobody, including HR admins, can see individual answers.' },
                    { value: 'named', label: 'Named', description: 'Allowed for onboarding and exit surveys only.', disabled: !namedOk },
                  ]}
                />
                <FormField label="Smallest group shown" helper="Results for smaller groups are hidden. 3 to 10.">
                  <Select value={min} onChange={(v) => setMin(v ?? '5')} options={['3', '4', '5', '6', '7', '8', '9', '10'].map((v) => ({ value: v, label: v }))} />
                </FormField>
                <InlineAlert tone="info" title="Shown to employees before they answer">
                  {anon || !namedOk ? `“This survey is anonymous. Results are shown only for groups of ${min} or more.”` : '“This survey is named: HR sees your answers with your name.”'}
                </InlineAlert>
              </div>
            ),
            summary: <Text>{anon || !namedOk ? `Anonymous · groups of ${min}+` : 'Named'}</Text>,
          },
        ]}
      />
    </Hr>
  );
}

/* ------------------------------------------------------------------ ENG-05 take */

export interface LiveTakeSurvey {
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  survey: { id: string; name: string; anonymous: boolean; minGroup: number; closesOn: string; closed: boolean; answered: boolean; questions: LiveQuestion[] } | null;
  onSend: (answers: Record<string, string | number | string[]>) => Promise<unknown>;
}

function ZeroToTenLive({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) {
  return (
    <RadioGroup aria-label={label} orientation="horizontal" value={value != null ? String(value) : ''} onChange={(v) => onChange(Number(v))} options={Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: String(i) }))} />
  );
}

export function LiveTakeSurveyScreen({ live }: { live: LiveTakeSurvey }) {
  const { toast } = useToast();
  const s = live.survey;
  const [answers, setAnswers] = useState<Record<string, string | number | string[]>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  if (live.state === 'error')
    return (
      <Hr persona="emp">
        <ErrorState title="We couldn't load the survey." description="Try again in a moment." onRetry={live.onRetry} />
      </Hr>
    );
  if (!s)
    return (
      <Hr persona="emp">
        <Skeleton height={400} />
      </Hr>
    );
  const set = (id: string, v: string | number | string[]) => setAnswers((a) => ({ ...a, [id]: v }));
  const answered = s.questions.filter((q) => answers[q.id] != null && answers[q.id] !== '' && !(Array.isArray(answers[q.id]) && (answers[q.id] as string[]).length === 0)).length;
  const send = async () => {
    if (!answered) return setFailed('Answer at least one question.');
    setBusy(true);
    setFailed(null);
    try {
      const out = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
      await live.onSend(out);
      toast({ tone: 'success', title: 'Thank you, your answers are in.' });
      setDone(true);
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const body = s.closed ? (
    <EmptyState title="This survey has closed" description={`It closed on ${formatDate(day(s.closesOn))}. Results are shared by HR once they’re ready.`} />
  ) : done || s.answered ? (
    <InlineAlert tone="success" title="Thank you, your answers are in">
      {s.anonymous ? 'They are stored without your name. We only record that you took part, so you don’t get reminders.' : 'HR sees your answers with your name, as the survey said.'}
    </InlineAlert>
  ) : (
    <div className="yx-growth-stack">
      {failed && <InlineAlert tone="danger" title="Not sent">{failed}</InlineAlert>}
      <InlineAlert tone="info" title={s.anonymous ? 'This survey is anonymous' : 'This survey is named'}>
        {s.anonymous ? `Your name isn’t stored with your answers. Results show only for groups of ${s.minGroup} or more people.` : 'Your name is shown with your answers to HR.'}
      </InlineAlert>
      <Meter label="Answered" value={answered} max={s.questions.length} valueText={`${answered} of ${s.questions.length} answered`} />
      {s.questions.map((q, i) => (
        <section key={q.id} className="yx-growth-question" aria-labelledby={`${q.id}-t`}>
          <span className="yx-growth-question__n">
            Question {i + 1} of {s.questions.length}
          </span>
          <h2 id={`${q.id}-t`} className="yx-growth-h">
            {q.text}
          </h2>
          {q.kind === 'enps' && <ZeroToTenLive label={q.text} value={(answers[q.id] as number) ?? null} onChange={(v) => set(q.id, v)} />}
          {q.kind === 'rating' && (
            <RadioGroup aria-label={q.text} orientation="horizontal" value={answers[q.id] != null ? String(answers[q.id]) : ''} onChange={(v) => set(q.id, Number(v))} options={['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'].map((l, j) => ({ value: String(j + 1), label: l }))} />
          )}
          {q.kind === 'single' && <RadioGroup aria-label={q.text} value={(answers[q.id] as string) ?? ''} onChange={(v) => set(q.id, v)} options={(q.options ?? []).map((o) => ({ value: o, label: o }))} />}
          {q.kind === 'multiple' && (
            <div className="yx-growth-stack" data-gap="sm" role="group" aria-label={q.text}>
              {(q.options ?? []).map((o) => (
                <Checkbox key={o} label={o} checked={((answers[q.id] as string[]) ?? []).includes(o)} onChange={(c) => set(q.id, c ? [...((answers[q.id] as string[]) ?? []), o] : ((answers[q.id] as string[]) ?? []).filter((x) => x !== o))} />
              ))}
            </div>
          )}
          {q.kind === 'text' && (
            <>
              <TextArea aria-label={q.text} rows={3} maxLength={2000} value={(answers[q.id] as string) ?? ''} onChange={(v) => set(q.id, v)} />
              {s.anonymous && <Text size="sm" tone="secondary">Avoid names or details that could identify you.</Text>}
            </>
          )}
        </section>
      ))}
    </div>
  );
  return (
    <Hr persona="emp">
      <PageHeader
        title={s.name}
        description={`${s.questions.length} questions · closes ${formatDate(day(s.closesOn))}`}
        status={s.anonymous ? <Badge tone="info"><Icon icon={Lock} /> Anonymous</Badge> : <Badge>Named</Badge>}
        actions={!done && !s.answered && !s.closed && <Button variant="primary" icon={Send} loading={busy} onClick={() => void send()}>Send answers</Button>}
      />
      <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
        {body}
      </div>
    </Hr>
  );
}

/* ------------------------------------------------------------------ ENG-06 results */

export interface LiveResultsData {
  name: string;
  minGroup: number;
  responded: number;
  invited?: number;
  suppressed: boolean;
  enps: { score: number | null; promoters: number; passives: number; detractors: number; n: number } | null;
  themes: { theme: string; favourable: number | null }[];
  choices: { question: string; counts: { option: string; count: number }[] }[];
  departments?: { id: string; name: string; size: number; shown: boolean }[];
  heat?: { label: string; groupSize: number; values: (number | null)[] }[];
  plan?: { id: string } | null;
}
export interface LiveSurveyResults {
  persona: 'hr' | 'mgr';
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  data: LiveResultsData | null;
  department?: string | null;
  onDepartment?: (id: string | null) => void;
  onPlan?: () => void;
  onPlans?: () => void;
  /** Answer 2668: download the shown results as CSV (HR). */
  onExport?: () => Promise<unknown>;
}

export function LiveSurveyResultsScreen({ live }: { live: LiveSurveyResults }) {
  const d = live.data;
  if (live.state === 'no-access')
    return (
      <Hr persona={live.persona}>
        <PageHeader title="Survey results" />
        <NoAccessState what="company survey results" grantedBy="your System Admin" />
      </Hr>
    );
  if (live.state === 'error' || !d)
    return (
      <Hr persona={live.persona}>
        {live.state === 'error' ? <ErrorState title="We couldn't load the results." description="Try again in a moment." onRetry={live.onRetry} /> : <Skeleton height={400} />}
      </Hr>
    );
  const rate = d.invited ? Math.round((d.responded / d.invited) * 100) : null;
  return (
    <Hr persona={live.persona}>
      <PageHeader
        title={d.name}
        description={live.persona === 'mgr' ? 'Your team (your direct reports)' : 'All of the company'}
        facts={`${d.responded}${d.invited ? ` of ${d.invited}` : ''} responded${rate !== null ? ` (${rate}%)` : ''} · groups of ${d.minGroup}+ shown`}
        actions={
          <>
            {live.persona === 'hr' && d.departments && (
              <Select aria-label="Department" placeholder="All departments" clearable value={live.department ?? null} onChange={(v) => live.onDepartment?.(v)} options={d.departments.map((x) => ({ value: x.id, label: x.shown ? x.name : `${x.name} (fewer than ${d.minGroup})`, disabled: !x.shown }))} />
            )}
            {live.persona === 'hr' && live.onPlans && <Button onClick={live.onPlans}>Action plans</Button>}
            {live.persona === 'hr' && live.onExport && <ExportButton onExport={live.onExport} />}
            {live.persona === 'mgr' && !d.suppressed && live.onPlan && (
              <Button variant="primary" icon={Plus} onClick={live.onPlan}>
                {d.plan ? 'Open action plan' : 'Create action plan'}
              </Button>
            )}
          </>
        }
      />
      {d.suppressed ? (
        <SuppressedNotice what={live.persona === 'mgr' ? 'Team results' : 'Results'} min={d.minGroup} count={d.responded} />
      ) : (
        <>
          <div className="yx-growth-split">
            <div className="yx-growth-split__main">
              {d.enps && (
                <Card title="eNPS">
                  <EnpsScale score={d.enps.score} promoters={d.enps.promoters} passives={d.enps.passives} detractors={d.enps.detractors} />
                </Card>
              )}
              {d.choices.map((c) => (
                <Card key={c.question} title={c.question}>
                  <ul className="yx-growth-list">
                    {c.counts.map((x) => (
                      <li key={x.option} className="yx-growth-list__item">
                        <span className="yx-growth-grow">{x.option}</span>
                        <span className="yx-growth-num">{x.count}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
            <aside className="yx-growth-split__side">
              {rate !== null && (
                <Card title="Response rate">
                  <Meter label="Responded" value={d.responded} max={d.invited || 1} valueText={`${rate}%`} />
                </Card>
              )}
              <Card title="Favourable answers by theme">
                {d.themes.length ? (
                  <ul className="yx-growth-list">
                    {d.themes.map((t) => (
                      <li key={t.theme} className="yx-growth-list__item">
                        <span className="yx-growth-grow">{t.theme}</span>
                        <span className="yx-growth-num">{t.favourable === null ? '—' : `${t.favourable}%`}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Text tone="secondary">This survey has no rating questions.</Text>
                )}
              </Card>
            </aside>
          </div>
          {live.persona === 'hr' && d.heat && d.heat.length > 0 && (
            <Heatmap title="Favourable answers by department and theme" description={`Share who agreed or strongly agreed. Departments with fewer than ${d.minGroup} responses are hidden.`} xLabel="Department" columns={d.themes.map((t) => t.theme)} rows={d.heat} max={100} minGroupSize={d.minGroup} format={(v) => `${v}%`} />
          )}
        </>
      )}
    </Hr>
  );
}

/* ------------------------------------------------------------------ ENG-07 action plans */

export interface LivePlanItem {
  id: string;
  action: string;
  dueOn: string;
  done: boolean;
}
export interface LiveActionPlan {
  persona: 'mgr' | 'hr';
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  survey: string;
  /** Manager: the team's plan (null before it is made) and its themes to focus on. */
  plan?: { focus: string; focusScore: string | null; status: 'draft' | 'shared' | 'completed'; items: LivePlanItem[] } | null;
  focusOptions?: { label: string; score: string | null }[];
  dueOn: string;
  onSave?: (plan: { focus: string; focusScore?: string; status: 'draft' | 'shared' | 'completed'; items: LivePlanItem[] }) => Promise<unknown>;
  /** HR: every manager's plan. */
  plans?: { id: string; manager: string; focus: string; status: 'draft' | 'shared' | 'completed'; items: LivePlanItem[] }[];
  today: Date;
}

export function LiveActionPlanScreen({ live }: { live: LiveActionPlan }) {
  const { toast } = useToast();
  const [focus, setFocus] = useState<string | null>(live.plan?.focus ?? null);
  const [items, setItems] = useState<LivePlanItem[]>(live.plan?.items ?? []);
  const [draft, setDraft] = useState('');
  const [due, setDue] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const early = useTooEarly([...(!focus ? [{ fieldId: 'ap-focus', message: 'Choose the area to focus on.' }] : [])]);
  if (live.state === 'no-access' || live.state === 'error')
    return (
      <Hr persona={live.persona}>
        {live.state === 'no-access' ? <NoAccessState what="action plans" grantedBy="your System Admin" /> : <ErrorState title="We couldn't load the plan." description="Try again in a moment." onRetry={live.onRetry} />}
      </Hr>
    );
  if (live.state === 'loading')
    return (
      <Hr persona={live.persona}>
        <Skeleton height={300} />
      </Hr>
    );
  const status = (s: 'draft' | 'shared' | 'completed', overdue: boolean) => (s === 'draft' && overdue ? 'Overdue' : s === 'draft' ? 'Draft' : s === 'shared' ? 'Shared with team' : 'Completed');
  const overdue = day(live.dueOn) < live.today;
  if (live.persona === 'hr') {
    const plans = live.plans ?? [];
    return (
      <Hr>
        <PageHeader title={`Action plans · ${live.survey}`} description="Managers of teams with enough responses make a plan within 30 days of the survey closing." facts={`${plans.filter((p) => p.status !== 'draft').length} of ${plans.length} shared · due ${formatDate(day(live.dueOn))}`} />
        <DataTable
          label="Action plans"
          rows={plans}
          getRowId={(r) => r.id}
          empty={<EmptyState title="No action plans yet" description="Plans appear as managers make them from their team results." />}
          columns={[
            { key: 'owner', header: 'Manager', type: 'person', value: (r) => r.manager, person: (r) => ({ name: r.manager }), width: 200 },
            { key: 'focus', header: 'Focus', value: (r) => r.focus, width: 280 },
            { key: 'items', header: 'Actions done', type: 'number', value: (r) => r.items.filter((i) => i.done).length, render: (r) => `${r.items.filter((i) => i.done).length} of ${r.items.length}`, width: 130 },
            { key: 'status', header: 'Status', type: 'status', value: (r) => status(r.status, overdue), statusTone: (v) => (v === 'Completed' ? 'success' : v === 'Overdue' ? 'danger' : v === 'Draft' ? 'warning' : 'info'), width: 150 },
          ]}
        />
      </Hr>
    );
  }
  const plan = live.plan;
  const done = plan?.status === 'completed';
  const save = async (next: 'draft' | 'shared' | 'completed') => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      const score = live.focusOptions?.find((f) => f.label === focus)?.score ?? undefined;
      await live.onSave!({ focus: focus!, ...(score ? { focusScore: score } : {}), status: next, items });
      toast({ tone: 'success', title: next === 'shared' ? 'Plan shared with your team.' : next === 'completed' ? 'Plan marked complete.' : 'Plan saved.' });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    if (draft.trim().length < 2 || !due) return;
    setItems((xs) => [...xs, { id: `a${Date.now().toString(36)}`, action: draft.trim(), dueOn: iso(due), done: false }]);
    setDraft('');
    setDue(null);
  };
  return (
    <Hr persona="mgr">
      <PageHeader
        title={`Action plan · ${live.survey}`}
        status={<Badge tone={done ? 'success' : plan?.status === 'shared' ? 'info' : 'warning'}>{status(plan?.status ?? 'draft', overdue)}</Badge>}
        facts={`Due ${formatDate(day(live.dueOn))} (30 days after the survey closed)`}
        actions={
          !done && (
            <>
              <Button loading={busy} onClick={() => void save('draft')}>Save</Button>
              <Button icon={Check} loading={busy} onClick={() => void save('completed')}>Mark plan complete</Button>
              <Button variant="primary" icon={Send} loading={busy} onClick={() => void save('shared')}>Share with team</Button>
            </>
          )
        }
      />
      {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
      <SplitLayout
        main={
          <div className="yx-growth-stack">
            <Card title="Focus area">
              <FormField id="ap-focus" label="What to work on" required error={early.errorOf('ap-focus')}>
                <Select value={focus} onChange={setFocus} disabled={done} options={(live.focusOptions ?? []).map((f) => ({ value: f.label, label: f.score ? `${f.label} · ${f.score}` : f.label }))} />
              </FormField>
            </Card>
            <Card title={`Actions · ${items.filter((i) => i.done).length} of ${items.length} done`}>
              <ul className="yx-growth-list">
                {items.map((i) => (
                  <li key={i.id} className="yx-growth-list__item">
                    <Checkbox disabled={done} checked={i.done} onChange={(c) => setItems((xs) => xs.map((x) => (x.id === i.id ? { ...x, done: c } : x)))} label={i.action} description={`Due ${formatDate(day(i.dueOn))}`} />
                  </li>
                ))}
              </ul>
              {!done && (
                <FieldRow>
                  <FormField label="New action">
                    <TextField value={draft} onChange={setDraft} maxLength={300} />
                  </FormField>
                  <FormField label="Due">
                    <DatePicker value={due} onChange={setDue} min={live.today} />
                  </FormField>
                  <Button icon={Plus} onClick={add}>
                    Add
                  </Button>
                </FieldRow>
              )}
            </Card>
          </div>
        }
        side={
          <Card title="Your team’s results">
            <Text size="sm" tone="secondary">
              Shown because enough of your team answered. Individual answers are never shown.
            </Text>
          </Card>
        }
      />
    </Hr>
  );
}

/** Answer 2668: the shown results as CSV (groups below the smallest group are not in it). */
function ExportButton({ onExport }: { onExport: () => Promise<unknown> }) {
  const { toast } = useToast();
  return (
    <Button onClick={() => void onExport().then(() => toast({ tone: 'success', title: 'Results downloaded. Groups below the smallest group are not in it.' }), (e: unknown) => toast({ tone: 'error', title: errorText(e) }))}>
      Export CSV
    </Button>
  );
}
