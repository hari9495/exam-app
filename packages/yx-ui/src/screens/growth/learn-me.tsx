// Learning, employee side: my learning + catalogue (LRN-01), course player (LRN-02), nomination / enrolment /
// external request + decline (LRN-06), skills profile (LRN-10), feedback + 60-day check (LRN-12), my tests (LRN-13),
// skill suggestions to confirm (LRN-15).
import { useMemo, useState, type ReactNode } from 'react';
import { Award, BookOpen, CheckCircle2, ClipboardCheck, Download, ExternalLink, FileText, Film, Package, Play, Share2, Star, X } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { AiBadge, Badge, PersonLabel } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { BottomSheet } from '../../components/overlay';
import { MilestoneMoment } from '../../components/notify';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { MultiSelect, type SelectOption } from '../../components/select';
import { DatePicker } from '../../components/date';
import { formatDate, formatINR } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { TODAY } from '../_kit/data';
import { GrowthFrame, ProgressRing, RatingScale, SkillLevel, type Device } from './growth-kit';
import { budgetCheck, enrol } from './growth-logic';
import type { LoadState } from './perf-goals';
import './growth.css';

/* ================================================================== Shared types */

export type CourseType = 'Classroom' | 'Virtual' | 'Self-paced' | 'SCORM' | 'Assessment only';
export type CourseSource = 'Kaveri Foods' | 'Provider' | 'Partner pack';

export interface Course {
  id: string;
  title: string;
  type: CourseType;
  source: CourseSource;
  provider?: string;
  duration: string;
  skills: string[];
  cost: number;
  mandatory?: boolean;
  approval?: boolean;
  certificate?: boolean;
}

export interface Enrolment {
  id: string;
  course: Course;
  status: 'Enrolled' | 'In progress' | 'Completed' | 'Waitlisted' | 'Requested' | 'Overdue';
  source: 'Assigned by rule' | 'Nominated' | 'Self' | 'Training need' | 'IDP';
  due?: Date;
  progress: number;
  nextSession?: string;
}

export interface Certification {
  id: string;
  title: string;
  issued: Date;
  expires: Date | null;
  badge?: 'Open Badge' | 'Credly';
  renewal?: Date;
}

const TYPE_ICON: Record<CourseType, typeof Film> = { Classroom: BookOpen, Virtual: Film, 'Self-paced': Film, SCORM: Package, 'Assessment only': ClipboardCheck };

function CourseCard({ c, action }: { c: Course; action?: ReactNode }) {
  return (
    <article className="yx-growth-card" aria-label={c.title}>
      <div className="yx-growth-card__thumb" aria-hidden="true">
        <Icon icon={TYPE_ICON[c.type]} size="md" />
      </div>
      <h3 className="yx-growth-card__title">{c.title}</h3>
      <span className="yx-growth-meta">
        {c.type} · {c.duration}
        {c.source !== 'Kaveri Foods' ? ` · ${c.source === 'Provider' ? c.provider : 'Partner pack'}` : ''}
      </span>
      <div className="yx-growth-row">
        {c.mandatory && <Badge tone="warning">Mandatory</Badge>}
        {c.certificate && <Badge tone="success">Certificate</Badge>}
        {c.source === 'Provider' && <Badge>{c.provider}</Badge>}
      </div>
      <span className="yx-growth-meta">Skills: {c.skills.join(', ')}</span>
      <div className="yx-growth-card__foot">
        <span className="yx-growth-meta yx-growth-grow">{c.cost ? formatINR(c.cost) : 'No cost'}{c.approval ? ' · needs approval' : ''}</span>
        {action}
      </div>
    </article>
  );
}

/* ================================================================== LRN-01 · My learning + catalogue */

export interface MyLearningProps {
  device?: Device;
  state?: LoadState;
  enrolments: Enrolment[];
  certificates: Certification[];
  catalogue: Course[];
  recommendations: { course: Course; reason: string }[];
  points?: { total: number; badges: string[]; optedOut?: boolean } | null;
  tab?: 'mine' | 'catalogue' | 'certificates';
}

const CAT_FIELDS: FilterFieldDef[] = [
  { key: 'source', label: 'Source', type: 'multi', options: ['Kaveri Foods', 'Provider', 'Partner pack'].map((v) => ({ value: v, label: v })) },
  { key: 'type', label: 'Type', type: 'multi', options: ['Classroom', 'Virtual', 'Self-paced', 'SCORM', 'Assessment only'].map((v) => ({ value: v, label: v })) },
];

/** LRN-01 My learning (mobile first) + catalogue: assigned with due dates, continue, recommendations (AI, no auto-enrol), certificates. */
export function MyLearningScreen({ device = 'desktop', state = 'ready', enrolments, certificates, catalogue, recommendations, points, tab = 'mine' }: MyLearningProps) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [optOut, setOptOut] = useState(!!points?.optedOut);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const shownCat = useMemo(() => catalogue.filter((c) => (!q || c.title.toLowerCase().includes(q.toLowerCase())) && filters.every((f) => matchesFilter((c as unknown as Record<string, unknown>)[f.key], f))), [catalogue, filters, q]);
  const cont = enrolments.find((e) => e.status === 'In progress');
  const assigned = enrolments.filter((e) => e.status !== 'Completed');

  const mine =
    state === 'loading' ? (
      <Skeleton height={320} />
    ) : state === 'empty' || enrolments.length === 0 ? (
      <EmptyState title="Nothing assigned to you right now" description="Mandatory courses appear here with their due dates. Browse the catalogue to learn something new." action={<Button variant="primary">Browse catalogue</Button>} />
    ) : (
      <div className="yx-growth-stack">
        {cont && (
          <section className="yx-growth-panel" aria-label="Continue learning">
            <div className="yx-growth-row">
              <ProgressRing value={cont.progress} label={cont.course.title} size="lg" />
              <div className="yx-growth-list__main">
                <Text size="sm" tone="secondary">
                  Continue learning
                </Text>
                <span className="yx-growth-list__title">{cont.course.title}</span>
                <span className="yx-growth-meta">
                  {cont.course.type} · {cont.course.duration}
                  {cont.due ? ` · due ${formatDate(cont.due)}` : ''}
                </span>
              </div>
              <Button variant="primary" icon={Play}>
                Continue
              </Button>
            </div>
          </section>
        )}
        <section aria-label="Assigned to me" className="yx-growth-stack" data-gap="sm">
          <h2 className="yx-growth-h">Assigned to me · {assigned.length}</h2>
          <ul className="yx-growth-list">
            {assigned.map((e) => (
              <li key={e.id} className="yx-growth-list__item">
                <ProgressRing value={e.progress} label={e.course.title} size="sm" tone={e.status === 'Overdue' ? 'danger' : 'default'} />
                <div className="yx-growth-list__main">
                  <span className="yx-growth-list__title">{e.course.title}</span>
                  <span className="yx-growth-meta">
                    {e.source}
                    {e.due ? ` · due ${formatDate(e.due)}` : ''}
                    {e.nextSession ? ` · ${e.nextSession}` : ''}
                  </span>
                </div>
                {e.course.mandatory && <Badge tone="warning">Mandatory</Badge>}
                <Badge tone={e.status === 'Overdue' ? 'danger' : e.status === 'Waitlisted' || e.status === 'Requested' ? 'info' : 'neutral'}>{e.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
        {recommendations.filter((r) => !dismissed.includes(r.course.id)).length > 0 && (
          <section aria-label="Recommended for you" className="yx-growth-stack" data-gap="sm">
            <div className="yx-growth-row">
              <h2 className="yx-growth-h">Recommended for you</h2>
              <AiBadge />
            </div>
            <Text size="sm" tone="secondary">
              From your confirmed skills and next role. You’re never enrolled until you choose.
            </Text>
            <ul className="yx-growth-list">
              {recommendations
                .filter((r) => !dismissed.includes(r.course.id))
                .map((r) => (
                  <li key={r.course.id} className="yx-growth-list__item">
                    <div className="yx-growth-list__main">
                      <span className="yx-growth-list__title">{r.course.title}</span>
                      <span className="yx-growth-meta">Why: {r.reason}</span>
                    </div>
                    <Button size="sm">View course</Button>
                    <Button size="sm" onClick={() => setDismissed((d) => [...d, r.course.id])}>
                      Not now
                    </Button>
                  </li>
                ))}
            </ul>
          </section>
        )}
        {points && (
          <section className="yx-growth-panel" aria-label="Achievements">
            <div className="yx-growth-row" data-between="">
              <span>
                <span className="yx-growth-points">{points.total}</span> <Text tone="secondary">learning points</Text>
              </span>
              <div className="yx-growth-row">
                {points.badges.map((b) => (
                  <Badge key={b} tone="success">
                    <Icon icon={Award} /> {b}
                  </Badge>
                ))}
              </div>
            </div>
            <Switch checked={optOut} onChange={setOptOut} label="Hide me from leaderboards" description="You still see your own points and badges. Points never affect ratings or pay." />
          </section>
        )}
      </div>
    );

  const certs =
    certificates.length === 0 ? (
      <EmptyState compact title="No certificates yet" description="Certificates are issued automatically when you complete a course that has one." />
    ) : (
      <ul className="yx-growth-list">
        {certificates.map((c) => {
          const expired = c.expires && c.expires < TODAY;
          return (
            <li key={c.id} className="yx-growth-list__item">
              <Icon icon={Award} size="md" />
              <div className="yx-growth-list__main">
                <span className="yx-growth-list__title">{c.title}</span>
                <span className="yx-growth-meta">
                  Issued {formatDate(c.issued)} · {c.expires ? `${expired ? 'expired' : 'valid until'} ${formatDate(c.expires)}` : 'no expiry'}
                  {c.renewal ? ` · renewal enrolled ${formatDate(c.renewal)}` : ''}
                </span>
              </div>
              {c.badge && <Badge tone="info">{c.badge}</Badge>}
              {expired ? <Badge tone="danger">Expired</Badge> : <Badge tone="success">Valid</Badge>}
              <Button size="sm" icon={Download}>
                Download
              </Button>
              {c.badge && (
                <Button size="sm" icon={Share2}>
                  Share
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    );

  const cat = (
    <div className="yx-growth-stack">
      <FilterBar fields={CAT_FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search courses" />
      {shownCat.length === 0 ? (
        <EmptyState compact title="No courses match these filters" action={<Button onClick={() => { setFilters([]); setQ(''); }}>Clear filters</Button>} />
      ) : (
        <div className="yx-growth-cards">
          {shownCat.map((c) => (
            <CourseCard key={c.id} c={c} action={<Button size="sm">{c.approval ? 'Request' : 'Enrol'}</Button>} />
          ))}
        </div>
      )}
    </div>
  );

  const tabs = (
    <Tabs defaultValue={tab}>
      <TabsList aria-label="Learning">
        <TabsTrigger value="mine" count={assigned.length}>
          My learning
        </TabsTrigger>
        <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
        <TabsTrigger value="certificates" count={certificates.length}>
          Certificates
        </TabsTrigger>
      </TabsList>
      <TabsContent value="mine">{mine}</TabsContent>
      <TabsContent value="catalogue">{cat}</TabsContent>
      <TabsContent value="certificates">{certs}</TabsContent>
    </Tabs>
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="learning" active="My learning" persona="emp" device="phone" phone={{ title: 'Learning' }}>
        {tabs}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="learning" active={tab === 'catalogue' ? 'Catalogue' : 'My learning'} persona="emp">
      <PageHeader title="My learning" description="Your assigned courses, what to continue, and certificates." actions={<Button>Request external training</Button>} />
      {tabs}
    </GrowthFrame>
  );
}

/* ================================================================== LRN-02 · Course player */

export interface PlayerItem {
  id: string;
  title: string;
  kind: 'Video' | 'PDF' | 'SCORM' | 'Quiz' | 'Link';
  minutes: number;
  required: boolean;
  done: boolean;
}

export interface CoursePlayerProps {
  device?: Device;
  course: Course;
  items: PlayerItem[];
  currentId: string;
  scormStatus?: 'incomplete' | 'completed' | 'failed';
  completed?: boolean;
}

/** LRN-02 Course player (T3): outline, sandboxed content, required items; SCORM status comes from the package (YX-LRN-09). */
export function CoursePlayerScreen({ device = 'desktop', course, items: initial, currentId, scormStatus, completed }: CoursePlayerProps) {
  const [items, setItems] = useState(initial);
  const [cur, setCur] = useState(currentId);
  const item = items.find((i) => i.id === cur) ?? items[0];
  const req = items.filter((i) => i.required);
  const pct = Math.round((req.filter((i) => i.done).length / Math.max(1, req.length)) * 100);
  const allDone = completed || req.every((i) => i.done);
  const kindIcon = { Video: Film, PDF: FileText, SCORM: Package, Quiz: ClipboardCheck, Link: ExternalLink }[item.kind];

  const stage = allDone ? (
    <MilestoneMoment title={`You completed ${course.title}`} description="Your certificate is issued and your skills profile is updated: Food safety and hygiene, level 2 → 3." action={<Button variant="primary" icon={Download}>Download certificate</Button>} />
  ) : (
    <div className="yx-growth-stack">
      <div className="yx-growth-player__stage" role="region" aria-label={`${item.kind}: ${item.title}`}>
        <Icon icon={kindIcon} size="md" />
        <strong>{item.title}</strong>
        <span>
          {item.kind === 'SCORM' ? 'SCORM package runs in a sandboxed frame' : item.kind === 'Video' ? `Video · ${item.minutes} min · captions on` : item.kind === 'Quiz' ? 'Opens in My tests with your consent' : `${item.kind} · ${item.minutes} min`}
        </span>
        {item.kind === 'Quiz' ? (
          <Button variant="primary">Start quiz</Button>
        ) : (
          <Button icon={Play}>{item.kind === 'Video' ? 'Play' : 'Open'}</Button>
        )}
      </div>
      {item.kind === 'SCORM' && (
        <InlineAlert tone={scormStatus === 'failed' ? 'danger' : 'info'} title={`Package reports: ${scormStatus ?? 'incomplete'}`}>
          Completion and score come from the package. {scormStatus === 'failed' ? 'Retake the package to complete this item.' : 'Finish the last screen of the package to complete it.'}
        </InlineAlert>
      )}
      {(item.kind === 'PDF' || item.kind === 'Link') && !item.done && (
        <Button onClick={() => setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, done: true } : x)))} icon={CheckCircle2}>
          Mark as done
        </Button>
      )}
    </div>
  );
  const outline = (
    <ol className="yx-growth-player__outline" aria-label="Course contents">
      {items.map((i, n) => (
        <li key={i.id} className="yx-growth-player__item" aria-current={i.id === cur ? 'step' : undefined}>
          <Icon icon={i.done ? CheckCircle2 : { Video: Film, PDF: FileText, SCORM: Package, Quiz: ClipboardCheck, Link: ExternalLink }[i.kind]} label={i.done ? 'Done' : undefined} />
          <Link
            href={`#${i.id}`}
            onClick={(e) => {
              e.preventDefault();
              setCur(i.id);
            }}
          >
            {n + 1}. {i.title}
          </Link>
          <span className="yx-growth-grow" />
          <span className="yx-growth-meta">{i.required ? `${i.minutes} min` : 'Optional'}</span>
        </li>
      ))}
    </ol>
  );
  const head = <Meter label="Required items done" value={pct} max={100} valueText={`${req.filter((i) => i.done).length} of ${req.length} required items · ${pct}%`} />;
  if (device === 'phone')
    return (
      <GrowthFrame area="learning" active="My learning" persona="emp" device="phone" phone={{ title: course.title, back: true, hideTabs: true }}>
        {head}
        {stage}
        {outline}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="learning" active="My learning" persona="emp">
      <PageHeader title={course.title} description={`${course.type} · ${course.duration} · pass mark 70% on the final quiz`} status={allDone ? <Badge tone="success">Completed</Badge> : <Badge tone="info">In progress</Badge>} />
      {head}
      <div className="yx-growth-player">
        {outline}
        {stage}
      </div>
    </GrowthFrame>
  );
}

/* ================================================================== LRN-06 · Nomination / enrolment / external request (+ decline) */

export interface EnrolmentSheetProps {
  mode: 'nominate' | 'self' | 'external' | 'decline';
  persona: 'mgr' | 'ld' | 'emp';
  device?: Device;
  course: Course;
  session?: { label: string; seats: number; enrolled: string[]; waitlist: string[] };
  people?: SelectOption[];
  budget: { department: string; planned: number; spent: number; committed: number; mode: 'warn' | 'block' };
  bondAbove?: number;
  defaultCost?: number;
  mandatory?: boolean;
}

/** LRN-06 request sheet (T4): nominate (seats / waitlist), self-enrol, external training (cost, bond, budget), decline a nomination. */
export function EnrolmentSheet({ mode, persona, device = 'desktop', course, session, people = [], budget, bondAbove = 25000, defaultCost, mandatory }: EnrolmentSheetProps) {
  const [who, setWho] = useState<string[]>(mode === 'nominate' ? people.slice(0, 2).map((p) => p.value) : []);
  const [cost, setCost] = useState<number | null>(defaultCost ?? course.cost);
  const [bond, setBond] = useState(false);
  const [reason, setReason] = useState('');
  const [due, setDue] = useState<Date | null>(new Date(2026, 10, 30));
  const total = mode === 'nominate' ? (cost ?? 0) * who.length : cost ?? 0;
  const b = budgetCheck(total, budget, budget.mode);
  const seatsResult = useMemo(() => {
    if (!session) return null;
    let s = { seats: session.seats, enrolled: session.enrolled, waitlist: session.waitlist };
    const out: { name: string; result: string }[] = [];
    for (const id of mode === 'nominate' ? who : ['me']) {
      const r = enrol(s, id);
      s = r;
      out.push({ name: people.find((p) => p.value === id)?.label ?? 'You', result: r.result === 'Waitlisted' ? `Waitlist, position ${'position' in r ? r.position : ''}` : r.result });
    }
    return out;
  }, [session, who, mode, people]);
  const needsBond = (cost ?? 0) > bondAbove;
  const title = mode === 'nominate' ? `Nominate for ${course.title}` : mode === 'self' ? `Enrol in ${course.title}` : mode === 'external' ? 'Request external training' : `Decline nomination: ${course.title}`;
  const blocked = b.level === 'block' || (needsBond && !bond && mode !== 'decline' && mode !== 'nominate') || (mode === 'decline' && (mandatory || reason.trim().length < 10));

  const body =
    mode === 'decline' ? (
      <div className="yx-growth-stack">
        {mandatory ? (
          <InlineAlert tone="warning" title="Mandatory courses can’t be declined">
            This course is required for your role. Talk to your manager if the date doesn’t work; they can move you to another session.
          </InlineAlert>
        ) : (
          <>
            <Text>Karthik Subramanian nominated you. Your manager sees your reason.</Text>
            <FormField label="Reason" required helper="At least 10 characters.">
              <TextArea value={reason} onChange={setReason} rows={3} />
            </FormField>
          </>
        )}
      </div>
    ) : (
      <div className="yx-growth-stack">
        {mode === 'external' ? (
          <>
            <FormField label="Course or certification" required>
              <TextField defaultValue="Certified Quality Auditor preparation" />
            </FormField>
            <FieldRow>
              <FormField label="Provider" required>
                <TextField defaultValue="Deccan Quality Institute" />
              </FormField>
              <FormField label="Cost" required helper="Fees only. Travel goes on an expense claim.">
                <CurrencyField value={cost} onChange={setCost} />
              </FormField>
            </FieldRow>
            <FormField label="Why this helps your work" required>
              <TextArea defaultValue="Supplier audits are 40% of my goals this year." rows={3} />
            </FormField>
          </>
        ) : (
          <>
            <DescriptionList items={[{ label: 'Course', value: course.title }, { label: 'Session', value: session?.label ?? 'Self-paced' }, { label: 'Cost per person', value: course.cost ? formatINR(course.cost) : 'No cost' }]} />
            {mode === 'nominate' && (
              <FormField label="People" required>
                <MultiSelect value={who} onChange={setWho} options={people} />
              </FormField>
            )}
            {mode === 'nominate' && (
              <FormField label="Complete by">
                <DatePicker value={due} onChange={setDue} />
              </FormField>
            )}
          </>
        )}
        {needsBond && mode !== 'nominate' && (
          <Card title="Training bond">
            <Text>
              Courses above {formatINR(bondAbove)} have a 12-month service agreement. If you leave within 12 months, a pro-rata share of {formatINR(cost ?? 0)} is recovered in your final settlement, after HR confirms.
            </Text>
            <div className="yx-growth-stack">
              <Link href="#bond">Read the full bond terms</Link>
              <Checkbox checked={bond} onChange={setBond} label="I accept the training bond terms" />
            </div>
          </Card>
        )}
        {b.level !== 'ok' && (
          <InlineAlert tone={b.level === 'block' ? 'danger' : 'warning'} title={b.level === 'block' ? 'Over budget' : 'Goes over budget'}>
            {b.message} {budget.department} has {formatINR(Math.max(0, b.remaining))} left for FY 2026-27.
          </InlineAlert>
        )}
        <div className="yx-growth-effect" aria-live="polite">
          <span className="yx-growth-effect__title">What happens</span>
          <ul>
            {seatsResult?.map((s) => (
              <li key={s.name}>
                {s.name}: {s.result}
              </li>
            ))}
            {total > 0 && (
              <li>
                Cost {formatINR(total)} against {budget.department}’s budget: {formatINR(budget.planned - budget.spent - budget.committed)} → {formatINR(b.after)}
              </li>
            )}
            <li>{mode === 'nominate' ? 'Each person is told and can decline with a reason, except for mandatory courses.' : course.approval || mode === 'external' ? 'Goes to your manager, then L&D for approval.' : 'You’re enrolled straight away.'}</li>
            {course.certificate && <li>A certificate is issued on completion.</li>}
          </ul>
        </div>
      </div>
    );
  const footer = (
    <div className="yx-growth-foot">
      <Button>Cancel</Button>
      <Button variant={mode === 'decline' ? 'danger' : 'primary'} disabled={blocked} fullWidth={device === 'phone'}>
        {mode === 'nominate' ? `Nominate ${who.length} ${who.length === 1 ? 'person' : 'people'}` : mode === 'self' ? (course.approval ? 'Send request' : 'Enrol') : mode === 'external' ? 'Send request' : 'Decline nomination'}
      </Button>
    </div>
  );
  const active = mode === 'nominate' ? 'Catalogue' : 'My learning';
  if (device === 'phone')
    return (
      <GrowthFrame area="learning" active={active} persona={persona === 'emp' ? 'emp' : 'mgr'} device="phone" phone={{ title: 'Learning', tab: 'requests' }}>
        <BottomSheet open onOpenChange={() => {}} title={title} footer={footer}>
          {body}
        </BottomSheet>
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="learning" active={active} persona={persona === 'emp' ? 'emp' : persona === 'ld' ? 'ld' : 'mgr'}>
      <PageHeader title="Catalogue" description="Courses, sessions and paths" />
      <div className="yx-growth-cards">
        <CourseCard c={course} />
      </div>
      <Drawer open onOpenChange={() => {}} title={title} footer={footer}>
        {body}
      </Drawer>
    </GrowthFrame>
  );
}

/* ================================================================== LRN-10 · Skills profile */

export interface PersonSkill {
  id: string;
  name: string;
  level: number | null;
  required?: number;
  source: 'Self' | 'Manager' | 'Test' | 'Course' | 'Project' | 'AI-confirmed';
  evidence: string;
  updated: Date;
}

/** LRN-10 Skills profile (T3): confirmed skills with source and evidence, gaps for the next role; only confirmed skills count (YX-PERF-20). */
export function SkillsProfileScreen({ persona, device = 'desktop', person, role, nextRole, skills, pending, state = 'ready' }: { persona: 'emp' | 'mgr'; device?: Device; person: string; role: string; nextRole: string; skills: PersonSkill[]; pending: number; state?: LoadState }) {
  const list =
    state === 'empty' || skills.length === 0 ? (
      <EmptyState title="No confirmed skills yet" description="Skills are added from completed courses, tests, projects and your manager. Confirm suggestions to build your profile." action={<Button>Add a skill</Button>} />
    ) : (
      <ul className="yx-growth-list">
        {skills.map((s) => (
          <li key={s.id} className="yx-growth-list__item">
            <div className="yx-growth-list__main">
              <span className="yx-growth-list__title">{s.name}</span>
              <span className="yx-growth-meta">
                Source: {s.source} · {s.evidence} · {formatDate(s.updated)}
              </span>
            </div>
            <SkillLevel level={s.level} required={s.required} label={s.name} />
          </li>
        ))}
      </ul>
    );
  const gaps = skills.filter((s) => s.required != null && (s.level == null || s.level < s.required));
  const side = (
    <Card title={`Gaps for ${nextRole}`}>
      {gaps.length === 0 ? (
        <Text tone="secondary">No gaps. You meet every required level for {nextRole}.</Text>
      ) : (
        <ul className="yx-growth-list">
          {gaps.map((g) => (
            <li key={g.id} className="yx-growth-list__item">
              <span className="yx-growth-grow">{g.name}</span>
              <span className="yx-growth-meta">{g.level == null ? 'Not assessed' : `${g.required! - g.level} below`}</span>
              <Button size="sm">Add to IDP</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
  const banner = pending > 0 && (
    <InlineAlert tone="ai" title={`${pending} skill suggestions to confirm`} actions={<Button size="sm">Review suggestions</Button>}>
      Suggestions join {persona === 'emp' ? 'your' : `${person}’s`} profile only after {persona === 'emp' ? 'you or your manager' : 'you or they'} confirm.
    </InlineAlert>
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="learning" active="Skills" persona={persona} device="phone" phone={{ title: 'My skills' }}>
        {banner}
        {list}
        {side}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="learning" active="Skills" persona={persona}>
      <PageHeader title={persona === 'emp' ? 'My skills' : `${person}’s skills`} description={`${role} · next role on path: ${nextRole}`} actions={<Button variant="primary">Add a skill</Button>} />
      {banner}
      {state === 'loading' ? (
        <Skeleton height={300} />
      ) : (
        <div className="yx-growth-split">
          <div className="yx-growth-split__main">{list}</div>
          <aside className="yx-growth-split__side">{side}</aside>
        </div>
      )}
    </GrowthFrame>
  );
}

/* ================================================================== LRN-12 · Session feedback + 60-day manager check */

/** LRN-12 (T4): reaction survey after a session (Emp) and the manager's 60-day "applying the skill?" check (Q8). */
export function TrainingFeedbackScreen({ mode, device = 'desktop', course, trainer, person, sent }: { mode: 'reaction' | 'manager-check'; device?: Device; course: string; trainer: string; person?: string; sent?: boolean }) {
  const [overall, setOverall] = useState<number | null>(null);
  const [trainerScore, setTrainerScore] = useState<number | null>(null);
  const [applying, setApplying] = useState('');
  const [done, setDone] = useState(!!sent);
  const labels = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  const body = done ? (
    <InlineAlert tone="success" title="Thank you">
      {mode === 'reaction' ? 'Your feedback goes into the course and trainer scores. It’s shown to the trainer only as a summary.' : 'Recorded. L&D uses this to judge how well the course works.'}
    </InlineAlert>
  ) : mode === 'reaction' ? (
    <div className="yx-growth-stack">
      <FormField label="How useful was the session overall?" required>
        <RatingScale label="Overall" value={overall} onChange={setOverall} labels={labels} />
      </FormField>
      <FormField label={`How was the trainer, ${trainer}?`} required>
        <RatingScale label="Trainer" value={trainerScore} onChange={setTrainerScore} labels={labels} />
      </FormField>
      <FormField label="What would you change?" optional>
        <TextArea rows={3} />
      </FormField>
    </div>
  ) : (
    <div className="yx-growth-stack">
      <Text>
        {person} completed <strong>{course}</strong> on 30 Jul 2026. Is {person?.split(' ')[0]} applying what they learnt?
      </Text>
      <RadioGroup
        aria-label="Applying the skill"
        value={applying}
        onChange={setApplying}
        options={[
          { value: 'yes', label: 'Yes, regularly' },
          { value: 'partly', label: 'Partly' },
          { value: 'no', label: 'Not yet' },
          { value: 'early', label: 'Too early to say', description: 'We’ll ask again in 30 days.' },
        ]}
      />
      <FormField label="Example or comment" optional>
        <TextArea rows={3} />
      </FormField>
    </div>
  );
  const btn = !done && (
    <Button variant="primary" icon={Star} fullWidth={device === 'phone'} disabled={mode === 'reaction' ? overall == null || trainerScore == null : !applying} onClick={() => setDone(true)}>
      Send feedback
    </Button>
  );
  const title = mode === 'reaction' ? `Feedback: ${course}` : '60-day check';
  if (device === 'phone')
    return (
      <GrowthFrame area="learning" active="My learning" persona={mode === 'reaction' ? 'emp' : 'mgr'} device="phone" phone={{ title, back: true, tab: mode === 'reaction' ? 'me' : 'requests' }}>
        {body}
        {btn && <div className="yx-growth-pinned">{btn}</div>}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="learning" active="My learning" persona={mode === 'reaction' ? 'emp' : 'mgr'}>
      <PageHeader title={title} description={mode === 'reaction' ? `Classroom session with ${trainer} · 24 Sep 2026 · Hosur plant` : `${course} · trainer ${trainer}`} actions={btn} />
      <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
        {body}
      </div>
    </GrowthFrame>
  );
}

/* ================================================================== LRN-13 · My tests */

export interface MyTest {
  id: string;
  title: string;
  source: string;
  due: Date | null;
  minutes: number;
  status: 'Not started' | 'In progress' | 'Passed' | 'Failed' | 'Expired';
  score?: number;
  passMark: number;
  attemptsLeft: number;
  proctored?: boolean;
}

/** LRN-13 My tests (T8): training and skills tests with due date, start (consent per attempt), results back on the enrolment (YX-DLV-13). */
export function MyTestsScreen({ device = 'desktop', tests, consentFor, state = 'ready' }: { device?: Device; tests: MyTest[]; consentFor?: string; state?: LoadState }) {
  const [consent, setConsent] = useState<string | null>(consentFor ?? null);
  const [agree, setAgree] = useState(false);
  const t = tests.find((x) => x.id === consent);
  const list =
    state === 'loading' ? (
      <Skeleton height={240} />
    ) : tests.length === 0 ? (
      <EmptyState title="No tests assigned to you" description="Tests from your courses and skills checks appear here with their due dates." />
    ) : (
      <ul className="yx-growth-list">
        {tests.map((x) => (
          <li key={x.id} className="yx-growth-list__item">
            <div className="yx-growth-list__main">
              <span className="yx-growth-list__title">{x.title}</span>
              <span className="yx-growth-meta">
                {x.source} · {x.minutes} min · pass {x.passMark}%{x.due ? ` · due ${formatDate(x.due)}` : ''}
                {x.proctored ? ' · proctored' : ''}
              </span>
            </div>
            {x.score != null && <span className="yx-growth-num">{x.score}%</span>}
            <Badge tone={x.status === 'Passed' ? 'success' : x.status === 'Failed' || x.status === 'Expired' ? 'danger' : x.status === 'In progress' ? 'info' : 'neutral'}>{x.status}</Badge>
            {(x.status === 'Not started' || x.status === 'In progress' || (x.status === 'Failed' && x.attemptsLeft > 0)) && (
              <Button size="sm" onClick={() => setConsent(x.id)}>
                {x.status === 'In progress' ? 'Resume' : x.status === 'Failed' ? `Retake (${x.attemptsLeft} left)` : 'Start'}
              </Button>
            )}
            {x.status === 'Passed' && (
              <Button size="sm" icon={Download}>
                Certificate
              </Button>
            )}
          </li>
        ))}
      </ul>
    );
  const sheetBody = t && (
    <div className="yx-growth-stack">
      <DescriptionList items={[{ label: 'Time', value: `${t.minutes} minutes, once started` }, { label: 'Pass mark', value: `${t.passMark}%` }, { label: 'Attempts left', value: t.attemptsLeft }]} />
      {t.proctored && <InlineAlert tone="info" title="This test is proctored">Your camera and screen are recorded during the test and reviewed only if something is flagged.</InlineAlert>}
      <Checkbox checked={agree} onChange={setAgree} label="I agree to the test rules and how my result is used" description="The result goes to your course record and your skills profile." />
    </div>
  );
  const sheetFooter = (
    <div className="yx-growth-foot">
      <Button onClick={() => setConsent(null)}>Cancel</Button>
      <Button variant="primary" disabled={!agree} icon={Play}>
        Start test
      </Button>
    </div>
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="learning" active="My tests" persona="emp" device="phone" phone={{ title: 'My tests' }}>
        {list}
        {t && (
          <BottomSheet open onOpenChange={(o) => !o && setConsent(null)} title={t.title} footer={sheetFooter}>
            {sheetBody}
          </BottomSheet>
        )}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="learning" active="My tests" persona="emp">
      <PageHeader title="My tests" description="Signed in as you: no separate link or password." />
      {list}
      {t && (
        <Drawer open onOpenChange={(o) => !o && setConsent(null)} title={t.title} footer={sheetFooter}>
          {sheetBody}
        </Drawer>
      )}
    </GrowthFrame>
  );
}

/* ================================================================== LRN-15 · Skill suggestions to confirm */

export interface SkillSuggestion {
  id: string;
  skill: string;
  level: number;
  from: 'Course' | 'Test' | 'Project' | 'CV';
  evidence: string;
}

/** LRN-15 (T3 / T8): AI skill suggestions stay pending until the employee or manager confirms; rejected ones aren't re-offered from the same evidence. */
export function SkillSuggestionsScreen({ persona, device = 'desktop', person, suggestions }: { persona: 'emp' | 'mgr'; device?: Device; person: string; suggestions: SkillSuggestion[] }) {
  const [decided, setDecided] = useState<Record<string, 'Confirmed' | 'Rejected'>>({});
  const open = suggestions.filter((s) => !decided[s.id]);
  const list =
    suggestions.length === 0 ? (
      <EmptyState title="No suggestions to review" description="When you finish a course, pass a test or close a project, suggested skills appear here." />
    ) : (
      <ul className="yx-growth-list" aria-live="polite">
        {suggestions.map((s) => (
          <li key={s.id} className="yx-growth-list__item">
            <div className="yx-growth-list__main">
              <span className="yx-growth-list__title">
                {s.skill} · level {s.level}
              </span>
              <span className="yx-growth-meta">
                From {s.from.toLowerCase()}: {s.evidence}
              </span>
            </div>
            {decided[s.id] ? (
              <Badge tone={decided[s.id] === 'Confirmed' ? 'success' : 'neutral'}>{decided[s.id]}</Badge>
            ) : (
              <>
                <Button size="sm" icon={CheckCircle2} onClick={() => setDecided((d) => ({ ...d, [s.id]: 'Confirmed' }))}>
                  Confirm
                </Button>
                <Button size="sm" icon={X} onClick={() => setDecided((d) => ({ ...d, [s.id]: 'Rejected' }))}>
                  Reject
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    );
  const intro = (
    <div className="yx-growth-row">
      <AiBadge />
      <Text size="sm" tone="secondary">
        Suggested from evidence. Nothing joins {persona === 'emp' ? 'your' : `${person}’s`} profile until confirmed. A rejected suggestion isn’t offered again from the same evidence.
      </Text>
    </div>
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="learning" active="Skills" persona={persona} device="phone" phone={{ title: 'Skills to confirm', back: true }}>
        {intro}
        {list}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="learning" active="Skills" persona={persona}>
      <PageHeader title={persona === 'emp' ? 'Skills to confirm' : `Skills to confirm for ${person}`} facts={`${open.length} waiting`} actions={open.length > 0 ? <Button onClick={() => setDecided(Object.fromEntries(suggestions.map((s) => [s.id, 'Confirmed'])))}>Confirm all</Button> : undefined} />
      {intro}
      {list}
      {persona === 'mgr' && <PersonLabel name={person} secondary="You’re confirming as their manager; they are told." />}
    </GrowthFrame>
  );
}
