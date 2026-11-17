// Candidate-facing proctoring screens (T9 portal and full-screen runner): portal home, readiness / system check,
// accommodation request, consent, identity verification, test runner, result + appeal, privacy centre, candidate app,
// result reuse (T03–T05, T08). PRC-21 … PRC-28, PRC-31, PRC-32.
import { useState, type ReactNode } from 'react';
import { CalendarClock, Calculator as CalcIcon, Coffee, Download, Eye, Monitor, RotateCcw, Smartphone, Type } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, AiBadge } from '../../components/display';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { Card, DescriptionList } from '../../components/shell';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { FileUpload } from '../../components/upload';
import { ConfirmDialog } from '../../components/overlay';
import { Heading, Icon } from '../../components/foundations';
import { ExamShell, QuestionCard, formatClock, type AutosaveStatus, type ExamQuestionState } from '../../components/exam';
import { PageBanner } from '../../components/notify';
import { PhoneFrame } from '../_kit/frames';
import { COMPANY } from '../_kit/data';
import { CandidateFrame, type CandidateBrand } from './proctoring-shared';
import { LivePortalHomeScreen, LiveResultReuseScreen, type LivePortal, type LiveReuse } from './delivery-live';
import { Calculator, CameraFrame, CodeAnswer, ConnectionStatus, EvidenceFrame, IdCapture, OptionLabel, QrPlaceholder, QuestionMedia, SystemCheckList, type ConnState, type QuestionImage, type SystemCheck } from './proctoring-kit';
import { canReschedule, withExtraTime } from './proctoring-logic';
import { READINESS_CHECKS } from './proctoring-data';
import { LiveAccommodationRequestScreen, type LiveAccommodationRequest } from './before-test-live';

const Title = ({ children }: { children: string }) => <Heading level={1}>{children}</Heading>;

/* ================================================================== */
/* PRC-21 · Candidate portal home                                      */
/* ================================================================== */

type PortalHomeProps = { state?: 'tests' | 'empty' | 'booking'; rescheduleCount?: number; reschedule?: boolean };

/** PRC-21; with `live` (AS-3) the candidate's own tests at this company. */
export function CandidatePortalHomeScreen(props: PortalHomeProps | { live: LivePortal }) {
  return 'live' in props ? <LivePortalHomeScreen live={props.live} /> : <SamplePortalHome {...props} />;
}

function SamplePortalHome({ state = 'tests', rescheduleCount = 0, reschedule = false }: PortalHomeProps) {
  // PRC-21
  const [open, setOpen] = useState(reschedule);
  const [slot, setSlot] = useState<string | undefined>('fri-10');
  const rule = canReschedule(rescheduleCount, 72);
  return (
    <CandidateFrame page="My tests">
      <PageBanner tone="info">Your access to this portal ends on 31 Dec 2026.</PageBanner>
      <Title>My tests</Title>
      {state === 'empty' ? (
        <EmptyState title="No tests for you right now." description={`When ${COMPANY.shortName} invites you to a test, it appears here and we email you.`} />
      ) : state === 'booking' ? (
        <Card title="Book a slot · Campus aptitude 2026">
          <div className="yx-prc-stack">
            <p className="yx-prc-p">90 minutes · AI-only proctoring · laptop or phone. Times are in your time zone (India Standard Time).</p>
            <RadioGroup
              aria-label="Available slots"
              value={slot}
              onChange={setSlot}
              options={[
                { value: 'thu-9', label: 'Thu 1 Oct, 9:00 am', description: 'Full', disabled: true },
                { value: 'thu-2', label: 'Thu 1 Oct, 2:00 pm', description: '8 places left' },
                { value: 'fri-10', label: 'Fri 2 Oct, 10:00 am', description: '24 places left' },
                { value: 'sat-10', label: 'Sat 3 Oct, 10:00 am', description: '40 places left' },
              ]}
            />
            <p className="yx-prc-muted yx-prc-small">You can change your slot up to 2 times, until 24 hours before it starts.</p>
            <Button variant="primary">Book this slot</Button>
          </div>
        </Card>
      ) : (
        <div className="yx-prc-stack">
          <Card title="Java Backend Developer · L2" actions={<Badge tone="info">Booked</Badge>}>
            <div className="yx-prc-stack">
              <DescriptionList items={[{ label: 'When', value: 'Thu 1 Oct 2026, 2:00 pm IST (your time)' }, { label: 'Length', value: '75 minutes, plus 25 % extra time approved = 94 minutes' }, { label: 'Proctoring', value: 'Record & review: camera, screen and audio are recorded' }, { label: 'Device', value: 'Laptop or desktop only, with the YukthiX Secure Client' }]} />
              <div className="yx-prc-row">
                <Button variant="primary">Run the readiness check</Button>
                <Button>Try the practice test</Button>
                <Button icon={CalendarClock} onClick={() => setOpen(true)}>
                  Change slot
                </Button>
                <Button>Ask for an accommodation</Button>
              </div>
            </div>
          </Card>
          <Card title="Campus aptitude 2026" actions={<Badge tone="warning">Result under review</Badge>}>
            <p className="yx-prc-p">Submitted on 28 Sep. We are checking a few moments of your session. You will hear from us by 1 Oct.</p>
          </Card>
          <Card title="Customer care basics" actions={<Badge tone="danger">Missed</Badge>}>
            <p className="yx-prc-p">Your slot on 10 Aug passed without a start. Contact the recruiter if you still want to take it.</p>
          </Card>
        </div>
      )}
      {/* confirmDisabled kept: the reschedule rule is set elsewhere; nothing in this dialog can change it (the reason is shown). */}
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Change your slot?" consequence={rule.ok ? `You have ${2 - rescheduleCount} changes left.` : rule.reason} confirmLabel="Choose a new slot" confirmDisabled={!rule.ok} onConfirm={() => setOpen(false)} />
    </CandidateFrame>
  );
}

/* ================================================================== */
/* PRC-22 · Readiness check (system check) + practice                  */
/* ================================================================== */

export type ReadinessState = 'running' | 'issues' | 'passed' | 'client';

/** AS-4b (PRC-22): the candidate's own computer, checked in the browser before the test (and again at the start). */
export interface LiveReadiness {
  testTitle: string;
  /** The inviting company, shown in the frame (never the sample name). */
  companyName: string;
  checks: SystemCheck[];
  running: boolean;
  onRunAgain: () => void;
  onBack: () => void;
}

/** PRC-22; with `live` (AS-4b) the checks run on the candidate's own computer. */
export function ReadinessCheckScreen(props: { state?: ReadinessState } | { live: LiveReadiness }) {
  return 'live' in props ? <LiveReadinessScreen live={props.live} /> : <SampleReadiness {...props} />;
}

function LiveReadinessScreen({ live }: { live: LiveReadiness }) {
  const blocking = live.checks.filter((c) => c.blocking && c.status === 'fail').length;
  const passed = live.checks.filter((c) => c.status === 'pass').length;
  return (
    <CandidateFrame page="My tests" company={live.companyName}>
      <Title>Check your computer</Title>
      <p className="yx-prc-muted">{live.testTitle}. Run this any time before your test; we check again at the start.</p>
      <div className="yx-prc-split">
        <SystemCheckList checks={live.checks} onRetry={live.running ? undefined : () => live.onRunAgain()} />
        <aside className="yx-prc-stack">
          <Meter value={passed} max={live.checks.length} label="Checks passed" />
          <div className="yx-prc-row">
            <Button onClick={live.onBack}>Back to my test</Button>
            <Button variant="primary" loading={live.running} onClick={live.onRunAgain}>
              Run the check again
            </Button>
          </div>
        </aside>
      </div>
      {!live.running && blocking > 0 && (
        <InlineAlert tone="danger" title={`${blocking} ${blocking === 1 ? 'problem blocks' : 'problems block'} the start`}>
          Fix the items marked "Blocks the start". Warnings will not stop you, but the reviewer will see them.
        </InlineAlert>
      )}
      {!live.running && blocking === 0 && (
        <InlineAlert tone="success" title="Your computer is ready">
          Nothing here is saved or sent; we check again when you start.
        </InlineAlert>
      )}
    </CandidateFrame>
  );
}

function SampleReadiness({ state = 'issues' }: { state?: ReadinessState }) {
  // PRC-22
  const checks: SystemCheck[] =
    state === 'running'
      ? READINESS_CHECKS.map((c, i) => ({ ...c, status: i < 2 ? 'pass' : i === 2 ? 'running' : 'pending', detail: i < 2 ? c.detail : i === 2 ? 'Checking…' : 'Waiting', fix: undefined }))
      : state === 'passed' || state === 'client'
        ? READINESS_CHECKS.map((c) => ({ ...c, status: 'pass', detail: c.id === 'browser' ? 'YukthiX Secure Client 3.4 found and signature verified.' : c.id === 'screen' ? 'Entire screen shared.' : c.id === 'apps' ? 'No blocked apps running.' : c.id === 'mic' ? 'Microphone is clear.' : c.detail }))
        : READINESS_CHECKS;
  const blocking = checks.filter((c) => c.blocking && c.status === 'fail').length;
  return (
    <CandidateFrame page="My tests">
      <Title>Check your computer</Title>
      <p className="yx-prc-muted">Java Backend Developer · L2 · Thu 1 Oct, 2:00 pm. Run this any time before your test; we run it again at the start.</p>
      {state === 'client' ? (
        <div className="yx-prc-split">
          <Card title="Install the YukthiX Secure Client (Windows)">
            <ol className="yx-prc-list">
              <li>Download the installer (84 MB). It is signed by YukthiX.</li>
              <li>Open it and follow the steps. Windows asks for admin rights the first time only.</li>
              <li>Come back here and select "Open in Secure Client". The client runs only during your test and leaves nothing running afterwards.</li>
            </ol>
            <div className="yx-prc-row">
              <Button variant="primary" icon={Download}>
                Download for Windows
              </Button>
              <Button>Other systems (macOS, Linux, ChromeOS)</Button>
            </div>
          </Card>
          <Card title="Client self-test">
            <ul className="yx-prc-plain">
              <li>
                <span>Signature and version 3.4</span> <Badge tone="success">Passed</Badge>
              </li>
              <li>
                <span>Virtual machine or virtual camera</span> <Badge tone="success">None found</Badge>
              </li>
              <li>
                <span>Apps to close: Zoomline Meetings, CapturePro recorder</span> <Badge tone="warning">Close these</Badge>
              </li>
              <li>
                <span>Screen reader NVDA</span> <Badge tone="info">Allowed: your accommodation</Badge>
              </li>
            </ul>
            <p className="yx-prc-muted yx-prc-small">The client collects only process names, device types, display count and virtual-machine signs. It never reads your files or browsing history.</p>
          </Card>
        </div>
      ) : (
        <>
          <div className="yx-prc-split">
            <SystemCheckList checks={checks} onRetry={() => {}} />
            <aside className="yx-prc-stack">
              <CameraFrame state={state === 'running' ? 'connecting' : 'live'} label="Your camera" size="md" />
              <Meter value={state === 'running' ? 2 : checks.filter((c) => c.status === 'pass').length} max={checks.length} label="Checks passed" />
            </aside>
          </div>
          {state === 'issues' && (
            <InlineAlert tone="danger" title={`${blocking} ${blocking === 1 ? 'problem blocks' : 'problems block'} the start`}>
              Fix the items marked "Blocks the start". Warnings will not stop you, but the reviewer will see them.
            </InlineAlert>
          )}
          {state === 'passed' && (
            <InlineAlert tone="success" title="Your computer is ready" actions={<Button size="sm">Try the practice test</Button>}>
              We saved this result for your test day. The practice test has 5 sample questions and nothing is recorded.
            </InlineAlert>
          )}
        </>
      )}
    </CandidateFrame>
  );
}

/* ================================================================== */
/* PRC-23 · Accommodation request                                      */
/* ================================================================== */

/** PRC-23; with `live` (AS-4b, answer 2011) the candidate's own request and what was approved. */
export function AccommodationRequestScreen(props: { submitted?: boolean; employee?: boolean } | { live: LiveAccommodationRequest }) {
  return 'live' in props ? <LiveAccommodationRequestScreen live={props.live} /> : <SampleAccommodationRequest {...props} />;
}

function SampleAccommodationRequest({ submitted = false, employee = false }: { submitted?: boolean; employee?: boolean }) {
  // PRC-23
  const [types, setTypes] = useState<string[]>(['time']);
  const [pct, setPct] = useState<string | null>('25');
  return (
    <CandidateFrame page="My tests">
      <Title>Ask for an accommodation</Title>
      <p className="yx-prc-muted">Java Backend Developer · L2 · Thu 1 Oct. Ask before your test; approved changes apply by themselves on the day.</p>
      {submitted ? (
        <InlineAlert tone="info" title="Request sent on 29 Sep">
          {employee ? 'HR / L&D will decide' : 'An accommodation reviewer will decide'} before 30 Sep and tell you exactly what was approved. People who mark your answers never see your request or documents.
        </InlineAlert>
      ) : (
        <div className="yx-prc-center">
          <FormField label="What do you need?" required>
            <div className="yx-prc-stack" data-gap="sm">
              {[
                ['time', 'Extra time'],
                ['breaks', 'Extra or longer breaks'],
                ['reader', 'Screen-reader mode'],
                ['font', 'Larger font or high contrast'],
                ['separate', 'A separate session'],
                ['profile', 'Changes to proctoring (for example, no eye-direction checks)'],
              ].map(([v, l]) => (
                <Checkbox key={v} label={l} checked={types.includes(v)} onChange={(c) => setTypes(c ? [...types, v] : types.filter((x) => x !== v))} />
              ))}
            </div>
          </FormField>
          {types.includes('time') && (
            <FormField label="How much extra time?" helper={pct ? `Your 75-minute test would become ${withExtraTime(75, Number(pct))} minutes` : undefined}>
              <Select value={pct} onChange={setPct} options={[{ value: '25', label: '25 %' }, { value: '50', label: '50 %' }, { value: '100', label: '100 %' }]} />
            </FormField>
          )}
          <FormField label="Tell us more" optional>
            <TextArea rows={3} placeholder="Anything that helps the reviewer understand what works for you" />
          </FormField>
          <FormField label="Supporting document" optional helper="PDF or photo, up to 10 MB. Stored as sensitive data and seen only by the reviewer.">
            <FileUpload upload={async () => {}} accept={['.pdf', '.jpg', '.png']} />
          </FormField>
          <div className="yx-prc-row">
            <Button>Cancel</Button>
            <Button variant="primary" disabled={types.length === 0}>
              Send request
            </Button>
          </div>
        </div>
      )}
    </CandidateFrame>
  );
}

/* ================================================================== */
/* PRC-24 · Consent and "what we record"                               */
/* ================================================================== */

/** AS-4a part 2 (answer 2201): the manual identity check a candidate may ask for instead of the photo (AS-4b). */
export interface ManualIdentityCheck {
  state: 'none' | 'asked' | 'approved';
  onAsk: () => Promise<unknown>;
}

/** PRC-24 with a real invitation: what this test records, how long it is kept, and the candidate's choices. */
export interface LiveConsent {
  candidateName: string;
  /** The inviting company, shown in the frame. */
  companyName: string;
  testName: string;
  /** What runs during this test, from its proctoring settings. */
  rows: { what: string; how: string; on: boolean }[];
  /** The company's retention for recordings and face data (AS-2, answer 2008). */
  retentionDays: number;
  /** Face checks run; `faceRequired`: the test cannot start without the photo (or an approved manual check). */
  faceChecks: boolean;
  faceRequired: boolean;
  /** A statement the candidate confirms before starting, e.g. that other apps are closed. */
  attestation?: string;
  /** The candidate said no: show their options. */
  declined: boolean;
  /** Offered when the photo is required: ask for a manual identity check instead. */
  manual?: ManualIdentityCheck | null;
  onAgree: (choices: { faceChecks: boolean }) => void;
  onDecline: () => void;
}

export function ConsentScreen(props: { minor?: boolean; noFace?: boolean; keystroke?: boolean; declined?: boolean; live?: LiveConsent }) {
  if (props.live) return <LiveConsentScreen live={props.live} />;
  return <SampleConsent {...props} />;
}

function ManualCheckOffer({ manual }: { manual: ManualIdentityCheck }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (manual.state === 'approved')
    return (
      <InlineAlert tone="success" title="A manual identity check was approved for you">
        No photo is needed to start.
      </InlineAlert>
    );
  if (manual.state === 'asked')
    return (
      <InlineAlert tone="info" title="You asked for a manual identity check">
        You will hear back before your test. Your invitation is not used up.
      </InlineAlert>
    );
  return (
    <InlineAlert tone="info" title="This test needs a photo check">
      <p>Instead, you can ask for a manual identity check: a person checks your identity before you start. Your invitation is not used up.</p>
      {error && <p>{error}</p>}
      <Button
        loading={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          manual
            .onAsk()
            .catch((e: unknown) => setError(e instanceof Error ? e.message : 'It was not sent. Try again.'))
            .finally(() => setBusy(false));
        }}
      >
        Ask for a manual identity check
      </Button>
    </InlineAlert>
  );
}

function LiveConsentScreen({ live }: { live: LiveConsent }) {
  const [rec, setRec] = useState(false);
  const [bio, setBio] = useState(false);
  const [attest, setAttest] = useState(false);
  const manualApproved = live.manual?.state === 'approved';
  // The photo is required unless a manual check was approved; otherwise saying no to face checks is allowed.
  const bioRequired = live.faceChecks && live.faceRequired && !manualApproved;
  const ok = rec && (!bioRequired || bio) && (!live.attestation || attest);
  return (
    <CandidateFrame page="My tests" user={live.candidateName} company={live.companyName}>
      <Title>What we record and why</Title>
      <p className="yx-prc-muted">{`${live.testName}. Nothing here fails you automatically: a person reviews every flag.`}</p>
      <div className="yx-prc-split">
        <Card title="During this test">
          <ul className="yx-prc-plain">
            {live.rows.map((r) => (
              <li key={r.what}>
                <span className="yx-prc-stack" data-gap="sm">
                  <strong>{r.what}</strong>
                  <span className="yx-prc-small">{r.how}</span>
                </span>
                <Badge tone={r.on ? 'info' : 'neutral'}>{r.on ? 'On' : 'Off'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <aside className="yx-prc-stack">
          <Card title="How long we keep it">
            <DescriptionList
              items={[
                { label: live.faceChecks ? 'Recordings and face data' : 'Recordings', value: `Deleted ${live.retentionDays} days after your result, unless you ask for a review` },
                { label: 'Answers and score', value: 'Kept with your application' },
              ]}
            />
          </Card>
          <Card title="Your choices">
            <div className="yx-prc-stack">
              <Checkbox label="I agree to camera, screen and activity recording for this test" checked={rec} onChange={setRec} required />
              {live.faceChecks && !manualApproved && (
                <Checkbox
                  label="I agree to face checks (biometric data) under India's DPDP Act"
                  description={bioRequired ? undefined : 'Saying no is fine: you can still take the test'}
                  checked={bio}
                  onChange={setBio}
                  required={bioRequired}
                />
              )}
              {live.attestation && <Checkbox label={live.attestation} checked={attest} onChange={setAttest} required />}
            </div>
          </Card>
        </aside>
      </div>
      {live.declined &&
        (live.faceChecks && live.faceRequired && live.manual ? (
          <ManualCheckOffer manual={live.manual} />
        ) : (
          <InlineAlert tone="info" title="You said no">
            This test cannot be taken without the recording. Close this page and contact the person who invited you; your invitation is not used up.
          </InlineAlert>
        ))}
      {!live.declined && manualApproved && <ManualCheckOffer manual={live.manual!} />}
      <div className="yx-prc-row">
        <Button onClick={live.onDecline}>Say no and see my options</Button>
        <Button variant="primary" disabled={!ok} onClick={() => live.onAgree({ faceChecks: live.faceChecks && !manualApproved && bio })}>
          Agree and continue
        </Button>
      </div>
    </CandidateFrame>
  );
}

function SampleConsent({ minor = false, noFace = false, keystroke = true, declined = false }: { minor?: boolean; noFace?: boolean; keystroke?: boolean; declined?: boolean }) {
  // PRC-24
  const [bio, setBio] = useState(false);
  const [rec, setRec] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const ok = rec && (noFace || bio) && (!minor || guardian);
  const rows: [string, string, boolean][] = [
    ['Camera', noFace ? 'Recorded for the reviewer. No face analysis runs.' : 'Recorded at low quality; face checks every few minutes', true],
    ['Screen', 'Your whole screen, at a low frame rate', true],
    ['Microphone', 'Recorded; only moments with a second voice are reviewed. No speech-to-text of your room.', true],
    ['Phone camera', 'Not used for this test', false],
    ['ID document', 'Photo checked against your face; we keep the type, the last 4 characters and the result', true],
    ['Typing rhythm', keystroke && !minor ? 'Optional: compares your typing pattern to spot a different person' : 'Not used', keystroke && !minor],
  ];
  return (
    <CandidateFrame page="My tests">
      <Title>What we record and why</Title>
      <p className="yx-prc-muted">{COMPANY.name} uses YukthiX to run this test fairly. Nothing here fails you automatically: a person reviews every flag, and you can appeal.</p>
      <div className="yx-prc-split">
        <Card title="During this test">
          <ul className="yx-prc-plain">
            {rows.map(([what, how, on]) => (
              <li key={what}>
                <span className="yx-prc-stack" data-gap="sm">
                  <strong>{what}</strong>
                  <span className="yx-prc-small">{how}</span>
                </span>
                <Badge tone={on ? 'info' : 'neutral'}>{on ? 'On' : 'Off'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <aside className="yx-prc-stack">
          <Card title="How long we keep it">
            <DescriptionList items={[{ label: 'Recordings, face data, ID photo', value: 'Deleted 30 days after your result, unless you appeal' }, { label: 'Answers and score', value: 'With your application, 12 months' }, { label: 'Where', value: 'Stored in India; never sent to outside AI' }]} />
          </Card>
          <Card title="Your choices">
            <div className="yx-prc-stack">
              <Checkbox label="I agree to camera, screen and audio recording for this test" checked={rec} onChange={setRec} required />
              {!noFace && <Checkbox label="I agree to face and ID checks (biometric data) under India's DPDP Act" checked={bio} onChange={setBio} required />}
              {keystroke && !minor && <Checkbox label="Optional: I agree to typing-rhythm checks" description="Saying no is fine and is not flagged" />}
              {minor && <Checkbox label="My parent or guardian has confirmed their consent (OTP sent to +91 98XXXXX210)" checked={guardian} onChange={setGuardian} required />}
            </div>
          </Card>
        </aside>
      </div>
      {minor && <InlineAlert tone="info">You are under 18. A parent or guardian must agree before any face or ID check. Your answers are marked by people or fixed rules only, never by AI.</InlineAlert>}
      {declined && (
        <InlineAlert tone="info" title="You said no to face and ID checks">
          This test allows a manual check instead: a proctor will compare you with your ID on a short video call before you start. Your invitation is not used up.
        </InlineAlert>
      )}
      <div className="yx-prc-row">
        <Button>Say no and see my options</Button>
        <Button variant="primary" disabled={!ok}>
          Agree and continue
        </Button>
      </div>
    </CandidateFrame>
  );
}

/* ================================================================== */
/* PRC-25 · Identity verification, room scan, phone pairing            */
/* ================================================================== */

export type IdStep = 'id' | 'id-blurry' | 'selfie' | 'liveness-fail' | 'manual' | 'room' | 'phone' | 'waiting';
const ID_STEPS: { id: string; label: string }[] = [
  { id: 'id', label: 'ID card' },
  { id: 'selfie', label: 'Selfie and liveness' },
  { id: 'room', label: 'Room scan' },
  { id: 'phone', label: 'Pair phone' },
  { id: 'waiting', label: 'Start' },
];

/** PRC-25's selfie step with a real camera (answer 2201): the page owns the camera and the face check. */
export interface LiveSelfie {
  candidateName: string;
  /** The inviting company, shown in the frame. */
  companyName: string;
  /** The page's live camera (a <video>). */
  camera: ReactNode;
  /** What to do now, or why the last try failed. */
  hint: string;
  /** Tries used so far, out of `maxTries`. */
  tries: number;
  maxTries: number;
  failed: boolean;
  /** The photo could not be taken and the test needs it: the manual path, or contact the recruiter. */
  blocked: boolean;
  manual?: ManualIdentityCheck | null;
}

function LiveSelfieScreen({ live }: { live: LiveSelfie }) {
  return (
    <CandidateFrame page="My tests" user={live.candidateName} company={live.companyName}>
      <Title>Check your identity</Title>
      {live.blocked ? (
        live.manual ? (
          <ManualCheckOffer manual={live.manual} />
        ) : (
          <InlineAlert tone="danger" title="We couldn't take your photo">
            This test needs a photo before you can start. Contact the person who invited you.
          </InlineAlert>
        )
      ) : (
        <div className="yx-prc-split">
          <figure className="yx-prc-selfie">{live.camera}</figure>
          <Card title="Selfie and liveness">
            <div className="yx-prc-stack">
              {live.failed ? (
                <InlineAlert tone="warning" title="That try did not work">
                  {live.hint}
                </InlineAlert>
              ) : (
                <p className="yx-prc-p" aria-live="polite">
                  {live.hint}
                </p>
              )}
              <Meter value={Math.min(live.tries, live.maxTries)} max={live.maxTries} label="Photo tries used" valueText={`Try ${Math.min(live.tries + 1, live.maxTries)} of ${live.maxTries}`} />
            </div>
          </Card>
        </div>
      )}
    </CandidateFrame>
  );
}

export function IdentityCheckScreen({ step = 'id', live }: { step?: IdStep; live?: LiveSelfie }) {
  // PRC-25; with `live`, the selfie step on the candidate's own camera (answer 2201).
  if (live) return <LiveSelfieScreen live={live} />;
  const base = step === 'id-blurry' ? 'id' : step === 'liveness-fail' || step === 'manual' ? 'selfie' : step;
  const idx = ID_STEPS.findIndex((s) => s.id === base);
  return (
    <CandidateFrame page="My tests">
      <Title>Check your identity</Title>
      <ol className="yx-prc-steps" aria-label="Steps">
        {ID_STEPS.map((s, i) => (
          <li key={s.id} data-state={i < idx ? 'done' : undefined} aria-current={i === idx ? 'step' : undefined}>
            {i + 1}. {s.label}
            {i < idx && ' · done'}
          </li>
        ))}
      </ol>
      {(step === 'id' || step === 'id-blurry') && (
        <div className="yx-prc-split">
          <IdCapture docType="PAN card" state={step === 'id-blurry' ? 'blurry' : 'waiting'} />
          <Card title="Show a government photo ID">
            <div className="yx-prc-stack">
              <p className="yx-prc-p">PAN card, passport, driving licence or voter ID. If you use Aadhaar, cover the first 8 digits: we never store the full number.</p>
              <Select aria-label="ID document type" value="pan" onChange={() => {}} options={[{ value: 'pan', label: 'PAN card' }, { value: 'passport', label: 'Passport' }, { value: 'dl', label: 'Driving licence' }, { value: 'voter', label: 'Voter ID' }]} />
              <Button variant="primary">Take photo of ID</Button>
              <Button>I don't have a government ID</Button>
            </div>
          </Card>
        </div>
      )}
      {(step === 'selfie' || step === 'liveness-fail') && (
        <div className="yx-prc-split">
          <CameraFrame state="live" label="Look at the camera" size="lg" />
          <Card title="Selfie and liveness">
            <div className="yx-prc-stack">
              {step === 'liveness-fail' ? (
                <InlineAlert tone="warning" title="We couldn't confirm it was a live picture">
                  Face a window or lamp so your face is lit, remove sunglasses, then try again. After 3 tries, a proctor checks you instead.
                </InlineAlert>
              ) : (
                <p className="yx-prc-p" aria-live="polite">
                  Step 2 of 3: slowly turn your head to the left, then blink twice.
                </p>
              )}
              <Meter value={step === 'liveness-fail' ? 1 : 2} max={3} label="Liveness prompts done" />
              <Button variant="primary" icon={RotateCcw}>
                {step === 'liveness-fail' ? 'Try again (2 tries left)' : 'Start liveness check'}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {step === 'manual' && (
        <div className="yx-prc-fullscreen">
          <CameraFrame state="captured" label="Your selfie" size="md" />
          <Heading level={2}>A proctor is checking your ID</Heading>
          <p className="yx-prc-p" role="status" aria-live="polite">
            The automatic match was not sure, so a person is looking. This usually takes under 5 minutes, and the waiting time is added back to your test.
          </p>
        </div>
      )}
      {step === 'room' && (
        <div className="yx-prc-split">
          <CameraFrame kind="room" state="live" label="Room scan" size="lg" />
          <Card title="Show your room">
            <ol className="yx-prc-list">
              <li>Tilt your laptop or pick up your webcam.</li>
              <li>Turn slowly all the way round, then show your desk surface.</li>
              <li>Keep it to about 30 seconds. Only the proctor and reviewer see it.</li>
            </ol>
            <Button variant="primary">Start room scan</Button>
          </Card>
        </div>
      )}
      {step === 'phone' && (
        <div className="yx-prc-split">
          <QrPlaceholder seed="pair-ATT-88213" label="Scan with your phone camera. The code works once, for this test only." />
          <Card title="Use your phone as a second camera">
            <ol className="yx-prc-list">
              <li>Scan the code with your phone. No app is needed.</li>
              <li>Place the phone about 1 metre behind you, to the side, so it sees you, your desk and your screen.</li>
              <li>Keep it plugged in. Its camera is recorded like your webcam.</li>
            </ol>
            <p className="yx-prc-row yx-prc-small">
              <Icon icon={Smartphone} /> Waiting for your phone…
            </p>
          </Card>
        </div>
      )}
      {step === 'waiting' && (
        <div className="yx-prc-fullscreen">
          <Heading level={2}>Waiting for your proctor</Heading>
          <p className="yx-prc-mono yx-prc-big" role="timer" aria-live="off">
            {formatClock(412)}
          </p>
          <p className="yx-prc-p">Your proctor will join shortly. If nobody joins within 10 minutes, your test starts automatically with recording, and the waiting time is added back. You don't lose your attempt.</p>
          <Button>Review the rules</Button>
        </div>
      )}
    </CandidateFrame>
  );
}

/* ================================================================== */
/* PRC-26 · Test runner                                                */
/* ================================================================== */

export type RunnerView =
  | 'mcq'
  | 'coding'
  | 'descriptive'
  | 'reconnecting'
  | 'break'
  | 'paused'
  | 'accessibility'
  | 'calculator'
  | 'finish'
  | 'submitted'
  | 'ai-allowed'
  // Answer 2161: going through unanswered questions, "answer any N of M" sections (and their finish note), the phone
  // question list, a question with a picture, a code snippet and option pictures. Answer 2162: the scientific calculator.
  | 'review'
  | 'choice'
  | 'choice-finish'
  | 'phone'
  | 'media'
  | 'scientific';

const SECTIONS = [
  { name: 'Aptitude', count: 10, state: 'done' as const, note: 'Submitted · forward only' },
  { name: 'Java', count: 20, state: 'current' as const, note: '32:10 left in section' },
  { name: 'SQL', count: 10, state: 'next' as const, note: 'Opens after Java' },
];

/** Answer 2161: a test whose Java section asks for any 3 of its 5 questions. */
const CHOICE_SECTIONS = [
  { name: 'Aptitude', count: 10 },
  { name: 'Java', count: 5, required: 3 },
  { name: 'SQL', count: 5 },
];
const SAMPLE_PICTURE = (label: string, w = 320, h = 120) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#e8eefc"/><text x="12" y="${h / 2 + 6}" font-size="16" fill="#1f2a44">${label}</text></svg>`);

function makeQuestions(n: number, answered: number): ExamQuestionState[] {
  return Array.from({ length: n }, (_, i) => ({ answered: i < answered && i !== 4, markedForReview: i === 6 || i === 11 }));
}


/* ---------------- PRC-26 live (AS-4a) ---------------- */

/** One question as the live runner shows it. Code, file and spoken answers come from the page (`renderQuestion`). */
export interface LiveRunnerQuestion {
  id: string;
  type: 'single' | 'multiple' | 'essay' | 'other';
  text: string;
  marks: number;
  /** Answer 2161: an option may carry a picture. */
  options: { id: string; label: string; image?: QuestionImage | null }[];
  /** Answer 2161: the question's picture and read-only code snippet. */
  image?: QuestionImage | null;
  snippet?: { language?: string | null; code: string } | null;
  /** Chosen option ids (single and multiple). */
  value: string[];
  /** The written answer (essay). */
  answerText: string;
  answered: boolean;
  markedForReview: boolean;
}

export interface LiveRunnerPause {
  title: string;
  message: string;
  /** e.g. "Warning 1/3". */
  strike?: string | null;
  /** A quieter line under the message, e.g. that no time is lost. */
  note?: string | null;
  action?: { label: string; busyLabel?: string; onClick: () => void; busy?: boolean } | null;
  /** Why the last try did not work. */
  error?: string | null;
}

export interface LiveRunner {
  testName: string;
  candidateName: string;
  logo?: ReactNode;
  proctored: boolean;
  /** What is watched, shown under the bar ("Camera on · Screen shared"). */
  proctoringNote?: string;
  seconds: number;
  /** running; on the candidate's break; paused by the proctor or a check; submitted. */
  status: 'running' | 'break' | 'paused' | 'submitted';
  pausedMessage?: string;
  /**
   * Answer 2231: why the test is paused and what the candidate can do (a rule broken, a check, the proctor, screen sharing,
   * a block). Shown in the designed paused view; without it the plain "paused" text shows.
   */
  pause?: LiveRunnerPause | null;
  /** A heads-up that does not stop the test (e.g. the face did not clearly match); dismissed by the candidate. */
  notice?: { title: string; message: string; actionLabel: string; onAction: () => void; busy?: boolean } | null;
  /** AS-6 part 2 (answer 2272): the approved assistant of an AI-allowed test; every message is logged for the markers. */
  assistant?: LiveAssistant | null;
  /** Answer 2269: the proctor's unread messages; the candidate says "Got it" or replies (the proctor sees the thread). */
  messages?: { items: { id: string; body: string }[]; onRead: () => Promise<unknown>; onReply: (text: string) => Promise<unknown> } | null;
  /** While on a break: seconds until it ends on its own. */
  breakSecondsLeft?: number;
  breaksLeft: number;
  breakMinutes: number;
  onStartBreak?: () => Promise<unknown>;
  onEndBreak?: () => Promise<unknown>;
  connection: ConnState;
  /** Answers kept on this device, not yet sent. */
  queued: number;
  offlineSeconds: number;
  /** asmt.offline_minutes: answering stops past this offline. */
  offlineMinutes: number;
  /** Time given back for a lost connection so far (seconds) and the cap (minutes). */
  creditSeconds: number;
  creditCapMinutes: number;
  /** AS-4b (answers 2011, 2164): the help approved for this candidate (e.g. 'reader': screen-reader mode). */
  approvedHelp?: string[];
  saveStatus: AutosaveStatus;
  savedAt?: string;
  /** In order; `required`: the section asks for any N of its questions (answer 2161). */
  sections: { name: string; count: number; required?: number | null }[];
  questions: LiveRunnerQuestion[];
  current: number;
  onNavigate: (index: number) => void;
  onAnswer: (q: LiveRunnerQuestion, value: string[]) => void;
  onAnswerText: (q: LiveRunnerQuestion, text: string) => void;
  onMark: (q: LiveRunnerQuestion, marked: boolean) => void;
  /** Code, file and spoken questions (the page keeps its editors and recorders). */
  renderQuestion?: (q: LiveRunnerQuestion) => ReactNode;
  calculator: 'none' | 'basic' | 'scientific';
  onFinish: () => void;
  /** Submitting now; and why the last try did not go through (answers stay saved; Try again calls onFinish). */
  finishing?: boolean;
  finishError?: string | null;
  /** After submit: when, how many answered, the result line, and the optional survey. */
  submittedAt?: string;
  resultNote?: ReactNode;
  survey?: { done: boolean; onSend: (input: { rating: number; clearInstructions?: boolean; comment?: string; gender?: 'woman' | 'man' | 'another' | 'not_say' }) => Promise<unknown> } | null;
}

function SurveyCard({ survey }: { survey: NonNullable<LiveRunner['survey']> }) {
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [rating, setRating] = useState<string | null>(null);
  const [clear, setClear] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(survey.done);
  if (sent) return <p className="yx-prc-muted">Thank you for answering the survey.</p>;
  if (skipped) return null;
  return (
    <Card title="Two minutes: how was the test? (optional)">
      <p className="yx-prc-small">Your answers never affect your score and are only reported in groups of 5 or more.</p>
      {!open ? (
        <div className="yx-prc-row">
          <Button onClick={() => setSkipped(true)}>Skip</Button>
          <Button variant="primary" onClick={() => setOpen(true)}>
            Start survey
          </Button>
        </div>
      ) : (
        <div className="yx-prc-stack">
          {error && <InlineAlert tone="danger" title="It was not sent">{error}</InlineAlert>}
          <FormField label="How was the test overall?" required error={tried && !rating ? 'Choose a rating' : undefined}>
            <RadioGroup aria-label="How was the test overall?" orientation="horizontal" value={rating ?? undefined} onChange={setRating} options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v === '1' ? '1 · Poor' : v === '5' ? '5 · Very good' : v }))} />
          </FormField>
          <FormField label="Were the instructions clear?" optional>
            <RadioGroup aria-label="Were the instructions clear?" orientation="horizontal" value={clear ?? undefined} onChange={setClear} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          </FormField>
          <FormField label="Anything else?" optional>
            <TextArea rows={3} maxLength={1000} value={comment} onChange={setComment} />
          </FormField>
          {/* AS-6 (answer 2019): voluntary; only counts per group, never with your name, and only for groups large enough. */}
          <FormField label="How do you describe yourself?" optional helper="Used only to check that the test is fair to everyone, as counts per group. Never shown with your name.">
            <RadioGroup aria-label="How do you describe yourself?" orientation="horizontal" value={gender ?? undefined} onChange={setGender} options={[{ value: 'woman', label: 'Woman' }, { value: 'man', label: 'Man' }, { value: 'another', label: 'Another way' }, { value: 'not_say', label: 'Prefer not to say' }]} />
          </FormField>
          <div className="yx-prc-row">
            <Button onClick={() => setSkipped(true)}>Skip</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => {
                setTried(true);
                if (!rating) return;
                setBusy(true);
                setError(null);
                survey
                  .onSend({ rating: Number(rating), ...(clear ? { clearInstructions: clear === 'yes' } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}), ...(gender ? { gender: gender as 'woman' | 'man' | 'another' | 'not_say' } : {}) })
                  .then(() => setSent(true))
                  .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Try again in a moment.'))
                  .finally(() => setBusy(false));
              }}
            >
              Send
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

type RunnerSection = { name: string; count: number; required?: number | null; first: number; answered: number };
/** Sections with where each starts and how many of its questions are answered. */
function placeSections(sections: LiveRunner['sections'], answered: boolean[]): RunnerSection[] {
  let at = 0;
  return sections.map((s) => {
    const first = at;
    at += s.count;
    return { ...s, first, answered: answered.slice(first, at).filter(Boolean).length };
  });
}
const sectionOf = (sections: RunnerSection[], i: number) => sections.findIndex((s) => i >= s.first && i < s.first + s.count);
/** Answer 2161: "Java · 20", or "Java · any 3 of 5" when the section asks for some of its questions. */
const sectionChip = (s: { name: string; count: number; required?: number | null }) => (s.required != null ? `${s.name} · any ${s.required} of ${s.count}` : `${s.name} · ${s.count}`);
/** The line above a question: which section, and what it asks for. */
function sectionContext(sections: RunnerSection[], i: number): string | undefined {
  const k = sectionOf(sections, i);
  const s = sections[k];
  if (!s || (sections.length < 2 && s.required == null)) return undefined;
  return `Section ${k + 1} of ${sections.length}: ${s.name}${s.required != null ? ` · answer any ${s.required} of ${s.count}` : ''}`;
}
/** In the Finish confirmation: each "answer any N" section, and whether it has enough answers yet. */
function choiceNote(sections: RunnerSection[]): ReactNode {
  const choice = sections.filter((s) => s.required != null);
  if (!choice.length) return null;
  const short = choice.filter((s) => s.answered < s.required!);
  return (
    <InlineAlert tone={short.length ? 'warning' : 'info'} title={short.length ? 'Some sections need more answers' : 'Every section has enough answers'}>
      <ul className="yx-prc-list">
        {choice.map((s) => (
          <li key={s.name}>{`${s.name}: ${Math.min(s.answered, s.required!)} of ${s.required} answered${s.answered > s.required! ? ` (your best ${s.required} count)` : ''}`}</li>
        ))}
      </ul>
    </InlineAlert>
  );
}
/** Answer 2161: going through only the unanswered or the marked questions, from the Finish confirmation. */
function ReviewBanner({ which, at, of, onPrevious, onNext, onStop }: { which: 'unanswered' | 'review'; at: number; of: number; onPrevious?: () => void; onNext?: () => void; onStop: () => void }) {
  return (
    <div className="yx-prc-review" role="region" aria-label="Going through questions">
      <p className="yx-prc-review__title">{`${which === 'review' ? 'Marked for review' : 'Unanswered'}: ${at} of ${of}`}</p>
      <div className="yx-prc-row">
        <Button size="sm" onClick={onPrevious} disabled={!onPrevious}>
          {which === 'review' ? 'Previous marked' : 'Previous unanswered'}
        </Button>
        <Button size="sm" onClick={onNext} disabled={!onNext}>
          {which === 'review' ? 'Next marked' : 'Next unanswered'}
        </Button>
        <Button size="sm" onClick={onStop}>
          Show all questions
        </Button>
      </div>
    </div>
  );
}

/** PRC-26 with a real attempt (exam-runtime): the designed runner, its sections, connection, calculator, display, breaks and finish. */
/** AS-6 part 2 (answer 2272): the approved assistant in an AI-allowed test (PRC-26 "AI-allowed test: logged assistant"). */
export interface LiveAssistant {
  log: { id: string; role: 'candidate' | 'assistant'; body: string }[];
  turnsLeft: number;
  limit: number;
  onAsk: (text: string) => Promise<unknown>;
}

function AssistantPanel({ assistant }: { assistant: LiveAssistant }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = () => {
    const text = draft.trim();
    if (!text) return setError('Write your question first.');
    setBusy(true);
    setError(null);
    assistant
      .onAsk(text)
      .then(() => setDraft(''))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Try again in a moment.'))
      .finally(() => setBusy(false));
  };
  return (
    <Card title="Allowed AI assistant · every message is logged" actions={<AiBadge />}>
      <div className="yx-prc-stack">
        <p className="yx-prc-small">You may use this assistant for this test. Other AI tools or websites are not allowed and are flagged as usual.</p>
        {assistant.log.length > 0 && (
          <ul className="yx-prc-plain" aria-label="Assistant conversation" aria-live="polite">
            {assistant.log.map((m) => (
              <li key={m.id}>
                <span>
                  <strong>{m.role === 'candidate' ? 'You:' : 'Assistant:'}</strong> {m.body}
                </span>
              </li>
            ))}
          </ul>
        )}
        <FormField label="Ask the assistant" error={error} helper={`${assistant.turnsLeft} of ${assistant.limit} questions left`}>
          <TextArea rows={2} value={draft} onChange={setDraft} maxLength={2000} disabled={assistant.turnsLeft === 0} />
        </FormField>
        <div className="yx-prc-row">
          <Button loading={busy} disabled={assistant.turnsLeft === 0} onClick={ask}>
            Ask
          </Button>
        </div>
      </div>
    </Card>
  );
}

function LiveTestRunnerScreen({ live }: { live: LiveRunner }) {
  const [reviewing, setReviewing] = useState<'unanswered' | 'review' | null>(null);
  const [calc, setCalc] = useState(false);
  const [a11y, setA11y] = useState(false);
  const [font, setFont] = useState<'normal' | 'large'>('normal');
  const [contrast, setContrast] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const act = (key: string, fn?: () => Promise<unknown>) => {
    if (!fn) return;
    setBusy(key);
    setError(null);
    fn()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Try again in a moment.'))
      .finally(() => setBusy(null));
  };
  const stopped = live.connection === 'offline' && live.offlineSeconds >= live.offlineMinutes * 60;
  // Answer 2269 (and 2280: also in the paused view): the proctor's unread messages, Got it and Reply.
  const proctorMessages = (
    <>
      {live.messages && live.messages.items.length > 0 && (
        <InlineAlert
          tone="info"
          title={live.messages.items.length > 1 ? `${live.messages.items.length} messages from your proctor` : 'Message from your proctor'}
          actions={
            <>
              <Button size="sm" loading={busy === 'read'} onClick={() => act('read', live.messages!.onRead)}>
                Got it
              </Button>
              <Button size="sm" onClick={() => setReply('')}>
                Reply
              </Button>
            </>
          }
        >
          {live.messages.items.map((m) => (
            <p key={m.id}>{m.body}</p>
          ))}
        </InlineAlert>
      )}
      <ConfirmDialog
        open={reply !== null}
        onOpenChange={(o) => !o && (setReply(null), setReplyError(null))}
        title="Reply to your proctor"
        consequence={`Your proctor sees your message in their console.${live.status === 'running' ? ' The timer keeps running.' : ''}`}
        confirmLabel="Send"
        onConfirm={async () => {
          const text = (reply ?? '').trim();
          if (!text) {
            setReplyError('Write your message first.');
            return false;
          }
          setReplyError(null);
          await live.messages?.onReply(text);
          setReply(null);
        }}
      >
        <FormField label="Your message" required error={replyError}>
          <TextArea value={reply ?? ''} onChange={setReply} rows={3} maxLength={1000} />
        </FormField>
      </ConfirmDialog>
    </>
  );

  if (live.status === 'submitted')
    return (
      <div className="yx-prc-fullscreen">
        <Heading level={1}>Test submitted</Heading>
        <p className="yx-prc-p">
          We received your answers{live.submittedAt ? ` at ${live.submittedAt}` : ''}. {live.proctored ? 'Your camera and screen recording have stopped. ' : ''}You can close this window.
        </p>
        {live.resultNote && <div className="yx-prc-muted">{live.resultNote}</div>}
        {live.survey && <SurveyCard survey={live.survey} />}
      </div>
    );

  if (live.status === 'break' || live.status === 'paused')
    return (
      <div className="yx-prc-fullscreen">
        <Icon icon={Coffee} size="md" />
        <Heading level={1}>{live.status === 'break' ? 'Break' : 'Your test is paused'}</Heading>
        {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
        {proctorMessages}
        {live.status === 'break' ? (
          <>
            <p className="yx-prc-mono yx-prc-big" aria-live="polite">
              {formatClock(live.breakSecondsLeft ?? 0)}
            </p>
            <p className="yx-prc-p">The test timer is stopped. When the break ends, on its own or when you continue, the timer starts again.</p>
            <Button variant="primary" loading={busy === 'end'} onClick={() => act('end', live.onEndBreak)}>
              End break and continue
            </Button>
          </>
        ) : live.pause ? (
          <section className="yx-prc-stack" aria-label={live.pause.title}>
            <Heading level={2}>{live.pause.title}</Heading>
            <p className="yx-prc-p">{live.pause.message}</p>
            {live.pause.strike && <p className="yx-prc-muted yx-prc-small">{live.pause.strike}</p>}
            {live.pause.action && (
              <Button variant="primary" loading={live.pause.action.busy} onClick={live.pause.action.onClick}>
                {live.pause.action.busy && live.pause.action.busyLabel ? live.pause.action.busyLabel : live.pause.action.label}
              </Button>
            )}
            {live.pause.error && (
              <InlineAlert tone="warning" title="That did not work">
                {live.pause.error}
              </InlineAlert>
            )}
            <p className="yx-prc-muted yx-prc-small">{live.pause.note ?? 'The timer is stopped. It starts again when the test is resumed.'}</p>
          </section>
        ) : (
          <>
            {live.pausedMessage && <p className="yx-prc-p">{live.pausedMessage}</p>}
            <p className="yx-prc-muted">The timer is stopped. It starts again when the test is resumed.</p>
          </>
        )}
      </div>
    );

  const q = live.questions[live.current];
  const sections = placeSections(live.sections, live.questions.map((x) => x.answered));
  const context = sectionContext(sections, live.current);
  // Review mode steps through only the matching questions; it ends when none are left.
  const matching = reviewing ? live.questions.flatMap((x, i) => ((reviewing === 'review' ? x.markedForReview : !x.answered) ? [i] : [])) : [];
  const inReview = reviewing !== null && matching.length > 0;
  const before = matching.filter((i) => i < live.current);
  const after = matching.filter((i) => i > live.current);
  const prev = inReview ? (before.length ? () => live.onNavigate(before[before.length - 1]!) : undefined) : live.current > 0 ? () => live.onNavigate(live.current - 1) : undefined;
  const next = inReview ? (after.length ? () => live.onNavigate(after[0]!) : undefined) : live.current < live.questions.length - 1 ? () => live.onNavigate(live.current + 1) : undefined;
  const banner = inReview ? (
    <ReviewBanner which={reviewing!} at={matching.includes(live.current) ? matching.indexOf(live.current) + 1 : before.length} of={matching.length} onPrevious={prev} onNext={next} onStop={() => setReviewing(null)} />
  ) : null;
  const media = q ? <QuestionMedia image={q.image} snippet={q.snippet} /> : null;
  const metaLine = (kind: string) => `Question ${live.current + 1} of ${live.questions.length}${kind} · ${q!.marks} ${q!.marks === 1 ? 'mark' : 'marks'}`;
  const nav = (
    <div className="yx-prc-row" data-between>
      <Checkbox label="Mark for review" checked={q?.markedForReview ?? false} onChange={(m) => q && live.onMark(q, m)} />
      <div className="yx-prc-row">
        <Button onClick={prev} disabled={!prev}>
          Previous
        </Button>
        <Button variant="primary" onClick={next} disabled={!next}>
          Next
        </Button>
      </div>
    </div>
  );
  const body = !q ? (
    <EmptyState title="This test has no questions." />
  ) : q.type === 'single' || q.type === 'multiple' ? (
    <QuestionCard
      number={live.current + 1}
      total={live.questions.length}
      marks={`${q.marks} ${q.marks === 1 ? 'mark' : 'marks'}`}
      question={q.text}
      context={context}
      media={q.image || q.snippet ? media : undefined}
      kind={q.type}
      options={q.options.map((o) => ({ id: o.id, label: <OptionLabel text={o.label} image={o.image} /> }))}
      value={q.value}
      onChange={(v) => !stopped && live.onAnswer(q, v)}
      markedForReview={q.markedForReview}
      onMarkedForReviewChange={(m) => live.onMark(q, m)}
      onPrevious={prev}
      onNext={next}
    />
  ) : q.type === 'essay' ? (
    <article className="yx-prc-stack" aria-label={`Question ${live.current + 1}`}>
      {context && <p className="yx-question__context">{context}</p>}
      <p className="yx-prc-muted yx-prc-small">{metaLine(' · Descriptive')}</p>
      <p className="yx-prc-p">{q.text}</p>
      {media}
      <TextArea className="yx-prc-answer" rows={12} value={q.answerText} readOnly={stopped} onChange={(v) => live.onAnswerText(q, v)} aria-label="Your answer" spellCheck />
      <p className="yx-prc-muted yx-prc-small" aria-live="polite">
        {q.answerText.trim() ? q.answerText.trim().split(/\s+/).length : 0} words
      </p>
      {nav}
    </article>
  ) : (
    <article className="yx-prc-stack" aria-label={`Question ${live.current + 1}`}>
      {context && <p className="yx-question__context">{context}</p>}
      <p className="yx-prc-muted yx-prc-small">{metaLine('')}</p>
      <p className="yx-prc-p">{q.text}</p>
      {media}
      {live.renderQuestion?.(q)}
      {nav}
    </article>
  );

  const currentSection = sectionOf(sections, live.current);

  return (
    <div className="yx-prc-a11y" data-font={font} data-contrast={contrast ? 'high' : undefined}>
      <ExamShell
        testName={live.testName}
        candidateName={live.candidateName}
        seconds={live.seconds}
        saveStatus={live.saveStatus}
        savedAt={live.savedAt}
        questions={live.questions.map((x) => ({ answered: x.answered, markedForReview: x.markedForReview }))}
        current={live.current}
        onNavigate={live.onNavigate}
        onFinish={live.onFinish}
        logo={live.logo}
        proctored={live.proctored}
        onReview={(which) => {
          const first = live.questions.findIndex((x) => (which === 'review' ? x.markedForReview : !x.answered));
          if (first < 0) return;
          setReviewing(which);
          live.onNavigate(first);
        }}
        finishNote={choiceNote(sections)}
        banner={banner}
      >
        <div className="yx-prc-stack">
          <div className="yx-prc-runner-bar">
            {sections.length > 1 ? (
              <nav className="yx-prc-sections" aria-label="Sections">
                {sections.map((s, k) => (
                  <Button key={s.name} size="sm" variant={k === currentSection ? 'primary' : undefined} aria-current={k === currentSection ? 'step' : undefined} onClick={() => live.onNavigate(s.first)}>
                    {sectionChip(s)}
                  </Button>
                ))}
              </nav>
            ) : (
              <span />
            )}
            <div className="yx-prc-row">
              <ConnectionStatus state={live.connection} queued={live.queued} offlineSeconds={live.offlineSeconds} offlineMinutes={live.offlineMinutes} />
              {live.calculator !== 'none' && (
                <Button size="sm" icon={CalcIcon} onClick={() => setCalc(!calc)} aria-pressed={calc}>
                  Calculator
                </Button>
              )}
              <Button size="sm" icon={Type} onClick={() => setA11y(!a11y)} aria-pressed={a11y}>
                Display
              </Button>
              {live.breaksLeft > 0 && live.onStartBreak && (
                <Button size="sm" icon={Coffee} loading={busy === 'break'} onClick={() => act('break', live.onStartBreak)}>
                  Take a break ({live.breaksLeft} left)
                </Button>
              )}
            </div>
          </div>
          {live.proctoringNote && <p className="yx-prc-row yx-prc-small yx-prc-muted">{live.proctoringNote}</p>}
          {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
          {live.notice && (
            <InlineAlert tone="warning" title={live.notice.title} actions={<Button size="sm" loading={live.notice.busy} onClick={live.notice.onAction}>{live.notice.actionLabel}</Button>}>
              {live.notice.message}
            </InlineAlert>
          )}
          {proctorMessages}
          {live.finishError && (
            <InlineAlert tone="danger" title="Your test was not submitted">
              <p>{live.finishError} Your answers are saved.</p>
              <Button variant="primary" loading={live.finishing} onClick={live.onFinish}>
                Try again
              </Button>
            </InlineAlert>
          )}
          {(live.connection === 'reconnecting' || live.connection === 'offline') && (
            <InlineAlert tone="warning" title={stopped ? 'Answering is paused until you are back online' : 'Reconnecting'}>
              {stopped
                ? `You were offline for more than ${live.offlineMinutes} minutes. Your answers are kept on this device and sent when the connection returns.`
                : `Keep answering. ${live.queued} ${live.queued === 1 ? 'answer is' : 'answers are'} kept on this device and will be sent. Lost time is added back automatically, up to ${live.creditCapMinutes} minutes.`}
            </InlineAlert>
          )}
          {live.creditSeconds > 0 && live.connection === 'online' && (
            <p className="yx-prc-small yx-prc-muted" aria-live="polite">
              {formatClock(live.creditSeconds)} added back for a lost connection.
            </p>
          )}
          {a11y && (
            <Card title="Display settings">
              <div className="yx-prc-grid3">
                <FormField label="Text size">
                  <Select value={font} onChange={(v) => setFont((v as 'normal' | 'large') ?? 'normal')} options={[{ value: 'normal', label: 'Standard' }, { value: 'large', label: 'Large' }]} size="sm" />
                </FormField>
                <Switch label="High contrast" checked={contrast} onChange={setContrast} />
                {/* Answer 2164: shown only when it was approved for this candidate (AS-4b). */}
                {live.approvedHelp?.includes('reader') && <Switch label="Screen-reader mode" description="Approved for you" defaultChecked />}
              </div>
            </Card>
          )}
          {body}
          {live.assistant && <AssistantPanel assistant={live.assistant} />}
          {calc && (
            <div className="yx-prc-floating">
              <Calculator scientific={live.calculator === 'scientific'} onClose={() => setCalc(false)} />
            </div>
          )}
        </div>
      </ExamShell>
    </div>
  );
}

export function TestRunnerScreen({ view = 'mcq', conn = 'online', live }: { view?: RunnerView; conn?: ConnState; live?: LiveRunner }) {
  // PRC-26; with `live`, a real attempt (AS-4a).
  if (live) return <LiveTestRunnerScreen live={live} />;
  const [answer, setAnswer] = useState<string[]>(['b']);
  const [marked, setMarked] = useState(false);
  const [calc, setCalc] = useState(view === 'calculator' || view === 'scientific');
  const [a11y, setA11y] = useState(view === 'accessibility');
  const [font, setFont] = useState<'normal' | 'large'>(view === 'accessibility' ? 'large' : 'normal');
  const [contrast, setContrast] = useState(view === 'accessibility');
  const [text, setText] = useState('I would start by grouping the deviation log by station and shift. The seal temperature drops after the 2 pm changeover suggest the heater warm-up is skipped…');
  const [code, setCode] = useState('public List<String> topK(List<String> words, int k) {\n  // your code\n}');
  const [current, setCurrent] = useState(view === 'coding' ? 13 : view === 'descriptive' ? 18 : view === 'review' ? 4 : view === 'choice' || view === 'choice-finish' ? 11 : 13);
  const connection: ConnState = view === 'reconnecting' ? 'reconnecting' : conn;
  const choice = view === 'choice' || view === 'choice-finish';
  const sampleQuestions = choice
    ? makeQuestions(20, 0).map((x, i) => ({ ...x, answered: i < 10 || i === 10 || i === 12 || i === 15, markedForReview: false }))
    : makeQuestions(20, 16);

  if (view === 'submitted')
    return (
      <div className="yx-prc-fullscreen">
        <Heading level={1}>Test submitted</Heading>
        <p className="yx-prc-p">We received all 40 answers at 11:52 am. Your camera and screen recording have stopped. You can close this window; the Secure Client will exit and leave nothing running.</p>
        <p className="yx-prc-muted">Results: {COMPANY.name} will tell you by email. You can also check My tests.</p>
        <Card title="Two minutes: how was the test? (optional)">
          <p className="yx-prc-small">Your answers never affect your score and are only reported in groups of 5 or more.</p>
          <div className="yx-prc-row">
            <Button>Skip</Button>
            <Button variant="primary">Start survey</Button>
          </div>
        </Card>
      </div>
    );

  if (view === 'break' || view === 'paused')
    return (
      <div className="yx-prc-fullscreen">
        <Icon icon={Coffee} size="md" />
        <Heading level={1}>{view === 'break' ? 'Break between sections' : 'Your test is paused'}</Heading>
        {view === 'break' ? (
          <>
            <p className="yx-prc-mono yx-prc-big">
              {formatClock(236)}
            </p>
            <p className="yx-prc-p">The test timer is stopped and proctoring is paused. When you come back, we check your face again before the SQL section.</p>
            <Button variant="primary">End break and continue</Button>
          </>
        ) : (
          <>
            <p className="yx-prc-p">Message from your proctor: "Please clear the papers from your desk and show them to the camera."</p>
            <p className="yx-prc-muted">The timer is stopped. It starts again when your proctor resumes the test.</p>
          </>
        )}
      </div>
    );

  const q =
    view === 'coding' || view === 'ai-allowed' ? (
      <article className="yx-prc-stack" aria-label={`Question ${current + 1}`}>
        <p className="yx-prc-muted yx-prc-small">Question {current + 1} of 20 · Code · 10 marks</p>
        <p className="yx-prc-p">Write a method that returns the k most frequent words in a list. Ties are sorted alphabetically.</p>
        <CodeAnswer language="Java 17" value={code} onChange={setCode} onRun={() => {}} runs={3} results={[{ name: 'Sample 1: k = 2', status: 'pass', detail: '0.12 s' }, { name: 'Sample 2: ties', status: 'fail', detail: 'Expected [apple, mango], got [mango, apple]' }, { name: 'Hidden tests (6)', status: 'hidden' }]} />
        {view === 'ai-allowed' && (
          <Card title="Allowed AI assistant · every message is logged" actions={<AiBadge />}>
            <p className="yx-prc-small">You may use this assistant for this test. Other AI tools or websites are not allowed and are flagged as usual.</p>
            <TextArea rows={2} placeholder="Ask the assistant" aria-label="Ask the assistant" />
          </Card>
        )}
        <div className="yx-prc-row" data-between>
          <Checkbox label="Mark for review" checked={marked} onChange={setMarked} />
          <div className="yx-prc-row">
            <Button onClick={() => setCurrent(current - 1)}>Previous</Button>
            <Button variant="primary" onClick={() => setCurrent(current + 1)}>
              Next
            </Button>
          </div>
        </div>
      </article>
    ) : view === 'descriptive' ? (
      <article className="yx-prc-stack" aria-label={`Question ${current + 1}`}>
        <p className="yx-prc-muted yx-prc-small">Question {current + 1} of 20 · Descriptive · 9 marks · 150–400 words</p>
        <p className="yx-prc-p">Explain how you would reduce food-safety deviations on a packing line. Name the method you would use and who owns each action.</p>
        <textarea className="yx-prc-answer" value={text} onChange={(e) => setText(e.target.value)} aria-label="Your answer" spellCheck />
        <p className="yx-prc-muted yx-prc-small" aria-live="polite">
          {text.trim().split(/\s+/).length} words · paste is turned off for this question
        </p>
        <div className="yx-prc-row" data-between>
          <Checkbox label="Mark for review" checked={marked} onChange={setMarked} />
          <div className="yx-prc-row">
            <Button onClick={() => setCurrent(current - 1)}>Previous</Button>
            <Button variant="primary" onClick={() => setCurrent(current + 1)}>
              Next
            </Button>
          </div>
        </div>
      </article>
    ) : (
      <QuestionCard
        number={current + 1}
        total={20}
        marks="2 marks"
        context={choice ? 'Section 2 of 3: Java · answer any 3 of 5' : undefined}
        question={view === 'media' ? 'What does this method print for the sales shown in the chart? Choose the matching chart.' : 'A Stream pipeline runs only when a terminal operation is called. Which operation is lazy and returns a new stream?'}
        media={
          view === 'media' ? (
            <QuestionMedia
              image={{ src: SAMPLE_PICTURE('Line chart: sales by month, March to August'), alt: 'Line chart of monthly sales, rising from March to August' }}
              snippet={{ language: 'Java', code: 'int best = sales.stream()\n    .mapToInt(Integer::intValue)\n    .max()\n    .orElse(0);\nSystem.out.println(best);' }}
            />
          ) : undefined
        }
        kind="single"
        options={
          view === 'media'
            ? [
                { id: 'a', label: <OptionLabel text="Highest in August" image={{ src: SAMPLE_PICTURE('Aug', 96, 96), alt: 'Bar chart, August highest' }} /> },
                { id: 'b', label: <OptionLabel text="Highest in March" image={{ src: SAMPLE_PICTURE('Mar', 96, 96), alt: 'Bar chart, March highest' }} /> },
                { id: 'c', label: <OptionLabel text="All months the same" image={{ src: SAMPLE_PICTURE('Flat', 96, 96), alt: 'Bar chart, every month the same' }} /> },
              ]
            : [
                { id: 'a', label: 'filter() is terminal' },
                { id: 'b', label: 'map() is lazy and returns a new stream' },
                { id: 'c', label: 'collect() is lazy' },
                { id: 'd', label: 'forEach() returns a stream' },
              ]
        }
        value={answer}
        onChange={setAnswer}
        markedForReview={marked}
        onMarkedForReviewChange={setMarked}
        onPrevious={() => setCurrent(Math.max(0, current - 1))}
        onNext={() => setCurrent(Math.min(19, current + 1))}
      />
    );

  return (
    <div className="yx-prc-a11y" data-font={font} data-contrast={contrast ? 'high' : undefined}>
      <ExamShell
        testName="Java Backend Developer · L2"
        candidateName="Arjun Nair"
        seconds={view === 'finish' || view === 'choice-finish' ? 245 : 1930}
        saveStatus={connection === 'reconnecting' ? 'offline' : 'saved'}
        savedAt="10:41"
        questions={sampleQuestions}
        current={current}
        onNavigate={setCurrent}
        onFinish={() => {}}
        logo={<strong>{COMPANY.shortName}</strong>}
        proctored
        defaultFinishOpen={view === 'finish' || view === 'choice-finish'}
        onReview={() => {}}
        finishNote={choice ? choiceNote(placeSections(CHOICE_SECTIONS, sampleQuestions.map((x) => x.answered))) : undefined}
        compact={view === 'phone'}
        defaultListOpen={view === 'phone'}
        banner={view === 'review' ? <ReviewBanner which="unanswered" at={1} of={5} onNext={() => {}} onStop={() => {}} /> : undefined}
      >
        <div className="yx-prc-stack">
          <div className="yx-prc-runner-bar">
            <nav className="yx-prc-sections" aria-label="Sections">
              {choice
                ? CHOICE_SECTIONS.map((s) => (
                    <Button key={s.name} size="sm" variant={s.name === 'Java' ? 'primary' : undefined} aria-current={s.name === 'Java' ? 'step' : undefined}>
                      {sectionChip(s)}
                    </Button>
                  ))
                : SECTIONS.map((s) => (
                    <button key={s.name} type="button" className="yx-prc-section-tab" aria-current={s.state === 'current' ? 'step' : undefined} aria-disabled={s.state !== 'current'} title={s.note}>
                      {s.name} · {s.count}
                      <span className="yx-prc-small yx-prc-muted">{s.state === 'done' ? 'done' : s.state === 'next' ? 'locked' : ''}</span>
                    </button>
                  ))}
            </nav>
            <div className="yx-prc-row">
              <ConnectionStatus state={connection} queued={3} offlineSeconds={48} />
              <Button size="sm" icon={CalcIcon} onClick={() => setCalc(!calc)} aria-pressed={calc}>
                Calculator
              </Button>
              <Button size="sm" icon={Type} onClick={() => setA11y(!a11y)} aria-pressed={a11y}>
                Display
              </Button>
              <Button size="sm" icon={Coffee}>
                Take a break (1 left)
              </Button>
            </div>
          </div>
          <p className="yx-prc-row yx-prc-small yx-prc-muted">
            <Icon icon={Eye} /> Camera on · <Icon icon={Monitor} /> Screen shared · Microphone on · Includes your 25 % extra time
          </p>
          {connection === 'reconnecting' && (
            <InlineAlert tone="warning" title="Reconnecting">
              Keep answering. 3 answers are saved on this device and will sync. Lost time is added back automatically, up to 10 minutes.
            </InlineAlert>
          )}
          {a11y && (
            <Card title="Display settings">
              <div className="yx-prc-grid3">
                <FormField label="Text size">
                  <Select value={font} onChange={(v) => setFont((v as 'normal' | 'large') ?? 'normal')} options={[{ value: 'normal', label: 'Standard' }, { value: 'large', label: 'Large' }]} size="sm" />
                </FormField>
                <Switch label="High contrast" checked={contrast} onChange={setContrast} />
                <Switch label="Screen-reader mode" description="Approved for you" defaultChecked={view === 'accessibility'} />
              </div>
            </Card>
          )}
          {q}
          {calc && (
            <div className="yx-prc-floating">
              <Calculator scientific={view === 'scientific'} onClose={() => setCalc(false)} />
            </div>
          )}
        </div>
      </ExamShell>
    </div>
  );
}

/* ================================================================== */
/* PRC-27 · Result page + appeal                                       */
/* ================================================================== */

/** PRC-27 with a real attempt (AS-4a): released (what the test lets the candidate see) or held for review. */
/** AS-5 (answer 2012): an integrity decision on the attempt, with its appeal window and the appeal. */
export interface LiveIntegrityDecision {
  verdict: 'warning' | 'section' | 'attempt';
  sectionTitle: string | null;
  reason: string | null;
  decidedOn: string;
  appealUntil: string | null;
  canAppeal: boolean;
  appeal: { status: 'open' | 'upheld' | 'overturned'; sentOn: string; decidedOn: string | null; reason: string | null } | null;
  /** Answer 2262: the flagged moments (times already formatted) and how many frames are kept; never the images. */
  evidence?: { moments: { at: string; what: string }[]; cameraFrames: number; screenFrames: number };
}

export interface LiveResult {
  /** AS-3: the company and candidate in the header (not the sample ones). */
  brand?: CandidateBrand;
  testName: string;
  takenOn?: string;
  /** invalidated (AS-5): an integrity decision invalidated the attempt; the decision shows instead of a score. */
  state: 'released' | 'held' | 'pending' | 'invalidated';
  integrity?: LiveIntegrityDecision | null;
  /** Answer 2264: the candidate's words and one optional file (PDF, JPG or PNG up to 10 MB). */
  onAppeal?: (text: string, file?: File | null) => Promise<unknown>;
  /** The inviting company, shown in the frame (never the sample name). */
  companyName?: string;
  /** Released: only what the test shows (pass or fail, score, sections); null when it shows nothing of it. */
  passed?: boolean | null;
  percentage?: number | null;
  sections?: { title: string; score: number; maxScore: number }[] | null;
  onCertificate?: () => Promise<unknown>;
}

const DECISION_TITLE = { warning: 'A warning was noted on your test', section: 'Part of your test was not counted', attempt: 'Your test was not counted' } as const;

/** PRC-27's verdict, appeal form, appeal sent and window closed, with a real decision (AS-5). */
function IntegrityDecisionPart({ d, onAppeal }: { d: LiveIntegrityDecision; onAppeal?: (text: string, file?: File | null) => Promise<unknown> }) {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overturned = d.appeal?.status === 'overturned';
  return (
    <>
      <Card title={overturned ? 'Decision overturned on appeal' : `${DECISION_TITLE[d.verdict]}${d.verdict === 'section' && d.sectionTitle ? `: ${d.sectionTitle}` : ''}`}>
        <DescriptionList
          items={[
            { label: 'Why', value: d.reason ?? '—' },
            { label: 'Decided on', value: d.decidedOn },
            ...(d.appeal?.reason ? [{ label: d.appeal.status === 'overturned' ? 'Why it was overturned' : 'Appeal decision', value: d.appeal.reason }] : []),
          ]}
        />
      </Card>
      {d.evidence && (
        <Card title="What was recorded">
          {d.evidence.moments.length ? (
            <ul className="yx-prc-plain" aria-label="Flagged moments">
              {d.evidence.moments.map((m, i) => (
                <li key={i}>
                  <span>{m.at}</span> <span>{m.what}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="yx-prc-muted">No moments were flagged.</p>
          )}
          <p className="yx-prc-muted yx-prc-small">{`${d.evidence.cameraFrames} camera ${d.evidence.cameraFrames === 1 ? 'frame' : 'frames'} and ${d.evidence.screenFrames} screen ${d.evidence.screenFrames === 1 ? 'capture' : 'captures'} are kept as evidence. Every time a reviewer opens one, it is recorded.`}</p>
        </Card>
      )}
      {d.canAppeal && !writing && (
        <InlineAlert tone="info" title={`You can appeal until ${d.appealUntil ?? ''}`} actions={<Button variant="primary" onClick={() => setWriting(true)}>Appeal this decision</Button>}>
          A different reviewer will look at your appeal. Your recordings are kept until it is decided.
        </InlineAlert>
      )}
      {d.canAppeal && writing && onAppeal && (
        <div className="yx-prc-center">
          {error && <InlineAlert tone="danger" title="Your appeal was not sent">{error}</InlineAlert>}
          <FormField label="Why should we look again?" required helper="Explain what happened in your own words" error={tried && text.trim().length < 10 ? 'Write at least 10 characters.' : undefined}>
            <TextArea rows={5} value={text} onChange={setText} maxLength={2000} />
          </FormField>
          <FormField label="Supporting file" optional helper="One PDF, JPG or PNG, up to 10 MB">
            <FileUpload
              accept={['.pdf', '.jpg', '.jpeg', '.png']}
              maxSize={10 * 1024 * 1024}
              multiple={false}
              upload={async (f) => setFile(f)}
              onItemsChange={(items) => items.length === 0 && setFile(null)}
            />
          </FormField>
          <div className="yx-prc-row">
            <Button onClick={() => setWriting(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => {
                setTried(true);
                if (text.trim().length < 10) return;
                setBusy(true);
                setError(null);
                onAppeal(text.trim(), file)
                  .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Try again in a moment.'))
                  .finally(() => setBusy(false));
              }}
            >
              Send appeal
            </Button>
          </div>
        </div>
      )}
      {d.appeal?.status === 'open' && <InlineAlert tone="success" title={`Appeal received on ${d.appeal.sentOn}`}>A reviewer who was not part of the first decision will reply. Your result and recordings are kept until then.</InlineAlert>}
      {d.appeal?.status === 'upheld' && <InlineAlert tone="info" title="Your appeal was decided">The decision stands. This is final.</InlineAlert>}
      {!d.canAppeal && !d.appeal && d.appealUntil && <p className="yx-prc-muted yx-prc-small">{`The appeal window for this decision closed on ${d.appealUntil}.`}</p>}
    </>
  );
}

function LiveResultAppealScreen({ live }: { live: LiveResult }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <CandidateFrame page="My tests" brand={live.brand} company={live.companyName}>
      <Title>Your result</Title>
      <p className="yx-prc-muted">
        {live.testName}
        {live.takenOn ? ` · taken on ${live.takenOn}` : ''}
      </p>
      {live.state === 'invalidated' ? null : live.state === 'held' ? (
        <Card title="Result under review">
          <p className="yx-prc-p">We are checking a few moments from your session. This is routine and does not mean you did anything wrong. You will hear from us by email.</p>
        </Card>
      ) : live.state === 'pending' ? (
        <Card title="Result not ready yet">
          <p className="yx-prc-p">Some answers are marked by a person, or the hiring team releases results later. You will hear from us by email.</p>
        </Card>
      ) : (
        <Card title={live.passed == null ? 'Result' : live.passed ? 'Result: passed' : 'Result: not passed'}>
          {live.passed == null && live.percentage == null && !live.sections?.length ? (
            <p className="yx-prc-p">The hiring team will contact you about the next step.</p>
          ) : (
            <DescriptionList
              items={[
                ...(live.passed != null ? [{ label: 'Status', value: live.passed ? 'Passed' : 'Not passed' }] : []),
                ...(live.percentage != null ? [{ label: 'Score', value: `${Math.round(live.percentage)} %` }] : []),
                ...(live.sections ?? []).map((sec) => ({ label: sec.title, value: `${sec.score} of ${sec.maxScore}` })),
              ]}
            />
          )}
        </Card>
      )}
      {live.integrity && <IntegrityDecisionPart d={live.integrity} onAppeal={live.onAppeal} />}
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      {live.state === 'released' && live.onCertificate && (
        <div className="yx-prc-row">
          <Button
            icon={Download}
            loading={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              live.onCertificate!()
                .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Try again in a moment.'))
                .finally(() => setBusy(false));
            }}
          >
            Download certificate
          </Button>
        </div>
      )}
    </CandidateFrame>
  );
}

export function ResultAppealScreen({ state = 'released', live }: { state?: 'released' | 'held' | 'verdict' | 'appeal-form' | 'appeal-sent' | 'window-closed'; live?: LiveResult }) {
  // PRC-27; with `live`, a real result (AS-4a).
  if (live) return <LiveResultAppealScreen live={live} />;
  return (
    <CandidateFrame page="My tests">
      <Title>Your result</Title>
      <p className="yx-prc-muted">Java Backend Developer · L2 · taken on 28 Sep 2026</p>
      {state === 'held' ? (
        <Card title="Result under review">
          <p className="yx-prc-p">We are checking a few moments from your session. This is routine and does not mean you did anything wrong. You will hear from us by 1 Oct.</p>
        </Card>
      ) : (
        <Card title={state === 'verdict' || state === 'appeal-form' || state === 'appeal-sent' ? 'Result: Java section not counted' : 'Result: passed'}>
          <DescriptionList
            items={[
              { label: 'Status', value: state === 'released' || state === 'window-closed' ? 'Passed' : 'Not passed' },
              { label: 'Band', value: 'Meets expectations' },
              { label: 'What happens next', value: state === 'released' ? 'The hiring team will contact you about the interview.' : 'The hiring team has been told.' },
            ]}
          />
        </Card>
      )}
      {(state === 'verdict' || state === 'appeal-form') && (
        <Card title="Why: evidence summary">
          <p className="yx-prc-p">A reviewer found your Java answers 91 % similar to another candidate's code in the same drive.</p>
          <div className="yx-prc-grid3">
            <EvidenceFrame at="41:10" source="screen" label="Code for question 13" />
            <EvidenceFrame at="44:30" source="screen" label="Code for question 15" />
          </div>
          <p className="yx-prc-muted yx-prc-small">You see a summary with times, flag types and key frames, not the full recordings.</p>
        </Card>
      )}
      {state === 'verdict' && (
        <InlineAlert tone="info" title="You can appeal until 6 Oct 2026" actions={<Button variant="primary">Appeal this decision</Button>}>
          A different reviewer will look at your appeal and reply within 10 working days.
        </InlineAlert>
      )}
      {state === 'appeal-form' && (
        <div className="yx-prc-center">
          <FormField label="Why should we look again?" required helper="Explain what happened in your own words">
            <TextArea rows={5} />
          </FormField>
          <FormField label="Supporting files" optional>
            <FileUpload upload={async () => {}} />
          </FormField>
          <div className="yx-prc-row">
            <Button>Cancel</Button>
            <Button variant="primary">Send appeal</Button>
          </div>
        </div>
      )}
      {state === 'appeal-sent' && <InlineAlert tone="success" title="Appeal received on 29 Sep">A reviewer who was not part of the first decision will reply by 13 Oct. Your recordings are kept until then.</InlineAlert>}
      {state === 'window-closed' && <p className="yx-prc-muted yx-prc-small">The appeal window for this result closed on 5 Oct.</p>}
    </CandidateFrame>
  );
}

/* ================================================================== */
/* PRC-28 · Privacy centre                                             */
/* ================================================================== */

/** AS-5 part 3 (PRC-28): what a company holds about the candidate's tests (dates already formatted for the reader). */
export interface LivePrivacy {
  state: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  brand?: CandidateBrand;
  company: string;
  consents: { what: string; test: string; on: string }[];
  recordings: { frames: number; deleteOn: string | null };
  face: { kept: boolean; deleteOn: string | null };
  /** Answer 2279: files sent with accommodation requests. */
  accommodation?: { files: number; deleteOn: string | null; pending: boolean };
  /** An incident or appeal holds the evidence (legal hold). */
  held: boolean;
  request: { status: 'waiting' | 'done'; requestedOn: string; doneOn: string | null; dueOn: string } | null;
  onErase: () => Promise<unknown>;
  onDownload: () => Promise<unknown>;
}

export function PrivacyCentreScreen({ confirmErase = false, legalHold = false, requested = false, live }: { confirmErase?: boolean; legalHold?: boolean; requested?: boolean; live?: LivePrivacy }) {
  // PRC-28; with `live`, the candidate's own data (AS-5 part 3).
  if (live) return <LivePrivacyCentreScreen live={live} />;
  return <SamplePrivacyCentre confirmErase={confirmErase} legalHold={legalHold} requested={requested} />;
}

function LivePrivacyCentreScreen({ live }: { live: LivePrivacy }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = live.request;
  const waiting = r?.status === 'waiting';
  const nothing = !live.recordings.frames && !live.face.kept && !live.accommodation?.files;
  return (
    <CandidateFrame page="Privacy centre" brand={live.brand}>
      <Title>Privacy centre</Title>
      <p className="yx-prc-muted">What {live.company} holds about your tests, how long, and what you can change.</p>
      {live.state === 'error' ? (
        <InlineAlert tone="danger" title="We couldn't load your privacy centre." actions={<Button size="sm" onClick={live.onRetry}>Try again</Button>} />
      ) : live.state === 'loading' ? (
        <EmptyState title="Loading…" />
      ) : (
        <>
          {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
          <Card title="Consents you gave">
            {live.consents.length ? (
              <ul className="yx-prc-plain">
                {live.consents.map((c, i) => (
                  <li key={i}>
                    <span className="yx-prc-stack" data-gap="sm">
                      <strong>{c.what}</strong>
                      <span className="yx-prc-small">{`${c.on}, ${c.test}`}</span>
                    </span>
                    {!r || r.status === 'done' ? (
                      <Button size="sm" onClick={() => setOpen(true)} disabled={nothing} aria-label={`Withdraw: ${c.what}`}>
                        Withdraw
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="yx-prc-muted">You have not started a monitored test yet.</p>
            )}
          </Card>
          <Card title="What we keep and until when">
            <DescriptionList
              items={[
                { label: 'Recordings and clips', value: !live.recordings.frames ? 'None kept' : live.held ? `Kept while a review or appeal is open (legal hold)${live.recordings.deleteOn ? `, then deleted (planned for ${live.recordings.deleteOn})` : ''}` : `Delete on ${live.recordings.deleteOn ?? '—'}` },
                { label: 'Face template and photo', value: !live.face.kept ? 'None kept' : `Delete on ${live.face.deleteOn ?? '—'}` },
                ...(live.accommodation?.files
                  ? [{ label: 'Accommodation evidence', value: live.accommodation.pending ? 'Kept until your request is decided' : `Delete on ${live.accommodation.deleteOn ?? '—'}` }]
                  : []),
                { label: 'Answers and score', value: `Kept with your application under ${live.company}'s retention policy` },
              ]}
            />
          </Card>
          {live.held && waiting && <InlineAlert tone="info">We can't erase your recordings while a review or appeal of your test is open. We will erase them when it closes.</InlineAlert>}
          {waiting && r ? (
            <InlineAlert tone="success" title={`Erasure request received on ${r.requestedOn}`}>
              {`We will erase your recordings, clips, face data and accommodation files by ${r.dueOn} and email you. Your answers and score stay with your application.`}
            </InlineAlert>
          ) : r?.status === 'done' ? (
            <InlineAlert tone="success" title={`Erased on ${r.doneOn ?? r.requestedOn}`}>Your recordings, clips and face data were erased. Your answers and score stay with your application.</InlineAlert>
          ) : null}
          <div className="yx-prc-row">
            <Button
              icon={Download}
              loading={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                live
                  .onDownload()
                  .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Try again in a moment.'))
                  .finally(() => setBusy(false));
              }}
            >
              Download my data
            </Button>
            {!waiting && !nothing && (
              <Button variant="danger" onClick={() => setOpen(true)}>
                Erase my recordings and face data
              </Button>
            )}
          </div>
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Erase your recordings and face data?"
            consequence={`We delete recordings, clips, your face template and photo, and the files you sent with accommodation requests (the decisions stay). This can't be undone. Results already released are not changed; tests you have not taken yet will need a manual ID check.${live.held ? ' A review or appeal is open, so we erase them when it closes.' : ''}`}
            confirmLabel="Erase my data"
            destructive
            onConfirm={async () => {
              await live.onErase();
            }}
          />
        </>
      )}
    </CandidateFrame>
  );
}

function SamplePrivacyCentre({ confirmErase, legalHold, requested }: { confirmErase: boolean; legalHold: boolean; requested: boolean }) {
  const [open, setOpen] = useState(confirmErase);
  return (
    <CandidateFrame page="Privacy centre">
      <Title>Privacy centre</Title>
      <p className="yx-prc-muted">What {COMPANY.name} holds about your tests, how long, and what you can change.</p>
      <Card title="Consents you gave">
        <ul className="yx-prc-plain">
          {[
            ['Camera, screen and audio recording', '28 Sep 2026, Java Backend Developer · L2'],
            ['Face and ID checks (biometric)', '28 Sep 2026, under India DPDP Act'],
            ['Typing-rhythm checks (optional)', '28 Sep 2026'],
          ].map(([w, when]) => (
            <li key={w}>
              <span className="yx-prc-stack" data-gap="sm">
                <strong>{w}</strong>
                <span className="yx-prc-small">{when}</span>
              </span>
              <Button size="sm">Withdraw</Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="What we keep and until when">
        <DescriptionList
          items={[
            { label: 'Recordings and clips', value: legalHold ? 'Kept while your appeal is open (legal hold), then 30 days' : 'Delete on 28 Oct 2026' },
            { label: 'Face template and ID check result', value: 'Delete on 28 Oct 2026' },
            { label: 'Answers and score', value: 'Delete on 28 Sep 2027 with your application' },
            { label: 'Accommodation evidence', value: 'Delete on 28 Oct 2026' },
          ]}
        />
      </Card>
      {legalHold && <InlineAlert tone="info">We can't erase your recordings while your appeal APL-118 is open. We will erase them when it closes, if you still want that.</InlineAlert>}
      {requested ? (
        <InlineAlert tone="success" title="Erasure request received on 29 Sep">We will erase your recordings, face data and ID photo by 29 Oct and email you. A minimal score record without your face or voice stays where the law allows.</InlineAlert>
      ) : (
        <div className="yx-prc-row">
          <Button icon={Download}>Download my data</Button>
          <Button variant="danger" onClick={() => setOpen(true)}>
            Erase my recordings and face data
          </Button>
        </div>
      )}
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Erase your recordings and face data?" consequence="We delete recordings, clips, face template and ID photo. This can't be undone. Results already released are not changed; tests you have not taken yet will need a manual ID check." confirmLabel="Erase my data" destructive onConfirm={() => setOpen(false)} />
    </CandidateFrame>
  );
}

/* ================================================================== */
/* PRC-31 · Candidate app (native, phone)                              */
/* ================================================================== */

export type AppView = 'tests' | 'readiness' | 'runner' | 'pinning' | 'result' | 'privacy';

export function CandidateAppScreen({ view = 'tests' }: { view?: AppView }) {
  // PRC-31
  const title: Record<AppView, string> = { tests: 'My tests', readiness: 'Readiness', runner: 'Campus aptitude 2026', pinning: 'Pin this app', result: 'Result', privacy: 'Privacy centre' };
  return (
    <PhoneFrame tab="me" title={title[view]} hideTabs>
      {view === 'tests' && (
        <>
          <Card title="Campus aptitude 2026" actions={<Badge tone="info">Sat 3 Oct, 10:00 am</Badge>}>
            <p className="yx-prc-small">AI-only proctoring · this app is allowed</p>
            <div className="yx-prc-stack" data-gap="sm">
              <Button variant="primary" fullWidth>
                Run readiness check
              </Button>
              <Button fullWidth>Change slot</Button>
            </div>
          </Card>
          <Card title="Java Backend Developer · L2" actions={<Badge>Laptop only</Badge>}>
            <p className="yx-prc-small">This test records your screen, so it can't be taken on a phone. Open the invite on a laptop; your attempt is not used up.</p>
          </Card>
        </>
      )}
      {view === 'readiness' && <SystemCheckList checks={READINESS_CHECKS.filter((c) => ['camera', 'mic', 'network', 'device'].includes(c.id))} onRetry={() => {}} />}
      {view === 'pinning' && (
        <div className="yx-prc-stack">
          <InlineAlert tone="info" title="This test needs screen pinning">Pinning keeps this app on screen until you finish. Leaving the app is flagged for a reviewer; it does not fail you.</InlineAlert>
          <ol className="yx-prc-list">
            <li>Select "Pin and start" below.</li>
            <li>Android asks to pin the app: select "Got it".</li>
            <li>Your test starts. To unpin after submitting, hold Back and Overview.</li>
          </ol>
          <Button variant="primary" fullWidth>
            Pin and start
          </Button>
        </div>
      )}
      {view === 'runner' && (
        <div className="yx-prc-stack">
          <div className="yx-prc-row" data-between>
            <span className="yx-prc-small">Q 7 of 30 · Aptitude</span>
            <strong className="yx-prc-mono">{formatClock(1712)}</strong>
          </div>
          <ConnectionStatus state="weak" />
          <p className="yx-prc-p">A dispatch van covers 180 km in 3 hours. At the same speed, how far in 5 hours?</p>
          <RadioGroup aria-label="Answer" defaultValue="c" options={[{ value: 'a', label: '240 km' }, { value: 'b', label: '270 km' }, { value: 'c', label: '300 km' }, { value: 'd', label: '360 km' }]} />
          <p className="yx-prc-row yx-prc-small yx-prc-muted">
            <Icon icon={Eye} /> Front camera on · app pinned · answers saved
          </p>
          <div className="yx-prc-row" data-between>
            <Button>Previous</Button>
            <Button variant="primary">Next</Button>
          </div>
        </div>
      )}
      {view === 'result' && (
        <Card title="Campus aptitude 2026">
          <DescriptionList items={[{ label: 'Status', value: 'Passed' }, { label: 'Band', value: 'Strong' }, { label: 'Next', value: 'Interview invite by email' }]} />
        </Card>
      )}
      {view === 'privacy' && (
        <Card title="What we keep">
          <DescriptionList items={[{ label: 'Camera stills and clips', value: 'Delete on 2 Nov 2026' }, { label: 'Answers and score', value: 'Delete on 3 Oct 2027' }]} />
          <Button variant="danger" fullWidth>
            Erase my recordings
          </Button>
        </Card>
      )}
    </PhoneFrame>
  );
}

/* ================================================================== */
/* PRC-32 · Result-reuse consent                                       */
/* ================================================================== */

type ResultReuseProps = { expired?: boolean; choice?: 'reuse' | 'retake' };

/** PRC-32; with `live` (AS-3) the candidate's real earlier result and choice. */
export function ResultReuseScreen(props: ResultReuseProps | { live: LiveReuse }) {
  return 'live' in props ? <LiveResultReuseScreen live={props.live} /> : <SampleResultReuse {...props} />;
}

function SampleResultReuse({ expired = false, choice = 'reuse' }: ResultReuseProps) {
  // PRC-32
  const [c, setC] = useState<string | undefined>(expired ? 'retake' : choice);
  const [agree, setAgree] = useState(false);
  return (
    <CandidateFrame page="My tests">
      <Title>Use your earlier result?</Title>
      <p className="yx-prc-muted">You applied for Senior Backend Developer (Chennai). This job uses the same test you took for another job.</p>
      <Card title="Java Backend Developer · L2, taken 12 Jun 2026">
        <DescriptionList items={[{ label: 'Result', value: 'Passed · band Meets' }, { label: 'Valid for other jobs until', value: '12 Dec 2026 (6 months)' }, { label: 'Retake possible from', value: '10 Sep 2026 (90-day cooldown from your first attempt)' }]} />
      </Card>
      {expired ? (
        <InlineAlert tone="info" title="This result can't be reused">It is older than 6 months. You can retake the test; your cooldown has passed.</InlineAlert>
      ) : (
        <RadioGroup
          aria-label="Your choice"
          value={c}
          onChange={setC}
          options={[
            { value: 'reuse', label: 'Use my earlier result for this job', description: 'No new test. The result is linked, not copied, and you can withdraw this until the stage is decided.' },
            { value: 'retake', label: 'Take the test again', description: 'Uses 1 of your attempts. If you retake, the latest result counts for this job only.' },
          ]}
        />
      )}
      {c === 'reuse' && !expired && <Checkbox label="I agree that Kaveri Foods may use my 12 Jun result for this job" checked={agree} onChange={setAgree} required />}
      <div className="yx-prc-row">
        <Button>Decide later</Button>
        <Button variant="primary" disabled={c === 'reuse' && !expired && !agree}>
          {c === 'reuse' && !expired ? 'Use my result' : 'Book the test'}
        </Button>
      </div>
    </CandidateFrame>
  );
}
