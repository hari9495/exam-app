// T9 candidate-facing pages: careers site (T9-09), campus registration (T9-11), identity verification (T9-15),
// automation notice (T9-18), alternative process and deletion (T9-19), chat apply (T9-20) and referee questionnaire (T9-21).
import { useState } from 'react';
import { Download, MessageCircle, Send } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, DescriptionList } from '../../components/shell';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { MaskedField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { FileUpload } from '../../components/upload';
import { CareersPage, JobApplyForm, type CareersConfig, type CareersJob } from '../../components/careers';
import { ApprovalTimeline } from '../../components/timeline';
import { formatDate, formatINR } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import { daysUntil } from './portals-logic';
import { BlockNote, CameraFrame, ConsentPanel, Fact, FactRow, OtpInput, QrCode, StepDots, TenantPortal, type CameraState } from './portals-kit';

const fakeUpload = () => Promise.resolve();
const CAND_FOOTER = { privacy: 'Candidate privacy notice (G-07)', terms: 'Candidate terms (G-29)', cookies: true };

/* ================================================================== */
/* T9-09 Careers site                                                  */
/* ================================================================== */

// T9-09
/** Careers home: the tenant-branded CareersPage (the one T9 page search engines may index). */
export function CareersSiteScreen({ config, jobs }: { config: CareersConfig; jobs: CareersJob[] }) {
  return <CareersPage config={config} jobs={jobs} />;
}

export interface CareersJobDetail {
  job: CareersJob;
  slug: string;
  pay: { min: number; max: number; period: string };
  experience: string;
  about: string;
  requirements: string[];
  closesOn: Date;
}

/** Job page at an ASCII slug: pay range, requirements, apply form or WhatsApp apply; closed jobs expire within a day (YX-ATS-02 / 34 / 45). */
export function CareersJobScreen({ tenant, accent, detail, today, state = 'open' }: { tenant: string; accent?: string; detail: CareersJobDetail; today: Date; state?: 'open' | 'closed' | 'sent' }) {
  const { job } = detail;
  return (
    <TenantPortal tenant={tenant} portal="Careers" accent={accent} access={{ kind: 'public' }} footer={CAND_FOOTER} nav={[{ label: 'All jobs' }, { label: job.title, active: true }]}>
      <p className="yx-ps-muted yx-ps-mono">{`${tenant.toLowerCase().replace(/\s+/g, '')}.yukthix.in/${detail.slug}`}</p>
      {state === 'closed' ? (
        <EmptyState title="This job has closed." description={`${job.title} stopped taking applications on ${formatDate(detail.closesOn)}.`} action={<Button variant="primary">See open jobs</Button>} />
      ) : (
        <div className="yx-split">
          <div className="yx-split__main">
            <section className="yx-ps-hero">
              <h1>{job.title}</h1>
              <p>
                {job.department} · {job.location} · {job.type} · {detail.experience}
              </p>
            </section>
            <FactRow label="Job facts">
              <Fact label={`Pay range (${detail.pay.period})`} value={`${formatINR(detail.pay.min)} – ${formatINR(detail.pay.max)}`} />
              <Fact label="Apply by" value={formatDate(detail.closesOn)} />
            </FactRow>
            <Card title="The job">
              <p className="yx-ps-p">{detail.about}</p>
            </Card>
            <Card title="You'll need">
              <ul className="yx-ps-list">
                {detail.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Card>
            <p className="yx-ps-muted">We never ask about your current or past salary. Applicants under 18 need a parent's consent; we check date of birth before any test.</p>
          </div>
          <div className="yx-split__aside">
            <JobApplyForm job={job} companyName={tenant} upload={fakeUpload} onSubmit={() => undefined} defaultSent={state === 'sent'} />
            <Button icon={MessageCircle} fullWidth>
              Apply on WhatsApp
            </Button>
            <p className="yx-ps-muted">Posted {daysUntil(job.postedOn, today) === 0 ? 'today' : `${-daysUntil(job.postedOn, today)} days ago`}.</p>
          </div>
        </div>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-11 Campus registration + coordinator view                        */
/* ================================================================== */

export interface Drive {
  name: string;
  opens: Date;
  closes: Date;
  cap: number;
  registered: number;
  eligibility: { branches: string[]; years: number[]; minPercent: number };
  testDate: Date;
}

export type CampusStage = 'form' | 'otp' | 'registered' | 'ineligible' | 'closed' | 'cap-reached' | 'admit-card' | 'matched';

// T9-11
/** Public registration with OTP and consent; eligibility and cap checked at submit; admit card with a single-attempt QR (T03 §11 B7). */
export function CampusRegistrationScreen({ tenant, accent, drive, stage: initial, today }: { tenant: string; accent?: string; drive: Drive; stage: CampusStage; today: Date }) {
  const [stage, setStage] = useState(initial);
  const [otp, setOtp] = useState('');
  const [branch, setBranch] = useState<string | null>('Chemical');
  const [pct, setPct] = useState<number | null>(72);
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const eligible = !!branch && drive.eligibility.branches.includes(branch) && (pct ?? 0) >= drive.eligibility.minPercent;
  return (
    <TenantPortal
      tenant={tenant}
      portal="Campus registration"
      accent={accent}
      narrow
      access={{ kind: 'public' }}
      footer={CAND_FOOTER}
      pinned={
        stage === 'form' ? (
          <Button variant="primary" onClick={() => (consent ? setStage('otp') : setTried(true))}>
            Verify and register
          </Button>
        ) : undefined
      }
    >
      <section className="yx-ps-hero">
        <h1>{drive.name}</h1>
        <p>
          Registration {formatDate(drive.opens)} to {formatDate(drive.closes)} · online test on {formatDate(drive.testDate)}, {timeOf(drive.testDate)}
        </p>
      </section>
      {stage === 'closed' && <InlineAlert tone="info" title="Registration has closed">It closed on {formatDate(drive.closes)}. Ask your placement cell about future drives.</InlineAlert>}
      {stage === 'cap-reached' && (
        <InlineAlert tone="warning" title="This drive is full">
          All {drive.cap} places are taken. Your placement cell will share the next drive.
        </InlineAlert>
      )}
      {stage === 'form' && (
        <>
          <Meter label="Places taken" value={drive.registered} max={drive.cap} valueText={`${drive.registered} of ${drive.cap} places taken`} warnAt={90} />
          <FieldRow>
            <FormField label="Full name" required>
              <TextField defaultValue="Aishwarya Senthil" />
            </FormField>
            <FormField label="Mobile" required helper="We send a code to verify it.">
              <MaskedField kind="phone" value="9790012345" onChange={() => undefined} />
            </FormField>
          </FieldRow>
          <FormField label="Email" required>
            <TextField type="email" defaultValue="aishwarya.s@example.in" />
          </FormField>
          <FieldRow>
            <FormField label="College" required>
              <Select value="srce" onChange={() => undefined} options={[{ value: 'srce', label: 'Sri Ranganatha College of Engineering' }]} />
            </FormField>
            <FormField label="Roll number" required>
              <TextField defaultValue="21CH014" />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="Branch" required>
              <Select value={branch} onChange={setBranch} options={['Chemical', 'Food Technology', 'Mechanical', 'Civil', 'Computer Science'].map((x) => ({ value: x, label: x }))} />
            </FormField>
            <FormField label="Aggregate %" required>
              <NumberField value={pct} onChange={setPct} decimals min={0} max={100} />
            </FormField>
          </FieldRow>
          {!eligible && (
            <BlockNote>
              This drive is open to {drive.eligibility.branches.join(', ')} students with {drive.eligibility.minPercent}% or more. You can still register; we'll tell you if you are not eligible.
            </BlockNote>
          )}
          <FormField label="Photo" required>
            <FileUpload upload={fakeUpload} accept={['.jpg', '.png']} multiple={false} />
          </FormField>
          <Checkbox
            checked={consent}
            onChange={setConsent}
            label={
              <>
                I agree that {tenant} may use these details for this drive, as the <a href="#">candidate privacy notice</a> explains
              </>
            }
            description={tried && !consent ? 'Give consent to register.' : undefined}
          />
        </>
      )}
      {stage === 'otp' && (
        <Card title="Verify your mobile">
          <div className="yx-ps-stack">
            <p className="yx-ps-muted">Your registration counts only after this code. We sent it to +91 ••••• ••345.</p>
            <OtpInput value={otp} onChange={setOtp} />
            <Button variant="primary" disabled={otp.length < 6} onClick={() => setStage(eligible ? 'registered' : 'ineligible')}>
              Complete registration
            </Button>
          </div>
        </Card>
      )}
      {stage === 'registered' && (
        <InlineAlert tone="success" title="You're registered and eligible">
          Your admit card will be ready by {formatDate(new Date(2026, 9, 8))}. We'll send the link to your mobile and email.
        </InlineAlert>
      )}
      {stage === 'matched' && (
        <InlineAlert tone="info" title="We found your earlier application">
          You applied to Kaveri Foods before, so we added this registration to your existing profile instead of making a new one.
        </InlineAlert>
      )}
      {stage === 'ineligible' && (
        <InlineAlert tone="warning" title="You're registered, but not eligible for this drive">
          This drive needs {drive.eligibility.minPercent}% or more in {drive.eligibility.branches.join(', ')}. Your details stay with us for future drives only if you agree.
        </InlineAlert>
      )}
      {stage === 'admit-card' && (
        <Card title="Admit card">
          <div className="yx-ps-pass">
            <QrCode value="ADMIT-KF26-21CH014" size={150} label="Admit card QR code, single use" />
            <DescriptionList
              items={[
                { label: 'Name', value: 'Aishwarya Senthil' },
                { label: 'Roll number', value: '21CH014', mono: true },
                { label: 'Test', value: `${formatDate(drive.testDate)}, ${timeOf(drive.testDate)} · online, proctored` },
                { label: 'Admit number', value: 'KF26-GET-00412', mono: true },
              ]}
            />
          </div>
          <p className="yx-ps-muted">This QR works for one attempt. If we reissue your card, the old one stops working.</p>
          <Button icon={Download}>Download admit card</Button>
        </Card>
      )}
      {daysUntil(drive.closes, today) >= 0 && stage !== 'closed' && <p className="yx-ps-muted">Registration closes in {daysUntil(drive.closes, today)} days.</p>}
    </TenantPortal>
  );
}

/** College coordinator: own institution only; results at the level the company set (none / aggregate / per candidate). */
export function CollegeCoordinatorScreen({
  tenant,
  accent,
  college,
  registrants,
  results,
  visibility,
  today,
}: {
  tenant: string;
  accent?: string;
  college: { name: string; coordinator: string; email: string };
  registrants: { name: string; roll: string; branch: string; year: number; status: string; admit: string }[];
  results: { registered: number; eligible: number; attended: number; passed: number; shortlisted: number };
  visibility: 'none' | 'aggregate' | 'per-candidate';
  today: Date;
}) {
  return (
    <TenantPortal
      tenant={tenant}
      portal="Campus drive · college coordinator"
      accent={accent}
      access={{ kind: 'otp', identity: college.email, endsOn: new Date(2026, 11, 31), today, endsBecause: 'end of the drive' }}
      footer={{ privacy: 'Privacy notice for college coordinators (G-07)' }}
    >
      <section className="yx-ps-hero">
        <h1>{college.name}</h1>
        <p>You see only your college's registrants for drives shared with you. Answers, proctoring evidence and accommodations are never shown.</p>
      </section>
      <div className="yx-ps-row">
        <Button>Copy registration link</Button>
        <Button icon={Download}>Download admit-card status</Button>
      </div>
      <FactRow label="Your college">
        <Fact label="Registered" value={results.registered} />
        <Fact label="Eligible" value={results.eligible} />
        {visibility !== 'none' && (
          <>
            <Fact label="Attended" value={results.attended} />
            <Fact label="Passed" value={`${results.passed} · ${Math.round((results.passed / results.attended) * 100)}%`} />
            <Fact label="Shortlisted" value={results.shortlisted} />
          </>
        )}
      </FactRow>
      {visibility === 'none' && <InlineAlert tone="info" title="Results aren't shared with colleges for this drive">{tenant} contacts shortlisted students directly.</InlineAlert>}
      {visibility === 'aggregate' ? (
        <InlineAlert tone="info" title="Only totals are shared for this drive">
          {tenant} shares counts and pass rates, not individual results.
        </InlineAlert>
      ) : (
        <Card title="Registrants">
          <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Registrants, scrolls sideways on small screens">
          <table className="yx-ps-slabgrid">
            <caption className="yx-visually-hidden">Registrants</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Roll</th>
                <th scope="col">Branch</th>
                <th scope="col">Year</th>
                <th scope="col">Registration</th>
                <th scope="col">Admit card</th>
                {visibility === 'per-candidate' && <th scope="col">Result</th>}
              </tr>
            </thead>
            <tbody>
              {registrants.map((r, i) => (
                <tr key={r.roll}>
                  <th scope="row">{r.name}</th>
                  <td className="yx-ps-mono">{r.roll}</td>
                  <td>{r.branch}</td>
                  <td>{r.year}</td>
                  <td>
                    <Badge tone={r.status === 'eligible' || r.status === 'invited' ? 'success' : r.status === 'rejected' ? 'neutral' : 'info'}>
                      {r.status === 'rejected' ? 'Not eligible' : r.status[0].toUpperCase() + r.status.slice(1)}
                    </Badge>
                  </td>
                  <td>{r.admit}</td>
                  {visibility === 'per-candidate' && <td>{i < 2 ? <Badge tone="success">Passed</Badge> : r.status === 'rejected' ? '—' : <Badge>Not passed</Badge>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-15 Identity verification / re-verification                       */
/* ================================================================== */

export type IdvStage = 'consent' | 'id' | 'selfie' | 'checking' | 'verified' | 'mismatch' | 're-verify' | 'fallback' | 'under-18';

// T9-15
/** Consent → ID → selfie; a mismatch is flagged for a person, never auto-rejected; declining falls back to ID + attestation (YX-ATS-32, YX-PROC-19). */
export function IdentityVerificationScreen({ tenant, accent, stage: initial, camera = 'live', today }: { tenant: string; accent?: string; stage: IdvStage; camera?: CameraState; today: Date }) {
  const [stage, setStage] = useState(initial);
  const steps = ['Consent', 'ID document', 'Selfie', 'Result'];
  const idx = { consent: 0, id: 1, selfie: 2, checking: 3, verified: 3, mismatch: 3, 're-verify': 1, fallback: 1, 'under-18': 1 }[stage];
  return (
    <TenantPortal
      tenant={tenant}
      portal={stage === 're-verify' ? 'Confirm your identity again' : 'Verify your identity'}
      accent={accent}
      narrow
      access={{ kind: 'link', endsOn: new Date(2026, 9, 6), today, endsBecause: 'this link is valid for 7 days' }}
      footer={CAND_FOOTER}
    >
      <StepDots steps={steps} current={idx} />
      {stage === 'consent' && (
        <ConsentPanel
          title="Using your face to confirm it's you"
          summary={
            <>
              <p>
                For your application to Production Supervisor, {tenant} checks your ID and takes a selfie. The selfie is turned into a face template and compared at your
                test, interviews and first day, so no one else can take your place.
              </p>
              <p>We keep the template for 30 days after the last check, then delete it. You can withdraw consent at any time; the template is deleted straight away.</p>
            </>
          }
          purposes={[{ id: 'bio', label: 'I agree to face matching for this application', required: true, description: 'This is biometric data. You can say no and use an ID check with a person instead.' }]}
          noticeLabel="identity verification notice"
          noticeVersion="IDV-2026.2"
          acceptLabel="Agree and continue"
          declineLabel="Use an ID check instead"
          onAccept={() => setStage('id')}
          onDecline={() => setStage('fallback')}
          declinedText="No problem. Declining does not count against you. Upload your ID and a recruiter will confirm it with you on a video call."
        />
      )}
      {(stage === 'id' || stage === 're-verify' || stage === 'fallback' || stage === 'under-18') && (
        <Card
          title={stage === 're-verify' ? 'Upload a fresh ID photo' : 'Photo of your ID'}
          footer={
            <Button variant="primary" onClick={() => setStage(stage === 'fallback' || stage === 'under-18' ? 'checking' : 'selfie')}>
              Continue
            </Button>
          }
        >
          <div className="yx-ps-stack">
            {stage === 're-verify' && (
              <InlineAlert tone="warning" title="Your selfie at the test didn't match your earlier photo">
                This happens with poor light or a new look. Nothing has been decided; your application is paused until you re-verify or a person reviews it. You can also appeal.
              </InlineAlert>
            )}
            {stage === 'fallback' && <InlineAlert tone="info" title="ID check with a person">A recruiter will compare your ID on a short video call and record that they checked it.</InlineAlert>}
            {stage === 'under-18' && <InlineAlert tone="info" title="You're under 18">We check only your ID; no face matching is used.</InlineAlert>}
            <FormField label="ID type" required>
              <Select value="Aadhaar" onChange={() => undefined} options={['Aadhaar', 'PAN card', 'Passport', 'Driving licence', 'Voter ID'].map((x) => ({ value: x, label: x }))} />
            </FormField>
            <CameraFrame state={stage === 're-verify' ? 'live' : 'captured'} subject="id-card" label="ID photo" />
            <Button>Upload a file instead</Button>
          </div>
        </Card>
      )}
      {stage === 'selfie' && (
        <Card
          title="Take a selfie"
          footer={
            <>
              <Button>Retake</Button>
              <Button variant="primary" disabled={camera === 'blocked'} onClick={() => setStage('checking')}>
                Use this selfie
              </Button>
            </>
          }
        >
          <CameraFrame state={camera} label="Selfie" />
        </Card>
      )}
      {stage === 'checking' && (
        <InlineAlert tone="info" title="Checking your ID and selfie">
          This usually takes under a minute. You can close this page; we'll email you.
        </InlineAlert>
      )}
      {stage === 'verified' && (
        <InlineAlert tone="success" title="You're verified">
          Your identity is confirmed for this application. Checks at your test and interviews compare with this photo.
        </InlineAlert>
      )}
      {stage === 'mismatch' && (
        <Card title="We couldn't confirm the match">
          <div className="yx-ps-stack">
            <CameraFrame state="mismatch" label="Selfie" />
            <p className="yx-ps-p">A person at {tenant} will review this; nothing is decided automatically. Choose what you'd like to do.</p>
            <RadioGroup
              defaultValue="retry"
              options={[
                { value: 'retry', label: 'Try again with a fresh ID photo and selfie' },
                { value: 'video', label: 'Ask for a video check with a recruiter' },
                { value: 'explain', label: 'Explain (for example, a recent change in appearance)' },
              ]}
            />
            <div className="yx-ps-row">
              <Link href="#">Appeal this flag</Link>
            </div>
            <Button variant="primary">Continue</Button>
          </div>
        </Card>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-18 Automation notice + consent                                   */
/* ================================================================== */

// T9-18
/** Plain notice of what is automated and why, before any automated step; consent stored with notice version and time (YX-ATS-35). */
export function AutomationNoticeScreen({
  tenant,
  accent,
  info,
  state = 'notice',
  today,
}: {
  tenant: string;
  accent?: string;
  info: { job: string; steps: { what: string; how: string; effect: string }[]; noticeVersion: string };
  state?: 'notice' | 'consented' | 'declined';
  today: Date;
}) {
  return (
    <TenantPortal tenant={tenant} portal="How we review your application" accent={accent} narrow access={{ kind: 'link', endsOn: new Date(2026, 10, 30), today }} footer={CAND_FOOTER}>
      <section className="yx-ps-hero">
        <h1>Automated steps in your application for {info.job}</h1>
        <p>We use software to help with some steps. A person makes every decision. Here is exactly what is automated and why.</p>
      </section>
      {info.steps.map((s) => (
        <Card key={s.what} title={s.what} actions={<Badge tone="ai">AI</Badge>}>
          <DescriptionList
            items={[
              { label: 'What happens', value: s.how },
              { label: 'What it means for you', value: s.effect },
            ]}
          />
        </Card>
      ))}
      {state !== 'consented' && (
      <ConsentPanel
        title="Your choice"
        summary={<p>You can agree to these automated steps, or ask for a review by a person only. Asking for the alternative never counts against you.</p>}
        purposes={[{ id: 'auto', label: 'I agree to the automated steps above', required: true }]}
        noticeLabel="automated decision notice"
        noticeVersion={info.noticeVersion}
        acceptLabel="Agree and continue"
        declineLabel="Ask for a person-only review"
        defaultDeclined={state === 'declined'}
        declinedText={
          <>
            Your request went to the recruiter. They will review your application without the automated steps. <Link href="#">Track your request</Link>.
          </>
        }
      />
      )}
      {state === 'consented' && (
        <InlineAlert tone="success" title="Consent recorded on 29 Sep 2026, 9:42 am">
          Recorded against notice {info.noticeVersion}. You can withdraw it from this page.
        </InlineAlert>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-19 Alternative process and deletion request                      */
/* ================================================================== */

export type RequestState = 'form' | 'received' | 'completed' | 'hold';

// T9-19
/** Candidate asks for a person-only process or deletion; deletion within 30 days unless a legal hold applies (reason shown). */
export function CandidateRequestScreen({ tenant, accent, state, today }: { tenant: string; accent?: string; state: RequestState; today: Date }) {
  const [kind, setKind] = useState<string | undefined>('delete');
  const [confirm, setConfirm] = useState(false);
  const due = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
  return (
    <TenantPortal tenant={tenant} portal="Your data and choices" accent={accent} narrow access={{ kind: 'link', endsOn: due, today }} footer={CAND_FOOTER}>
      {state === 'form' && (
        <Card title="What would you like to do?" footer={<Button variant={kind === 'delete' ? 'danger' : 'primary'} disabled={kind === 'delete' && !confirm}>{kind === 'delete' ? 'Request deletion' : 'Send request'}</Button>}>
          <div className="yx-ps-stack">
            <RadioGroup
              value={kind}
              onChange={setKind}
              options={[
                { value: 'alt', label: 'Review my application without automated steps', description: 'A recruiter reviews you by hand, at no disadvantage.' },
                { value: 'delete', label: 'Delete my data', description: 'Your applications, résumé and test results are deleted within 30 days.' },
              ]}
            />
            {kind === 'delete' && <Checkbox checked={confirm} onChange={setConfirm} label="I understand my applications with Kaveri Foods will end and can't be restored" />}
            <FormField label="Anything you'd like us to know" optional>
              <TextArea rows={3} />
            </FormField>
          </div>
        </Card>
      )}
      {state === 'received' && (
        <Card title="Request received">
          <ApprovalTimeline
            aria-label="Deletion request"
            steps={[
              { id: '1', label: 'Requested', status: 'done', at: today },
              { id: '2', label: 'Checking for legal holds', status: 'current' },
              { id: '3', label: `Deleted by ${formatDate(due)}`, status: 'pending' },
            ]}
          />
          <p className="yx-ps-muted">We emailed you a receipt with this complete-by date. We keep your email only to confirm when it's done.</p>
        </Card>
      )}
      {state === 'completed' && (
        <InlineAlert tone="success" title="Your data was deleted on 12 Oct 2026">
          All applications, files and results with {tenant} are gone. This link will stop working soon.
        </InlineAlert>
      )}
      {state === 'hold' && (
        <InlineAlert tone="warning" title="We can't delete everything yet">
          A legal hold applies: your application is part of an open complaint to the labour department. We'll delete it when the hold ends and email you then. Everything else was
          deleted on 12 Oct 2026.
        </InlineAlert>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-20 WhatsApp / careers chatbot apply                              */
/* ================================================================== */

export type ChatStage = 'consent' | 'questions' | 'knockout' | 'done' | 'opted-out';

interface Bubble {
  from: 'me' | 'bot';
  text: string;
  choices?: string[];
}

const CHAT_SCRIPT: Record<ChatStage, Bubble[]> = {
  consent: [{ from: 'bot', text: 'Hi, this is Kaveri Foods careers. May we message you on WhatsApp about your application? You can reply STOP at any time.', choices: ['Yes, message me', 'No thanks'] }],
  questions: [
    { from: 'bot', text: 'Hi, this is Kaveri Foods careers. May we message you on WhatsApp about your application? You can reply STOP at any time.' },
    { from: 'me', text: 'Yes, message me' },
    { from: 'bot', text: 'Thanks. You are applying for Production Supervisor, Hosur plant. What is your full name?' },
    { from: 'me', text: 'Karthikeyan Murugan' },
    { from: 'bot', text: 'Can you work rotating shifts, including nights?', choices: ['Yes', 'No'] },
  ],
  knockout: [
    { from: 'bot', text: 'Can you work rotating shifts, including nights?' },
    { from: 'me', text: 'No' },
    { from: 'bot', text: 'Thanks for being clear. This job needs night shifts, so a recruiter will look at your application and decide; it is not rejected automatically. You can also ask for a review by a person only.', choices: ['Continue', 'Ask for a person-only review'] },
  ],
  done: [
    { from: 'bot', text: 'Please send your résumé as a PDF.' },
    { from: 'me', text: 'Karthikeyan_resume.pdf' },
    { from: 'bot', text: 'Done. Your application for Production Supervisor is in. It is the same application as on our careers site, so you do not need to apply twice.' },
  ],
  'opted-out': [
    { from: 'me', text: 'STOP' },
    { from: 'bot', text: 'You will not get more WhatsApp messages from Kaveri Foods. Your application stays open; we will email you instead.' },
  ],
};

// T9-20
/** Chat apply: channel consent first, knockout questions as a recommendation only, instant opt-out (YX-ATS-36). */
export function ChatApplyScreen({ tenant, accent, stage, channel = 'whatsapp', today }: { tenant: string; accent?: string; stage: ChatStage; channel?: 'whatsapp' | 'web'; today: Date }) {
  const [msg, setMsg] = useState('');
  const bubbles = CHAT_SCRIPT[stage];
  return (
    <TenantPortal tenant={tenant} portal={channel === 'whatsapp' ? 'Apply on WhatsApp' : 'Apply by chat'} accent={accent} narrow access={{ kind: 'link', endsOn: new Date(2026, 9, 18), today }} footer={CAND_FOOTER}>
      <p className="yx-ps-muted">{channel === 'whatsapp' ? 'Preview of the WhatsApp conversation.' : 'Chat on the careers site. Your answers go to the same application as the web form.'}</p>
      <div className="yx-ps-chatlog" aria-live="polite" aria-label="Conversation">
        {bubbles.map((b, i) => (
          <div key={i} className="yx-ps-bubble" data-from={b.from}>
            <span className="yx-ps-bubble__meta">{b.from === 'me' ? 'You' : `${tenant} careers`}</span>
            <span>{b.text}</span>
            {b.choices && i === bubbles.length - 1 && (
              <span className="yx-ps-bubble__choices">
                {b.choices.map((c) => (
                  <Button key={c} size="sm">
                    {c}
                  </Button>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
      {stage !== 'opted-out' && (
        <div className="yx-ps-row">
          <FormField label="Message" hideLabel>
            <TextField value={msg} onChange={setMsg} placeholder="Type a reply" />
          </FormField>
          <Button icon={Send} disabled={!msg.trim()}>
            Send
          </Button>
        </div>
      )}
      <p className="yx-ps-muted">Reply STOP to stop messages at any time.</p>
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-21 Referee questionnaire                                         */
/* ================================================================== */

// T9-21
/** Secure-link questionnaire for a referee: consent, structured questions, submit; expired is final (YX-ATS-38). */
export function RefereeQuestionnaireScreen({
  tenant,
  accent,
  request,
  state = 'form',
  today,
}: {
  tenant: string;
  accent?: string;
  request: { candidate: string; company: string; referee: string; relationship: string; expiresOn: Date; questions: { id: string; kind: 'rating' | 'choice' | 'text'; text: string; options?: string[] }[] };
  state?: 'form' | 'submitted' | 'expired' | 'declined';
  today: Date;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const missing = request.questions.filter((q) => q.kind !== 'text' && !answers[q.id]);
  const [sent, setSent] = useState(state === 'submitted');
  return (
    <TenantPortal
      tenant={tenant}
      portal="Reference request"
      accent={accent}
      narrow
      access={{ kind: 'link', endsOn: request.expiresOn, today, endsBecause: 'this link expires' }}
      footer={{ privacy: 'Privacy notice for referees (G-07)' }}
      pinned={
        state === 'form' && !sent ? (
          <Button variant="primary" onClick={() => (consent && missing.length === 0 ? setSent(true) : setTried(true))}>
            Send reference
          </Button>
        ) : undefined
      }
    >
      {state === 'expired' ? (
        <InlineAlert tone="info" title="This reference request has expired">
          It closed on {formatDate(request.expiresOn)}. If you still want to give a reference, ask {request.candidate} to have the recruiter send a new request.
        </InlineAlert>
      ) : state === 'declined' ? (
        <InlineAlert tone="info" title="You declined to give a reference">
          We let the recruiter know. Nothing else was recorded.
        </InlineAlert>
      ) : sent ? (
        <InlineAlert tone="success" title="Thank you, your reference was sent">
          Only the recruiter and the hiring panel at {request.company} can read it.
        </InlineAlert>
      ) : (
        <>
          <section className="yx-ps-hero">
            <h1>
              Reference for {request.candidate}, requested by {request.company}
            </h1>
            <p>
              {request.candidate} named you ({request.relationship}) and agreed to this request. It takes about 5 minutes. The link works until {formatDate(request.expiresOn)}.
            </p>
          </section>
          {tried && (missing.length > 0 || !consent) && (
            <InlineAlert tone="danger" title="Answer the required questions">
              {missing.length > 0 ? `${missing.length} questions still need an answer.` : ''} {!consent ? 'Confirm the consent at the end.' : ''}
            </InlineAlert>
          )}
          {request.questions.map((q) => (
            <Card key={q.id} title={q.text}>
              {q.kind === 'rating' && (
                <RadioGroup
                  orientation="horizontal"
                  value={answers[q.id]}
                  onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                  options={['1 Poor', '2', '3 Good', '4', '5 Excellent'].map((x, i) => ({ value: String(i + 1), label: x }))}
                />
              )}
              {q.kind === 'choice' && <RadioGroup value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} options={(q.options ?? []).map((o) => ({ value: o, label: o }))} />}
              {q.kind === 'text' && (
                <FormField label="Your answer" hideLabel optional>
                  <TextArea rows={3} value={answers[q.id] ?? ''} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
                </FormField>
              )}
            </Card>
          ))}
          <Checkbox
            checked={consent}
            onChange={setConsent}
            label={`I agree that ${request.company} may store this reference with ${request.candidate}'s application`}
            description="It is kept for the application's retention period and never shared with the candidate word for word."
          />
          <Link href="#">I'd rather not give a reference</Link>
        </>
      )}
    </TenantPortal>
  );
}
