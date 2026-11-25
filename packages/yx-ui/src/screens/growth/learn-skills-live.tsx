// G3d (M07) with real records, in the designed layouts: LRN-09 team skills, LRN-10 skills profile, LRN-15 skills to
// confirm, LRN-11 training needs and budgets, and the HR counts of the Internal Committees (answer 2620) shown on the
// compliance dashboard. The designed screens (learn-me.tsx, learn-admin.tsx) render these when given `live`.
import { useState } from 'react';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { PlainTable } from '../../components/plain-table';
import { Drawer } from '../../components/drawer';
import { Dialog } from '../../components/overlay';
import { useToast } from '../../components/notify';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { CurrencyField, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { formatDate, formatINR } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { GrowthFrame, SkillLevel } from './growth-kit';

type State = 'ready' | 'loading' | 'error';
const LEVELS = ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: `Level ${v}` }));
const day = (s: string) => new Date(`${s}T00:00:00`);

function Loading({ state, onRetry, what, children }: { state: State; onRetry?: () => void; what: string; children: () => React.ReactNode }) {
  if (state === 'error') return <ErrorState title={`We couldn't load ${what}.`} description="Try again in a moment." onRetry={onRetry} />;
  if (state === 'loading') return <Skeleton height={300} />;
  return <>{children()}</>;
}

/* ------------------------------------------------------------------ LRN-10 skills profile and LRN-15 skills to confirm */

export interface LiveSkillProfileData {
  employeeId: string;
  person: string;
  role: string;
  self: boolean;
  canAssess: boolean;
  canDecide: boolean;
  skills: { id: string; name: string; level: number | null; required: number | null; source: string; evidence: string; updated: string | null }[];
  suggestions: { id: string; skillId: string; skill: string; level: number; from: string; evidence: string }[];
  library: { id: string; name: string }[];
}
export interface LiveSkillsProfile {
  state: State;
  onRetry?: () => void;
  data: LiveSkillProfileData | null;
  onSuggestions: () => void;
  onAssess: (skillId: string, level: number) => Promise<unknown>;
}

export function LiveSkillsProfileScreen({ live }: { live: LiveSkillsProfile }) {
  const [assessing, setAssessing] = useState(false);
  const d = live.data;
  const persona = d && !d.self ? 'mgr' : 'emp';
  return (
    <GrowthFrame area="learning" active="Skills" persona={persona}>
      <Loading state={d ? live.state : live.state === 'ready' ? 'loading' : live.state} onRetry={live.onRetry} what="the skills">
        {() => {
          const p = d!;
          const gaps = p.skills.filter((s) => s.required != null && (s.level == null || s.level < s.required));
          return (
            <>
              <PageHeader
                title={p.self ? 'My skills' : `${p.person}’s skills`}
                description={`${p.role} · required levels come from the job title`}
                actions={
                  p.canAssess ? (
                    <Button variant="primary" icon={Plus} onClick={() => setAssessing(true)}>
                      Set a level
                    </Button>
                  ) : undefined
                }
              />
              {p.suggestions.length > 0 && (
                <InlineAlert
                  tone="info"
                  title={`${p.suggestions.length} skill ${p.suggestions.length === 1 ? 'suggestion' : 'suggestions'} to confirm`}
                  actions={
                    <Button size="sm" onClick={live.onSuggestions}>
                      Review suggestions
                    </Button>
                  }
                >
                  Suggestions join {p.self ? 'your' : `${p.person}’s`} profile only after {p.self ? 'you or your manager' : 'you or they'} confirm.
                </InlineAlert>
              )}
              <div className="yx-growth-split">
                <div className="yx-growth-split__main">
                  {p.skills.length === 0 ? (
                    <EmptyState title="No skills yet" description="Skills come from completed courses and from the manager. The job title sets the levels needed." />
                  ) : (
                    <ul className="yx-growth-list">
                      {p.skills.map((s) => (
                        <li key={s.id} className="yx-growth-list__item">
                          <div className="yx-growth-list__main">
                            <span className="yx-growth-list__title">{s.name}</span>
                            <span className="yx-growth-meta">
                              {s.level == null ? 'Not assessed yet' : `Source: ${s.source}${s.evidence ? ` · ${s.evidence}` : ''}${s.updated ? ` · ${formatDate(day(s.updated))}` : ''}`}
                            </span>
                          </div>
                          <SkillLevel level={s.level} required={s.required ?? undefined} label={s.name} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <aside className="yx-growth-split__side">
                  <Card title="Gaps for the job title">
                    {gaps.length === 0 ? (
                      <Text tone="secondary">No gaps. Every required level is met.</Text>
                    ) : (
                      <ul className="yx-growth-list">
                        {gaps.map((g) => (
                          <li key={g.id} className="yx-growth-list__item">
                            <span className="yx-growth-grow">{g.name}</span>
                            <span className="yx-growth-meta">{g.level == null ? 'Not assessed' : `${g.required! - g.level} below`}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </aside>
              </div>
              {assessing && <AssessDialog person={p.person} library={p.library} onClose={() => setAssessing(false)} onSave={live.onAssess} />}
            </>
          );
        }}
      </Loading>
    </GrowthFrame>
  );
}

function AssessDialog({ person, library, onClose, onSave }: { person: string; library: { id: string; name: string }[]; onClose: () => void; onSave: LiveSkillsProfile['onAssess'] }) {
  const { toast } = useToast();
  const [skill, setSkill] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const early = useTooEarly([...(skill ? [] : [{ fieldId: 'as-skill', message: 'Choose the skill.' }]), ...(level ? [] : [{ fieldId: 'as-level', message: 'Choose the level.' }])]);
  const save = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      await onSave(skill!, Number(level));
      toast({ tone: 'success', title: `Level saved for ${person}.` });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Set a level for ${person}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save level
          </Button>
        </>
      }
    >
      <div className="yx-growth-stack">
        {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
        <FormField id="as-skill" label="Skill" required error={early.errorOf('as-skill')}>
          <Select value={skill} onChange={setSkill} options={library.map((s) => ({ value: s.id, label: s.name }))} />
        </FormField>
        <FormField id="as-level" label="Level" required error={early.errorOf('as-level')} helper="1 is a beginner, 5 an expert who teaches others.">
          <Select value={level} onChange={setLevel} options={LEVELS} />
        </FormField>
      </div>
    </Dialog>
  );
}

export interface LiveSkillSuggestions {
  state: State;
  onRetry?: () => void;
  data: LiveSkillProfileData | null;
  onDecide: (id: string, confirm: boolean) => Promise<unknown>;
}

export function LiveSkillSuggestionsScreen({ live }: { live: LiveSkillSuggestions }) {
  const { toast } = useToast();
  const d = live.data;
  const decide = async (id: string, confirm: boolean, skill: string) => {
    try {
      await live.onDecide(id, confirm);
      toast({ tone: 'success', title: confirm ? `${skill} confirmed.` : `${skill} rejected. It won’t be offered again from the same course.` });
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    }
  };
  return (
    <GrowthFrame area="learning" active="Skills" persona={d && !d.self ? 'mgr' : 'emp'}>
      <Loading state={d ? live.state : live.state === 'ready' ? 'loading' : live.state} onRetry={live.onRetry} what="the suggestions">
        {() => (
          <>
            <PageHeader title={d!.self ? 'Skills to confirm' : `Skills to confirm for ${d!.person}`} facts={`${d!.suggestions.length} waiting`} />
            <Text size="sm" tone="secondary">
              Suggested from completed courses. Nothing joins {d!.self ? 'your' : `${d!.person}’s`} profile until confirmed. A rejected suggestion isn’t offered again from the same course.
            </Text>
            {d!.suggestions.length === 0 ? (
              <EmptyState title="No suggestions to review" description="When a course with skills is completed, its skills appear here." />
            ) : (
              <ul className="yx-growth-list" aria-live="polite">
                {d!.suggestions.map((s) => (
                  <li key={s.id} className="yx-growth-list__item">
                    <div className="yx-growth-list__main">
                      <span className="yx-growth-list__title">
                        {s.skill} · level {s.level}
                      </span>
                      <span className="yx-growth-meta">From course: {s.evidence}</span>
                    </div>
                    {d!.canDecide && (
                      <>
                        <Button size="sm" icon={CheckCircle2} onClick={() => void decide(s.id, true, s.skill)}>
                          Confirm
                        </Button>
                        <Button size="sm" icon={X} onClick={() => void decide(s.id, false, s.skill)}>
                          Reject
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!d!.self && <PersonLabel name={d!.person} secondary="You’re deciding as their manager." />}
          </>
        )}
      </Loading>
    </GrowthFrame>
  );
}

/* ------------------------------------------------------------------ LRN-09 team skills */

export interface LiveTeamSkillsData {
  skills: string[];
  people: { employeeId: string; name: string; role: string; levels: (number | null)[]; required: number[] }[];
}
export interface LiveTeamSkills {
  state: State;
  onRetry?: () => void;
  data: LiveTeamSkillsData | null;
  onPerson: (employeeId: string) => void;
}

export function LiveTeamSkillsScreen({ live }: { live: LiveTeamSkills }) {
  const d = live.data;
  const gaps = d ? d.people.reduce((a, p) => a + p.levels.filter((l, i) => p.required[i] > 0 && (l == null || l < p.required[i])).length, 0) : 0;
  return (
    <GrowthFrame area="learning" active="Skills" persona="mgr">
      <PageHeader title="Team skills" description="Your team · confirmed skills only · required levels from each person’s job title" facts={d ? `${d.people.length} people · ${gaps} gaps` : undefined} />
      <Loading state={d ? live.state : live.state === 'ready' ? 'loading' : live.state} onRetry={live.onRetry} what="your team’s skills">
        {() =>
          d!.people.length === 0 ? (
            <EmptyState title="No one reports to you" description="Your team’s skills show here." />
          ) : d!.skills.length === 0 ? (
            <EmptyState title="No required skills yet" description="HR sets the skills each job title needs in Settings › Performance (competencies)." />
          ) : (
            <PlainTable
              label="Team skills matrix"
              caption="Level of 5, with the required level when there’s a gap."
              rows={d!.people}
              getRowId={(p) => p.employeeId}
              columns={[
                {
                  key: 'person',
                  header: 'Person',
                  rowHeader: true,
                  cell: (p) => (
                    <>
                      <Link href={`#${p.employeeId}`} onClick={(e) => (e.preventDefault(), live.onPerson(p.employeeId))}>
                        {p.name}
                      </Link>
                      <div className="yx-growth-meta">{p.role}</div>
                    </>
                  ),
                },
                ...d!.skills.map((s, i) => ({ key: `s${i}`, header: s, cell: (p: LiveTeamSkillsData['people'][number]) => (p.required[i] > 0 || p.levels[i] != null ? <SkillLevel level={p.levels[i]} required={p.required[i] || undefined} label={`${p.name}, ${s}`} /> : <span className="yx-growth-meta">Not needed</span>) })),
              ]}
            />
          )
        }
      </Loading>
    </GrowthFrame>
  );
}

/* ------------------------------------------------------------------ LRN-11 training needs and budgets */

export interface LiveNeedRow {
  id: string;
  title: string;
  who: string;
  source: string;
  skill: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'New' | 'Planned' | 'In progress' | 'Closed';
  plan?: string;
  estCost: number;
}
export interface NeedInput {
  title: string;
  employeeId?: string;
  departmentId?: string;
  skillId?: string;
  source: 'skill_gap' | 'manager' | 'compliance' | 'review';
  priority: 'high' | 'medium' | 'low';
  estCost: number;
}
export interface LiveTrainingNeeds {
  state: State;
  onRetry?: () => void;
  needs: LiveNeedRow[];
  budgets: { year: number; rows: { departmentId: string; dept: string; planned: number; spent: number; committed: number }[] } | null;
  people: { value: string; label: string }[];
  departments: { value: string; label: string }[];
  skills: { value: string; label: string }[];
  courses: { value: string; label: string }[];
  onAdd: (n: NeedInput) => Promise<unknown>;
  onPlan: (ids: string[], courseId: string) => Promise<unknown>;
  onStatus: (ids: string[], status: 'in_progress' | 'closed') => Promise<unknown>;
  onBudget: (departmentId: string, amount: number) => Promise<unknown>;
}

export function LiveTrainingNeedsScreen({ live }: { live: LiveTrainingNeeds }) {
  const { toast } = useToast();
  const [sel, setSel] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [planning, setPlanning] = useState<string[] | null>(null);
  const [budget, setBudget] = useState(false);
  const run = async (f: () => Promise<unknown>, ok: string) => {
    try {
      await f();
      toast({ tone: 'success', title: ok });
      setSel([]);
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    }
  };
  const cols: TableColumn<LiveNeedRow>[] = [
    { key: 'title', header: 'Need', value: (r) => r.title, width: 260 },
    { key: 'who', header: 'For', value: (r) => r.who, width: 180 },
    { key: 'source', header: 'Source', value: (r) => r.source, groupable: true, width: 150 },
    { key: 'skill', header: 'Skill', value: (r) => r.skill || '—', groupable: true, width: 170 },
    { key: 'priority', header: 'Priority', type: 'status', value: (r) => r.priority, statusTone: (v) => (v === 'High' ? 'danger' : v === 'Medium' ? 'warning' : 'neutral'), width: 110 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Closed' ? 'success' : v === 'New' ? 'info' : 'neutral'), groupable: true, width: 120 },
    { key: 'plan', header: 'Plan', value: (r) => r.plan ?? 'Not planned', width: 200 },
    { key: 'cost', header: 'Est. cost', type: 'money', value: (r) => r.estCost, total: 'sum', width: 130 },
  ];
  const b = live.budgets;
  return (
    <GrowthFrame area="learning" active="Needs & budgets" persona="ld">
      <PageHeader
        title="Training needs and budgets"
        description="Needs come from skill gaps, compliance, reviews and managers. Plan them with a course."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
            Add need
          </Button>
        }
      />
      <Tabs defaultValue="needs">
        <TabsList aria-label="Needs and budgets">
          <TabsTrigger value="needs" count={live.needs.filter((n) => n.status !== 'Closed').length}>
            Needs
          </TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
        </TabsList>
        <TabsContent value="needs">
          <DataTable
            label="Training needs"
            columns={cols}
            rows={live.needs}
            getRowId={(r) => r.id}
            state={live.state}
            onRetry={live.onRetry}
            defaultGroupBy="status"
            selectable
            selectedIds={sel}
            onSelectedChange={setSel}
            bulkActions={(ids) => (
              <>
                <Button size="sm" onClick={() => setPlanning(ids)}>
                  Plan {ids.length} with a course
                </Button>
                <Button size="sm" onClick={() => void run(() => live.onStatus(ids, 'closed'), `${ids.length} closed.`)}>
                  Close {ids.length}
                </Button>
              </>
            )}
            empty={<EmptyState title="No training needs yet" description="Add a need for a person or a department." />}
          />
        </TabsContent>
        <TabsContent value="budgets">
          <div className="yx-growth-stack">
            <div className="yx-growth-row">
              <Text weight="semibold">{b ? `Financial year ${b.year}-${String(b.year + 1).slice(2)}` : ''}</Text>
              <span className="yx-growth-grow" />
              <Button icon={Plus} onClick={() => setBudget(true)}>
                Set a budget
              </Button>
            </div>
            <PlainTable
              label="Department budgets"
              rows={b?.rows ?? []}
              getRowId={(r) => r.departmentId}
              empty={<EmptyState compact title="No budgets set" description="Set a department’s training budget for the year." />}
              columns={[
                { key: 'dept', header: 'Department', rowHeader: true, cell: (r) => r.dept },
                { key: 'planned', header: 'Budget', num: true, cell: (r) => formatINR(r.planned) },
                { key: 'spent', header: 'Spent', num: true, cell: (r) => formatINR(r.spent) },
                { key: 'committed', header: 'Committed', num: true, cell: (r) => formatINR(r.committed) },
                {
                  key: 'left',
                  header: 'Left',
                  num: true,
                  cell: (r) => {
                    const left = r.planned - r.spent - r.committed;
                    return left < 0 ? <Badge tone="danger">{`Over by ${formatINR(-left)}`}</Badge> : formatINR(left);
                  },
                },
                { key: 'used', header: 'Used', cell: (r) => (r.planned > 0 ? <Meter label={`${r.dept} budget used`} value={Math.min(r.spent + r.committed, r.planned)} max={r.planned} valueText={`${Math.round(((r.spent + r.committed) / r.planned) * 100)}%`} /> : <span className="yx-growth-meta">No budget</span>) },
              ]}
            />
          </div>
        </TabsContent>
      </Tabs>
      {adding && <NeedSheet live={live} onClose={() => setAdding(false)} />}
      {planning && (
        <PickDialog
          title={`Plan ${planning.length} ${planning.length === 1 ? 'need' : 'needs'} with a course`}
          label="Course"
          options={live.courses}
          confirm="Plan"
          onClose={() => setPlanning(null)}
          onSave={(courseId) => run(() => live.onPlan(planning, courseId), 'Planned.')}
        />
      )}
      {budget && <BudgetDialog departments={live.departments} onClose={() => setBudget(false)} onSave={live.onBudget} />}
    </GrowthFrame>
  );
}

function NeedSheet({ live, onClose }: { live: LiveTrainingNeeds; onClose: () => void }) {
  const { toast } = useToast();
  const [forWhat, setFor] = useState<'person' | 'department'>('person');
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<string | null>(null);
  const [skill, setSkill] = useState<string | null>(null);
  const [source, setSource] = useState<NeedInput['source']>('manager');
  const [priority, setPriority] = useState<NeedInput['priority']>('medium');
  const [cost, setCost] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const early = useTooEarly([...(title.trim().length >= 3 ? [] : [{ fieldId: 'nd-title', message: 'Name the need (3 letters or more).' }]), ...(who ? [] : [{ fieldId: 'nd-who', message: forWhat === 'person' ? 'Choose the person.' : 'Choose the department.' }])]);
  const save = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onAdd({ title: title.trim(), ...(forWhat === 'person' ? { employeeId: who! } : { departmentId: who! }), ...(skill ? { skillId: skill } : {}), source, priority, estCost: cost ?? 0 });
      toast({ tone: 'success', title: 'Need added.' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a training need"
      footer={
        <div className="yx-growth-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Add need
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        {failed && <InlineAlert tone="danger" title="Not added">{failed}</InlineAlert>}
        <FormField id="nd-title" label="Need" required error={early.errorOf('nd-title')}>
          <TextField value={title} onChange={setTitle} maxLength={200} />
        </FormField>
        <FormField label="For">
          <Segment<'person' | 'department'> label="Need for" value={forWhat} onChange={(v) => (setFor(v), setWho(null))} options={[{ value: 'person', label: 'A person' }, { value: 'department', label: 'A department' }]} />
        </FormField>
        <FormField id="nd-who" label={forWhat === 'person' ? 'Person' : 'Department'} required error={early.errorOf('nd-who')}>
          <Select value={who} onChange={setWho} options={forWhat === 'person' ? live.people : live.departments} />
        </FormField>
        <FormField label="Skill" optional>
          <Select value={skill} onChange={setSkill} clearable options={live.skills} />
        </FormField>
        <FieldRow>
          <FormField label="Source">
            <Select<NeedInput['source']> value={source} onChange={(v) => v && setSource(v)} options={[{ value: 'manager', label: 'Manager request' }, { value: 'skill_gap', label: 'Skill gap' }, { value: 'compliance', label: 'Compliance' }, { value: 'review', label: 'Review gap' }]} />
          </FormField>
          <FormField label="Priority">
            <Segment<NeedInput['priority']> label="Priority" value={priority} onChange={setPriority} options={[{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />
          </FormField>
        </FieldRow>
        <FormField label="Estimated cost" optional>
          <CurrencyField value={cost} onChange={setCost} />
        </FormField>
      </div>
    </Drawer>
  );
}

function PickDialog({ title, label, options, confirm, onClose, onSave }: { title: string; label: string; options: { value: string; label: string }[]; confirm: string; onClose: () => void; onSave: (v: string) => Promise<unknown> }) {
  const [v, setV] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTried(true);
              if (v) void onSave(v).then(onClose);
            }}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <FormField label={label} required error={tried && !v ? `Choose the ${label.toLowerCase()}.` : null}>
        <Select value={v} onChange={setV} options={options} />
      </FormField>
    </Dialog>
  );
}

function BudgetDialog({ departments, onClose, onSave }: { departments: { value: string; label: string }[]; onClose: () => void; onSave: LiveTrainingNeeds['onBudget'] }) {
  const { toast } = useToast();
  const [dept, setDept] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const save = async () => {
    setTried(true);
    if (!dept || amount == null) return;
    try {
      await onSave(dept, amount);
      toast({ tone: 'success', title: 'Budget saved.' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Set a department budget"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()}>
            Save budget
          </Button>
        </>
      }
    >
      <div className="yx-growth-stack">
        {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
        <FormField label="Department" required error={tried && !dept ? 'Choose the department.' : null}>
          <Select value={dept} onChange={setDept} options={departments} />
        </FormField>
        <FormField label="Budget for the year" required error={tried && amount == null ? 'Give the amount.' : null}>
          <CurrencyField value={amount} onChange={setAmount} />
        </FormField>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ answer 2620: HR counts of the Internal Committees */

export interface PoshCounts {
  minimum: number;
  committees: { committee: string; year: number; shown: boolean; received: number | null; disposed: number | null; pendingOver90: number | null; sessions: number; trainings: number }[];
}

/** On the compliance dashboard for company-wide training reports: counts only; a committee under the minimum shows none. */
export function PoshCountsCard({ counts }: { counts: PoshCounts }) {
  return (
    <Card title="Internal Committees this year (POSH)">
      <PlainTable
        label="Internal Committees this year"
        rows={counts.committees}
        getRowId={(r) => r.committee}
        empty={<EmptyState compact title="No Internal Committee yet" description="The System Admin sets the committees in Speak-up set-up." />}
        columns={[
          { key: 'committee', header: 'Committee', rowHeader: true, cell: (r) => r.committee },
          { key: 'received', header: 'Complaints', num: true, cell: (r) => (r.shown ? r.received : `Fewer than ${counts.minimum}`) },
          { key: 'disposed', header: 'Disposed', num: true, cell: (r) => (r.shown ? r.disposed : '—') },
          { key: 'pending', header: 'Pending over 90 days', num: true, cell: (r) => (r.shown ? r.pendingOver90 : '—') },
          { key: 'sessions', header: 'Awareness sessions', num: true, cell: (r) => r.sessions },
          { key: 'trainings', header: 'Awareness course completions', num: true, cell: (r) => r.trainings },
        ]}
      />
      <Text size="sm" tone="secondary">
        Counts only, never a case or a name. Below {counts.minimum} complaints a committee shows no complaint counts, so no one can be singled out.
      </Text>
    </Card>
  );
}
