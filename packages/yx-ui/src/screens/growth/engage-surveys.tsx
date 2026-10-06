// Engage surveys: list + builder (ENG-04), take survey / pulse / eNPS (ENG-05), results with small-group
// suppression (ENG-06), action plans (ENG-07).
import { useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Lock, Plus, Send, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { AiBadge, Badge, PersonLabel } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { Card, DescriptionList, PageHeader } from '../../components/shell';
import { Heatmap, LineChart, StatCard } from '../../components/charts';
import { DataTable, type TableColumn } from '../../components/table';
import { Stepper } from '../../components/stepper';
import { FieldRow, FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { formatDate } from '../../lib/format';
import { TODAY } from '../_kit/data';
import { EnpsScale, GrowthFrame, SplitLayout, SuppressedNotice, type Device } from './growth-kit';
import { actionPlanDue, canSlice, enps } from './growth-logic';
import type { LoadState } from './perf-goals';
import './growth.css';

export type QuestionKind = 'eNPS (0–10)' | 'Rating (1–5)' | 'Single choice' | 'Multiple choice' | 'Text';

export interface SurveyQuestion {
  id: string;
  text: string;
  kind: QuestionKind;
  options?: string[];
  theme?: string;
}

/* ================================================================== ENG-04 · Surveys list + builder */

export interface SurveyRow {
  id: string;
  name: string;
  type: 'Engagement' | 'Pulse' | 'eNPS' | 'Onboarding' | 'Exit';
  anonymity: 'Anonymous' | 'Named';
  audience: string;
  status: 'Draft' | 'Scheduled' | 'Open' | 'Closed';
  invited: number;
  responded: number;
  closes: Date | null;
}

/** ENG-04 Surveys list (T2): type, anonymity, audience, status and response rate. */
export function SurveysListScreen({ surveys, state = 'ready' }: { surveys: SurveyRow[]; state?: LoadState }) {
  const cols: TableColumn<SurveyRow>[] = [
    { key: 'name', header: 'Survey', value: (r) => r.name, width: 280 },
    { key: 'type', header: 'Type', value: (r) => r.type, groupable: true, width: 130 },
    { key: 'anon', header: 'Answers', value: (r) => r.anonymity, width: 120 },
    { key: 'aud', header: 'Audience', value: (r) => r.audience, width: 200 },
    { key: 'rate', header: 'Responses', type: 'number', value: (r) => (r.invited ? r.responded / r.invited : 0), render: (r) => (r.invited ? `${r.responded} of ${r.invited} · ${Math.round((r.responded / r.invited) * 100)}%` : '—'), width: 170 },
    { key: 'closes', header: 'Closes', type: 'date', value: (r) => r.closes, width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Open' ? 'success' : v === 'Scheduled' ? 'info' : 'neutral'), width: 120 },
  ];
  return (
    <GrowthFrame area="engage" active="Surveys" persona="hr">
      <PageHeader title="Surveys" description="Monthly pulse, quarterly eNPS and yearly engagement by default. Anonymous surveys never store who answered what." actions={<Button variant="primary" icon={Plus}>New survey</Button>} />
      <DataTable
        label="Surveys"
        columns={cols}
        rows={surveys}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : 'ready'}
        onRowClick={() => {}}
        empty={<EmptyState title="No surveys yet" description="Start from a template: engagement, pulse, eNPS, onboarding 30/60/90 or exit." />}
      />
    </GrowthFrame>
  );
}

const LIBRARY: SurveyQuestion[] = [
  { id: 'l1', text: 'How likely are you to recommend Kaveri Foods as a place to work?', kind: 'eNPS (0–10)', theme: 'eNPS' },
  { id: 'l2', text: 'I know what is expected of me at work.', kind: 'Rating (1–5)', theme: 'Clarity' },
  { id: 'l3', text: 'My manager gives me useful feedback.', kind: 'Rating (1–5)', theme: 'Manager' },
  { id: 'l4', text: 'I have the tools I need to do my job well.', kind: 'Rating (1–5)', theme: 'Enablement' },
  { id: 'l5', text: 'My workload this month was…', kind: 'Single choice', options: ['Too light', 'About right', 'Too heavy'], theme: 'Workload' },
  { id: 'l6', text: 'What one thing should we change?', kind: 'Text', theme: 'Open' },
];

/** ENG-04 Survey builder (T5): template, questions (library, list, preview), audience and schedule, anonymity (locked after launch). */
export function SurveyBuilderScreen({ defaultStep = 'questions', questions: q0 }: { defaultStep?: string; questions: SurveyQuestion[] }) {
  const [questions, setQuestions] = useState(q0);
  const [anon, setAnon] = useState('anonymous');
  const [min, setMin] = useState<number | null>(5);
  const [closes, setCloses] = useState<Date | null>(new Date(2026, 9, 12));
  const move = (i: number, by: -1 | 1) =>
    setQuestions((xs) => {
      const j = i + by;
      if (j < 0 || j >= xs.length) return xs;
      const n = [...xs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const preview = (
    <Card title="Preview" className="yx-growth-builder__preview">
      <Text size="sm" tone="secondary">
        {anon === 'anonymous' ? 'Your answers are anonymous. Results show only for groups of 5 or more.' : 'Your name is shown with your answers.'}
      </Text>
      <ol className="yx-growth-list">
        {questions.map((q, i) => (
          <li key={q.id} className="yx-growth-list__item">
            <span>
              {i + 1}. {q.text} <span className="yx-growth-meta">({q.kind})</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
  return (
    <GrowthFrame area="engage" active="Surveys" persona="hr">
      <PageHeader title="New survey · Monthly pulse, October 2026" />
      <Stepper
        title="New survey"
        defaultCurrent={defaultStep}
        onSaveAndExit={() => {}}
        review={{ title: 'Review and launch', description: 'The anonymity mode can’t change after launch.' }}
        finishLabel="Launch survey"
        steps={[
          {
            id: 'template',
            title: 'Template',
            description: 'Type and starting questions',
            content: (
              <RadioGroup
                aria-label="Template"
                defaultValue="pulse"
                options={[
                  { value: 'engagement', label: 'Engagement (yearly)', description: '30 questions across 8 themes' },
                  { value: 'pulse', label: 'Pulse (monthly)', description: '5 questions rotating from the library' },
                  { value: 'enps', label: 'eNPS (quarterly)', description: '1 question and a comment' },
                  { value: 'onboarding', label: 'Onboarding 30 / 60 / 90', description: 'Named; sent on the day after joining' },
                  { value: 'exit', label: 'Exit', description: 'Named; sent when a resignation is accepted' },
                ]}
              />
            ),
            summary: <Text>Pulse (monthly)</Text>,
          },
          {
            id: 'questions',
            title: 'Questions',
            description: `${questions.length} questions`,
            content: (
              <div className="yx-growth-builder">
                <Card title="Question library">
                  <ul className="yx-growth-list">
                    {LIBRARY.filter((l) => !questions.some((q) => q.id === l.id)).map((l) => (
                      <li key={l.id} className="yx-growth-list__item">
                        <span className="yx-growth-grow">
                          {l.text} <span className="yx-growth-meta">· {l.theme}</span>
                        </span>
                        <IconButton icon={Plus} label={`Add “${l.text}”`} size="sm" onClick={() => setQuestions((xs) => [...xs, l])} />
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card title="This survey">
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
                            <span className="yx-growth-meta">{q.kind}</span>
                          </div>
                          <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                          <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={i === questions.length - 1} onClick={() => move(i, 1)} />
                          <IconButton icon={Trash2} label={`Remove question ${i + 1}`} size="sm" onClick={() => setQuestions((xs) => xs.filter((x) => x.id !== q.id))} />
                        </li>
                      ))}
                    </ol>
                  )}
                  <Button size="sm" icon={Plus}>
                    Write a new question
                  </Button>
                </Card>
                {preview}
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
                <FormField label="Audience" helper="248 people">
                  <MultiSelect value={['all']} onChange={() => {}} options={[{ value: 'all', label: 'Everyone' }, { value: 'hosur', label: 'Hosur plant' }]} />
                </FormField>
                <FieldRow>
                  <FormField label="Opens">
                    <DatePicker value={new Date(2026, 9, 1)} onChange={() => {}} />
                  </FormField>
                  <FormField label="Closes">
                    <DatePicker value={closes} onChange={setCloses} />
                  </FormField>
                </FieldRow>
                <FormField label="Repeat">
                  <Select value="monthly" onChange={() => {}} options={[{ value: 'once', label: 'Once' }, { value: 'monthly', label: 'Every month' }, { value: 'quarterly', label: 'Every quarter' }]} />
                </FormField>
                <Checkbox defaultChecked label="Remind people who haven’t answered, 3 days before closing" description="Reminders use only whether someone answered, never what they said." />
              </div>
            ),
            summary: <Text>Everyone · 1–{formatDate(closes)} · monthly</Text>,
          },
          {
            id: 'anonymity',
            title: 'Anonymity',
            description: 'Locked after launch',
            content: (
              <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
                <RadioGroup
                  aria-label="Anonymity"
                  value={anon}
                  onChange={setAnon}
                  options={[
                    { value: 'anonymous', label: 'Anonymous', description: 'No identity stored with answers. Nobody, including HR admins, can see individual answers.' },
                    { value: 'named', label: 'Named', description: 'Allowed for onboarding, exit and feedback surveys only.', disabled: true },
                  ]}
                />
                <FormField label="Smallest group shown" helper="Results for smaller groups are hidden and roll up to the parent group. 3 to 10.">
                  <NumberField value={min} onChange={setMin} min={3} max={10} />
                </FormField>
                <InlineAlert tone="info" title="Shown to employees before they answer">
                  “This survey is anonymous. Results are shown only for groups of {min} or more.”
                </InlineAlert>
              </div>
            ),
            summary: <Text>Anonymous · groups of {min}+</Text>,
          },
        ]}
      />
    </GrowthFrame>
  );
}

/* ================================================================== ENG-05 · Take survey / pulse / eNPS */

function ZeroToTen({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) {
  return (
    <div className="yx-growth-stack" data-gap="sm">
      <div className="yx-growth-scale" role="radiogroup" aria-label={label}>
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            tabIndex={value === i || (value == null && i === 0) ? 0 : -1}
            className="yx-growth-scale__opt"
            onClick={() => onChange(i)}
            onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
              const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(10, i + 1) : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(0, i - 1) : null;
              if (next == null) return;
              e.preventDefault();
              onChange(next);
              (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
            }}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="yx-growth-scale__ends" aria-hidden="true">
        <span>0 · Not at all likely</span>
        <span>10 · Extremely likely</span>
      </div>
    </div>
  );
}

export interface TakeSurveyProps {
  device?: Device;
  title: string;
  anonymity: 'Anonymous' | 'Named';
  closes: Date;
  questions: SurveyQuestion[];
  submitted?: boolean;
  closed?: boolean;
  prefill?: boolean;
}

/** ENG-05 Take a survey (T4): anonymity shown first, 0–10 eNPS scale, ratings, choices, text; progress; thank-you. */
export function TakeSurveyScreen({ device = 'desktop', title, anonymity, closes, questions, submitted, closed, prefill }: TakeSurveyProps) {
  const [answers, setAnswers] = useState<Record<string, string | number>>(prefill ? { [questions[0].id]: 8 } : {});
  const [done, setDone] = useState(!!submitted);
  const answered = questions.filter((q) => answers[q.id] != null && answers[q.id] !== '').length;
  const body = closed ? (
    <EmptyState title="This survey has closed" description={`It closed on ${formatDate(closes)}. Results are shared by HR once they’re ready.`} />
  ) : done ? (
    <InlineAlert tone="success" title="Thank you, your answers are in">
      {anonymity === 'Anonymous' ? 'They are stored without your name. We only record that you took part, so you don’t get reminders.' : 'HR sees your answers with your name, as the survey said.'}
    </InlineAlert>
  ) : (
    <div className="yx-growth-stack">
      <InlineAlert tone="info" title={anonymity === 'Anonymous' ? 'This survey is anonymous' : 'This survey is named'}>
        {anonymity === 'Anonymous' ? 'Your name isn’t stored with your answers. Results show only for groups of 5 or more people.' : 'Your name is shown with your answers to HR and your manager.'}
      </InlineAlert>
      <Meter label="Answered" value={answered} max={questions.length} valueText={`${answered} of ${questions.length} answered`} />
      {questions.map((q, i) => (
        <section key={q.id} className="yx-growth-question" aria-labelledby={`${q.id}-t`}>
          <span className="yx-growth-question__n">
            Question {i + 1} of {questions.length}
          </span>
          <h2 id={`${q.id}-t`} className="yx-growth-h">
            {q.text}
          </h2>
          {q.kind === 'eNPS (0–10)' && <ZeroToTen label={q.text} value={(answers[q.id] as number) ?? null} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />}
          {q.kind === 'Rating (1–5)' && (
            <RadioGroup
              aria-label={q.text}
              orientation="horizontal"
              value={answers[q.id] != null ? String(answers[q.id]) : ''}
              onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: Number(v) }))}
              options={['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'].map((l, j) => ({ value: String(j + 1), label: l }))}
            />
          )}
          {(q.kind === 'Single choice' || q.kind === 'Multiple choice') && (
            <RadioGroup aria-label={q.text} value={(answers[q.id] as string) ?? ''} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} options={(q.options ?? []).map((o) => ({ value: o, label: o }))} />
          )}
          {q.kind === 'Text' && (
            <>
              <TextArea aria-label={q.text} rows={3} value={(answers[q.id] as string) ?? ''} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
              {anonymity === 'Anonymous' && <Text size="sm" tone="secondary">Avoid names or details that could identify you.</Text>}
            </>
          )}
        </section>
      ))}
    </div>
  );
  const btn = !done && !closed && (
    <Button variant="primary" icon={Send} fullWidth={device === 'phone'} disabled={answered === 0} onClick={() => setDone(true)}>
      Send answers
    </Button>
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="engage" active="Surveys" persona="emp" device="phone" phone={{ tab: 'home', title, back: true }}>
        {body}
        {btn && <div className="yx-growth-pinned">{btn}</div>}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="engage" active="Surveys" persona="emp">
      <PageHeader title={title} description={`${questions.length} questions · closes ${formatDate(closes)}`} status={anonymity === 'Anonymous' ? <Badge tone="info"><Icon icon={Lock} /> Anonymous</Badge> : <Badge>Named</Badge>} actions={btn} />
      <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
        {body}
      </div>
    </GrowthFrame>
  );
}

/* ================================================================== ENG-06 · Survey results */

export interface SurveyResults {
  name: string;
  invited: number;
  responded: number;
  scores: number[];
  previousEnps: number;
  trend: { period: string; enps: number | null }[];
  themes: string[];
  heat: { label: string; groupSize: number; values: (number | null)[] }[];
  departments: { name: string; size: number }[];
  comments: { theme: string; count: number; summary: string; examples: string[] }[];
}

/** ENG-06 Results (T6): eNPS scale, participation, theme heatmap with suppressed groups, comment themes (AI, anonymous text only); filters below minimum disabled. */
export function SurveyResultsScreen({ persona, results, team, state = 'ready' }: { persona: 'hr' | 'mgr'; results: SurveyResults; team?: { name: string; size: number; scores: number[] }; state?: LoadState }) {
  const [dept, setDept] = useState<string | null>(null);
  const e = enps(team ? team.scores : results.scores);
  const teamSuppressed = team ? !canSlice(team.size) : false;
  const deptOptions = results.departments.map((d) => ({ value: d.name, label: canSlice(d.size) ? d.name : `${d.name} (fewer than 5)`, disabled: !canSlice(d.size) }));
  return (
    <GrowthFrame area="engage" active="Surveys" persona={persona}>
      <PageHeader
        title={results.name}
        description={team ? `Your team: ${team.name}` : 'All of Kaveri Foods'}
        facts={`${results.responded} of ${results.invited} responded (${Math.round((results.responded / results.invited) * 100)}%) · closed 30 Sep 2026 · anonymous`}
        actions={
          <>
            {persona === 'hr' && <Select aria-label="Department" placeholder="All departments" clearable value={dept} onChange={setDept} options={deptOptions} />}
            <Button>Export</Button>
            {persona === 'mgr' && !teamSuppressed && <Button variant="primary" icon={Plus}>Create action plan</Button>}
          </>
        }
      />
      {state === 'loading' ? (
        <Skeleton height={400} />
      ) : teamSuppressed ? (
        <div className="yx-growth-stack">
          <SuppressedNotice what="Team results" count={team?.size} />
          <Text>Your team’s answers are included in the Quality department’s results instead, which you can see below.</Text>
        </div>
      ) : (
        <>
          <div className="yx-growth-split">
            <div className="yx-growth-split__main">
              <Card title="eNPS">
                <EnpsScale score={e.score} promoters={e.promoters} passives={e.passives} detractors={e.detractors} previous={team ? undefined : results.previousEnps} />
              </Card>
              {persona === 'hr' && <LineChart title="eNPS over time" xLabel="Quarter" categories={results.trend.map((t) => t.period)} series={[{ name: 'eNPS', values: results.trend.map((t) => t.enps) }]} yMin={-20} />}
            </div>
            <aside className="yx-growth-split__side">
              <StatCard label="Response rate" value={Math.round((results.responded / results.invited) * 100)} unit="%" previous={71} previousLabel="last pulse" drill={{ label: 'View by department', href: '#rate' }} />
              <Card title="Comment themes" actions={<AiBadge />}>
                <Text size="sm" tone="secondary">
                  Summarised from anonymous comment text only. No names or departments are passed to the model.
                </Text>
                <ul className="yx-growth-list">
                  {results.comments.map((c) => (
                    <li key={c.theme} className="yx-growth-list__item">
                      <div className="yx-growth-list__main">
                        <span className="yx-growth-list__title">
                          {c.theme} · {c.count} comments
                        </span>
                        <span className="yx-growth-meta">{c.summary}</span>
                        {c.examples.map((x) => (
                          <span key={x} className="yx-growth-meta">
                            “{x}”
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </aside>
          </div>
          {/* Full width so the table fits without its own scroll area (axe scrollable-region-focusable). */}
          {persona === 'hr' && (
            <Heatmap
              title="Favourable answers by department and theme"
              description="Share who agreed or strongly agreed. Departments with fewer than 5 responses are hidden."
              xLabel="Department"
              columns={results.themes}
              rows={results.heat}
              max={100}
              format={(v) => `${v}%`}
            />
          )}
        </>
      )}
    </GrowthFrame>
  );
}

/* ================================================================== ENG-07 · Action plans */

export interface ActionPlanItem {
  id: string;
  action: string;
  owner: string;
  due: Date;
  status: 'Not started' | 'In progress' | 'Done';
}

export interface ActionPlan {
  id: string;
  team: string;
  owner: string;
  survey: string;
  focus: { question: string; score: string };
  resultsOpened: Date;
  items: ActionPlanItem[];
  status: 'Draft' | 'Shared with team' | 'Completed';
}

/** ENG-07 Action plans (T3): focus area from results, actions with owner and due date, due 30 days after results (Q8); HR completion view. */
export function ActionPlanScreen({ persona, device = 'desktop', plan, plans = [] }: { persona: 'mgr' | 'hr'; device?: Device; plan?: ActionPlan; plans?: (ActionPlan & { size: number })[] }) {
  const [items, setItems] = useState(plan?.items ?? []);
  const [draft, setDraft] = useState('');
  if (persona === 'hr')
    return (
      <GrowthFrame area="engage" active="Surveys" persona="hr">
        <PageHeader title="Action plans · September pulse" description="Managers of teams with 5 or more responses create a plan within 30 days of results." facts={`${plans.filter((p) => p.status !== 'Draft').length} of ${plans.length} shared`} />
        <DataTable
          label="Action plans"
          rows={plans}
          getRowId={(r) => r.id}
          empty={<EmptyState title="No action plans yet" description="Plans appear once results are shared with managers." />}
          columns={[
            { key: 'team', header: 'Team', value: (r) => r.team, width: 200 },
            { key: 'owner', header: 'Manager', type: 'person', value: (r) => r.owner, person: (r) => ({ name: r.owner }), width: 200 },
            { key: 'focus', header: 'Focus', value: (r) => r.focus.question, width: 280 },
            { key: 'items', header: 'Actions done', type: 'number', value: (r) => r.items.filter((i) => i.status === 'Done').length, render: (r) => `${r.items.filter((i) => i.status === 'Done').length} of ${r.items.length}`, width: 130 },
            { key: 'due', header: 'Plan due', type: 'date', value: (r) => actionPlanDue(r.resultsOpened), width: 120 },
            { key: 'status', header: 'Status', type: 'status', value: (r) => (r.status === 'Draft' && actionPlanDue(r.resultsOpened) < TODAY ? 'Overdue' : r.status), statusTone: (v) => (v === 'Completed' ? 'success' : v === 'Overdue' ? 'danger' : v === 'Draft' ? 'warning' : 'info'), width: 150 },
          ]}
        />
      </GrowthFrame>
    );
  if (!plan) return null;
  const due = actionPlanDue(plan.resultsOpened);
  const body = (
    <div className="yx-growth-stack">
      <Card title="Focus area">
        <Text>{plan.focus.question}</Text>
        <Text tone="secondary">
          Team result: {plan.focus.score} · from {plan.survey}
        </Text>
      </Card>
      <Card title={`Actions · ${items.filter((i) => i.status === 'Done').length} of ${items.length} done`}>
        <ul className="yx-growth-list">
          {items.map((i) => (
            <li key={i.id} className="yx-growth-list__item">
              <Checkbox checked={i.status === 'Done'} onChange={(c) => setItems((xs) => xs.map((x) => (x.id === i.id ? { ...x, status: c ? 'Done' : 'In progress' } : x)))} label={i.action} description={`${i.owner} · due ${formatDate(i.due)}`} />
            </li>
          ))}
        </ul>
        <div className="yx-growth-row">
          <div className="yx-growth-grow">
            <TextField aria-label="New action" placeholder="Add an action" value={draft} onChange={setDraft} />
          </div>
          <Button
            icon={Plus}
            disabled={!draft.trim()}
            onClick={() => {
              setItems((xs) => [...xs, { id: `n${xs.length}`, action: draft.trim(), owner: plan.owner, due, status: 'Not started' }]);
              setDraft('');
            }}
          >
            Add
          </Button>
        </div>
      </Card>
    </div>
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="engage" active="Surveys" persona="mgr" device="phone" phone={{ tab: 'home', title: 'Action plan', back: true }}>
        <DescriptionList items={[{ label: 'Team', value: plan.team }, { label: 'Due', value: formatDate(due) }, { label: 'Status', value: plan.status }]} />
        {body}
        <div className="yx-growth-pinned">
          <Button variant="primary" fullWidth icon={Send}>
            Share with team
          </Button>
        </div>
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="engage" active="Surveys" persona="mgr">
      <PageHeader
        title={`Action plan · ${plan.team}`}
        status={<Badge tone={plan.status === 'Completed' ? 'success' : plan.status === 'Draft' ? 'warning' : 'info'}>{plan.status}</Badge>}
        facts={`Owner ${plan.owner} · due ${formatDate(due)} (30 days after results)`}
        actions={
          <>
            <Button icon={Check}>Mark plan complete</Button>
            <Button variant="primary" icon={Send}>
              Share with team
            </Button>
          </>
        }
      />
      <SplitLayout
        main={body}
        side={
          <Card title="Your team’s results">
            <PersonLabel name={plan.owner} secondary={plan.team} />
            <Text size="sm" tone="secondary">
              Shown because 6 of your 7 team members responded (minimum 5).
            </Text>
          </Card>
        }
      />
    </GrowthFrame>
  );
}
