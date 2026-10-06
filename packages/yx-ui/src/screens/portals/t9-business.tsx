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
import { DatePicker } from '../../components/date';
import { TimeField } from '../../components/inputs';
import { FileUpload } from '../../components/upload';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Icon } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import { daysUntil, deploymentBlock, licenceAlert, rateCapCheck, submissionBlock, vendorInvoice } from './portals-logic';
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
export function ClientPortalScreen(p: ClientPortalProps) {
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

function ClientInterviews({ items, defaultOpen }: { items: ClientPortalProps['interviews']; defaultOpen?: boolean }) {
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

function ClientInvoices({ items, today }: { items: ClientInvoice[]; today: Date }) {
  const outstanding = items.filter((i) => i.status !== 'Paid').reduce((a, i) => a + i.amount + i.gst, 0);
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
              <th scope="col">
                <span className="yx-visually-hidden">Download</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.no}>
                <td className="yx-ps-mono">{i.no}</td>
                <td>{i.period}</td>
                <td>{i.kind}</td>
                <td data-num>{formatINR(i.amount)}</td>
                <td data-num>{formatINR(i.gst)}</td>
                <td>
                  {formatDate(i.dueOn)}
                  {i.status === 'Overdue' && ` · ${-daysUntil(i.dueOn, today)} days late`}
                </td>
                <td>
                  <Badge tone={i.status === 'Paid' ? 'success' : i.status === 'Overdue' ? 'danger' : 'warning'}>{i.status}</Badge>
                </td>
                <td>
                  <Button size="sm" icon={Download}>
                    PDF
                  </Button>
                </td>
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
}

// T9-13
/** Contractor contact: own establishments, workers, monthly compliance packs, discrepancies, bills and licences (M13). */
export function ContractorPortalScreen(p: ContractorPortalProps) {
  const { tenant, accent, contractor, today, tab } = p;
  const held = p.bills.some((b) => b.status === 'On hold');
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
      {tab === 'establishments' && <ClEstablishments items={p.establishments} today={today} />}
      {tab === 'workers' && <ClWorkers workers={p.workers} establishments={p.establishments} today={today} addWorker={p.addWorker} />}
      {tab === 'packs' && <ClPack pack={p.pack} today={today} />}
      {tab === 'bills' && <ClBills bills={p.bills} />}
    </TenantPortal>
  );
}

function ClEstablishments({ items, today }: { items: ClEstablishment[]; today: Date }) {
  return (
    <div className="yx-ps-stack">
      {items.map((e) => {
        const a = licenceAlert(e.validTo, today);
        return (
          <Card
            key={e.id}
            title={e.name}
            actions={
              <Badge tone={a.band === 'ok' ? 'success' : a.band === '60' ? 'info' : a.band === '30' ? 'warning' : 'danger'}>
                {a.band === 'expired' ? 'Licence expired' : a.band === 'ok' ? 'Licence valid' : `Licence ends in ${a.days} days`}
              </Badge>
            }
          >
            <div className="yx-ps-stack">
              <DescriptionList
                columns={2}
                items={[
                  { label: 'Licence number', value: e.licenceNo, mono: true },
                  { label: 'Issued by', value: e.authority },
                  { label: 'Nature of work', value: e.nature },
                  { label: 'Valid until', value: formatDate(e.validTo) },
                ]}
              />
              <Meter label={`Workers deployed at ${e.name}`} value={e.deployed} max={e.maxWorkers} warnAt={90} valueText={`${e.deployed} of ${e.maxWorkers} allowed`} />
              {a.band !== 'ok' && (
                <div className="yx-ps-row">
                  <Button size="sm" icon={Upload}>
                    Upload renewed licence
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ClWorkers({ workers, establishments, today, addWorker }: { workers: ClWorker[]; establishments: ClEstablishment[]; today: Date; addWorker?: { dob: Date; establishmentId: string } }) {
  const [adding, setAdding] = useState(!!addWorker);
  const [dob, setDob] = useState<Date | null>(addWorker?.dob ?? null);
  const [estId, setEstId] = useState<string | null>(addWorker?.establishmentId ?? establishments[0].id);
  const est = establishments.find((e) => e.id === estId)!;
  const block = dob ? deploymentBlock({ dob, today, deployed: est.deployed, maxWorkers: est.maxWorkers }) : null;
  return (
    <div className="yx-ps-stack">
      <Card title={`Workers · ${workers.length}`} actions={<Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add worker</Button>}>
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Workers, scrolls sideways on small screens">
        <table className="yx-ps-slabgrid">
          <caption className="yx-visually-hidden">Workers</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">ID</th>
              <th scope="col">UAN</th>
              <th scope="col">ESIC IP</th>
              <th scope="col">Skill</th>
              <th scope="col">Daily wage</th>
              <th scope="col">Site</th>
              <th scope="col">Gate pass</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id}>
                <th scope="row">{w.name}</th>
                <td>{w.idMasked}</td>
                <td className="yx-ps-mono">{w.uan === 'Not linked' ? <Badge tone="warning">Not linked</Badge> : w.uan}</td>
                <td className="yx-ps-mono">{w.esic}</td>
                <td>{w.skill}</td>
                <td data-num>{formatINR(w.wage)}</td>
                <td>{w.site}</td>
                <td>
                  <span className="yx-ps-mono">{w.gatePass}</span> · to {formatDate(w.gateValidTo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
      {adding && (
        <Card
          title="Add a worker"
          footer={
            <>
              <Button onClick={() => setAdding(false)}>Cancel</Button>
              <Button variant="primary" disabled={!!block || !dob}>
                Add worker
              </Button>
            </>
          }
        >
          <div className="yx-ps-stack">
            {block && (
              <InlineAlert tone="danger" title="This worker can't be deployed">
                {block}
              </InlineAlert>
            )}
            <FieldRow>
              <FormField label="Full name" required>
                <TextField defaultValue="Ramesh Pandi" />
              </FormField>
              <FormField label="Date of birth" required>
                <DatePicker value={dob} onChange={setDob} max={today} />
              </FormField>
            </FieldRow>
            <FieldRow>
              <FormField label="Establishment" required>
                <Select value={estId} onChange={setEstId} options={establishments.map((e) => ({ value: e.id, label: `${e.name} (${e.deployed} of ${e.maxWorkers})` }))} />
              </FormField>
              <FormField label="Skill category" required>
                <Select value="Unskilled" onChange={() => undefined} options={opt(['Unskilled', 'Semi-skilled', 'Skilled', 'Highly skilled'])} />
              </FormField>
            </FieldRow>
            <FieldRow>
              <FormField label="ID type" required>
                <Select value="Aadhaar" onChange={() => undefined} options={opt(['Aadhaar', 'Voter ID', 'Driving licence', 'Passport'])} />
              </FormField>
              <FormField label="Last 4 digits of ID" required helper="We store only the masked number.">
                <TextField defaultValue="3318" inputMode="numeric" maxLength={4} />
              </FormField>
            </FieldRow>
            <FormField label="Photo" required>
              <FileUpload upload={fakeUpload} accept={['.jpg', '.png']} multiple={false} />
            </FormField>
          </div>
        </Card>
      )}
    </div>
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

// T9-14
/** Visitor pre-registration from a one-time link: confirm details, ID, photo, privacy notice (G-27), QR pass (M02 §B11). */
export function VisitorInviteScreen({ tenant, accent, visit, stage: initial, camera = 'live', today }: { tenant: string; accent?: string; visit: VisitInfo; stage: VisitStage; camera?: CameraState; today: Date }) {
  const [stage, setStage] = useState(initial);
  const steps = ['Your details', 'ID', 'Photo', 'Notice', 'Pass'];
  const idx = { details: 0, id: 1, photo: 2, notice: 3, pass: 4, expired: 4, blocked: 0 }[stage];
  const when = `${formatDate(visit.window.from)}, ${timeOf(visit.window.from)} to ${timeOf(visit.window.to)}`;
  return (
    <TenantPortal
      tenant={tenant}
      portal="Visitor pass"
      accent={accent}
      narrow
      access={{ kind: 'link', endsOn: visit.window.to, today, endsBecause: 'end of your visit window' }}
      footer={{ privacy: 'Visitor privacy notice (G-27)', cookies: true }}
      pinned={
        stage === 'details' ? (
          <Button variant="primary" onClick={() => setStage('id')}>
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
                { label: 'Mobile', value: `+91 ••••• ••${visit.mobile.slice(-3)}` },
                { label: 'Company', value: visit.company },
                { label: 'Where', value: `${visit.location}, ${visit.address}` },
                { label: 'Allowed hours', value: visit.rules.hours },
              ]}
            />
            <FormField label="Vehicle number" optional helper="For parking inside the gate.">
              <TextField placeholder="TN 70 AB 1234" />
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
      {stage === 'notice' && (
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
