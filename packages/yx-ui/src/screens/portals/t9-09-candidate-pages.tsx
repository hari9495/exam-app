// T9-09 candidate pages outside the app (founder decision 10, 9 Nov 2026): application status, the candidate's own page,
// offer accept and interview booking, in the T9-09 portal style. Each page is reached only by the candidate's own link
// (the token in the email); none shows a recruiter's name, an internal note, a stage name or another applicant.
import { useState, type ReactNode } from 'react';
import { CalendarClock, CheckCircle2, Download } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card } from '../../components/shell';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField, MaskedField } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { ConfirmDialog } from '../../components/overlay';
import { FileUpload } from '../../components/upload';
import { Icon } from '../../components/foundations';
import { useToastIfAny } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { Fact, FactRow, StepDots, TenantPortal } from './portals-kit';

const CAND_FOOTER = { privacy: 'Candidate privacy notice (G-07)', terms: 'Candidate terms (G-29)' };
export type CandidatePageState = 'loading' | 'ready' | 'not-found';

/** Company face on every candidate page: name, accent and the careers site link (null when it has none). */
export interface CandidateBrand {
  tenant: string;
  accent?: string | null;
  careersHref?: string | null;
}

function Frame({ brand, portal, children, narrow }: { brand: CandidateBrand; portal: string; children: ReactNode; narrow?: boolean }) {
  return (
    <TenantPortal
      tenant={brand.tenant || 'Careers'}
      portal={portal}
      accent={brand.accent ?? undefined}
      access={{ kind: 'note', text: 'Your own link · keep it private' }}
      footer={CAND_FOOTER}
      noLanguage
      narrow={narrow}
      nav={brand.careersHref ? [{ label: 'Open jobs', href: brand.careersHref }] : undefined}
    >
      {children}
    </TenantPortal>
  );
}

function Loading() {
  return (
    <div className="yx-ps-stack" aria-busy="true" aria-label="Loading">
      <Skeleton height={32} width="60%" />
      <Skeleton height={96} />
      <Skeleton height={96} />
    </div>
  );
}

const LINK_GONE = 'This link does not work any more. Use the newest email from the company, or reply to it for a new link.';

/** "3 Nov 2026" and "10:30 am" in a given time zone (the interview's own). */
export function zoned(iso: string, timeZone: string) {
  const d = new Date(iso);
  return {
    day: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(d),
    weekday: new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone }).format(d),
    time: new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone }).format(d),
  };
}

/* ================================================================== */
/* Application status                                                  */
/* ================================================================== */

/** The candidate words the API sends (never a stage name). */
export const STATUS_STEPS = ['Application received', 'Under review', 'Moving forward — the team will be in touch'];
const DECISION = 'A decision has been made; the team will follow up';

export interface ApplicationStatusView {
  jobTitle: string;
  location: string | null;
  appliedAt: Date;
  /** One of STATUS_STEPS, or the decision line. */
  bucket: string;
  /** The candidate's own page (all their applications), when the link is known. */
  portalHref?: string | null;
}

/** Where one application is, in candidate words; reached by the status link in the apply email. */
export function ApplicationStatusScreen({ brand, state, status }: { brand: CandidateBrand; state: CandidatePageState; status: ApplicationStatusView | null }) {
  return (
    <Frame brand={brand} portal="Your application" narrow>
      {state === 'loading' ? (
        <Loading />
      ) : state === 'not-found' || !status ? (
        <EmptyState title="We could not find this application." description={LINK_GONE} />
      ) : (
        <>
          <section className="yx-ps-hero">
            <h1>{status.jobTitle}</h1>
            <p>
              {brand.tenant}
              {status.location ? ` · ${status.location}` : ''}
            </p>
          </section>
          <FactRow label="Your application">
            <Fact label="Applied on" value={formatDate(status.appliedAt)} />
            <Fact label="Where it is" value={status.bucket} tone={status.bucket === DECISION ? 'warning' : status.bucket === STATUS_STEPS[2] ? 'success' : undefined} />
          </FactRow>
          {status.bucket === DECISION ? (
            <InlineAlert tone="info" title="A decision has been made">
              The team will write to you by email. Thank you for applying.
            </InlineAlert>
          ) : (
            <StepDots steps={['Received', 'Under review', 'Moving forward']} current={Math.max(0, STATUS_STEPS.indexOf(status.bucket))} />
          )}
          <p className="yx-ps-muted">We email you when this changes. This page shows only this application; nobody else can see it.</p>
          {status.portalHref && (
            <div>
              <Button asChild>
                <a href={status.portalHref}>See all your applications</a>
              </Button>
            </div>
          )}
        </>
      )}
    </Frame>
  );
}

/* ================================================================== */
/* Candidate portal (the candidate's own page)                         */
/* ================================================================== */

export interface PortalInterview {
  token: string | null;
  status: string;
  location: string | null;
  confirmed: boolean;
  /** The confirmed or first proposed time. */
  startsAt: string | null;
  timeZone: string;
}

export interface PortalOffer {
  token: string | null;
  status: string;
  startDate: Date;
}

export interface PortalApplication {
  jobTitle: string;
  bucket: string;
  appliedAt: Date;
  statusHref: string | null;
  interviews: PortalInterview[];
  offers: PortalOffer[];
}

export interface PortalOpenJob {
  id: string;
  title: string;
  location: string | null;
  /** Full apply form (the company asks for more than the saved details). */
  applyHref: string;
}

export interface CandidatePortalView {
  name: string;
  email: string;
  phone: string | null;
  hasResume: boolean;
  applications: PortalApplication[];
  openJobs: PortalOpenJob[];
  /** One click reuses the saved details and resume; otherwise each job opens the full form. */
  oneClick: boolean;
}

export interface LiveCandidatePortal {
  onSaveDetails: (d: { name: string; phone: string }) => Promise<unknown>;
  onUploadResume: (file: File) => Promise<unknown>;
  onQuickApply: (job: PortalOpenJob) => Promise<unknown>;
  interviewHref: (token: string) => string;
  offerHref: (token: string) => string;
}

const bucketTone = (b: string): BadgeTone => (b === DECISION ? 'neutral' : b === STATUS_STEPS[2] ? 'success' : 'info');
const OFFER_WORDS: Record<string, string> = { accepted: 'Accepted', declined: 'Declined', sent: 'Offer waiting for you', expired: 'Expired', withdrawn: 'Withdrawn' };

/** The candidate's own page: their details, resume, every application with its interviews and offers, other open jobs. */
export function CandidatePortalScreen({ brand, state, portal, live }: { brand: CandidateBrand; state: CandidatePageState; portal: CandidatePortalView | null; live?: LiveCandidatePortal }) {
  return (
    <Frame brand={brand} portal="Your candidate page">
      {state === 'loading' ? <Loading /> : state === 'not-found' || !portal ? <EmptyState title="We could not open your candidate page." description={LINK_GONE} /> : <PortalBody portal={portal} live={live} />}
    </Frame>
  );
}

function PortalBody({ portal, live }: { portal: CandidatePortalView; live?: LiveCandidatePortal }) {
  const toast = useToastIfAny();
  const [name, setName] = useState(portal.name);
  const [phone, setPhone] = useState((portal.phone ?? '').replace(/\D/g, '').slice(-10));
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setNameError('Enter your name');
      document.getElementById('cp-name')?.focus();
      return;
    }
    setNameError(null);
    setSaving(true);
    setSaveError(null);
    try {
      await live?.onSaveDetails({ name: name.trim(), phone });
      toast?.toast({ tone: 'success', title: 'Your details are saved' });
    } catch (e) {
      setSaveError((e as Error).message || 'Your details were not saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const quickApply = async (job: PortalOpenJob) => {
    setApplying(job.id);
    setApplyError(null);
    try {
      await live?.onQuickApply(job);
      toast?.toast({ tone: 'success', title: `You applied for ${job.title}` });
    } catch (e) {
      setApplyError((e as Error).message || `Could not apply for ${job.title}. Try again.`);
    } finally {
      setApplying(null);
    }
  };

  return (
    <>
      <section className="yx-ps-hero">
        <h1>Your applications</h1>
        <p>
          {portal.name} · {portal.email}
        </p>
      </section>
      <div className="yx-split">
        <div className="yx-split__main">
          {portal.applications.length === 0 ? (
            <EmptyState compact title="You have no applications yet." description="Jobs you apply for appear here." />
          ) : (
            portal.applications.map((a, i) => (
              <Card key={i} title={a.jobTitle} actions={<Badge tone={bucketTone(a.bucket)}>{a.bucket}</Badge>}>
                <p className="yx-ps-muted">Applied on {formatDate(a.appliedAt)}</p>
                {a.interviews.map((iv, k) => {
                  const when = iv.startsAt ? zoned(iv.startsAt, iv.timeZone) : null;
                  const waiting = !iv.confirmed && iv.status === 'proposed';
                  return (
                    <div key={`iv-${k}`} className="yx-ps-row">
                      <Icon icon={CalendarClock} />
                      <span>
                        {iv.confirmed ? 'Interview confirmed' : waiting ? 'Interview: choose a time' : iv.status === 'cancelled' ? 'Interview cancelled' : iv.status === 'declined' ? 'Interview declined' : 'Interview: new time asked for'}
                        {when && iv.confirmed ? ` · ${when.weekday} ${when.day}, ${when.time}` : ''}
                        {iv.location ? ` · ${iv.location}` : ''}
                      </span>
                      {iv.token && waiting && (
                        <Button size="sm" asChild>
                          <a href={live ? live.interviewHref(iv.token) : '#'}>Choose a time</a>
                        </Button>
                      )}
                    </div>
                  );
                })}
                {a.offers.map((o, k) => (
                  <div key={`of-${k}`} className="yx-ps-row">
                    <Icon icon={CheckCircle2} />
                    <span>
                      {OFFER_WORDS[o.status] ?? 'Offer'} · starts {formatDate(o.startDate)}
                    </span>
                    {o.token && o.status === 'sent' && (
                      <Button size="sm" variant="primary" asChild>
                        <a href={live ? live.offerHref(o.token) : '#'}>View offer</a>
                      </Button>
                    )}
                  </div>
                ))}
                {a.statusHref && (
                  <div>
                    <Button size="sm" asChild>
                      <a href={a.statusHref}>Where it is</a>
                    </Button>
                  </div>
                )}
              </Card>
            ))
          )}
          {portal.openJobs.length > 0 && (
            <Card title="Other open jobs">
              <p className="yx-ps-muted">{portal.oneClick ? 'Apply in one click: we reuse your details and resume.' : 'Apply with your saved details; the company asks a few more questions.'}</p>
              {applyError && <InlineAlert tone="danger">{applyError}</InlineAlert>}
              {portal.openJobs.map((j) => (
                <div key={j.id} className="yx-ps-row">
                  <span>
                    <strong>{j.title}</strong>
                    {j.location ? ` · ${j.location}` : ''}
                  </span>
                  {portal.oneClick ? (
                    <Button size="sm" loading={applying === j.id} onClick={() => void quickApply(j)} aria-label={`Apply for ${j.title}`}>
                      Apply
                    </Button>
                  ) : (
                    <Button size="sm" asChild>
                      <a href={j.applyHref} aria-label={`Apply for ${j.title}`}>
                        Apply
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </Card>
          )}
        </div>
        <div className="yx-split__aside">
          <Card title="Your details">
            {saveError && <InlineAlert tone="danger">{saveError}</InlineAlert>}
            <FormField id="cp-name" label="Full name" required error={nameError}>
              <TextField value={name} onChange={setName} autoComplete="name" maxLength={200} />
            </FormField>
            <FormField label="Mobile number" optional>
              <MaskedField kind="phone" value={phone} onChange={setPhone} />
            </FormField>
            <FormField label="Email" helper="Your email is how the company knows you. To change it, apply again with the new email.">
              <TextField value={portal.email} onChange={() => undefined} readOnly />
            </FormField>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              Save details
            </Button>
          </Card>
          <Card title="Resume">
            <p className="yx-ps-muted">{portal.hasResume ? 'Your resume is on file. Upload a new one to replace it.' : 'No resume yet. Upload one so the company can read it.'}</p>
            <FormField label={portal.hasResume ? 'Replace your resume' : 'Upload your resume'} helper="PDF file, up to 5 MB">
              <FileUpload
                accept={['.pdf']}
                maxSize={5 * 1024 * 1024}
                multiple={false}
                upload={async (file) => {
                  await live?.onUploadResume(file);
                  toast?.toast({ tone: 'success', title: 'Your resume is uploaded' });
                }}
              />
            </FormField>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/* Offer accept (by link)                                              */
/* ================================================================== */

export interface OfferView {
  jobTitle: string;
  compensation: string;
  startDate: Date;
  expiresAt: Date;
  /** sent, accepted, declined, expired or withdrawn. */
  status: string;
  pdfUrl: string | null;
}

export interface LiveOfferAccept {
  onRespond: (action: 'accept' | 'decline') => Promise<unknown>;
  today: Date;
}

/** The offer the company sent, accepted or declined by its link (accept stays the default; e-sign is a template choice). */
export function OfferAcceptScreen({ brand, state, offer, live }: { brand: CandidateBrand; state: CandidatePageState; offer: OfferView | null; live?: LiveOfferAccept }) {
  const toast = useToastIfAny();
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const today = live?.today ?? new Date();

  const respond = async (action: 'accept' | 'decline') => {
    setBusy(true);
    setError(null);
    try {
      await live?.onRespond(action);
      setDone(action === 'accept' ? 'accepted' : 'declined');
      toast?.toast({ tone: 'success', title: action === 'accept' ? 'Offer accepted' : 'Offer declined' });
    } catch (e) {
      setError((e as Error).message || 'Your answer was not sent. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (state !== 'ready' || !offer)
    return (
      <Frame brand={brand} portal="Your offer" narrow>
        {state === 'loading' ? <Loading /> : <EmptyState title="We could not find this offer." description={LINK_GONE} />}
      </Frame>
    );

  const status = done ?? (offer.status === 'sent' && offer.expiresAt < today ? 'expired' : offer.status);
  return (
    <Frame brand={brand} portal="Your offer" narrow>
      <section className="yx-ps-hero">
        <h1>{offer.jobTitle}</h1>
        <p>Offer from {brand.tenant}</p>
      </section>
      <FactRow label="Offer">
        <Fact label="Pay" value={offer.compensation} />
        <Fact label="Start date" value={formatDate(offer.startDate)} />
        <Fact label="Answer by" value={formatDate(offer.expiresAt)} tone={status === 'expired' ? 'danger' : undefined} />
      </FactRow>
      {offer.pdfUrl && (
        <div>
          <Button icon={Download} asChild>
            <a href={offer.pdfUrl} target="_blank" rel="noopener noreferrer">
              Download the offer letter
            </a>
          </Button>
        </div>
      )}
      {status === 'sent' ? (
        <Card title="Your answer">
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <p className="yx-ps-muted">Accepting tells {brand.tenant} you will join on the start date. They will send the next steps.</p>
          <div className="yx-ps-row">
            <Button variant="approve" loading={busy} onClick={() => void respond('accept')}>
              Accept offer
            </Button>
            <Button onClick={() => setDeclining(true)}>Decline</Button>
          </div>
        </Card>
      ) : (
        <InlineAlert tone={status === 'accepted' ? 'success' : 'info'} title={status === 'accepted' ? 'You accepted this offer' : status === 'declined' ? 'You declined this offer' : status === 'expired' ? 'This offer has expired' : 'This offer is no longer open'}>
          {status === 'accepted' ? `${brand.tenant} will email you the next steps for joining.` : status === 'expired' ? `Write to ${brand.tenant} if you still want to talk about it.` : `Write to ${brand.tenant} if you have questions.`}
        </InlineAlert>
      )}
      {declining && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setDeclining(false)}
          title="Decline this offer?"
          consequence={`${brand.tenant} is told at once. You cannot accept it again from this link.`}
          confirmLabel="Decline offer"
          onConfirm={async () => {
            await respond('decline');
            setDeclining(false);
          }}
        />
      )}
    </Frame>
  );
}

/* ================================================================== */
/* Interview booking                                                   */
/* ================================================================== */

export interface InterviewView {
  jobTitle: string;
  location: string | null;
  timeZone: string;
  /** First names of the panel the candidate will meet. */
  panel: string[];
  status: string;
  confirmedSlotId: string | null;
  /** Times the company proposed (pick one). */
  slots: { id: string; startsAt: string; endsAt: string }[];
  /** Self-booking: every free time in the window (book one). */
  selfBook?: { minutes: number; available: { startsAt: string; endsAt: string }[] } | null;
}

export interface LiveInterviewBooking {
  onConfirm: (slotId: string) => Promise<unknown>;
  onBook: (slot: { startsAt: string; endsAt: string }) => Promise<unknown>;
  onDecline: () => Promise<unknown>;
  onReschedule: (note: string) => Promise<unknown>;
}

/** Interview time: confirm a proposed time, book a free one, ask for another time, or decline. */
export function InterviewBookingScreen({ brand, state, interview, live }: { brand: CandidateBrand; state: CandidatePageState; interview: InterviewView | null; live?: LiveInterviewBooking }) {
  const toast = useToastIfAny();
  const [pick, setPick] = useState<string | null>(interview?.slots.length === 1 ? interview.slots[0].id : null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ what: 'confirmed' | 'declined' | 'asked'; at?: string } | null>(null);

  if (state !== 'ready' || !interview)
    return (
      <Frame brand={brand} portal="Your interview" narrow>
        {state === 'loading' ? <Loading /> : <EmptyState title="We could not find this interview." description={LINK_GONE} />}
      </Frame>
    );

  const tz = interview.timeZone;
  const label = (iso: string, end?: string) => {
    const s = zoned(iso, tz);
    return `${s.weekday} ${s.day}, ${s.time}${end ? ` to ${zoned(end, tz).time}` : ''}`;
  };
  const options = interview.selfBook ? interview.selfBook.available.map((s) => ({ value: s.startsAt, label: label(s.startsAt, s.endsAt) })) : interview.slots.map((s) => ({ value: s.id, label: label(s.startsAt, s.endsAt) }));
  const confirmed = interview.confirmedSlotId ? interview.slots.find((s) => s.id === interview.confirmedSlotId) : null;
  const status = done?.what ?? (confirmed ? 'confirmed' : interview.status === 'proposed' ? 'open' : interview.status);

  const run = async (fn: () => Promise<unknown> | undefined, after: NonNullable<typeof done>, title: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setDone(after);
      toast?.toast({ tone: 'success', title });
      return true;
    } catch (e) {
      setError((e as Error).message || 'Your answer was not sent. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!pick) {
      setPickError('Choose one of the times');
      document.getElementById('iv-times')?.querySelector('button')?.focus();
      return;
    }
    setPickError(null);
    if (interview.selfBook) {
      const slot = interview.selfBook.available.find((s) => s.startsAt === pick)!;
      void run(() => live?.onBook(slot), { what: 'confirmed', at: slot.startsAt }, 'Interview booked');
    } else void run(() => live?.onConfirm(pick), { what: 'confirmed', at: interview.slots.find((s) => s.id === pick)?.startsAt }, 'Interview confirmed');
  };

  return (
    <Frame brand={brand} portal="Your interview" narrow>
      <section className="yx-ps-hero">
        <h1>Interview for {interview.jobTitle}</h1>
        <p>
          {brand.tenant}
          {interview.location ? ` · ${interview.location}` : ''}
          {interview.panel.length ? ` · with ${interview.panel.join(', ')}` : ''}
        </p>
      </section>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {status === 'open' ? (
        <Card title={interview.selfBook ? `Book a time (${interview.selfBook.minutes} minutes)` : 'Choose a time'}>
          {options.length === 0 ? (
            <EmptyState compact title="No free times are left." description="Ask for another time below, and the team will send new ones." />
          ) : (
            <FormField id="iv-times" label={`Times are in ${tz.replace(/_/g, ' ')} time`} error={pickError}>
              <RadioGroup options={options} value={pick ?? undefined} onChange={setPick} aria-label="Interview times" />
            </FormField>
          )}
          <div className="yx-ps-row">
            {options.length > 0 && (
              <Button variant="primary" loading={busy} onClick={confirm}>
                {interview.selfBook ? 'Book this time' : 'Confirm this time'}
              </Button>
            )}
            {!interview.selfBook && <Button onClick={() => setAsking(true)}>None of these work</Button>}
            <Button variant="danger" onClick={() => setDeclining(true)}>
              Decline the interview
            </Button>
          </div>
          {asking && (
            <>
              <FormField id="iv-note" label="Times that suit you" required error={noteError} helper="For example: weekday mornings next week.">
                <TextArea value={note} onChange={setNote} maxLength={1000} rows={3} />
              </FormField>
              <div>
                <Button
                  loading={busy}
                  onClick={() => {
                    if (!note.trim()) {
                      setNoteError('Say which times suit you');
                      document.getElementById('iv-note')?.focus();
                      return;
                    }
                    setNoteError(null);
                    void run(() => live?.onReschedule(note.trim()), { what: 'asked' }, 'Your request is sent');
                  }}
                >
                  Ask for another time
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : (
        <InlineAlert
          tone={status === 'confirmed' ? 'success' : 'info'}
          title={status === 'confirmed' ? 'Your interview is confirmed' : status === 'declined' ? 'You declined this interview' : status === 'asked' || status === 'reschedule_requested' ? 'You asked for another time' : 'This interview is no longer open'}
        >
          {status === 'confirmed'
            ? `${(done?.at ?? confirmed?.startsAt) ? label((done?.at ?? confirmed?.startsAt)!) : ''} (${tz.replace(/_/g, ' ')} time). The invitation is in your email.`
            : status === 'asked' || status === 'reschedule_requested'
              ? 'The team will send new times by email.'
              : `Write to ${brand.tenant} if you have questions.`}
        </InlineAlert>
      )}
      {declining && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setDeclining(false)}
          title="Decline this interview?"
          consequence={`${brand.tenant} is told at once.`}
          confirmLabel="Decline interview"
          onConfirm={async () => {
            await run(() => live?.onDecline(), { what: 'declined' }, 'Interview declined');
            setDeclining(false);
          }}
        />
      )}
    </Frame>
  );
}
