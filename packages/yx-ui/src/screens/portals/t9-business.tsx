// T9 portals for business contacts: client portal (T9-06), staffing vendor portal (T9-12),
// contract-labour vendor portal (T9-13) and the visitor invite page (T9-14).
import { useState } from 'react';
import { Check, Download, FileText, Plus, Upload, X } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, DescriptionList } from '../../components/shell';
import { EmptyState, InlineAlert, Meter, NoAccessState } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DatePicker } from '../../components/date';
import { TimeField } from '../../components/inputs';
import { FileUpload } from '../../components/upload';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Icon } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import { daysUntil, deploymentBlock, licenceAlert, rateCapCheck, submissionBlock, vendorInvoice } from './portals-logic';
import { ClDue, ClLicences, ClWorkerList, ClWorkOrders, type PortalDue, type PortalLicence, type PortalWorker, type PortalWorkOrder } from './contractor-portal';
import { LiveContractorPortalView, type LiveContractorPortal } from './contractor-portal-live';
import { BlockNote, CameraFrame, ConsentPanel, Fact, FactRow, QrCode, StepDots, TenantPortal, type CameraState } from './portals-kit';
import type {
  ClEstablishment,
  ClientInvoice,
  ClientJob,
  ClientSubmission,
  ClientTimesheet,
  ClWorker,
  PackItemState,
  SharedJob,
  VendorSubmission,
} from './t9-biz-data';

const fakeUpload = () => Promise.resolve();
const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

/* ================================================================== */
/* T9-06 Client portal                                                 */
/* ================================================================== */

export type ClientTab = 'jobs' | 'submissions' | 'interviews' | 'timesheets' | 'invoices' | 'tickets';
const CLIENT_TABS: { id: ClientTab; label: string }[] = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'timesheets', label: 'Timesheets' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'tickets', label: 'Tickets' },
];

const SUB_TONE: Record<ClientSubmission['status'], BadgeTone> = { New: 'info', Shortlisted: 'success', Interview: 'info', Rejected: 'neutral', Offered: 'success' };

export interface ClientPortalProps {
  tenant: string;
  accent?: string;
  client: { name: string; contact: string; email: string; contractEnds: Date };
  today: Date;
  tab: ClientTab;
  jobs: ClientJob[];
  submissions: ClientSubmission[];
  interviews: { id: string; candidate: string; job: string; at: Date; mode: string; panel: string; status: string }[];
  timesheets: ClientTimesheet[];
  invoices: ClientInvoice[];
  tickets: { id: string; subject: string; category: string; priority: string; raisedOn: Date; sla: string; status: string }[];
  /** A deep link to another client's record: 403. */
  forbidden?: boolean;
  defaultRejectId?: string;
  defaultScheduleOpen?: boolean;
  defaultTicketOpen?: boolean;
}

// T9-06
/** Client contact: own client's jobs, submissions, interviews, timesheets, invoices and tickets only (M10 Q8). */
export function ClientPortalScreen(props: ClientPortalProps | { live: LiveClientPortal }) {
  if ('live' in props) return <LiveClientPortalView live={props.live} />;
  const p = props;
  const { tenant, accent, client, today, tab } = p;
  return (
    <TenantPortal
      tenant={tenant}
      portal={`Client portal · ${client.name}`}
      accent={accent}
      nav={CLIENT_TABS.map((t) => ({ label: t.label, active: t.id === tab }))}
      access={{ kind: 'otp', identity: client.email, endsOn: client.contractEnds, today, endsBecause: 'contract end' }}
      footer={{ privacy: 'Privacy notice for client contacts (G-09)' }}
    >
      {p.forbidden ? (
        <NoAccessState what="this record" grantedBy={`your account manager at ${tenant}`} />
      ) : tab === 'jobs' ? (
        <ClientJobs jobs={p.jobs} />
      ) : tab === 'submissions' ? (
        <ClientSubmissions subs={p.submissions} jobs={p.jobs} defaultRejectId={p.defaultRejectId} />
      ) : tab === 'interviews' ? (
        <ClientInterviews items={p.interviews} defaultOpen={p.defaultScheduleOpen} />
      ) : tab === 'timesheets' ? (
        <ClientTimesheets items={p.timesheets} />
      ) : tab === 'invoices' ? (
        <ClientInvoices items={p.invoices} today={today} />
      ) : (
        <ClientTickets items={p.tickets} defaultOpen={p.defaultTicketOpen} />
      )}
    </TenantPortal>
  );
}

function ClientJobs({ jobs }: { jobs: ClientJob[] }) {
  const open = jobs.filter((j) => j.status === 'Open');
  return (
    <>
      <FactRow label="Hiring summary">
        <Fact label="Open jobs" value={open.length} />
        <Fact label="Openings" value={open.reduce((a, j) => a + j.openings, 0)} />
        <Fact label="New submissions to review" value={2} tone="warning" />
      </FactRow>
      {jobs.length === 0 ? (
        <EmptyState title="No jobs yet." description="Your account manager adds the jobs you agree with them." action={<Button variant="primary">Request a new job</Button>} />
      ) : (
        <Card title="Your jobs" actions={<Button size="sm" icon={Plus}>Request a new job</Button>}>
          <ul className="yx-ps-list">
            {jobs.map((j) => (
              <li key={j.id}>
                <div className="yx-ps-list__main">
                  <span className="yx-ps-list__title">
                    {j.title} <span className="yx-ps-muted yx-ps-mono">{j.id}</span>
                  </span>
                  <span className="yx-ps-list__meta">
                    {j.location} · {j.type} · {j.band} · {j.openings} openings · {j.submissions} submissions · {j.interviews} interviews
                  </span>
                </div>
                <Badge tone={j.status === 'Open' ? 'success' : j.status === 'On hold' ? 'warning' : 'neutral'}>{j.status}</Badge>
                <Button variant="review" size="sm">View</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function ClientSubmissions({ subs, jobs, defaultRejectId }: { subs: ClientSubmission[]; jobs: ClientJob[]; defaultRejectId?: string }) {
  const [rows, setRows] = useState(subs);
  const [rejecting, setRejecting] = useState<string | null>(defaultRejectId ?? null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const job = (id: string) => jobs.find((j) => j.id === id)?.title ?? id;
  const set = (id: string, status: ClientSubmission['status']) => setRows((xs) => xs.map((r) => (r.id === id ? { ...r, status } : r)));
  if (rows.length === 0) return <EmptyState title="No submissions yet." description="You'll get an email when a candidate is submitted for one of your jobs." />;
  return (
    <Card title="Submissions">
      <ul className="yx-ps-list" aria-live="polite">
        {rows.map((s) => (
          <li key={s.id}>
            <div className="yx-ps-list__main">
              <span className="yx-ps-list__title">{s.candidate}</span>
              <span className="yx-ps-list__meta">
                {job(s.jobId)} · {s.current} · {s.experience} · expects {formatINR(s.expected)} a year · notice {s.notice} · submitted {formatDate(s.submittedOn)}
              </span>
            </div>
            <Badge tone={SUB_TONE[s.status]}>{s.status}</Badge>
            <Button size="sm" icon={FileText}>
              Résumé
            </Button>
            {s.status === 'New' && (
              <>
                <Button size="sm" icon={Check} onClick={() => set(s.id, 'Shortlisted')}>
                  Shortlist
                </Button>
                <Button size="sm" icon={X} onClick={() => setRejecting(s.id)}>
                  Reject
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <Dialog
        open={rejecting != null}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Reject ${rows.find((r) => r.id === rejecting)?.candidate ?? ''}?`}
        description="Your feedback goes to the recruiter, not the candidate."
        footer={
          <>
            <Button onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!reason}
              onClick={() => {
                if (rejecting) set(rejecting, 'Rejected');
                setRejecting(null);
              }}
            >
              Reject with feedback
            </Button>
          </>
        }
      >
        <FormField label="Reason" required>
          <Select value={reason} onChange={setReason} options={opt(['Not enough experience', 'Salary expectation too high', 'Notice period too long', 'Skills do not match', 'Already in our pipeline', 'Other'])} placeholder="Choose a reason" />
        </FormField>
        <FormField label="Feedback" optional>
          <TextArea value={note} onChange={setNote} rows={3} />
        </FormField>
      </Dialog>
    </Card>
  );
}

function ClientInterviews(props: { items: ClientPortalProps['interviews']; defaultOpen?: boolean } | { live: Parameters<typeof LiveClientInterviews>[0] }) {
  if ('live' in props) return <LiveClientInterviews {...props.live} />;
  const { items, defaultOpen } = props;
  const [open, setOpen] = useState(!!defaultOpen);
  const [date, setDate] = useState<Date | null>(new Date(2026, 9, 1));
  const [time, setTime] = useState('11:00');
  const [mode, setMode] = useState<string | undefined>('video');
  return (
    <Card title="Interviews" actions={<Button size="sm" icon={Plus} onClick={() => setOpen(true)}>Schedule interview</Button>}>
      {items.length === 0 ? (
        <EmptyState compact title="No interviews scheduled." />
      ) : (
        <ul className="yx-ps-list">
          {items.map((i) => (
            <li key={i.id}>
              <div className="yx-ps-list__main">
                <span className="yx-ps-list__title">
                  {i.candidate} · {i.job}
                </span>
                <span className="yx-ps-list__meta">
                  {formatDate(i.at)}, {timeOf(i.at)} · {i.mode} · panel: {i.panel}
                </span>
              </div>
              <Badge tone={i.status === 'Confirmed' ? 'success' : 'warning'}>{i.status}</Badge>
              <Button size="sm">Reschedule</Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title="Schedule an interview"
        description="The recruiter confirms the time with the candidate and sends invitations."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Propose time
            </Button>
          </>
        }
      >
        <FormField label="Candidate" required>
          <Select value="S-8801" onChange={() => undefined} options={[{ value: 'S-8801', label: 'Imran Sheikh · Production Supervisor' }]} />
        </FormField>
        <FieldRow>
          <FormField label="Date" required>
            <DatePicker value={date} onChange={setDate} />
          </FormField>
          <FormField label="Start time" required>
            <TimeField value={time} onChange={(v) => setTime(v ?? '')} />
          </FormField>
        </FieldRow>
        <FormField label="How">
          <RadioGroup value={mode} onChange={setMode} orientation="horizontal" options={[{ value: 'video', label: 'Video call' }, { value: 'site', label: 'At your site' }, { value: 'phone', label: 'Phone' }]} />
        </FormField>
        <FormField label="Panel" helper="Names only; they get a calendar invitation.">
          <TextField defaultValue="Divya Raghunathan, Karthik Subramanian" />
        </FormField>
      </Dialog>
    </Card>
  );
}

function ClientTimesheets({ items }: { items: ClientTimesheet[] }) {
  const [rows, setRows] = useState(items);
  const waiting = rows.filter((r) => r.status === 'Waiting for you');
  const set = (ids: string[], status: ClientTimesheet['status']) => setRows((xs) => xs.map((r) => (ids.includes(r.id) ? { ...r, status } : r)));
  return (
    <Card
      title="Timesheets"
      actions={
        waiting.length > 1 ? (
          <ConfirmDialog
            trigger={<Button size="sm">Approve all {waiting.length}</Button>}
            title={`Approve ${waiting.length} timesheets?`}
            consequence={`${waiting.reduce((a, r) => a + r.hours, 0)} hours will be billed on the next invoice.`}
            confirmLabel={`Approve ${waiting.length} timesheets`}
            onConfirm={() => set(waiting.map((w) => w.id), 'Approved')}
          />
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState compact title="No timesheets to approve." />
      ) : (
        <ul className="yx-ps-list" aria-live="polite">
          {rows.map((t) => (
            <li key={t.id}>
              <div className="yx-ps-list__main">
                <span className="yx-ps-list__title">
                  {t.worker} · {t.role}
                </span>
                <span className="yx-ps-list__meta">
                  {t.week} · {t.hours} hours{t.overtime ? ` (${t.overtime} overtime)` : ''}
                  {t.vendor ? ` · supplied by ${t.vendor}` : ''}
                </span>
              </div>
              <Badge tone={t.status === 'Approved' ? 'success' : t.status === 'Sent back' ? 'danger' : 'warning'}>{t.status}</Badge>
              {t.status === 'Waiting for you' && (
                <>
                  <Button variant="approve" size="sm" icon={Check} onClick={() => set([t.id], 'Approved')}>
                    Approve
                  </Button>
                  <Button size="sm" onClick={() => set([t.id], 'Sent back')}>
                    Send back
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Live (slice 3): no PDF yet (question 492), so `pdf` is off there. */
function ClientInvoices({ items, today, pdf = true, onPdf }: { items: ClientInvoice[]; today: Date; pdf?: boolean; onPdf?: (no: string) => void }) {
  const outstanding = items.filter((i) => i.status === 'Due' || i.status === 'Overdue').reduce((a, i) => a + i.amount + i.gst, 0);
  const overdue = items.filter((i) => i.status === 'Overdue');
  return (
    <>
      <FactRow label="Invoices">
        <Fact label="Outstanding" value={formatINR(outstanding)} />
        <Fact label="Overdue" value={`${overdue.length} · ${formatINR(overdue.reduce((a, i) => a + i.amount + i.gst, 0))}`} tone={overdue.length ? 'danger' : undefined} />
      </FactRow>
      <Card title="Invoices">
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Invoices, scrolls sideways on small screens">
        <table className="yx-ps-slabgrid">
          <caption className="yx-visually-hidden">Invoices</caption>
          <thead>
            <tr>
              <th scope="col">Invoice</th>
              <th scope="col">Period</th>
              <th scope="col">Type</th>
              <th scope="col">Amount</th>
              <th scope="col">GST</th>
              <th scope="col">Due</th>
              <th scope="col">Status</th>
              {pdf && (
                <th scope="col">
                  <span className="yx-visually-hidden">Download</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.no}>
                <td className="yx-ps-mono">{i.no}</td>
                <td>{i.period || '—'}</td>
                <td>{i.kind}</td>
                <td data-num>{formatINR(i.amount)}</td>
                <td data-num>{formatINR(i.gst)}</td>
                <td>
                  {formatDate(i.dueOn)}
                  {i.status === 'Overdue' && ` · ${-daysUntil(i.dueOn, today)} days late`}
                </td>
                <td>
                  <Badge tone={i.status === 'Paid' || i.status === 'Credit' ? 'success' : i.status === 'Overdue' ? 'danger' : 'warning'}>{i.status}</Badge>
                </td>
                {pdf && (
                  <td>
                    <Button size="sm" icon={Download} onClick={onPdf ? () => onPdf(i.no) : undefined} aria-label={`PDF of ${i.no}`}>
                      PDF
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </>
  );
}

function ClientTickets({ items, defaultOpen }: { items: ClientPortalProps['tickets']; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [cat, setCat] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <Card title="Tickets" actions={<Button size="sm" icon={Plus} onClick={() => setOpen(true)}>Raise a ticket</Button>}>
      {items.length === 0 ? (
        <EmptyState compact title="No tickets." description="Raise one for replacements, billing questions or access." />
      ) : (
        <ul className="yx-ps-list">
          {items.map((t) => (
            <li key={t.id}>
              <div className="yx-ps-list__main">
                <span className="yx-ps-list__title">{t.subject}</span>
                <span className="yx-ps-list__meta">
                  <span className="yx-ps-mono">{t.id}</span> · {t.category} · {t.priority} priority · raised {formatDate(t.raisedOn)} · {t.sla}
                </span>
              </div>
              <Badge tone={t.status === 'Resolved' ? 'success' : t.status === 'Waiting for you' ? 'warning' : 'info'}>{t.status}</Badge>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title="Raise a ticket"
        description="Response times follow your contract: high priority within 4 business hours."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => (cat && subject ? setOpen(false) : setTried(true))}>
              Raise ticket
            </Button>
          </>
        }
      >
        <FormField label="Category" required error={tried && !cat ? 'Choose a category.' : null}>
          <Select value={cat} onChange={setCat} options={opt(['Replacement', 'Billing', 'Timesheets', 'Access', 'Complaint about a worker', 'Other'])} placeholder="Choose" />
        </FormField>
        <FormField label="Subject" required error={tried && !subject ? 'Add a short subject.' : null}>
          <TextField value={subject} onChange={setSubject} />
        </FormField>
        <FormField label="Details" optional>
          <TextArea rows={4} />
        </FormField>
      </Dialog>
    </Card>
  );
}

/* ================================================================== */
/* T9-12 Staffing vendor portal                                        */
/* ================================================================== */

export type VendorTab = 'jobs' | 'submit' | 'submissions' | 'invoices' | 'scorecard';
const VENDOR_TABS: { id: VendorTab; label: string }[] = [
  { id: 'jobs', label: 'Shared jobs' },
  { id: 'submit', label: 'Submit candidate' },
  { id: 'submissions', label: 'My submissions' },
  { id: 'invoices', label: 'Timesheets and invoices' },
  { id: 'scorecard', label: 'Scorecard' },
];

export interface VendorPortalProps {
  tenant: string;
  accent?: string;
  vendor: { name: string; contact: string; email: string; agreementEnds: Date; tdsSection: string };
  today: Date;
  tab: VendorTab;
  jobs: SharedJob[];
  submissions: VendorSubmission[];
  scorecard: { label: string; value: string }[];
  /** Activation needs agreement, PAN, verified bank and TDS section. */
  inactive?: boolean;
  submitJobId?: string;
  defaultRate?: number;
  duplicate?: boolean;
}

// T9-12
/** Staffing vendor: own shared jobs, submissions, placements, invoices and scorecard; never other vendors or bill rates (M10 C7). */
export function VendorPortalScreen(p: VendorPortalProps) {
  const { tenant, accent, vendor, today, tab } = p;
  return (
    <TenantPortal
      tenant={tenant}
      portal={`Vendor portal · ${vendor.name}`}
      accent={accent}
      nav={p.inactive ? [] : VENDOR_TABS.map((t) => ({ label: t.label, active: t.id === tab }))}
      access={{ kind: 'otp', identity: vendor.email, endsOn: vendor.agreementEnds, today, endsBecause: 'agreement end' }}
      footer={{ privacy: 'Privacy notice for staffing vendors (G-09)' }}
    >
      {p.inactive ? (
        <VendorActivation />
      ) : tab === 'jobs' ? (
        <VendorJobs jobs={p.jobs} today={today} />
      ) : tab === 'submit' ? (
        <VendorSubmit job={p.jobs.find((j) => j.id === (p.submitJobId ?? 'J-2317'))!} today={today} defaultRate={p.defaultRate} duplicate={p.duplicate} />
      ) : tab === 'submissions' ? (
        <VendorSubmissions rows={p.submissions} />
      ) : tab === 'invoices' ? (
        <VendorInvoices tds={vendor.tdsSection} />
      ) : (
        <Card title="Your scorecard · last 90 days">
          <div className="yx-ps-grid">
            {p.scorecard.map((s) => (
              <Fact key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
          <p className="yx-ps-muted">Recruiters see the same numbers. Other vendors' figures are never shown.</p>
        </Card>
      )}
    </TenantPortal>
  );
}

function VendorActivation() {
  const items = [
    { label: 'Vendor agreement signed', done: true },
    { label: 'PAN verified', done: true },
    { label: 'Bank account verified', done: false },
    { label: 'TDS section confirmed (194C or 194J)', done: false },
  ];
  return (
    <Card title="Finish setting up to see shared jobs">
      <div className="yx-ps-stack">
        <p className="yx-ps-muted">Your account becomes active when all four items are done.</p>
        <ul className="yx-ps-list">
          {items.map((i) => (
            <li key={i.label}>
              <span className="yx-ps-list__main">{i.label}</span>
              <Badge tone={i.done ? 'success' : 'warning'}>{i.done ? 'Done' : 'To do'}</Badge>
              {!i.done && <Button size="sm">Complete</Button>}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function VendorJobs({ jobs, today }: { jobs: SharedJob[]; today: Date }) {
  return (
    <Card title="Jobs shared with you">
      {jobs.length === 0 ? (
        <EmptyState compact title="No jobs are shared with you right now." description="Recruiters share jobs when they need more candidates." />
      ) : (
        <ul className="yx-ps-list">
          {jobs.map((j) => {
            const block = submissionBlock(j, today);
            return (
              <li key={j.id}>
                <div className="yx-ps-list__main">
                  <span className="yx-ps-list__title">
                    {j.title} <span className="yx-ps-muted yx-ps-mono">{j.id}</span>
                  </span>
                  <span className="yx-ps-list__meta">
                    {j.client} · {j.location} · rate cap {formatINR(j.rateCap)} an hour · {j.mySubmissions} of {j.maxSubmissions} submissions used · share ends {formatDate(j.expiresOn)}
                  </span>
                  {block && <BlockNote>{block}</BlockNote>}
                </div>
                <Badge tone={j.state === 'shared' && !block ? 'success' : 'neutral'}>{j.state === 'shared' ? (block ? 'Closed to you' : 'Open') : j.state === 'expired' ? 'Expired' : 'Withdrawn'}</Badge>
                <Button size="sm" disabled={!!block}>
                  Submit candidate
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function VendorSubmit({ job, today, defaultRate = 850, duplicate }: { job: SharedJob; today: Date; defaultRate?: number; duplicate?: boolean }) {
  const [rate, setRate] = useState<number | null>(defaultRate);
  const [right, setRight] = useState(false);
  const [sent, setSent] = useState(false);
  const [tried, setTried] = useState(false);
  const cap = rateCapCheck(rate ?? 0, job.rateCap);
  const block = submissionBlock(job, today);
  if (duplicate)
    return (
      <InlineAlert tone="warning" title="Duplicate — not accepted">
        This candidate is already in the recruiter's pipeline for this client. The submission was not accepted. For privacy we don't say who submitted them first.
      </InlineAlert>
    );
  if (sent)
    return (
      <InlineAlert tone="success" title="Candidate submitted">
        We sent a consent link to the candidate. The recruiter sees the submission once they confirm.
      </InlineAlert>
    );
  return (
    <Card
      title={`Submit a candidate · ${job.title}`}
      footer={
        <Button variant="primary" disabled={!!block} onClick={() => (right && cap.ok ? setSent(true) : setTried(true))}>
          Submit candidate
        </Button>
      }
    >
      <div className="yx-ps-stack">
        <p className="yx-ps-muted">
          {job.client} · rate cap {formatINR(job.rateCap)} an hour · {job.maxSubmissions - job.mySubmissions} submissions left
        </p>
        <FieldRow>
          <FormField label="Candidate name" required>
            <TextField defaultValue="Aarav Mehta" />
          </FormField>
          <FormField label="Candidate email" required helper="We send them a consent link.">
            <TextField type="email" defaultValue="aarav.m@example.in" />
          </FormField>
        </FieldRow>
        <FormField label="Résumé" required>
          <FileUpload upload={fakeUpload} accept={['.pdf', '.docx']} multiple={false} />
        </FormField>
        <FormField
          label="Your rate (₹ an hour)"
          required
          error={!cap.ok ? `This is ${formatINR(cap.over)} above the ${formatINR(job.rateCap)} cap. Lower it, or ask the recruiter for an exception.` : null}
        >
          <CurrencyField value={rate} onChange={setRate} />
        </FormField>
        {!cap.ok && <Button size="sm">Ask for a rate exception</Button>}
        <Checkbox
          checked={right}
          onChange={setRight}
          label="I confirm this candidate has agreed that we represent them for this job"
          description={tried && !right ? 'Confirm you have the right to represent this candidate.' : undefined}
        />
      </div>
    </Card>
  );
}

const VSUB_TONE: Record<VendorSubmission['status'], BadgeTone> = {
  Submitted: 'info',
  Shortlisted: 'success',
  Interview: 'info',
  Offered: 'success',
  Placed: 'success',
  Rejected: 'neutral',
  'Not accepted': 'warning',
};

function VendorSubmissions({ rows }: { rows: VendorSubmission[] }) {
  if (rows.length === 0) return <EmptyState title="You haven't submitted anyone yet." action={<Button variant="primary">Submit candidate</Button>} />;
  return (
    <Card title="My submissions">
      <ul className="yx-ps-list">
        {rows.map((s) => (
          <li key={s.id}>
            <div className="yx-ps-list__main">
              <span className="yx-ps-list__title">{s.candidate}</span>
              <span className="yx-ps-list__meta">
                {s.job} · {formatINR(s.rate)} an hour · submitted {formatDate(s.submittedOn)}
                {s.dup === 'duplicate' ? ' · duplicate, not accepted' : ''}
              </span>
            </div>
            <Badge tone={VSUB_TONE[s.status]}>{s.status}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function VendorInvoices({ tds }: { tds: string }) {
  const inv = vendorInvoice(160, 900, tds === '194J' ? 10 : 2);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="yx-ps-stack">
      <Card title="Proposed invoice · Aarav Mehta · September 2026">
        <DescriptionList
          columns={2}
          items={[
            { label: 'Approved hours', value: '160 hours (client approved 28 Sep 2026)' },
            { label: 'Your rate', value: `${formatINR(900)} an hour` },
            { label: 'Amount', value: formatINR(inv.base) },
            { label: 'GST 18%', value: formatINR(inv.gst) },
            { label: `TDS under section ${tds}`, value: `− ${formatINR(inv.tds)}` },
            { label: 'You will be paid', value: <strong>{formatINR(inv.payable)}</strong> },
          ]}
        />
        {done ? (
          <InlineAlert tone="success" title="Invoice confirmed">
            Payment is due in 30 days. Payment advice appears here when it is paid.
          </InlineAlert>
        ) : (
          <div className="yx-ps-row">
            <Button onClick={() => setConfirming(true)}>Upload my own invoice</Button>
            <Button variant="primary" onClick={() => setDone(true)}>
              Confirm invoice
            </Button>
          </div>
        )}
        {confirming && (
          <div className="yx-ps-stack">
            <FieldRow>
              <FormField label="Your invoice number" required>
                <TextField defaultValue="CTP/26-27/112" />
              </FormField>
              <FormField label="Your GSTIN" required>
                <TextField defaultValue="33AAKFC4521M1Z2" className="yx-ps-mono" />
              </FormField>
            </FieldRow>
            <FileUpload upload={fakeUpload} accept={['.pdf']} multiple={false} />
            <BlockNote>Your invoice can't be more than the approved {formatINR(inv.base)} before GST unless the recruiter approves an exception.</BlockNote>
          </div>
        )}
      </Card>
      <Card title="Past invoices">
        <ul className="yx-ps-list">
          <li>
            <span className="yx-ps-list__main">CTP/26-27/098 · August 2026 · {formatINR(1_62_720)}</span>
            <Badge tone="success">Paid 12 Sep 2026</Badge>
            <Button size="sm" icon={Download}>
              Payment advice
            </Button>
          </li>
        </ul>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* T9-13 Contract-labour vendor portal                                 */
/* ================================================================== */

export type ClTab = 'establishments' | 'workers' | 'packs' | 'bills';
const CL_TABS: { id: ClTab; label: string }[] = [
  { id: 'establishments', label: 'Establishments and licences' },
  { id: 'workers', label: 'Workers' },
  { id: 'packs', label: 'Monthly packs' },
  { id: 'bills', label: 'Bills' },
];

const PACK_TONE: Record<PackItemState, { tone: BadgeTone; text: string }> = {
  pending: { tone: 'info', text: 'Being checked' },
  verified: { tone: 'success', text: 'Verified' },
  discrepancy: { tone: 'danger', text: 'Discrepancy' },
  missing: { tone: 'warning', text: 'Not uploaded' },
};

export interface ContractorPortalProps {
  tenant: string;
  accent?: string;
  contractor: { name: string; contact: string; email: string; contractEnds: Date };
  today: Date;
  tab: ClTab;
  establishments: ClEstablishment[];
  workers: ClWorker[];
  pack: {
    establishment: string;
    month: string;
    due: Date;
    status: 'open' | 'submitted' | 'verified' | 'discrepancy' | 'overdue';
    items: { id: string; label: string; state: PackItemState; note?: string }[];
    checks: { label: string; ok: boolean }[];
  };
  bills: { no: string; month: string; amount: number; tds: number; status: 'On hold' | 'Paid' | 'Due'; reason: string }[];
  /** Adding a worker: show the add form with this DOB and establishment. */
  addWorker?: { dob: Date; establishmentId: string };
  /** CL-3 (answer 631): what is due, the work orders, and a licence whose renewal is being uploaded. */
  due?: PortalDue[];
  workOrders?: PortalWorkOrder[];
  renewingId?: string;
}

/** The design's sample establishments and workers as the portal parts take them. */
const licencesOf = (xs: ClEstablishment[]): PortalLicence[] => xs.map((e) => ({ id: e.id, site: e.name, licenceNo: e.licenceNo, authority: e.authority, nature: e.nature, maxWorkers: e.maxWorkers, deployed: e.deployed, validTo: e.validTo, renewal: e.renewal ?? null }));
const workersOf = (xs: ClWorker[]): PortalWorker[] => xs.map((w) => ({ id: w.id, name: w.name, idMasked: w.idMasked, uan: w.uan === 'Not linked' ? '' : w.uan, esic: w.esic, skill: w.skill, wage: w.wage, site: w.site, from: w.from, gatePass: w.gatePass, gateValidTo: w.gateValidTo, status: w.status ?? 'Deployed' }));

// T9-13
/** Contractor contact: own establishments, workers, monthly compliance packs, discrepancies, bills and licences (M13). */
export function ContractorPortalScreen(props: ContractorPortalProps | { live: LiveContractorPortal }) {
  if ('live' in props) return <LiveContractorPortalView live={props.live} />;
  const p = props;
  const { tenant, accent, contractor, today, tab } = p;
  const held = p.bills.some((b) => b.status === 'On hold');
  const est = p.addWorker ? p.establishments.find((e) => e.id === p.addWorker!.establishmentId)! : null;
  const block = p.addWorker && est ? deploymentBlock({ dob: p.addWorker.dob, today, deployed: est.deployed, maxWorkers: est.maxWorkers }) : null;
  return (
    <TenantPortal
      tenant={tenant}
      portal={`Contractor portal · ${contractor.name}`}
      accent={accent}
      nav={CL_TABS.map((t) => ({ label: t.label, active: t.id === tab }))}
      access={{ kind: 'otp', identity: contractor.email, endsOn: contractor.contractEnds, today, endsBecause: 'contract end' }}
      footer={{ privacy: 'Privacy notice for contract-labour vendors (G-09)' }}
    >
      {held && tab !== 'bills' && (
        <InlineAlert tone="warning" title="A bill payment is on hold">
          The August 2026 bill is held until the August pack's discrepancy is fixed.
        </InlineAlert>
      )}
      {tab === 'establishments' && (
        <div className="yx-ps-stack">
          {p.due && <ClDue items={p.due} />}
          <ClLicences items={licencesOf(p.establishments)} today={today} renewingId={p.renewingId ?? null} />
          {p.workOrders && <ClWorkOrders items={p.workOrders} />}
        </div>
      )}
      {tab === 'workers' && (
        <ClWorkerList
          workers={workersOf(p.workers)}
          sites={p.establishments.map((e) => ({ id: e.id, name: `${e.name} (${e.deployed} of ${e.maxWorkers})` }))}
          today={today}
          design={p.addWorker ? { dob: p.addWorker.dob, siteId: p.addWorker.establishmentId, checks: [{ id: 'age', status: block?.includes('under 18') ? 'fail' : 'pass', label: 'Age 18 or over', detail: block?.includes('under 18') ? block : undefined }, { id: 'max', status: block && !block.includes('under 18') ? 'fail' : 'pass', label: 'Within the licence maximum', detail: block && !block.includes('under 18') ? block : undefined }, { id: 'dup', status: 'pass', label: 'Not already deployed', detail: 'Matched on the ID' }] } : undefined}
        />
      )}
      {tab === 'packs' && <ClPack pack={p.pack} today={today} />}
      {tab === 'bills' && <ClBills bills={p.bills} />}
    </TenantPortal>
  );
}

function ClPack({ pack, today }: { pack: ContractorPortalProps['pack']; today: Date }) {
  const late = daysUntil(pack.due, today) < 0 && pack.status !== 'verified';
  return (
    <div className="yx-ps-stack">
      <div className="yx-ps-row" data-between>
        <h1 className="yx-ps-h">
          {pack.establishment} · {pack.month}
        </h1>
        <Badge tone={pack.status === 'verified' ? 'success' : pack.status === 'discrepancy' || pack.status === 'overdue' ? 'danger' : 'info'}>
          {pack.status === 'discrepancy' ? 'Discrepancy' : pack.status === 'overdue' ? 'Overdue' : pack.status === 'verified' ? 'Verified' : pack.status === 'submitted' ? 'Submitted' : 'Open'}
        </Badge>
      </div>
      <p className="yx-ps-muted">
        Due by {formatDate(pack.due)} (15th of the following month){late ? ` · ${-daysUntil(pack.due, today)} days late` : ''}. Bills are held while a pack is overdue or has a discrepancy.
      </p>
      <div className="yx-split">
        <div className="yx-split__main">
          <Card title="Proofs">
            <ul className="yx-ps-list">
              {pack.items.map((i) => (
                <li key={i.id}>
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title">{i.label}</span>
                    {i.note && <span className="yx-ps-list__meta">{i.note}</span>}
                  </div>
                  <Badge tone={PACK_TONE[i.state].tone}>{PACK_TONE[i.state].text}</Badge>
                  {(i.state === 'missing' || i.state === 'discrepancy') && (
                    <Button size="sm" icon={Upload}>
                      {i.state === 'missing' ? 'Upload' : 'Replace'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="yx-split__aside">
          <Card title="Automatic checks">
            <ul className="yx-ps-list">
              {pack.checks.map((c) => (
                <li key={c.label}>
                  <Icon icon={c.ok ? Check : X} label={c.ok ? 'Passed' : 'Failed'} />
                  <span className="yx-ps-list__main">{c.label}</span>
                  <Badge tone={c.ok ? 'success' : 'danger'}>{c.ok ? 'Passed' : 'Failed'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Button variant="primary" disabled={pack.items.some((i) => i.state === 'missing')}>
            Submit pack
          </Button>
        </div>
      </div>
    </div>
  );
}

function ClBills({ bills }: { bills: ContractorPortalProps['bills'] }) {
  return (
    <Card title="Bills and payments">
      <ul className="yx-ps-list">
        {bills.map((b) => (
          <li key={b.no}>
            <div className="yx-ps-list__main">
              <span className="yx-ps-list__title">
                <span className="yx-ps-mono">{b.no}</span> · {b.month}
              </span>
              <span className="yx-ps-list__meta">
                {formatINR(b.amount)} · TDS under section 194C {formatINR(b.tds)} · {b.reason}
              </span>
            </div>
            <Badge tone={b.status === 'Paid' ? 'success' : b.status === 'On hold' ? 'danger' : 'warning'}>{b.status}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ================================================================== */
/* T9-14 Visitor invite page                                           */
/* ================================================================== */

export type VisitStage = 'details' | 'id' | 'photo' | 'notice' | 'pass' | 'expired' | 'blocked';

export interface VisitInfo {
  visitor: string;
  mobile: string;
  company: string;
  purpose: string;
  host: string;
  location: string;
  address: string;
  window: { from: Date; to: Date };
  passCode: string;
  rules: { idRequired: boolean; photoRequired: boolean; safetyInduction: boolean; nda: boolean; escort: boolean; hours: string };
}

/** T9-14 live (Visitors slice 1): GET public/visits/:token. The mobile comes masked; the pass code only after the notice. */
export interface PublicVisitView {
  state: 'details' | 'pass' | 'expired' | 'blocked';
  visitor: string;
  /** Masked: "+91 ••••• ••871". */
  mobile: string;
  company: string;
  purpose: string;
  host: string;
  location: string;
  address: string;
  window: { from: string; to: string };
  vehicle: string | null;
  hours: string;
  retentionDays: number;
  notice: string;
  noticeVersion: string;
  passCode: string | null;
  brand?: { orgName?: string; orgLogo?: string | null; accent?: string | null; whiteLabel?: boolean };
}
export interface LiveVisitorPass {
  state: 'loading' | 'ready' | 'not-found' | 'error';
  onRetry: () => void;
  visit: PublicVisitView | null;
  /** Accepts the notice (the version read) with the vehicle number; resolves with the page's new state. */
  onAccept: (vehicle: string) => Promise<unknown>;
}

const PURPOSE_WORDS: Record<string, string> = { meeting: 'a meeting', interview: 'an interview', vendor: 'a supplier visit', audit: 'an audit', delivery: 'a delivery', maintenance: 'maintenance work' };

// T9-14
/** Visitor pre-registration from a one-time link: confirm details, ID, photo, privacy notice (G-27), QR pass (M02 §B11). */
export function VisitorInviteScreen({ tenant: sampleTenant, accent: sampleAccent, visit: sample, stage: initial, camera = 'live', today, live }: { tenant: string; accent?: string; visit: VisitInfo; stage: VisitStage; camera?: CameraState; today: Date; live?: LiveVisitorPass }) {
  const lv = live?.visit ?? null;
  const tenant = live ? (lv?.brand?.orgName ?? '') : sampleTenant;
  const accent = live ? (lv?.brand?.accent ?? undefined) : sampleAccent;
  const visit: VisitInfo = lv
    ? { visitor: lv.visitor, mobile: lv.mobile, company: lv.company || 'Individual', purpose: PURPOSE_WORDS[lv.purpose] ?? lv.purpose, host: lv.host, location: lv.location, address: lv.address, window: { from: new Date(lv.window.from), to: new Date(lv.window.to) }, passCode: lv.passCode ?? '', rules: { idRequired: false, photoRequired: false, safetyInduction: false, nda: false, escort: false, hours: lv.hours } }
    : sample;
  const [stage, setStage] = useState<VisitStage>(lv ? lv.state : initial);
  const [vehicle, setVehicle] = useState(lv?.vehicle ?? '');
  // Live (slice 1): details, the notice, the pass; the ID and photo steps come with slice 3.
  const steps = live ? ['Your details', 'Notice', 'Pass'] : ['Your details', 'ID', 'Photo', 'Notice', 'Pass'];
  const idx = live ? { details: 0, id: 0, photo: 0, notice: 1, pass: 2, expired: 2, blocked: 0 }[stage] : { details: 0, id: 1, photo: 2, notice: 3, pass: 4, expired: 4, blocked: 0 }[stage];
  const when = `${formatDate(visit.window.from)}, ${timeOf(visit.window.from)} to ${timeOf(visit.window.to)}`;
  if (live && (live.state !== 'ready' || !lv))
    return (
      <TenantPortal tenant={tenant || 'Visitor pass'} portal="Visitor pass" narrow access={{ kind: 'note', text: 'Your visit link' }} footer={{ privacy: 'Visitor privacy notice (G-27)', cookies: true }}>
        {live.state === 'loading' ? (
          <p className="yx-ps-muted" role="status">Loading your visit…</p>
        ) : live.state === 'error' ? (
          <InlineAlert tone="danger" title="We couldn't load your visit" actions={<Button size="sm" onClick={live.onRetry}>Try again</Button>}>Nothing has changed. Try again in a moment.</InlineAlert>
        ) : (
          <EmptyState title="We could not find this visit." description="The link may be mistyped or the visit removed. Ask your host to invite you again." />
        )}
      </TenantPortal>
    );
  return (
    <TenantPortal
      tenant={tenant}
      portal="Visitor pass"
      accent={accent}
      logoUrl={lv?.brand?.orgLogo ?? null}
      whiteLabel={Boolean(lv?.brand?.whiteLabel)}
      narrow
      access={{ kind: 'link', endsOn: visit.window.to, today, endsBecause: 'end of your visit window' }}
      footer={{ privacy: 'Visitor privacy notice (G-27)', cookies: true }}
      pinned={
        stage === 'details' ? (
          <Button variant="primary" onClick={() => setStage(live ? 'notice' : 'id')}>
            Continue
          </Button>
        ) : stage === 'id' ? (
          <Button variant="primary" onClick={() => setStage('photo')}>
            Continue
          </Button>
        ) : stage === 'photo' ? (
          <Button variant="primary" onClick={() => setStage('notice')}>
            Use this photo
          </Button>
        ) : undefined
      }
    >
      {stage !== 'blocked' && stage !== 'expired' && <StepDots steps={steps} current={idx} />}
      {stage === 'blocked' && (
        <InlineAlert tone="warning" title="We can't issue a pass for this visit">
          Please contact {visit.host} at {tenant} before you travel. Reception can't let you in with this link.
        </InlineAlert>
      )}
      {stage === 'expired' && (
        <InlineAlert tone="info" title="This visit pass has expired">
          Passes work only during the visit window ({when}). Ask {visit.host} to invite you again.
        </InlineAlert>
      )}
      {stage === 'details' && (
        <>
          <section className="yx-ps-hero">
            <h1>You're invited to {visit.location}</h1>
            <p>
              {visit.host} invited you for: {visit.purpose}. {when}.
            </p>
          </section>
          <Card title="Check your details">
            <DescriptionList
              items={[
                { label: 'Name', value: visit.visitor },
                { label: 'Mobile', value: live ? visit.mobile : `+91 ••••• ••${visit.mobile.slice(-3)}` },
                { label: 'Company', value: visit.company },
                { label: 'Where', value: `${visit.location}, ${visit.address}` },
                { label: 'Allowed hours', value: visit.rules.hours },
              ]}
            />
            <FormField label="Vehicle number" optional helper="For parking inside the gate.">
              {live ? <TextField value={vehicle} onChange={setVehicle} placeholder="TN 70 AB 1234" maxLength={20} /> : <TextField placeholder="TN 70 AB 1234" />}
            </FormField>
          </Card>
          {visit.rules.escort && <p className="yx-ps-muted">An escort will meet you at reception; plant areas need safety shoes.</p>}
        </>
      )}
      {stage === 'id' && (
        <Card title="Your ID">
          <div className="yx-ps-stack">
            <p className="yx-ps-muted">Reception checks your ID on arrival. We store only the ID type and last 4 digits, and delete them after 30 days.</p>
            <FormField label="ID type" required>
              <Select value="Driving licence" onChange={() => undefined} options={opt(['Aadhaar', 'Driving licence', 'Passport', 'Voter ID', 'Company ID card'])} />
            </FormField>
            <FormField label="Last 4 characters" required>
              <TextField defaultValue="4417" maxLength={4} />
            </FormField>
          </div>
        </Card>
      )}
      {stage === 'photo' && (
        <Card title="Your photo for the pass">
          <div className="yx-ps-stack">
            <CameraFrame state={camera} label="Visitor photo" />
            <div className="yx-ps-row">
              <Button>Retake</Button>
              <Button icon={Upload}>Upload a photo instead</Button>
            </div>
          </div>
        </Card>
      )}
      {stage === 'notice' && lv && (
        <ConsentPanel
          title="Before you visit"
          summary={
            <>
              <p>{lv.notice}</p>
              <p>
                {tenant} records your name, mobile, company, host, purpose and your entry and exit times, for site security, safety and evacuation roll-call. Records are kept for{' '}
                {lv.retentionDays} days after your visit, then deleted. Only your host, reception and security see them.
              </p>
            </>
          }
          purposes={[{ id: 'notice', label: 'I have read the visitor notice and the privacy notice', required: true }]}
          noticeLabel="visitor privacy notice (G-27)"
          noticeVersion={lv.noticeVersion}
          acceptLabel="Get my pass"
          declineLabel="Not now"
          onAccept={async () => {
            await live!.onAccept(vehicle.trim());
            setStage('pass');
          }}
          declinedText={`Nothing was recorded. Reception will ask you to read the notice when you arrive.`}
        />
      )}
      {stage === 'notice' && !lv && (
        <ConsentPanel
          title="Before you visit"
          summary={
            <>
              <p>
                {tenant} records your name, mobile, company, host, purpose, photo, ID type and last digits, and your entry and exit times, for site security, safety and
                evacuation roll-call. The site uses CCTV.
              </p>
              <p>Records are kept for 90 days; ID details for 30 days. Only your host and security see them.</p>
            </>
          }
          purposes={[
            { id: 'notice', label: 'I have read the visitor privacy notice', required: true },
            { id: 'safety', label: 'I have watched the 4-minute safety induction video', required: visit.rules.safetyInduction, description: 'Plant areas: food safety and forklift zones.' },
            { id: 'nda', label: 'I agree to the visitor non-disclosure terms', required: visit.rules.nda, description: 'A separate document; read it before agreeing.' },
          ]}
          noticeLabel="visitor privacy notice (G-27)"
          noticeVersion="G-27 v2026.1"
          acceptLabel="Get my pass"
          declineLabel="Cancel visit"
          onAccept={() => setStage('pass')}
          declinedText={`We told ${visit.host} you won't be visiting. Nothing else was recorded.`}
        />
      )}
      {stage === 'pass' && (
        <div className="yx-ps-pass">
          <QrCode value={visit.passCode} size={180} label={`Visitor pass QR code ${visit.passCode}`} />
          <div className="yx-ps-stack">
            <Badge tone="success">Pass ready</Badge>
            <h1 className="yx-ps-h">{visit.visitor}</h1>
            <DescriptionList
              items={[
                { label: 'Visiting', value: `${visit.host} · ${visit.location}` },
                { label: 'When', value: when },
                { label: 'Pass', value: visit.passCode, mono: true },
              ]}
            />
            <p className="yx-ps-muted">Show this at the gate. It works once, only in your visit window.</p>
            <div className="yx-ps-row">
              <Button icon={Download}>Save pass</Button>
              <Button>Get directions</Button>
            </div>
          </div>
        </div>
      )}
    </TenantPortal>
  );
}

/* ================================================================== T9-06 made live (staffing slice 3, answer 453) */

export type LiveClientTab = 'jobs' | 'submissions' | 'interviews' | 'timesheets' | 'invoices';
export interface LiveClientPortal {
  tenant: string;
  tab: LiveClientTab;
  /** Each tab is a link (the page keeps the tab in the address). */
  hrefFor: (tab: LiveClientTab) => string;
  state: 'ready' | 'loading' | 'error';
  onRetry: () => void;
  /** The session ended part-way (a call answered 401). */
  ended: boolean;
  onSignInAgain: () => void;
  onSignOut: () => void;
  today: Date;
  data: {
    client: { name: string; contact: string; email: string; contractEnds: string | null };
    jobs: { id: string; title: string; location: string; openings: number; submissions: number; interviews: number; status: 'Open' | 'On hold' | 'Filled' }[];
    submissions: { id: string; candidate: string; job: string; submittedOn: string; status: ClientSubmission['status']; feedback: string | null }[];
    timesheets: { id: string; worker: string; role: string; weekStart: string; hours: string; overtime: string; vendor: string | null; status: ClientTimesheet['status']; note: string | null }[];
    invoices: { id: string; no: string; period: string | null; kind: string; amount: string; gst: string; issuedOn: string; dueOn: string; status: 'Paid' | 'Due' | 'Overdue' | 'Credit' }[];
    /** Answer 491: HIR-06 interviews for this client's jobs, and who can be booked. */
    interviews?: { id: string; candidate: string; job: string; at: string | null; mode: string; panel: string | null; status: string }[];
    bookable?: { value: string; label: string }[];
  } | null;
  /** Answer 491: propose an interview time (HIR-06; the recruiter confirms it with the candidate). */
  onBook?: (input: { submissionId: string; startsAt: string; mode: 'video' | 'site' | 'phone'; panel: string | null }) => Promise<unknown>;
  /** Answer 492: download an invoice or credit note PDF. */
  onPdf?: (invoiceId: string) => void;
  onDecide: (id: string, decision: 'shortlist' | 'reject', feedback?: string) => Promise<unknown>;
  onTimesheet: (id: string, action: 'approve' | 'send_back') => Promise<unknown>;
}
const LIVE_TABS: { id: LiveClientTab; label: string }[] = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'timesheets', label: 'Timesheets' },
  { id: 'invoices', label: 'Invoices' },
];
const dOf = (s: string) => new Date(`${s}T00:00:00`);
const weekLabel = (s: string) => `${formatDate(dOf(s))} – ${formatDate(new Date(dOf(s).getTime() + 6 * 86_400_000))}`;

function LiveClientPortalView({ live }: { live: LiveClientPortal }) {
  const d = live.data;
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setFailed(null);
    try {
      await fn();
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const body = () => {
    if (live.ended) return <EmptyState title="Your session ended." description="Sign in again with a new code." action={<Button variant="primary" onClick={live.onSignInAgain}>Sign in again</Button>} />;
    if (live.state === 'error') return <EmptyState title="This page could not be loaded." action={<Button onClick={live.onRetry}>Try again</Button>} />;
    if (live.state === 'loading' || !d) return <EmptyState compact title="Loading…" />;
    if (live.tab === 'jobs') {
      const open = d.jobs.filter((j) => j.status === 'Open');
      return (
        <>
          <FactRow label="Hiring summary">
            <Fact label="Open jobs" value={open.length} />
            <Fact label="Openings" value={open.reduce((a, j) => a + j.openings, 0)} />
            <Fact label="New submissions to review" value={d.submissions.filter((x) => x.status === 'New').length} tone="warning" />
          </FactRow>
          {d.jobs.length === 0 ? (
            <EmptyState title="No jobs yet." description="Your account manager adds the jobs you agree with them." />
          ) : (
            <Card title="Your jobs">
              <ul className="yx-ps-list">
                {d.jobs.map((j) => (
                  <li key={j.id}>
                    <div className="yx-ps-list__main">
                      <span className="yx-ps-list__title">{j.title}</span>
                      <span className="yx-ps-list__meta">
                        {j.location ? `${j.location} · ` : ''}
                        {j.openings} openings · {j.submissions} submissions · {j.interviews} interviews
                      </span>
                    </div>
                    <Badge tone={j.status === 'Open' ? 'success' : j.status === 'On hold' ? 'warning' : 'neutral'}>{j.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      );
    }
    if (live.tab === 'submissions') {
      if (!d.submissions.length) return <EmptyState title="No submissions yet." description="You'll get an email when someone is submitted for one of your jobs." />;
      const who = d.submissions.find((r) => r.id === rejecting);
      return (
        <Card title="Submissions">
          <ul className="yx-ps-list" aria-live="polite">
            {d.submissions.map((x) => (
              <li key={x.id}>
                <div className="yx-ps-list__main">
                  <span className="yx-ps-list__title">{x.candidate}</span>
                  <span className="yx-ps-list__meta">
                    {x.job} · submitted {formatDate(dOf(x.submittedOn))}
                    {x.feedback ? ` · your feedback: ${x.feedback}` : ''}
                  </span>
                </div>
                <Badge tone={SUB_TONE[x.status]}>{x.status}</Badge>
                {x.status === 'New' && (
                  <>
                    <Button size="sm" icon={Check} loading={busy === `s${x.id}`} onClick={() => void act(`s${x.id}`, () => live.onDecide(x.id, 'shortlist'))}>
                      Shortlist
                    </Button>
                    <Button size="sm" icon={X} onClick={() => (setRejecting(x.id), setReason(null), setNote(''), setTried(false))}>
                      Reject
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <Dialog
            open={rejecting != null}
            onOpenChange={(o) => !o && setRejecting(null)}
            title={`Reject ${who?.candidate ?? ''}?`}
            description="Your feedback goes to the recruiter, not the candidate."
            footer={
              <>
                <Button onClick={() => setRejecting(null)}>Cancel</Button>
                <Button
                  variant="primary"
                  loading={busy === 'reject'}
                  onClick={() => {
                    setTried(true);
                    if (!reason) return void document.getElementById('cp-reason')?.focus();
                    const id = rejecting!;
                    void act('reject', async () => {
                      await live.onDecide(id, 'reject', note.trim() ? `${reason}: ${note.trim()}` : reason);
                      setRejecting(null);
                    });
                  }}
                >
                  Reject with feedback
                </Button>
              </>
            }
          >
            <FormField id="cp-reason" label="Reason" required error={tried && !reason ? 'Choose a reason.' : null}>
              <Select value={reason} onChange={setReason} options={opt(['Not enough experience', 'Salary expectation too high', 'Notice period too long', 'Skills do not match', 'Already in our pipeline', 'Other'])} placeholder="Choose a reason" />
            </FormField>
            <FormField label="Feedback" optional>
              <TextArea value={note} onChange={setNote} rows={3} maxLength={400} />
            </FormField>
          </Dialog>
        </Card>
      );
    }
    if (live.tab === 'interviews') return <ClientInterviews live={{ items: d.interviews ?? [], bookable: d.bookable ?? [], today: live.today, onBook: live.onBook }} />;
    if (live.tab === 'timesheets') {
      const waiting = d.timesheets.filter((r) => r.status === 'Waiting for you');
      return (
        <Card
          title="Timesheets"
          actions={
            waiting.length > 1 ? (
              <ConfirmDialog
                trigger={<Button size="sm">Approve all {waiting.length}</Button>}
                title={`Approve ${waiting.length} timesheets?`}
                consequence={`${waiting.reduce((a, r) => a + Number(r.hours) + Number(r.overtime), 0)} hours will be billed on the next invoice.`}
                confirmLabel={`Approve ${waiting.length} timesheets`}
                onConfirm={async () => {
                  for (const w of waiting) await live.onTimesheet(w.id, 'approve');
                }}
              />
            ) : undefined
          }
        >
          {d.timesheets.length === 0 ? (
            <EmptyState compact title="No timesheets to approve." />
          ) : (
            <ul className="yx-ps-list" aria-live="polite">
              {d.timesheets.map((t) => (
                <li key={t.id}>
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title">
                      {t.worker}
                      {t.role ? ` · ${t.role}` : ''}
                    </span>
                    <span className="yx-ps-list__meta">
                      {weekLabel(t.weekStart)} · {t.hours} hours{Number(t.overtime) ? ` (${t.overtime} overtime)` : ''}
                      {t.vendor ? ` · supplied by ${t.vendor}` : ''}
                    </span>
                  </div>
                  <Badge tone={t.status === 'Approved' ? 'success' : t.status === 'Sent back' ? 'danger' : 'warning'}>{t.status}</Badge>
                  {t.status === 'Waiting for you' && (
                    <>
                      <Button variant="approve" size="sm" icon={Check} loading={busy === `a${t.id}`} onClick={() => void act(`a${t.id}`, () => live.onTimesheet(t.id, 'approve'))}>
                        Approve
                      </Button>
                      <Button size="sm" loading={busy === `b${t.id}`} onClick={() => void act(`b${t.id}`, () => live.onTimesheet(t.id, 'send_back'))}>
                        Send back
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      );
    }
    if (d.invoices.length === 0) return <EmptyState compact title="No invoices yet." />;
    return <ClientInvoices pdf={Boolean(live.onPdf)} onPdf={(no) => live.onPdf?.(d.invoices.find((x) => x.no === no)!.id)} today={live.today} items={d.invoices.map((x) => ({ no: x.no, period: x.period ?? '', kind: x.kind as ClientInvoice['kind'], amount: Number(x.amount), gst: Number(x.gst), issuedOn: dOf(x.issuedOn), dueOn: dOf(x.dueOn), status: x.status }))} />;
  };
  return (
    <TenantPortal
      tenant={live.tenant}
      portal={`Client portal${d ? ` · ${d.client.name}` : ''}`}
      nav={LIVE_TABS.map((t) => ({ label: t.label, active: t.id === live.tab, href: live.hrefFor(t.id) }))}
      access={{ kind: 'otp', identity: d?.client.email ?? '', endsOn: d?.client.contractEnds ? dOf(d.client.contractEnds) : live.today, today: live.today, endsBecause: 'contract end' }}
      footer={{ privacy: 'Privacy notice for client contacts (G-09)' }}
      noLanguage
      onSignOut={live.onSignOut}
    >
      {failed && <InlineAlert tone="danger" title={failed} />}
      {body()}
    </TenantPortal>
  );
}

/** Answer 491: the drawn Interviews tab made live: the list, and Schedule interview proposing a time through HIR-06. */
function LiveClientInterviews({ items, bookable, today, onBook }: { items: NonNullable<NonNullable<LiveClientPortal['data']>['interviews']>; bookable: { value: string; label: string }[]; today: Date; onBook?: LiveClientPortal['onBook'] }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<string | null>('11:00');
  const [mode, setMode] = useState<'video' | 'site' | 'phone'>('video');
  const [panel, setPanel] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const pad = (n: number) => String(n).padStart(2, '0');
  const save = async () => {
    setTried(true);
    if (!sub) return document.getElementById('ci-sub')?.focus();
    if (!date) return document.getElementById('ci-date')?.focus();
    if (!time) return document.getElementById('ci-time')?.focus();
    setBusy(true);
    setFailed(null);
    try {
      await onBook!({ submissionId: sub, startsAt: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`, mode, panel: panel.trim() || null });
      setOpen(false);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const MODE: Record<string, string> = { 'Video call': 'Video call', 'At the client’s site': 'At your site', Phone: 'Phone' };
  return (
    <Card title="Interviews" actions={onBook && bookable.length ? <Button size="sm" icon={Plus} onClick={() => (setOpen(true), setTried(false), setFailed(null))}>Schedule interview</Button> : undefined}>
      {items.length === 0 ? (
        <EmptyState compact title="No interviews scheduled." />
      ) : (
        <ul className="yx-ps-list">
          {items.map((i) => (
            <li key={i.id}>
              <div className="yx-ps-list__main">
                <span className="yx-ps-list__title">
                  {i.candidate} · {i.job}
                </span>
                <span className="yx-ps-list__meta">
                  {i.at ? `${formatDate(new Date(i.at))}, ${timeOf(new Date(i.at))}` : 'Time to be agreed'} · {MODE[i.mode] ?? i.mode}
                  {i.panel ? ` · panel: ${i.panel}` : ''}
                </span>
              </div>
              <Badge tone={i.status === 'Confirmed' ? 'success' : i.status === 'Cancelled' ? 'neutral' : 'warning'}>{i.status}</Badge>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title="Schedule an interview"
        description="The recruiter confirms the time with the candidate and sends invitations."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              Propose time
            </Button>
          </>
        }
      >
        {failed && <InlineAlert tone="danger" title={failed} />}
        <FormField id="ci-sub" label="Candidate" required error={tried && !sub ? 'Choose the candidate.' : null}>
          <Select value={sub} onChange={setSub} options={bookable} placeholder="Choose a candidate" />
        </FormField>
        <FieldRow>
          <FormField id="ci-date" label="Date" required error={tried && !date ? 'Choose the date.' : null}>
            <DatePicker value={date} onChange={setDate} min={today} />
          </FormField>
          <FormField id="ci-time" label="Start time" required error={tried && !time ? 'Choose the time.' : null}>
            <TimeField value={time} onChange={(v) => setTime(v ?? null)} />
          </FormField>
        </FieldRow>
        <FormField label="How">
          <Segment label="How" value={mode} onChange={setMode} options={[{ value: 'video', label: 'Video call' }, { value: 'site', label: 'At your site' }, { value: 'phone', label: 'Phone' }]} />
        </FormField>
        <FormField label="Panel" optional helper="Names only; the recruiter sends the invitations.">
          <TextField value={panel} onChange={setPanel} maxLength={300} />
        </FormField>
      </Dialog>
    </Card>
  );
}
