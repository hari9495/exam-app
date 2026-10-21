// Learning, wired to the API (the core): My learning and catalogue (LRN-01), the course player (LRN-02), the courses
// list and course builder (LRN-03), assignment rules (LRN-07), the compliance dashboard (LRN-08) and the manager's
// team view. Each keeps its design's layout and words; what the core does not have yet is left out, never faked.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Award, BookOpen, CheckCircle2, ClipboardCheck, Download, ExternalLink, FileText, Film, Package, Play, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Link } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Heatmap, StatCard } from '../../components/charts';
import { DataTable } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { MilestoneMoment } from '../../components/notify';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { Select, type SelectOption } from '../../components/select';
import { FileUpload } from '../../components/upload';
import { ConditionBuilder } from '../../components/condition';
import { isGroup, type Rule, type RuleSchema } from '../../lib/rules';
import { formatDate } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { GrowthFrame, ProgressRing } from './growth-kit';
import { complianceCell } from './growth-logic';
import type { Course, CourseType } from './learn-me';
import type { LoadState } from './perf-goals';
import './growth.css';

const day = (iso: string | null | undefined) => (iso ? new Date(`${iso}T00:00:00`) : null);
const TYPE_ICON: Record<string, typeof Film> = { Classroom: BookOpen, Virtual: Film, 'Self-paced': Film, SCORM: Package, 'Assessment only': ClipboardCheck };
const KIND_ICON = { Video: Film, PDF: FileText, Link: ExternalLink } as const;

function Loading({ state, onRetry, what, children }: { state: LoadState; onRetry?: () => void; what: string; children: () => ReactNode }) {
  if (state === 'loading') return <Skeleton height={320} />;
  if (state === 'error') return <ErrorState title={`${what} didn’t load`} description="Try again in a moment." onRetry={onRetry} />;
  return <>{children()}</>;
}

/* ================================================================== LRN-01 · My learning + catalogue */

export type LiveEnrolmentStatus = 'Requested' | 'Enrolled' | 'In progress' | 'Completed' | 'Overdue';
export interface LiveEnrolment {
  id: string;
  course: Course;
  status: LiveEnrolmentStatus;
  source: string;
  due: string | null;
  progress: number;
}
export interface LiveCertificate {
  id: string;
  title: string;
  issued: string;
  expires: string | null;
  renewal: string | null;
}
export interface LiveExternal {
  id: string;
  title: string;
  provider: string;
  cost: number;
  status: 'Requested' | 'Approved';
  requested: string;
}
export interface ExternalInput {
  title: string;
  provider: string;
  cost: number;
  reason: string;
  acceptBond: boolean;
}
export interface LiveMyLearning {
  state: LoadState;
  onRetry: () => void;
  data: { today: string; employee: boolean; enrolments: LiveEnrolment[]; certificates: LiveCertificate[]; catalogue: Course[]; external?: LiveExternal[] } | null;
  /** LRN-06 external: training outside the catalogue (employees only). */
  onExternal?: (input: ExternalInput) => Promise<void>;
  tab: 'mine' | 'catalogue' | 'certificates';
  onTab: (tab: 'mine' | 'catalogue' | 'certificates') => void;
  onOpen: (enrolmentId: string) => void;
  /** Enrol, or ask when the course needs approval; above the bond threshold the bond is accepted first. */
  onEnrol: (course: Course, opts: { acceptBond: boolean }) => Promise<void>;
  onDownload: (certificateId: string) => void;
}

const STATUS_TONE: Record<LiveEnrolmentStatus, BadgeTone> = { Overdue: 'danger', Requested: 'info', Enrolled: 'neutral', 'In progress': 'neutral', Completed: 'success' };

function LiveCourseCard({ c, action }: { c: Course; action?: ReactNode }) {
  return (
    <article className="yx-growth-card" aria-label={c.title}>
      <div className="yx-growth-card__thumb" aria-hidden="true">
        <Icon icon={TYPE_ICON[c.type] ?? Film} size="md" />
      </div>
      <h3 className="yx-growth-card__title">{c.title}</h3>
      <span className="yx-growth-meta">
        {c.type} · {c.duration}
        {c.source === 'Provider' ? ` · ${c.provider}` : c.source === 'Partner pack' ? ' · Partner pack' : ''}
      </span>
      <div className="yx-growth-row">
        {c.mandatory && <Badge tone="warning">Mandatory</Badge>}
        {c.certificate && <Badge tone="success">Certificate</Badge>}
        {c.source === 'Provider' && <Badge>{c.provider}</Badge>}
      </div>
      {c.skills.length > 0 && <span className="yx-growth-meta">Skills: {c.skills.join(', ')}</span>}
      <div className="yx-growth-card__foot">
        <span className="yx-growth-meta yx-growth-grow">{c.cost ? `₹${c.cost.toLocaleString('en-IN')}` : 'No cost'}{c.approval ? ' · needs approval' : ''}</span>
        {action}
      </div>
    </article>
  );
}

export function LiveMyLearningScreen({ live }: { live: LiveMyLearning }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState<Course | null>(null);
  const [asking, setAsking] = useState(false);
  const d = live.data;
  const open = new Map((d?.enrolments ?? []).filter((e) => e.status !== 'Completed').map((e) => [e.course.id, e.status]));
  const completed = new Set((d?.enrolments ?? []).filter((e) => e.status === 'Completed').map((e) => e.course.id));
  const fields: FilterFieldDef[] = useMemo(() => {
    const sources = [...new Set((d?.catalogue ?? []).map((c) => c.source))];
    const types = [...new Set((d?.catalogue ?? []).map((c) => c.type))];
    return [
      { key: 'source', label: 'Source', type: 'multi', options: sources.map((v) => ({ value: v, label: v })) },
      { key: 'type', label: 'Type', type: 'multi', options: types.map((v) => ({ value: v, label: v })) },
    ];
  }, [d?.catalogue]);
  const shownCat = (d?.catalogue ?? []).filter((c) => (!q || c.title.toLowerCase().includes(q.toLowerCase())) && filters.every((f) => matchesFilter((c as unknown as Record<string, unknown>)[f.key], f)));
  const cont = d?.enrolments.find((e) => e.status === 'In progress');
  const assigned = (d?.enrolments ?? []).filter((e) => e.status !== 'Completed');
  const external = d?.external ?? [];

  const mine = () =>
    !d || assigned.length + external.length === 0 ? (
      <EmptyState title="Nothing assigned to you right now" description="Mandatory courses appear here with their due dates. Browse the catalogue to learn something new." action={<Button variant="primary" onClick={() => live.onTab('catalogue')}>Browse catalogue</Button>} />
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
                  {cont.due ? ` · due ${formatDate(day(cont.due))}` : ''}
                </span>
              </div>
              <Button variant="primary" icon={Play} onClick={() => live.onOpen(cont.id)}>
                Continue
              </Button>
            </div>
          </section>
        )}
        <section aria-label="Assigned to me" className="yx-growth-stack" data-gap="sm">
          <h2 className="yx-growth-h">Assigned to me · {assigned.length + external.length}</h2>
          <ul className="yx-growth-list">
            {external.map((x) => (
              <li key={x.id} className="yx-growth-list__item">
                <ProgressRing value={null} label={x.title} size="sm" />
                <div className="yx-growth-list__main">
                  <span className="yx-growth-list__title">{x.title}</span>
                  <span className="yx-growth-meta">
                    External · {x.provider} · ₹{x.cost.toLocaleString('en-IN')} · asked {formatDate(day(x.requested))}
                  </span>
                </div>
                <Badge tone={x.status === 'Approved' ? 'success' : 'info'}>{x.status}</Badge>
              </li>
            ))}
            {assigned.map((e) => (
              <li key={e.id} className="yx-growth-list__item">
                <ProgressRing value={e.progress} label={e.course.title} size="sm" tone={e.status === 'Overdue' ? 'danger' : 'default'} />
                <div className="yx-growth-list__main">
                  {e.status === 'Requested' ? (
                    <span className="yx-growth-list__title">{e.course.title}</span>
                  ) : (
                    <Link href={`#${e.id}`} onClick={(ev) => (ev.preventDefault(), live.onOpen(e.id))}>
                      {e.course.title}
                    </Link>
                  )}
                  <span className="yx-growth-meta">
                    {e.source}
                    {e.due ? ` · due ${formatDate(day(e.due))}` : ''}
                  </span>
                </div>
                {e.course.mandatory && <Badge tone="warning">Mandatory</Badge>}
                <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );

  const certs = () =>
    !d || d.certificates.length === 0 ? (
      <EmptyState compact title="No certificates yet" description="Certificates are issued automatically when you complete a course that has one." />
    ) : (
      <ul className="yx-growth-list">
        {d.certificates.map((c) => {
          const expired = Boolean(c.expires && c.expires < d.today);
          return (
            <li key={c.id} className="yx-growth-list__item">
              <Icon icon={Award} size="md" />
              <div className="yx-growth-list__main">
                <span className="yx-growth-list__title">{c.title}</span>
                <span className="yx-growth-meta">
                  Issued {formatDate(day(c.issued))} · {c.expires ? `${expired ? 'expired' : 'valid until'} ${formatDate(day(c.expires))}` : 'no expiry'}
                  {c.renewal ? ` · renewal enrolled ${formatDate(day(c.renewal))}` : ''}
                </span>
              </div>
              {expired ? <Badge tone="danger">Expired</Badge> : <Badge tone="success">Valid</Badge>}
              <Button size="sm" icon={Download} onClick={() => live.onDownload(c.id)}>
                Download
              </Button>
            </li>
          );
        })}
      </ul>
    );

  const cat = () => (
    <div className="yx-growth-stack">
      <FilterBar fields={fields} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search courses" />
      {shownCat.length === 0 ? (
        (d?.catalogue.length ?? 0) === 0 ? (
          <EmptyState compact title="No courses in the catalogue yet" description="Courses L&D publishes appear here." />
        ) : (
          <EmptyState compact title="No courses match these filters" action={<Button onClick={() => (setFilters([]), setQ(''))}>Clear filters</Button>} />
        )
      ) : (
        <div className="yx-growth-cards">
          {shownCat.map((c) => (
            <LiveCourseCard
              key={c.id}
              c={c}
              action={
                open.has(c.id) ? (
                  <Badge tone="info">{open.get(c.id) === 'Requested' ? 'Requested' : 'Enrolled'}</Badge>
                ) : completed.has(c.id) ? (
                  <Badge tone="success">Completed</Badge>
                ) : d?.employee ? (
                  <Button size="sm" onClick={() => setSheet(c)}>
                    {c.approval ? 'Request' : 'Enrol'}
                  </Button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <GrowthFrame area="learning" active={live.tab === 'catalogue' ? 'Catalogue' : 'My learning'} persona="emp">
      <PageHeader title="My learning" description="Your assigned courses, what to continue, and certificates." actions={d?.employee && live.onExternal ? <Button onClick={() => setAsking(true)}>Request external training</Button> : undefined} />
      <Loading state={live.state} onRetry={live.onRetry} what="Your learning">
        {() => (
          <Tabs value={live.tab} onValueChange={(v) => live.onTab(v as LiveMyLearning['tab'])}>
            <TabsList aria-label="Learning">
              <TabsTrigger value="mine" count={assigned.length + external.length}>
                My learning
              </TabsTrigger>
              <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
              <TabsTrigger value="certificates" count={d?.certificates.length ?? 0}>
                Certificates
              </TabsTrigger>
            </TabsList>
            <TabsContent value="mine">{mine()}</TabsContent>
            <TabsContent value="catalogue">{cat()}</TabsContent>
            <TabsContent value="certificates">{certs()}</TabsContent>
          </Tabs>
        )}
      </Loading>
      {sheet && <EnrolSheet course={sheet} onClose={() => setSheet(null)} onEnrol={live.onEnrol} />}
      {asking && live.onExternal && <ExternalSheet onClose={() => setAsking(false)} onSend={live.onExternal} />}
    </GrowthFrame>
  );
}

/** Courses above this carry a 12-month training bond (LRN-06; the design's threshold). */
export const BOND_ABOVE = 25000;

/** LRN-06 "self": enrol in a course, or ask when it needs approval; the bond is accepted first above the threshold. */
function EnrolSheet({ course, onClose, onEnrol }: { course: Course; onClose: () => void; onEnrol: LiveMyLearning['onEnrol'] }) {
  const [bond, setBond] = useState(false);
  const [busy, setBusy] = useState(false);
  const needsBond = course.cost > BOND_ABOVE;
  const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Enrol in ${course.title}`}
      footer={
        <div className="yx-growth-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={needsBond && !bond}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onEnrol(course, { acceptBond: needsBond && bond });
                onClose();
              } catch {
                // The page has said what went wrong; the sheet stays open to try again.
              } finally {
                setBusy(false);
              }
            }}
          >
            {course.approval ? 'Send request' : 'Enrol'}
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        <DescriptionList items={[{ label: 'Course', value: course.title }, { label: 'Session', value: course.type === 'Self-paced' ? 'Self-paced' : course.type }, { label: 'Cost per person', value: course.cost ? inr(course.cost) : 'No cost' }]} />
        {needsBond && (
          <Card title="Training bond">
            <Text>
              Courses above {inr(BOND_ABOVE)} have a 12-month service agreement. If you leave within 12 months, a pro-rata share of {inr(course.cost)} is recovered in your final settlement, after HR confirms.
            </Text>
            <div className="yx-growth-stack">
              <Checkbox checked={bond} onChange={setBond} label="I accept the training bond terms" />
            </div>
          </Card>
        )}
        <div className="yx-growth-effect" aria-live="polite">
          <span className="yx-growth-effect__title">What happens</span>
          <ul>
            <li>{course.approval ? 'Goes to your manager, then L&D for approval.' : 'You’re enrolled straight away.'}</li>
            {course.certificate && <li>A certificate is issued on completion.</li>}
          </ul>
        </div>
      </div>
    </Drawer>
  );
}

/** LRN-06 external: a course or certification outside the catalogue; the bond above the threshold. */
function ExternalSheet({ onClose, onSend }: { onClose: () => void; onSend: (input: ExternalInput) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');
  const [cost, setCost] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [bond, setBond] = useState(false);
  const [errors, setErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const needsBond = (cost ?? 0) > BOND_ABOVE;
  const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const ok = title.trim().length >= 3 && provider.trim().length >= 2 && cost !== null && reason.trim().length >= 10;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Request external training"
      footer={
        <div className="yx-growth-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={needsBond && !bond}
            loading={busy}
            onClick={async () => {
              if (!ok) return setErrors(true);
              setBusy(true);
              try {
                await onSend({ title: title.trim(), provider: provider.trim(), cost: cost ?? 0, reason: reason.trim(), acceptBond: needsBond && bond });
                onClose();
              } catch {
                // The page has said what went wrong; the sheet stays open.
              } finally {
                setBusy(false);
              }
            }}
          >
            Send request
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        <FormField label="Course or certification" required error={errors && title.trim().length < 3 ? 'Name the course or certification.' : null}>
          <TextField value={title} onChange={setTitle} />
        </FormField>
        <FieldRow>
          <FormField label="Provider" required error={errors && provider.trim().length < 2 ? 'Name the provider.' : null}>
            <TextField value={provider} onChange={setProvider} />
          </FormField>
          <FormField label="Cost" required helper="Fees only. Travel goes on an expense claim." error={errors && cost === null ? 'Enter the fees (0 if free).' : null}>
            <CurrencyField value={cost} onChange={setCost} />
          </FormField>
        </FieldRow>
        <FormField label="Why this helps your work" required helper="At least 10 characters." error={errors && reason.trim().length < 10 ? 'Say how it helps your work.' : null}>
          <TextArea value={reason} onChange={setReason} rows={3} />
        </FormField>
        {needsBond && (
          <Card title="Training bond">
            <Text>
              Courses above {inr(BOND_ABOVE)} have a 12-month service agreement. If you leave within 12 months, a pro-rata share of {inr(cost ?? 0)} is recovered in your final settlement, after HR confirms.
            </Text>
            <div className="yx-growth-stack">
              <Checkbox checked={bond} onChange={setBond} label="I accept the training bond terms" />
            </div>
          </Card>
        )}
        <div className="yx-growth-effect" aria-live="polite">
          <span className="yx-growth-effect__title">What happens</span>
          <ul>
            <li>Goes to your manager, then L&amp;D for approval.</li>
          </ul>
        </div>
      </div>
    </Drawer>
  );
}

/* ================================================================== LRN-02 · Course player */

export interface LivePlayerItem {
  id: string;
  title: string;
  kind: 'Video' | 'PDF' | 'Link';
  minutes: number;
  required: boolean;
  done: boolean;
  url: string | null;
}
export interface LivePlayer {
  state: LoadState;
  onRetry: () => void;
  data: { enrolment: { id: string; status: LiveEnrolmentStatus; due: string | null }; course: Course; items: LivePlayerItem[]; certificate: { id: string; issued: string; expires: string | null } | null } | null;
  /** Opens the item: the file in a new tab, or the link. */
  onOpenItem: (item: LivePlayerItem) => void;
  onDone: (item: LivePlayerItem) => Promise<void>;
  onDownload: (certificateId: string) => void;
}

export function LiveCoursePlayerScreen({ live }: { live: LivePlayer }) {
  const d = live.data;
  const [cur, setCur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const items = d?.items ?? [];
  const item = items.find((i) => i.id === cur) ?? items.find((i) => !i.done) ?? items[0];
  const req = items.filter((i) => i.required);
  const doneReq = req.filter((i) => i.done).length;
  const pct = Math.round((doneReq / Math.max(1, req.length)) * 100);
  const completed = d?.enrolment.status === 'Completed';

  const stage = !d || !item ? null : completed ? (
    <MilestoneMoment
      title={`You completed ${d.course.title}`}
      description={d.certificate ? `Your certificate is issued${d.certificate.expires ? `, valid until ${formatDate(day(d.certificate.expires))}` : ''}.` : 'Well done.'}
      action={d.certificate ? <Button variant="primary" icon={Download} onClick={() => live.onDownload(d.certificate!.id)}>Download certificate</Button> : undefined}
    />
  ) : (
    <div className="yx-growth-stack">
      <div className="yx-growth-player__stage" role="region" aria-label={`${item.kind}: ${item.title}`}>
        <Icon icon={KIND_ICON[item.kind]} size="md" />
        <strong>{item.title}</strong>
        <span>{item.kind === 'Video' ? `Video · ${item.minutes} min` : `${item.kind} · ${item.minutes} min`}</span>
        <Button icon={item.kind === 'Video' ? Play : ExternalLink} onClick={() => live.onOpenItem(item)}>
          {item.kind === 'Video' ? 'Play' : 'Open'}
        </Button>
      </div>
      {d.enrolment.status === 'Requested' ? (
        <InlineAlert tone="info" title="Waiting for approval">You can start once your request is approved.</InlineAlert>
      ) : (
        !item.done && (
          <Button
            icon={CheckCircle2}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await live.onDone(item);
              } finally {
                setBusy(false);
              }
            }}
          >
            Mark as done
          </Button>
        )
      )}
    </div>
  );
  const outline = (
    <ol className="yx-growth-player__outline" aria-label="Course contents">
      {items.map((i, n) => (
        <li key={i.id} className="yx-growth-player__item" aria-current={item && i.id === item.id ? 'step' : undefined}>
          <Icon icon={i.done ? CheckCircle2 : KIND_ICON[i.kind]} label={i.done ? 'Done' : undefined} />
          <Link href={`#${i.id}`} onClick={(e) => (e.preventDefault(), setCur(i.id))}>
            {n + 1}. {i.title}
          </Link>
          <span className="yx-growth-grow" />
          <span className="yx-growth-meta">{i.required ? `${i.minutes} min` : 'Optional'}</span>
        </li>
      ))}
    </ol>
  );
  return (
    <GrowthFrame area="learning" active="My learning" persona="emp">
      <PageHeader
        title={d?.course.title ?? 'Course'}
        description={d ? `${d.course.type} · ${d.course.duration}${d.enrolment.due && !completed ? ` · due ${formatDate(day(d.enrolment.due))}` : ''}` : undefined}
        status={d ? <Badge tone={completed ? 'success' : d.enrolment.status === 'Overdue' ? 'danger' : 'info'}>{completed ? 'Completed' : d.enrolment.status === 'Overdue' ? 'Overdue' : d.enrolment.status === 'Requested' ? 'Requested' : 'In progress'}</Badge> : undefined}
      />
      <Loading state={live.state} onRetry={live.onRetry} what="The course">
        {() =>
          items.length === 0 ? (
            <EmptyState title="This course has no content yet" description="L&D is still adding it." />
          ) : (
            <>
              <Meter label="Required items done" value={completed ? 100 : pct} max={100} valueText={`${completed ? req.length : doneReq} of ${req.length} required items · ${completed ? 100 : pct}%`} />
              <div className="yx-growth-player">
                {outline}
                {stage}
              </div>
            </>
          )
        }
      </Loading>
    </GrowthFrame>
  );
}

/* ================================================================== LRN-03 · Courses list + course builder */

export interface CourseDetails {
  title: string;
  description: string;
  source: 'company' | 'provider' | 'partner';
  provider: string;
  durationMinutes: number;
  cost: number;
  mandatory: boolean;
  needsApproval: boolean;
  certificate: boolean;
  certificateMonths: number | null;
  skills: string[];
}
export const NEW_COURSE: CourseDetails = { title: '', description: '', source: 'company', provider: '', durationMinutes: 30, cost: 0, mandatory: false, needsApproval: false, certificate: true, certificateMonths: 12, skills: [] };

/** A course's details: what it is, where it is from, what it costs, whether it is mandatory and gives a certificate. */
export function CourseDetailsFields({ value, onChange, showErrors }: { value: CourseDetails; onChange: (v: CourseDetails) => void; showErrors?: boolean }) {
  const set = (p: Partial<CourseDetails>) => onChange({ ...value, ...p });
  return (
    <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
      <FormField label="Course name" required error={showErrors && value.title.trim().length < 2 ? 'Give the course a name.' : null}>
        <TextField value={value.title} onChange={(v) => set({ title: v })} />
      </FormField>
      <FormField label="What it covers">
        <TextArea value={value.description} onChange={(v) => set({ description: v })} rows={2} />
      </FormField>
      <FormField label="Made by">
        <RadioGroup aria-label="Made by" orientation="horizontal" value={value.source} onChange={(v) => set({ source: v as CourseDetails['source'] })} options={[{ value: 'company', label: 'Our company' }, { value: 'provider', label: 'A training provider' }, { value: 'partner', label: 'Partner pack' }]} />
      </FormField>
      {value.source !== 'company' && (
        <FormField label="Provider" required error={showErrors && !value.provider.trim() ? 'Name the provider.' : null}>
          <TextField value={value.provider} onChange={(v) => set({ provider: v })} />
        </FormField>
      )}
      <FieldRow>
        <FormField label="Time to complete">
          <NumberField value={value.durationMinutes} onChange={(v) => set({ durationMinutes: v ?? 0 })} suffix="min" min={0} />
        </FormField>
        <FormField label="Cost per person">
          <CurrencyField value={value.cost} onChange={(v) => set({ cost: v ?? 0 })} />
        </FormField>
      </FieldRow>
      <FormField label="Skills it builds" helper="Separate skills with commas.">
        <TextField value={value.skills.join(', ')} onChange={(v) => set({ skills: v.split(',').map((s) => s.trimStart()) })} />
      </FormField>
      <Switch checked={value.mandatory} onChange={(c) => set({ mandatory: c })} label="Mandatory" description="Counts on the compliance dashboard. Assign it to people with an assignment rule." />
      <Switch checked={value.needsApproval} onChange={(c) => set({ needsApproval: c })} label="Self-enrolment needs approval" />
      <Switch checked={value.certificate} onChange={(c) => set({ certificate: c })} label="Issue a certificate on completion" description="With a code anyone can check on the verify page." />
      {value.certificate && (
        <FormField label="Valid for" helper="Leave empty for no expiry. Assignment rules that repeat enrol people again 30 days before it runs out.">
          <NumberField value={value.certificateMonths} onChange={(v) => set({ certificateMonths: v })} suffix="months" min={1} max={120} />
        </FormField>
      )}
    </div>
  );
}

export interface CourseRow extends Course {
  status: 'draft' | 'published' | 'retired';
  items: number;
  learners: number;
}

export interface LiveCourses {
  state: LoadState;
  onRetry: () => void;
  rows: CourseRow[] | null;
  onOpen: (id: string) => void;
  onCreate: (input: CourseDetails) => Promise<void>;
}

const STATUS_WORD: Record<CourseRow['status'], string> = { draft: 'Draft', published: 'Published', retired: 'Retired' };

/** LRN-03 entry for L&D: every course with its status, content and learners; a new course starts as a draft. */
export function CoursesListScreen({ rows: sample, live }: { rows?: CourseRow[]; live?: LiveCourses }) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CourseDetails>(NEW_COURSE);
  const [errors, setErrors] = useState(false);
  const rows = live ? (live.rows ?? []) : (sample ?? []);
  const valid = draft.title.trim().length >= 2 && (draft.source === 'company' || draft.provider.trim().length > 0);
  const table = (
    <DataTable
      label="Courses"
      rows={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => live?.onOpen(r.id)}
      empty={<EmptyState title="No courses yet" description="Build a course with videos, PDFs and links, then publish it to the catalogue." action={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New course</Button>} />}
      columns={[
        { key: 'title', header: 'Course', value: (r) => r.title, width: 300 },
        { key: 'type', header: 'Type', value: (r) => `${r.type} · ${r.duration}`, width: 180 },
        { key: 'mandatory', header: 'Mandatory', value: (r) => (r.mandatory ? 'Yes' : 'No'), width: 110 },
        { key: 'items', header: 'Items', type: 'number', value: (r) => r.items, width: 90 },
        { key: 'learners', header: 'Learners', type: 'number', value: (r) => r.learners, width: 100 },
        { key: 'status', header: 'Status', type: 'status', value: (r) => STATUS_WORD[r.status], statusTone: (v) => (v === 'Published' ? 'success' : 'neutral'), width: 120 },
      ]}
    />
  );
  return (
    <GrowthFrame area="learning" active="Course builder" persona="ld">
      <PageHeader title="Courses" description="Build courses, publish them to the catalogue, and assign them with rules." actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New course</Button>} />
      {live ? <Loading state={live.state} onRetry={live.onRetry} what="Courses">{() => table}</Loading> : table}
      <Dialog
        open={creating}
        onOpenChange={(o) => (setCreating(o), o || (setDraft(NEW_COURSE), setErrors(false)))}
        title="New course"
        size="md"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!valid) return setErrors(true);
                await live?.onCreate({ ...draft, skills: draft.skills.map((s) => s.trim()).filter(Boolean) });
                setCreating(false);
                setDraft(NEW_COURSE);
              }}
            >
              Create course
            </Button>
          </>
        }
      >
        <CourseDetailsFields value={draft} onChange={setDraft} showErrors={errors} />
      </Dialog>
    </GrowthFrame>
  );
}

export interface BuilderLiveItem {
  id: string;
  title: string;
  kind: 'PDF' | 'Video' | 'Link';
  minutes: number;
  required: boolean;
  url: string | null;
  file: string | null;
}
export interface LiveBuilder {
  state: LoadState;
  onRetry: () => void;
  data: { course: Course & { status: CourseRow['status']; version: number; description: string | null; durationMinutes: number; certificateMonths: number | null }; items: BuilderLiveItem[] } | null;
  onSave: (details: CourseDetails) => Promise<void>;
  onStatus: (status: 'published' | 'retired') => Promise<void>;
  onAddItem: (input: { title: string; kind: 'pdf' | 'video' | 'link'; minutes: number; required: boolean; url?: string }, file?: File) => Promise<void>;
  onItem: (item: BuilderLiveItem, change: { required?: boolean; move?: 'up' | 'down' }) => Promise<void>;
  onRemove: (item: BuilderLiveItem) => Promise<void>;
  onBack: () => void;
}

function detailsOf(c: NonNullable<LiveBuilder['data']>['course']): CourseDetails {
  return {
    title: c.title,
    description: c.description ?? '',
    source: c.source === 'Provider' ? 'provider' : c.source === 'Partner pack' ? 'partner' : 'company',
    provider: c.provider ?? '',
    durationMinutes: c.durationMinutes,
    cost: c.cost,
    mandatory: Boolean(c.mandatory),
    needsApproval: Boolean(c.approval),
    certificate: Boolean(c.certificate),
    certificateMonths: c.certificateMonths,
    skills: c.skills,
  };
}

/** LRN-03, wired: content items in order (required or not), the certificate, skills and settings; publish. */
export function LiveCourseBuilderScreen({ live }: { live: LiveBuilder }) {
  const d = live.data;
  const [details, setDetails] = useState<CourseDetails | null>(null);
  const [adding, setAdding] = useState<'file' | 'link' | null>(null);
  const [removing, setRemoving] = useState<BuilderLiveItem | null>(null);
  useEffect(() => setDetails(d ? detailsOf(d.course) : null), [d]);
  const items = d?.items ?? [];
  const noRequired = !items.some((i) => i.required);
  const published = d?.course.status === 'published';
  const changed = Boolean(d && details && JSON.stringify(details) !== JSON.stringify(detailsOf(d.course)));
  const saveBar = changed && details && (
    <div className="yx-growth-row">
      <Button onClick={() => d && setDetails(detailsOf(d.course))}>Cancel</Button>
      <Button variant="primary" onClick={() => void live.onSave({ ...details, skills: details.skills.map((s) => s.trim()).filter(Boolean) })}>
        Save changes
      </Button>
    </div>
  );
  return (
    <GrowthFrame area="learning" active="Course builder" persona="ld">
      <Loading state={live.state} onRetry={live.onRetry} what="The course">
        {() =>
          d &&
          details && (
            <>
              <ObjectHeader
                name={d.course.title}
                icon={FileText}
                secondary={`${d.course.type} · ${d.course.duration} · ${d.course.source === 'Provider' ? d.course.provider : d.course.source}`}
                status={<Badge tone={published ? 'success' : 'neutral'}>{STATUS_WORD[d.course.status]}</Badge>}
                facts={[
                  { label: 'Items', value: items.length },
                  { label: 'Required', value: items.filter((i) => i.required).length },
                  { label: 'Cost', value: d.course.cost ? `₹${d.course.cost.toLocaleString('en-IN')}` : 'No cost' },
                ]}
                actions={
                  !published && (
                    <Button variant="primary" disabled={noRequired} onClick={() => void live.onStatus('published')}>
                      Publish course
                    </Button>
                  )
                }
              />
              {noRequired && (
                <InlineAlert tone="danger" title="Mark at least one item as required">
                  A course needs a required item so completion can be checked.
                </InlineAlert>
              )}
              <Tabs defaultValue="content">
                <TabsList aria-label="Course builder">
                  <TabsTrigger value="content" count={items.length}>
                    Content
                  </TabsTrigger>
                  <TabsTrigger value="certificate">Certificate</TabsTrigger>
                  <TabsTrigger value="skills">Skills</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="content">
                  <div className="yx-growth-stack">
                    {items.length === 0 ? (
                      <EmptyState compact title="No content yet" description="Add a video, a PDF or a link. Mark the ones every learner must finish as required." />
                    ) : (
                      <ol className="yx-growth-list">
                        {items.map((it, i) => (
                          <li key={it.id} className="yx-growth-list__item">
                            <span className="yx-growth-num yx-growth-meta">{i + 1}</span>
                            <div className="yx-growth-list__main">
                              <span className="yx-growth-list__title">{it.title}</span>
                              <span className="yx-growth-meta">
                                {it.kind} · {it.minutes} min{it.file ? ` · ${it.file}` : it.url ? ` · ${it.url}` : ''}
                              </span>
                            </div>
                            <Checkbox checked={it.required} onChange={(c) => void live.onItem(it, { required: c })} label="Required" />
                            <IconButton icon={ArrowUp} label={`Move ${it.title} up`} size="sm" disabled={i === 0} onClick={() => void live.onItem(it, { move: 'up' })} />
                            <IconButton icon={ArrowDown} label={`Move ${it.title} down`} size="sm" disabled={i === items.length - 1} onClick={() => void live.onItem(it, { move: 'down' })} />
                            <IconButton icon={Trash2} label={`Remove ${it.title}`} size="sm" onClick={() => setRemoving(it)} />
                          </li>
                        ))}
                      </ol>
                    )}
                    <div className="yx-growth-row">
                      <Button icon={Plus} onClick={() => setAdding('file')}>
                        Add video or PDF
                      </Button>
                      <Button icon={Plus} onClick={() => setAdding('link')}>
                        Add link
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="certificate">
                  <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
                    <Switch checked={details.certificate} onChange={(c) => setDetails({ ...details, certificate: c })} label="Issue a certificate on completion" description="A PDF with a code anyone can check on the verify page." />
                    {details.certificate && (
                      <FormField label="Valid for" helper="Leave empty for no expiry. Renewal enrolment is created 30 days before expiry by a repeating rule.">
                        <NumberField value={details.certificateMonths} onChange={(v) => setDetails({ ...details, certificateMonths: v })} suffix="months" min={1} max={120} />
                      </FormField>
                    )}
                    {saveBar}
                  </div>
                </TabsContent>
                <TabsContent value="skills">
                  <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
                    <FormField label="Skills it builds" helper="Separate skills with commas.">
                      <TextField value={details.skills.join(', ')} onChange={(v) => setDetails({ ...details, skills: v.split(',').map((s) => s.trimStart()) })} />
                    </FormField>
                    {saveBar}
                  </div>
                </TabsContent>
                <TabsContent value="settings">
                  <div className="yx-growth-stack">
                    <CourseDetailsFields value={details} onChange={setDetails} />
                    {saveBar}
                    {published && (
                      <div className="yx-growth-row">
                        <Button onClick={() => void live.onStatus('retired')}>Take off the catalogue</Button>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
              <AddItemDialog kind={adding} onClose={() => setAdding(null)} onAdd={live.onAddItem} />
              <ConfirmDialog
                open={Boolean(removing)}
                onOpenChange={(o) => !o && setRemoving(null)}
                title={`Remove ${removing?.title ?? ''}?`}
                consequence="It comes off the course. Learners who already did it keep their progress on the other items."
                confirmLabel="Remove item"
                destructive
                onConfirm={async () => {
                  if (removing) await live.onRemove(removing);
                  setRemoving(null);
                }}
              />
            </>
          )
        }
      </Loading>
    </GrowthFrame>
  );
}

function AddItemDialog({ kind, onClose, onAdd }: { kind: 'file' | 'link' | null; onClose: () => void; onAdd: LiveBuilder['onAddItem'] }) {
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState<number | null>(10);
  const [required, setRequired] = useState(true);
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState(false);
  const reset = () => (setTitle(''), setMinutes(10), setRequired(true), setUrl(''), setFile(null), setErrors(false));
  const fileKind = file?.name.toLowerCase().endsWith('.mp4') ? 'video' : 'pdf';
  const ok = title.trim().length >= 2 && (kind === 'link' ? /^https:\/\/\S+$/i.test(url.trim()) : Boolean(file));
  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(o) => !o && (onClose(), reset())}
      title={kind === 'link' ? 'Add a link' : 'Add a video or PDF'}
      size="md"
      footer={
        <>
          <Button onClick={() => (onClose(), reset())}>Cancel</Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (!ok) return setErrors(true);
              await onAdd({ title: title.trim(), kind: kind === 'link' ? 'link' : fileKind, minutes: minutes ?? 0, required, ...(kind === 'link' ? { url: url.trim() } : {}) }, kind === 'link' ? undefined : (file ?? undefined));
              onClose();
              reset();
            }}
          >
            Add item
          </Button>
        </>
      }
    >
      <div className="yx-growth-stack">
        <FormField label="Title" required error={errors && title.trim().length < 2 ? 'Give the item a title.' : null}>
          <TextField value={title} onChange={setTitle} />
        </FormField>
        {kind === 'link' ? (
          <FormField label="Link" required helper="An https:// address. It opens in a new tab." error={errors && !/^https:\/\/\S+$/i.test(url.trim()) ? 'Enter a link that starts with https://.' : null}>
            <TextField value={url} onChange={setUrl} placeholder="https://" />
          </FormField>
        ) : (
          <FormField label="File" required helper="A PDF up to 20 MB or an MP4 video up to 100 MB." error={errors && !file ? 'Choose the file.' : null}>
            <FileUpload upload={async (f) => setFile(f)} accept={['.pdf', '.mp4']} maxSize={100 * 1024 * 1024} multiple={false} onItemsChange={(xs) => !xs.some((x) => x.status === 'done') && setFile(null)} />
          </FormField>
        )}
        <FormField label="Time it takes">
          <NumberField value={minutes} onChange={setMinutes} suffix="min" min={0} max={1440} />
        </FormField>
        <Checkbox checked={required} onChange={setRequired} label="Required to complete the course" />
      </div>
    </Dialog>
  );
}

/* ================================================================== LRN-07 · Assignment rules */

export interface LiveRule {
  id: string;
  name: string;
  courseId: string;
  course: string;
  legalEntityIds: string[];
  locationIds: string[];
  departmentIds: string[];
  designation: string | null;
  population: string;
  dueDays: number;
  repeatMonths: number;
  matches: number;
  active: boolean;
  version: number;
}
export interface RuleInput {
  name: string;
  courseId: string;
  legalEntityIds: string[];
  locationIds: string[];
  departmentIds: string[];
  designation: string | null;
  dueDays: number;
  repeatMonths: 0 | 12 | 24;
  active: boolean;
}
export interface LiveRules {
  state: LoadState;
  onRetry: () => void;
  rules: LiveRule[] | null;
  courses: SelectOption[];
  entities: SelectOption[];
  locations: SelectOption[];
  departments: SelectOption[];
  onPreview: (input: RuleInput) => Promise<{ matches: number; toEnrol: number }>;
  onSave: (input: RuleInput, rule: LiveRule | null) => Promise<void>;
}

const RULE_FIELDS = ['entity', 'location', 'department', 'designation'] as const;

/** The rule's people as the condition builder shows them: every condition must hold. */
function toConditions(r: Pick<RuleInput, 'legalEntityIds' | 'locationIds' | 'departmentIds' | 'designation'>): Rule {
  const items = [
    ...(r.legalEntityIds.length ? [{ id: 'c1', field: 'entity', operator: 'one_of' as const, value: r.legalEntityIds }] : []),
    ...(r.locationIds.length ? [{ id: 'c2', field: 'location', operator: 'one_of' as const, value: r.locationIds }] : []),
    ...(r.departmentIds.length ? [{ id: 'c3', field: 'department', operator: 'one_of' as const, value: r.departmentIds }] : []),
    ...(r.designation ? [{ id: 'c4', field: 'designation', operator: 'contains' as const, value: r.designation }] : []),
  ];
  return { trigger: null, conditions: { id: 'g1', join: 'and', items }, actions: [] };
}

/** Back from the builder: only "all of these" with "is one of" (and "contains" for the designation) are kept by rules. */
export function fromConditions(rule: Rule): { ok: true; value: Pick<RuleInput, 'legalEntityIds' | 'locationIds' | 'departmentIds' | 'designation'> } | { ok: false; message: string } {
  const out = { legalEntityIds: [] as string[], locationIds: [] as string[], departmentIds: [] as string[], designation: null as string | null };
  const items = rule.conditions.items.filter((c) => isGroup(c) || c.field !== null);
  if (items.length > 1 && rule.conditions.join !== 'and') return { ok: false, message: 'Rules match people who meet all the conditions. Change "any" to "all".' };
  for (const c of items) {
    if (isGroup(c)) return { ok: false, message: 'Rules don’t use groups of conditions. Put each condition on its own row.' };
    const field = c.field as (typeof RULE_FIELDS)[number];
    const list = (Array.isArray(c.value) ? c.value : c.value == null || c.value === '' ? [] : [c.value]).map(String);
    if (field === 'designation') {
      if (c.operator !== 'contains' && c.operator !== 'is') return { ok: false, message: 'Use "contains" for the designation.' };
      out.designation = list[0]?.trim() || null;
    } else {
      if (c.operator !== 'one_of' && c.operator !== 'is') return { ok: false, message: 'Use "is one of" for the legal entity, location and department.' };
      const key = field === 'entity' ? 'legalEntityIds' : field === 'location' ? 'locationIds' : 'departmentIds';
      out[key] = [...new Set([...out[key], ...list])];
    }
  }
  return { ok: true, value: out };
}

export function LiveAssignmentRulesScreen({ live }: { live: LiveRules }) {
  const [open, setOpen] = useState<LiveRule | 'new' | null>(null);
  const schema: RuleSchema = useMemo(
    () => ({
      triggers: [],
      fields: [
        { key: 'entity', label: 'Legal entity', type: 'choice', options: live.entities.map((o) => ({ value: o.value, label: o.label })) },
        { key: 'location', label: 'Location', type: 'choice', options: live.locations.map((o) => ({ value: o.value, label: o.label })) },
        { key: 'department', label: 'Department', type: 'choice', options: live.departments.map((o) => ({ value: o.value, label: o.label })) },
        { key: 'designation', label: 'Designation', type: 'text' },
      ],
      recipients: [],
    }),
    [live.entities, live.locations, live.departments],
  );
  return (
    <GrowthFrame area="learning" active="Compliance" persona="ld">
      <PageHeader title="Assignment rules" description="Who must complete what, by when. Checked every day, so people who join, transfer or change role are enrolled from their new job." actions={<Button variant="primary" icon={Plus} onClick={() => setOpen('new')} disabled={!live.courses.length}>Add rule</Button>} />
      <Loading state={live.state} onRetry={live.onRetry} what="Assignment rules">
        {() => (
          <DataTable
            label="Assignment rules"
            rows={live.rules ?? []}
            getRowId={(r) => r.id}
            onRowClick={(r) => setOpen(r)}
            activeRowId={open && open !== 'new' ? open.id : null}
            empty={<EmptyState title="No assignment rules" description={live.courses.length ? 'Add a rule: a mandatory course for the people it covers, due within some days.' : 'Publish a course first, then add a rule that assigns it.'} action={live.courses.length ? <Button onClick={() => setOpen('new')}>Add rule</Button> : undefined} />}
            columns={[
              { key: 'name', header: 'Rule', value: (r) => r.name, width: 260 },
              { key: 'course', header: 'Course', value: (r) => r.course, width: 220 },
              { key: 'pop', header: 'Who', value: (r) => r.population, width: 240 },
              { key: 'due', header: 'Due', value: (r) => `Within ${r.dueDays} days`, width: 150 },
              { key: 'rec', header: 'Repeats', value: (r) => (r.repeatMonths ? `Every ${r.repeatMonths} months` : 'Once'), width: 140 },
              { key: 'matches', header: 'People', type: 'number', value: (r) => r.matches, width: 100 },
              { key: 'active', header: 'Status', type: 'status', value: (r) => (r.active ? 'Active' : 'Paused'), statusTone: (v) => (v === 'Active' ? 'success' : 'neutral'), width: 110 },
            ]}
          />
        )}
      </Loading>
      {open && <RuleDrawer key={open === 'new' ? 'new' : open.id} rule={open === 'new' ? null : open} schema={schema} live={live} onClose={() => setOpen(null)} />}
    </GrowthFrame>
  );
}

function RuleDrawer({ rule, schema, live, onClose }: { rule: LiveRule | null; schema: RuleSchema; live: LiveRules; onClose: () => void }) {
  const [name, setName] = useState(rule?.name ?? '');
  const [courseId, setCourseId] = useState<string | null>(rule?.courseId ?? null);
  const [dueDays, setDueDays] = useState<number | null>(rule?.dueDays ?? 30);
  const [repeat, setRepeat] = useState(String(rule?.repeatMonths ?? 12));
  const [active, setActive] = useState(rule?.active ?? true);
  const [conditions, setConditions] = useState<Rule>(toConditions(rule ?? { legalEntityIds: [], locationIds: [], departmentIds: [], designation: null }));
  const [errors, setErrors] = useState(false);
  const [preview, setPreview] = useState<{ matches: number; toEnrol: number } | null>(null);
  const people = fromConditions(conditions);
  const input: RuleInput | null =
    people.ok && courseId && dueDays ? { name: name.trim(), courseId, dueDays, repeatMonths: Number(repeat) as 0 | 12 | 24, active, ...people.value } : null;
  const key = JSON.stringify(input && { ...input, name: '' });
  useEffect(() => {
    if (!input) return setPreview(null);
    let gone = false;
    const t = setTimeout(() => void live.onPreview(input).then((p) => !gone && setPreview(p)).catch(() => !gone && setPreview(null)), 300);
    return () => ((gone = true), clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const course = live.courses.find((c) => c.value === courseId)?.label;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={rule ? rule.name : 'New assignment rule'}
      footer={
        <div className="yx-growth-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (!input || input.name.length < 2) return setErrors(true);
              await live.onSave(input, rule);
              onClose();
            }}
          >
            Save rule
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        <FormField label="Rule name" required error={errors && name.trim().length < 2 ? 'Give the rule a name.' : null}>
          <TextField value={name} onChange={setName} />
        </FormField>
        <ConditionBuilder schema={schema} value={conditions} onChange={setConditions} parts={['if']} showSummary={false} emptyText="No conditions: everyone who works here." />
        {!people.ok && <InlineAlert tone="warning">{people.message}</InlineAlert>}
        <FieldRow>
          <FormField label="Course" required error={errors && !courseId ? 'Choose the course.' : null}>
            <Select value={courseId} onChange={setCourseId} options={live.courses} placeholder="Choose a published course" />
          </FormField>
          <FormField label="Due within" required>
            <NumberField value={dueDays} onChange={setDueDays} suffix="days" min={1} max={365} />
          </FormField>
        </FieldRow>
        <FormField label="Repeat">
          <RadioGroup aria-label="Repeat" orientation="horizontal" value={repeat} onChange={setRepeat} options={[{ value: '0', label: 'Once' }, { value: '12', label: 'Every 12 months' }, { value: '24', label: 'Every 24 months' }]} />
        </FormField>
        <FormField label="Reminders and escalation">
          <Text>Reminders 7 and 2 days before the due date; the manager is told the day after it’s missed, then HR after 7 days.</Text>
        </FormField>
        <Switch checked={active} onChange={setActive} label="Active" description="A paused rule enrols nobody new. Enrolments it made stay." />
        <div className="yx-growth-effect">
          <span className="yx-growth-effect__title">Preview</span>
          <ul>
            {preview ? (
              <>
                <li>
                  {preview.matches} {preview.matches === 1 ? 'person matches' : 'people match'} today; {preview.toEnrol} {preview.toEnrol === 1 ? 'doesn’t' : 'don’t'} have a valid completion {active ? 'and will be enrolled when you save' : 'and would be enrolled once the rule is active'}.
                </li>
                <li>People who join, transfer or change role into the rule are enrolled by the daily check.</li>
                {repeat !== '0' && <li>Before a completion of {course ?? 'the course'} runs out, a renewal enrolment is made 30 days ahead.</li>}
              </>
            ) : (
              <li>Choose the course and the people to see who matches.</li>
            )}
          </ul>
        </div>
      </div>
    </Drawer>
  );
}

/* ================================================================== LRN-08 · Compliance dashboard + the manager's team */

export interface LiveComplianceData {
  today: string;
  courses: string[];
  rows: { dept: string; done: number[]; assigned: number[]; size: number }[];
  overdue: { id: string; name: string; dept: string; course: string; due: string; manager: string }[];
  expiring: number;
  rules: number;
}
export interface LiveCompliance {
  state: LoadState;
  onRetry: () => void;
  data: LiveComplianceData | null;
  entities: SelectOption[];
  entity: string;
  onEntity: (v: string) => void;
  onExport: () => void;
  onRemind: () => Promise<void>;
  /** The rules page, for L&D (learning.manage). */
  onRules?: () => void;
}

export function LiveComplianceScreen({ live, persona = 'ld' }: { live: LiveCompliance; persona?: 'ld' | 'hr' }) {
  const d = live.data;
  const cells = (d?.rows ?? []).map((r) => ({ label: r.dept, groupSize: r.size, values: r.done.map((x, i) => complianceCell(x, r.assigned[i]).pct) }));
  const all = (d?.rows ?? []).flatMap((r) => r.done.map((x, i) => ({ x, a: r.assigned[i] })));
  const overall = complianceCell(all.reduce((a, v) => a + v.x, 0), all.reduce((a, v) => a + v.a, 0));
  const daysOver = (due: string) => Math.round((Date.parse(`${d!.today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000);
  return (
    <GrowthFrame area="learning" active="Compliance" persona={persona}>
      <PageHeader
        title="Compliance training"
        description="Mandatory courses by department. Expired certifications count as non-compliant."
        actions={
          <>
            {live.entities.length > 1 && <Select aria-label="Entity" value={live.entity} onChange={(v) => v && live.onEntity(v)} options={[{ value: 'all', label: 'All entities' }, ...live.entities]} />}
            <Button icon={Download} onClick={live.onExport}>
              Export for audit
            </Button>
            <Button variant="primary" disabled={!d?.overdue.length} onClick={() => void live.onRemind()}>
              Remind overdue
            </Button>
          </>
        }
      />
      <Loading state={live.state} onRetry={live.onRetry} what="Compliance figures">
        {() =>
          d && (
            <>
              <div className="yx-growth-kpis">
                <StatCard label="Overall completion" value={overall.pct ?? 0} unit="%" drill={{ label: 'View by department', href: '#by-department' }} />
                <StatCard label="Overdue people" value={new Set(d.overdue.map((o) => o.name)).size} drill={{ label: `View ${d.overdue.length} overdue`, href: '#overdue' }} />
                <StatCard label="Expiring in 30 days" value={d.expiring} drill={{ label: 'Download the list', href: '#export', onClick: (e) => (e.preventDefault(), live.onExport()) }} />
                <StatCard label="Mandatory courses" value={d.courses.length} drill={live.onRules ? { label: 'View assignment rules', href: '#rules', onClick: (e) => (e.preventDefault(), live.onRules!()) } : { label: 'View by department', href: '#by-department' }} />
              </div>
              {/* Not anonymous data: compliance names people anyway, so small departments are shown (no group suppression). */}
              {d.courses.length === 0 ? (
                <EmptyState title="No mandatory courses yet" description="Mark a published course as mandatory and assign it with a rule. Its completion shows here." />
              ) : (
                <div id="by-department">
                <Heatmap title="Completion by department" description="Share of assigned people with a valid completion. 95% and above is compliant; below 80% is non-compliant." xLabel="Department" columns={d.courses} rows={cells} max={100} format={(v) => `${v}%`} minGroupSize={1} />
                </div>
              )}
              <Card title={`Overdue · ${d.overdue.length}`}>
                <div id="overdue">
                  <DataTable
                    label="Overdue"
                    rows={d.overdue}
                    getRowId={(r) => r.id}
                    empty={<EmptyState compact title="No one is overdue" />}
                    columns={[
                      { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.dept }), width: 220 },
                      { key: 'course', header: 'Course', value: (r) => r.course, width: 220 },
                      { key: 'due', header: 'Was due', type: 'date', value: (r) => day(r.due), width: 120 },
                      { key: 'days', header: 'Days overdue', type: 'number', value: (r) => daysOver(r.due), width: 130 },
                      { key: 'mgr', header: 'Manager', value: (r) => r.manager, width: 180 },
                    ]}
                  />
                </div>
              </Card>
            </>
          )
        }
      </Loading>
    </GrowthFrame>
  );
}

export interface TeamLearningData {
  courses: string[];
  people: { employeeId: string; name: string; role: string; cells: string[] }[];
  overdue: { id: string; name: string; course: string; due: string }[];
}
export interface LiveTeamLearning {
  state: LoadState;
  onRetry: () => void;
  data: TeamLearningData | null;
  onPerson: (employeeId: string) => void;
}

const CELL_TONE: Record<string, BadgeTone> = { Completed: 'success', Overdue: 'danger', Expired: 'danger', 'In progress': 'info', Enrolled: 'neutral', Requested: 'info', 'Not assigned': 'neutral' };

/** The manager's team: each person × mandatory course in words, so the manager can follow up before it is missed. */
export function TeamLearningScreen({ data: sample, live }: { data?: TeamLearningData; live?: LiveTeamLearning }) {
  const d = live ? live.data : sample;
  const body = () =>
    !d || d.people.length === 0 ? (
      <EmptyState title="No one reports to you" description="Your team’s mandatory courses show here." />
    ) : d.courses.length === 0 ? (
      <EmptyState title="No mandatory courses yet" description="When L&D makes a course mandatory, your team’s progress on it shows here." />
    ) : (
      <div className="yx-growth-stack">
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Team training, scrolls sideways on small screens">
          <table className="yx-growth-matrix">
            <caption className="yx-visually-hidden">Mandatory courses for your team</caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                {d.courses.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.people.map((p) => (
                <tr key={p.employeeId}>
                  <th scope="row">
                    {live ? (
                      <Link href={`#${p.employeeId}`} onClick={(e) => (e.preventDefault(), live.onPerson(p.employeeId))}>
                        {p.name}
                      </Link>
                    ) : (
                      p.name
                    )}
                    <div className="yx-growth-meta">{p.role}</div>
                  </th>
                  {p.cells.map((c, i) => (
                    <td key={d.courses[i]}>
                      <Badge tone={CELL_TONE[c] ?? 'neutral'}>{c}</Badge>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.overdue.length > 0 && (
          <InlineAlert tone="warning" title={`${d.overdue.length} overdue`}>
            {d.overdue.map((o) => `${o.name}: ${o.course} (due ${formatDate(day(o.due))})`).join(' · ')}
          </InlineAlert>
        )}
      </div>
    );
  return (
    <GrowthFrame area="learning" active="My team" persona="mgr">
      <PageHeader title="My team’s training" description="Mandatory courses for the people who report to you. You’re told the day after someone misses a due date." />
      {live ? <Loading state={live.state} onRetry={live.onRetry} what="Your team’s training">{body}</Loading> : body()}
    </GrowthFrame>
  );
}

export type { CourseType };
