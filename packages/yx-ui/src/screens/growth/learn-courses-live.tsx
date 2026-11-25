// Batch G3a (M07 Q1-Q2; answers 2606, 2608): LRN-01 My learning and catalogue, LRN-02 course player, LRN-03 course
// builder and LRN-06 nominate / decline with real records, drawn in the designed layouts. The designed screens
// (learn-me.tsx, learn-admin.tsx) render these when given `live`.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Award, BookOpen, CheckCircle2, ExternalLink, FileText, Film, Play, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Link } from '../../components/button';
import { Badge } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Meter, NoAccessState, Skeleton } from '../../components/feedback';
import { DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { Dialog } from '../../components/overlay';
import { MilestoneMoment, useToast } from '../../components/notify';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { formatDate, formatINR } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { GrowthFrame, ProgressRing, SkillLevel } from './growth-kit';

export type LiveCourseType = 'self_paced' | 'classroom' | 'virtual';
export interface LiveCourseItem {
  id?: string;
  title: string;
  kind: 'video' | 'pdf' | 'link';
  url?: string | null;
  minutes: number;
  required: boolean;
  scan?: string | null;
}
export interface LiveCourse {
  id: string;
  title: string;
  description: string | null;
  type: LiveCourseType;
  durationMinutes: number;
  cost: number;
  mandatory: boolean;
  needsApproval: boolean;
  certificate: boolean;
  validMonths: number | null;
  skills: { skillId: string; level: number }[];
  status: 'draft' | 'published' | 'retired';
  items: LiveCourseItem[];
}
const TYPE_WORDS: Record<LiveCourseType, string> = { self_paced: 'Self-paced', classroom: 'Classroom', virtual: 'Virtual' };
const KIND_ICON = { video: Film, pdf: FileText, link: ExternalLink };
const day = (s: string) => new Date(`${s}T00:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mins = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h ${n % 60 ? `${n % 60} min` : ''}`.trim() : `${n} min`);

/* ------------------------------------------------------------------ LRN-01 My learning and catalogue */

export interface LiveEnrolment {
  id: string;
  course: LiveCourse;
  status: 'requested' | 'enrolled' | 'completed' | 'overdue';
  source: 'self' | 'nominated' | 'rule';
  dueOn: string | null;
  progress: number;
  canDecline: boolean;
}
export interface LiveMyLearning {
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  enrolments: LiveEnrolment[];
  certificates: { id: string; title: string; issuedOn: string; expiresOn: string | null }[];
  catalogue: (LiveCourse & { mine: string | null })[];
  today: Date;
  onOpen: (enrolmentId: string) => void;
  onEnrol: (courseId: string) => Promise<{ status: string }>;
  onDecline: (enrolmentId: string, reason: string) => Promise<unknown>;
  /** A manager or L&D: nominate people for a course from the catalogue. */
  onNominate?: (courseId: string) => void;
  tab?: 'mine' | 'catalogue' | 'certificates';
}
const SOURCE_WORDS = { self: 'Self', nominated: 'Nominated', rule: 'Assigned by rule' };
const STATUS_WORDS = { requested: 'Requested', enrolled: 'Enrolled', completed: 'Completed', overdue: 'Overdue' };

export function LiveMyLearningScreen({ live }: { live: LiveMyLearning }) {
  const { toast } = useToast();
  const [decline, setDecline] = useState<LiveEnrolment | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const open = live.enrolments.filter((e) => e.status !== 'completed');
  const cont = open.find((e) => e.status !== 'requested' && e.progress > 0 && e.progress < 100) ?? open.find((e) => e.status !== 'requested');
  const enrol = async (id: string) => {
    try {
      const r = await live.onEnrol(id);
      toast({ tone: 'success', title: r.status === 'requested' ? 'Request sent to L&D.' : 'Enrolled.' });
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    }
  };
  const sendDecline = async () => {
    setTried(true);
    if (reason.trim().length < 10) return void setTimeout(() => document.getElementById('ln-reason')?.focus(), 0);
    setBusy(true);
    try {
      await live.onDecline(decline!.id, reason.trim());
      toast({ tone: 'success', title: 'Nomination declined. Whoever nominated you sees your reason.' });
      setDecline(null);
      setReason('');
      setTried(false);
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const mine =
    live.state === 'loading' ? (
      <Skeleton height={320} />
    ) : open.length === 0 ? (
      <EmptyState title="Nothing assigned to you right now" description="Mandatory courses appear here with their due dates. Browse the catalogue to learn something new." />
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
                  {TYPE_WORDS[cont.course.type]} · {mins(cont.course.durationMinutes)}
                  {cont.dueOn ? ` · due ${formatDate(day(cont.dueOn))}` : ''}
                </span>
              </div>
              <Button variant="primary" icon={Play} onClick={() => live.onOpen(cont.id)}>
                Continue
              </Button>
            </div>
          </section>
        )}
        <section aria-label="Assigned to me" className="yx-growth-stack" data-gap="sm">
          <h2 className="yx-growth-h">Assigned to me · {open.length}</h2>
          <ul className="yx-growth-list">
            {open.map((e) => (
              <li key={e.id} className="yx-growth-list__item">
                <ProgressRing value={e.progress} label={e.course.title} size="sm" tone={e.status === 'overdue' ? 'danger' : 'default'} />
                <div className="yx-growth-list__main">
                  <span className="yx-growth-list__title">{e.course.title}</span>
                  <span className="yx-growth-meta">
                    {SOURCE_WORDS[e.source]}
                    {e.dueOn ? ` · due ${formatDate(day(e.dueOn))}` : ''}
                  </span>
                </div>
                {e.course.mandatory && <Badge tone="warning">Mandatory</Badge>}
                <Badge tone={e.status === 'overdue' ? 'danger' : e.status === 'requested' ? 'info' : 'neutral'}>{STATUS_WORDS[e.status]}</Badge>
                {e.status !== 'requested' && (
                  <Button size="sm" onClick={() => live.onOpen(e.id)}>
                    Open
                  </Button>
                )}
                {e.canDecline && (
                  <Button size="sm" onClick={() => (setDecline(e), setReason(''), setTried(false))}>
                    Decline
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  const certs =
    live.certificates.length === 0 ? (
      <EmptyState compact title="No certificates yet" description="Certificates are issued automatically when you complete a course that has one." />
    ) : (
      <ul className="yx-growth-list">
        {live.certificates.map((c) => {
          const expired = c.expiresOn && day(c.expiresOn) < live.today;
          return (
            <li key={c.id} className="yx-growth-list__item">
              <Icon icon={Award} size="md" />
              <div className="yx-growth-list__main">
                <span className="yx-growth-list__title">{c.title}</span>
                <span className="yx-growth-meta">
                  Issued {formatDate(day(c.issuedOn))} · {c.expiresOn ? `${expired ? 'expired' : 'valid until'} ${formatDate(day(c.expiresOn))}` : 'no expiry'}
                </span>
              </div>
              {expired ? <Badge tone="danger">Expired</Badge> : <Badge tone="success">Valid</Badge>}
            </li>
          );
        })}
      </ul>
    );
  const shown = live.catalogue.filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()));
  const cat = (
    <div className="yx-growth-stack">
      <TextField aria-label="Search courses" placeholder="Search courses" value={q} onChange={setQ} />
      {shown.length === 0 ? (
        <EmptyState compact title={q ? 'No courses match' : 'No courses published yet'} />
      ) : (
        <div className="yx-growth-cards">
          {shown.map((c) => (
            <article key={c.id} className="yx-growth-card" aria-label={c.title}>
              <div className="yx-growth-card__thumb" aria-hidden="true">
                <Icon icon={BookOpen} size="md" />
              </div>
              <h3 className="yx-growth-card__title">{c.title}</h3>
              <span className="yx-growth-meta">
                {TYPE_WORDS[c.type]} · {mins(c.durationMinutes)}
              </span>
              <div className="yx-growth-row">
                {c.mandatory && <Badge tone="warning">Mandatory</Badge>}
                {c.certificate && <Badge tone="success">Certificate</Badge>}
              </div>
              <div className="yx-growth-card__foot">
                <span className="yx-growth-meta yx-growth-grow">
                  {c.cost ? formatINR(c.cost) : 'No cost'}
                  {c.needsApproval ? ' · needs approval' : ''}
                </span>
                {live.onNominate && (
                  <Button size="sm" onClick={() => live.onNominate!(c.id)}>
                    Nominate
                  </Button>
                )}
                {c.mine ? (
                  <Button size="sm" onClick={() => live.onOpen(c.mine!)}>
                    Open
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => void enrol(c.id)}>
                    {c.needsApproval ? 'Request' : 'Enrol'}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <GrowthFrame area="learning" active={live.tab === 'catalogue' ? 'Catalogue' : 'My learning'} persona="emp">
      <PageHeader title="My learning" description="Your assigned courses, what to continue, and certificates." />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load your learning." description="Try again in a moment." onRetry={live.onRetry} />
      ) : (
        <Tabs defaultValue={live.tab ?? 'mine'}>
          <TabsList aria-label="Learning">
            <TabsTrigger value="mine" count={open.length}>
              My learning
            </TabsTrigger>
            <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
            <TabsTrigger value="certificates" count={live.certificates.length}>
              Certificates
            </TabsTrigger>
          </TabsList>
          <TabsContent value="mine">{mine}</TabsContent>
          <TabsContent value="catalogue">{cat}</TabsContent>
          <TabsContent value="certificates">{certs}</TabsContent>
        </Tabs>
      )}
      <Dialog
        open={decline !== null}
        onOpenChange={(o) => !o && setDecline(null)}
        title={`Decline nomination: ${decline?.course.title ?? ''}`}
        footer={
          <>
            <Button onClick={() => setDecline(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={() => void sendDecline()}>
              Decline nomination
            </Button>
          </>
        }
      >
        <FormField id="ln-reason" label="Reason" required helper="At least 10 characters. Whoever nominated you sees it." error={tried && reason.trim().length < 10 ? 'Write the reason (at least 10 characters).' : null}>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={1000} />
        </FormField>
      </Dialog>
    </GrowthFrame>
  );
}

/* ------------------------------------------------------------------ LRN-02 player */

export interface LivePlayer {
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  data: {
    id: string;
    course: LiveCourse;
    status: string;
    items: { id: string; title: string; kind: 'video' | 'pdf' | 'link'; url: string | null; minutes: number; required: boolean; done: boolean; hasFile: boolean }[];
    certificate: { title: string; issuedOn: string; expiresOn: string | null } | null;
  } | null;
  /** Opens an item's video or PDF (fetched with the person's sign-in). */
  onOpenFile: (itemId: string) => Promise<unknown>;
  onDone: (itemId: string) => Promise<{ completed: boolean }>;
}

export function LivePlayerScreen({ live }: { live: LivePlayer }) {
  const { toast } = useToast();
  const d = live.data;
  const [cur, setCur] = useState<string | null>(null);
  if (live.state === 'error' || !d)
    return (
      <GrowthFrame area="learning" active="My learning" persona="emp">
        {live.state === 'error' ? <ErrorState title="We couldn't open the course." description="Try again in a moment." onRetry={live.onRetry} /> : <Skeleton height={400} />}
      </GrowthFrame>
    );
  const item = d.items.find((i) => i.id === cur) ?? d.items.find((i) => !i.done) ?? d.items[0];
  const req = d.items.filter((i) => i.required);
  const doneReq = req.filter((i) => i.done).length;
  const pct = Math.round((doneReq / Math.max(1, req.length)) * 100);
  const completed = d.status === 'completed';
  const markDone = async () => {
    try {
      const r = await live.onDone(item.id);
      if (r.completed) toast({ tone: 'success', title: `You completed ${d.course.title}.` });
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    }
  };
  const stage = completed ? (
    <MilestoneMoment title={`You completed ${d.course.title}`} description={d.certificate ? `Your certificate is issued${d.certificate.expiresOn ? ` and valid until ${formatDate(day(d.certificate.expiresOn))}` : ''}. It is in My learning › Certificates.` : 'Well done.'} />
  ) : item ? (
    <div className="yx-growth-stack">
      <div className="yx-growth-player__stage" role="region" aria-label={`${item.kind}: ${item.title}`}>
        <Icon icon={KIND_ICON[item.kind]} size="md" />
        <strong>{item.title}</strong>
        <span>{item.kind === 'link' ? 'Opens in a new tab' : item.kind === 'video' ? `Video · ${item.minutes} min` : `PDF · ${item.minutes} min`}</span>
        {item.kind === 'link' ? (
          <Button icon={Play} asChild>
            <Link href={item.url!} target="_blank" rel="noopener noreferrer">
              Open
            </Link>
          </Button>
        ) : (
          <Button icon={Play} onClick={() => void live.onOpenFile(item.id).catch((e: unknown) => toast({ tone: 'error', title: errorText(e) }))}>
            {item.kind === 'video' ? 'Play' : 'Open'}
          </Button>
        )}
      </div>
      {!item.done && (
        <Button icon={CheckCircle2} onClick={() => void markDone()}>
          Mark as done
        </Button>
      )}
    </div>
  ) : (
    <EmptyState compact title="This course has no items yet" />
  );
  return (
    <GrowthFrame area="learning" active="My learning" persona="emp">
      <PageHeader title={d.course.title} description={`${TYPE_WORDS[d.course.type]} · ${mins(d.course.durationMinutes)}`} status={completed ? <Badge tone="success">Completed</Badge> : <Badge tone="info">In progress</Badge>} />
      <Meter label="Required items done" value={pct} max={100} valueText={`${doneReq} of ${req.length} required items · ${pct}%`} />
      <div className="yx-growth-player">
        <ol className="yx-growth-player__outline" aria-label="Course contents">
          {d.items.map((i, n) => (
            <li key={i.id} className="yx-growth-player__item" aria-current={i.id === item?.id ? 'step' : undefined}>
              <Icon icon={i.done ? CheckCircle2 : KIND_ICON[i.kind]} label={i.done ? 'Done' : undefined} />
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
        {stage}
      </div>
    </GrowthFrame>
  );
}

/* ------------------------------------------------------------------ LRN-03 builder (list and one course) */

export interface CourseInput {
  title: string;
  description?: string;
  type: LiveCourseType;
  durationMinutes: number;
  cost: number;
  mandatory: boolean;
  needsApproval: boolean;
  certificate: boolean;
  validMonths?: number;
  skills: { skillId: string; level: number }[];
  items: LiveCourseItem[];
}
export interface LiveCourseBuilder {
  view: 'list' | 'edit';
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  list?: (LiveCourse & { enrolled: number; completed: number; requested: number })[];
  onNew?: () => void;
  onOpen?: (id: string) => void;
  course?: (LiveCourse & { enrolments: { id: string; person: string; status: string; source: string; dueOn: string | null; reason: string | null; createdAt: string }[] }) | null;
  skillOptions?: { id: string; name: string }[];
  onSave?: (input: CourseInput) => Promise<{ id: string }>;
  onUpload?: (title: string, minutes: number, file: File) => Promise<unknown>;
  onPublish?: () => Promise<unknown>;
  onDecide?: (enrolmentId: string, approve: boolean, reason?: string) => Promise<unknown>;
  onNominate?: () => void;
}

export function LiveCourseBuilderScreen({ live }: { live: LiveCourseBuilder }) {
  if (live.state === 'no-access')
    return (
      <GrowthFrame area="learning" active="Course builder" persona="ld">
        <PageHeader title="Courses" />
        <NoAccessState what="the course builder" grantedBy="your System Admin" />
      </GrowthFrame>
    );
  if (live.state === 'error')
    return (
      <GrowthFrame area="learning" active="Course builder" persona="ld">
        <ErrorState title="We couldn't load the courses." description="Try again in a moment." onRetry={live.onRetry} />
      </GrowthFrame>
    );
  if (live.view === 'list') {
    const rows = live.list ?? [];
    return (
      <GrowthFrame area="learning" active="Course builder" persona="ld">
        <PageHeader title="Courses" description="Build courses from videos, PDFs and links; publish them to the catalogue." actions={<Button variant="primary" icon={Plus} onClick={live.onNew}>New course</Button>} />
        <DataTable
          label="Courses"
          rows={rows}
          getRowId={(r) => r.id}
          state={live.state === 'loading' ? 'loading' : 'ready'}
          onRowClick={(r) => live.onOpen?.(r.id)}
          rowButtons={(r) => <Button size="sm" onClick={() => live.onOpen?.(r.id)}>Open</Button>}
          empty={<EmptyState title="No courses yet" description="Start with a mandatory course everyone needs." action={<Button icon={Plus} onClick={live.onNew}>New course</Button>} />}
          columns={[
            { key: 'title', header: 'Course', value: (r) => r.title, width: 300, render: (r) => <span className="yx-ops-row">{r.title}{r.mandatory && <Badge tone="warning">Mandatory</Badge>}</span> },
            { key: 'type', header: 'Type', value: (r) => TYPE_WORDS[r.type], width: 130 },
            { key: 'items', header: 'Items', type: 'number', value: (r) => r.items.length, width: 90 },
            { key: 'enrolled', header: 'Enrolled', type: 'number', value: (r) => r.enrolled, width: 110 },
            { key: 'completed', header: 'Completed', type: 'number', value: (r) => r.completed, width: 120 },
            { key: 'requested', header: 'Requests', type: 'number', value: (r) => r.requested, width: 110 },
            { key: 'status', header: 'Status', type: 'status', value: (r) => (r.status === 'published' ? 'Published' : r.status === 'draft' ? 'Draft' : 'Retired'), statusTone: (v) => (v === 'Published' ? 'success' : 'neutral'), width: 120 },
          ]}
        />
      </GrowthFrame>
    );
  }
  return <CourseEditor live={live} key={live.course?.id ?? 'new'} />;
}

function CourseEditor({ live }: { live: LiveCourseBuilder }) {
  const { toast } = useToast();
  const c = live.course;
  const [title, setTitle] = useState(c?.title ?? '');
  const [type, setType] = useState<LiveCourseType>(c?.type ?? 'self_paced');
  const [duration, setDuration] = useState<number | null>(c?.durationMinutes ?? 30);
  const [cost, setCost] = useState<number | null>(c?.cost ?? 0);
  const [mandatory, setMandatory] = useState(c?.mandatory ?? false);
  const [approval, setApproval] = useState(c?.needsApproval ?? false);
  const [certificate, setCertificate] = useState(c?.certificate ?? false);
  const [valid, setValid] = useState<number | null>(c?.validMonths ?? null);
  const [skills, setSkills] = useState(c?.skills ?? []);
  const [items, setItems] = useState<LiveCourseItem[]>(c?.items ?? []);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [fileTitle, setFileTitle] = useState('');
  const [fileOpen, setFileOpen] = useState(false);
  const [refuse, setRefuse] = useState<string | null>(null);
  const [refuseWhy, setRefuseWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const early = useTooEarly([...(title.trim().length < 3 ? [{ fieldId: 'cb-title', message: 'Name the course (at least 3 letters).' }] : []), ...(!duration ? [{ fieldId: 'cb-duration', message: 'Say how long it takes.' }] : [])]);
  const noRequired = !items.some((i) => i.required);
  const move = (i: number, by: -1 | 1) =>
    setItems((xs) => {
      const j = i + by;
      if (j < 0 || j >= xs.length) return xs;
      const n = [...xs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const input = (): CourseInput => ({ title: title.trim(), type, durationMinutes: duration ?? 30, cost: cost ?? 0, mandatory, needsApproval: mandatory ? false : approval, certificate, ...(certificate && valid ? { validMonths: valid } : {}), skills, items: items.map((i) => ({ ...(i.id ? { id: i.id } : {}), title: i.title, kind: i.kind, ...(i.kind === 'link' ? { url: i.url ?? undefined } : {}), minutes: i.minutes, required: i.required })) });
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setFailed(null);
    try {
      await fn();
      toast({ tone: 'success', title: done });
      return true;
    } catch (e) {
      setFailed(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = () => !early.stop() && void run(() => live.onSave!(input()), 'Course saved.');
  const addLink = () => {
    if (linkTitle.trim().length < 2 || !/^https:\/\/\S+$/.test(linkUrl.trim())) return setFailed('A link needs a title and an address starting with https://.');
    setItems((xs) => [...xs, { title: linkTitle.trim(), kind: 'link', url: linkUrl.trim(), minutes: 5, required: true }]);
    setLinkTitle('');
    setLinkUrl('');
    setFailed(null);
  };
  const status = c?.status ?? 'draft';
  return (
    <GrowthFrame area="learning" active="Course builder" persona="ld">
      <ObjectHeader
        name={title.trim() || 'New course'}
        icon={FileText}
        secondary={`${TYPE_WORDS[type]} · ${mins(duration ?? 0)}`}
        status={<Badge tone={status === 'published' ? 'success' : 'neutral'}>{status === 'published' ? 'Published' : 'Draft'}</Badge>}
        facts={[
          { label: 'Items', value: items.length },
          { label: 'Required', value: items.filter((i) => i.required).length },
          { label: 'Cost', value: cost ? formatINR(cost) : 'No cost' },
        ]}
        actions={
          <>
            {status === 'published' && live.onNominate && <Button onClick={live.onNominate}>Nominate people</Button>}
            <Button loading={busy} onClick={save}>
              Save
            </Button>
            {status === 'draft' && c && (
              <Button variant="primary" loading={busy} onClick={() => void run(() => live.onPublish!(), 'Course published.')}>
                Publish course
              </Button>
            )}
          </>
        }
      />
      {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
      {noRequired && (
        <InlineAlert tone="warning" title="Mark at least one item as required">
          A course needs a required item so completion can be checked.
        </InlineAlert>
      )}
      <Tabs defaultValue="content">
        <TabsList aria-label="Course builder">
          <TabsTrigger value="content" count={items.length}>
            Content
          </TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          {c && (
            <TabsTrigger value="people" count={c.enrolments.filter((e) => e.status === 'requested').length}>
              People
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="content">
          <div className="yx-growth-stack">
            <ol className="yx-growth-list">
              {items.map((it, i) => (
                <li key={it.id ?? `n${i}`} className="yx-growth-list__item">
                  <span className="yx-growth-num yx-growth-meta">{i + 1}</span>
                  <div className="yx-growth-list__main">
                    <span className="yx-growth-list__title">{it.title}</span>
                    <span className="yx-growth-meta">
                      {it.kind === 'link' ? 'Link' : it.kind === 'pdf' ? 'PDF' : 'Video'} · {it.minutes} min{it.scan === 'pending' ? ' · being checked for viruses' : it.scan === 'infected' ? ' · failed the virus check' : ''}
                    </span>
                  </div>
                  <Checkbox checked={it.required} onChange={(v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, required: v } : x)))} label="Required" />
                  <IconButton icon={ArrowUp} label={`Move ${it.title} up`} size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label={`Move ${it.title} down`} size="sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
                  <IconButton icon={Trash2} label={`Remove ${it.title}`} size="sm" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} />
                </li>
              ))}
            </ol>
            <FieldRow>
              <FormField label="Link title">
                <TextField value={linkTitle} onChange={setLinkTitle} maxLength={200} />
              </FormField>
              <FormField label="Address" helper="https:// only">
                <TextField value={linkUrl} onChange={setLinkUrl} maxLength={1000} />
              </FormField>
              <Button icon={Plus} onClick={addLink}>
                Add link
              </Button>
            </FieldRow>
            {c ? (
              <Button icon={Plus} onClick={() => setFileOpen(true)}>
                Add video or PDF
              </Button>
            ) : (
              <Text size="sm" tone="secondary">Save the course first to add videos and PDFs.</Text>
            )}
          </div>
        </TabsContent>
        <TabsContent value="skills">
          <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
            <FormField label="Skills this course raises">
              <MultiSelect value={skills.map((s) => s.skillId)} onChange={(v) => setSkills(v.map((id) => skills.find((s) => s.skillId === id) ?? { skillId: id, level: 2 }))} options={(live.skillOptions ?? []).map((s) => ({ value: s.id, label: s.name }))} placeholder="Choose from the skills library" />
            </FormField>
            {skills.map((s) => (
              <FormField key={s.skillId} label={`Level gained: ${live.skillOptions?.find((o) => o.id === s.skillId)?.name ?? ''}`}>
                <div className="yx-growth-row">
                  <SkillLevel level={s.level} label={live.skillOptions?.find((o) => o.id === s.skillId)?.name ?? ''} />
                  <Select aria-label="Level" value={String(s.level)} onChange={(v) => setSkills((xs) => xs.map((x) => (x.skillId === s.skillId ? { ...x, level: Number(v ?? 2) } : x)))} options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))} />
                </div>
              </FormField>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="settings">
          <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
            <FormField id="cb-title" label="Course name" required error={early.errorOf('cb-title')}>
              <TextField value={title} onChange={setTitle} maxLength={200} />
            </FormField>
            <FieldRow>
              <FormField label="Type">
                <Select value={type} onChange={(v) => setType((v ?? 'self_paced') as LiveCourseType)} options={(Object.keys(TYPE_WORDS) as LiveCourseType[]).map((k) => ({ value: k, label: TYPE_WORDS[k] }))} />
              </FormField>
              <FormField id="cb-duration" label="Duration" required error={early.errorOf('cb-duration')}>
                <NumberField value={duration} onChange={setDuration} suffix="min" min={1} />
              </FormField>
              <FormField label="Cost per person">
                <CurrencyField value={cost} onChange={setCost} />
              </FormField>
            </FieldRow>
            <Switch checked={mandatory} onChange={setMandatory} label="Mandatory" description="Can’t be declined when someone is nominated." />
            {!mandatory && <Switch checked={approval} onChange={setApproval} label="Self-enrolment needs approval" description="L&D approves each request." />}
            <Switch checked={certificate} onChange={setCertificate} label="Issue a certificate on completion" />
            {certificate && (
              <FormField label="Valid for" helper="Leave empty for no expiry.">
                <NumberField value={valid} onChange={setValid} suffix="months" min={1} max={120} />
              </FormField>
            )}
          </div>
        </TabsContent>
        {c && (
          <TabsContent value="people">
            <DataTable
              label="People in this course"
              rows={c.enrolments}
              getRowId={(r) => r.id}
              empty={<EmptyState compact title="Nobody yet" />}
              columns={[
                { key: 'person', header: 'Person', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person }), width: 220 },
                { key: 'source', header: 'How', value: (r) => (r.source === 'self' ? 'Self' : r.source === 'nominated' ? 'Nominated' : 'Rule'), width: 120 },
                { key: 'due', header: 'Due', value: (r) => r.dueOn ?? '', render: (r) => (r.dueOn ? formatDate(day(r.dueOn)) : '—'), width: 120 },
                { key: 'status', header: 'Status', type: 'status', value: (r) => r.status[0].toUpperCase() + r.status.slice(1), statusTone: (v) => (v === 'Completed' ? 'success' : v === 'Requested' ? 'info' : v === 'Declined' || v === 'Refused' ? 'danger' : 'neutral'), width: 130 },
                { key: 'reason', header: 'Reason', value: (r) => r.reason ?? '', width: 240 },
              ]}
              rowButtons={(r) =>
                r.status === 'requested' ? (
                  <>
                    <Button size="sm" variant="primary" onClick={() => void run(() => live.onDecide!(r.id, true), 'Request approved.')}>
                      Approve
                    </Button>
                    <Button size="sm" onClick={() => (setRefuse(r.id), setRefuseWhy(''))}>
                      Refuse
                    </Button>
                  </>
                ) : null
              }
            />
          </TabsContent>
        )}
      </Tabs>
      <Dialog
        open={fileOpen}
        onOpenChange={setFileOpen}
        title="Add a video or PDF"
        footer={<Button onClick={() => setFileOpen(false)}>Close</Button>}
      >
        <div className="yx-growth-stack">
          <FormField label="Title" required helper="Name the item before choosing the file.">
            <TextField value={fileTitle} onChange={setFileTitle} maxLength={200} />
          </FormField>
          <FileUpload
            accept={[".mp4", ".pdf"]}
            maxSize={50 * 1024 * 1024}
            upload={async (f) => {
              if (fileTitle.trim().length < 2) throw new Error('Name the item first.');
              await live.onUpload!(fileTitle.trim(), 10, f);
              toast({ tone: 'success', title: 'Added. It opens for learners once the virus check passes.' });
              setFileTitle('');
            }}
          />
        </div>
      </Dialog>
      <Dialog
        open={refuse !== null}
        onOpenChange={(o) => !o && setRefuse(null)}
        title="Refuse this request?"
        footer={
          <>
            <Button onClick={() => setRefuse(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={() => void (refuseWhy.trim() ? run(() => live.onDecide!(refuse!, false, refuseWhy.trim()), 'Request refused.').then((ok) => ok && setRefuse(null)) : setFailed('Say why the request is refused.'))}>
              Refuse request
            </Button>
          </>
        }
      >
        <FormField label="Why" required helper="The person sees this.">
          <TextArea value={refuseWhy} onChange={setRefuseWhy} rows={3} maxLength={1000} />
        </FormField>
      </Dialog>
    </GrowthFrame>
  );
}

/* ------------------------------------------------------------------ LRN-06 nominate */

export interface LiveNominate {
  course: { id: string; title: string; mandatory: boolean; cost: number } | null;
  people: { id: string; name: string }[];
  onSearch?: (q: string) => void;
  today: Date;
  onSend: (userIds: string[], dueOn?: string) => Promise<{ nominated: number }>;
  onClose: () => void;
}

export function LiveNominateSheet({ live }: { live: LiveNominate }) {
  const { toast } = useToast();
  const [who, setWho] = useState<string[]>([]);
  const [due, setDue] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const early = useTooEarly(who.length ? [] : [{ fieldId: 'nm-who', message: 'Choose at least one person.' }]);
  const send = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      const r = await live.onSend(who, due ? iso(due) : undefined);
      toast({ tone: 'success', title: `${r.nominated} ${r.nominated === 1 ? 'person' : 'people'} nominated. They are told.` });
      live.onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <GrowthFrame area="learning" active="Catalogue" persona="mgr">
      <PageHeader title="Catalogue" description="Courses, sessions and paths" />
      <Drawer
        open
        onOpenChange={(o) => !o && live.onClose()}
        title={`Nominate for ${live.course?.title ?? ''}`}
        footer={
          <div className="yx-growth-foot">
            <Button onClick={live.onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void send()}>
              {`Nominate ${who.length} ${who.length === 1 ? 'person' : 'people'}`}
            </Button>
          </div>
        }
      >
        {!live.course ? (
          <Skeleton height={200} />
        ) : (
          <div className="yx-growth-stack">
            {failed && <InlineAlert tone="danger" title="Not nominated">{failed}</InlineAlert>}
            <DescriptionList items={[{ label: 'Course', value: live.course.title }, { label: 'Cost per person', value: live.course.cost ? formatINR(live.course.cost) : 'No cost' }]} />
            <FormField id="nm-who" label="People" required error={early.errorOf('nm-who')} helper="A manager nominates their own team; L&D anyone.">
              <MultiSelect value={who} onChange={setWho} onSearchChange={live.onSearch} options={live.people.map((p) => ({ value: p.id, label: p.name }))} />
            </FormField>
            <FormField label="Complete by" optional>
              <DatePicker value={due} onChange={setDue} min={live.today} />
            </FormField>
            <div className="yx-growth-effect" aria-live="polite">
              <span className="yx-growth-effect__title">What happens</span>
              <ul>
                <li>{live.course.mandatory ? 'Each person is told. A mandatory course can’t be declined.' : 'Each person is told and can decline with a reason.'}</li>
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </GrowthFrame>
  );
}
