// Candidate-facing proctoring screens (T9 portal and full-screen runner): portal home, readiness / system check,
// accommodation request, consent, identity verification, test runner, result + appeal, privacy centre, candidate app,
// result reuse (T03–T05, T08). PRC-21 … PRC-28, PRC-31, PRC-32.
import { useState } from 'react';
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
import { ExamShell, QuestionCard, formatClock, type ExamQuestionState } from '../../components/exam';
import { PageBanner } from '../../components/notify';
import { PhoneFrame } from '../_kit/frames';
import { COMPANY } from '../_kit/data';
import { CandidateFrame } from './proctoring-shared';
import { Calculator, CameraFrame, CodeAnswer, ConnectionStatus, EvidenceFrame, IdCapture, QrPlaceholder, SystemCheckList, type ConnState, type SystemCheck } from './proctoring-kit';
import { canReschedule, withExtraTime } from './proctoring-logic';
import { READINESS_CHECKS } from './proctoring-data';

const Title = ({ children }: { children: string }) => <Heading level={1}>{children}</Heading>;

/* ================================================================== */
/* PRC-21 · Candidate portal home                                      */
/* ================================================================== */

export function CandidatePortalHomeScreen({ state = 'tests', rescheduleCount = 0, reschedule = false }: { state?: 'tests' | 'empty' | 'booking'; rescheduleCount?: number; reschedule?: boolean }) {
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
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Change your slot?" consequence={rule.ok ? `You have ${2 - rescheduleCount} changes left.` : rule.reason} confirmLabel="Choose a new slot" confirmDisabled={!rule.ok} onConfirm={() => setOpen(false)} />
    </CandidateFrame>
  );
}

/* ================================================================== */
/* PRC-22 · Readiness check (system check) + practice                  */
/* ================================================================== */

export type ReadinessState = 'running' | 'issues' | 'passed' | 'client';

export function ReadinessCheckScreen({ state = 'issues' }: { state?: ReadinessState }) {
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

export function AccommodationRequestScreen({ submitted = false, employee = false }: { submitted?: boolean; employee?: boolean }) {
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

export function ConsentScreen({ minor = false, noFace = false, keystroke = true, declined = false }: { minor?: boolean; noFace?: boolean; keystroke?: boolean; declined?: boolean }) {
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

export function IdentityCheckScreen({ step = 'id' }: { step?: IdStep }) {
  // PRC-25
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

export type RunnerView = 'mcq' | 'coding' | 'descriptive' | 'reconnecting' | 'break' | 'paused' | 'accessibility' | 'calculator' | 'finish' | 'submitted' | 'ai-allowed';

const SECTIONS = [
  { name: 'Aptitude', count: 10, state: 'done' as const, note: 'Submitted · forward only' },
  { name: 'Java', count: 20, state: 'current' as const, note: '32:10 left in section' },
  { name: 'SQL', count: 10, state: 'next' as const, note: 'Opens after Java' },
];

function makeQuestions(n: number, answered: number): ExamQuestionState[] {
  return Array.from({ length: n }, (_, i) => ({ answered: i < answered && i !== 4, markedForReview: i === 6 || i === 11 }));
}

export function TestRunnerScreen({ view = 'mcq', conn = 'online' }: { view?: RunnerView; conn?: ConnState }) {
  // PRC-26
  const [answer, setAnswer] = useState<string[]>(['b']);
  const [marked, setMarked] = useState(false);
  const [calc, setCalc] = useState(view === 'calculator');
  const [a11y, setA11y] = useState(view === 'accessibility');
  const [font, setFont] = useState<'normal' | 'large'>(view === 'accessibility' ? 'large' : 'normal');
  const [contrast, setContrast] = useState(view === 'accessibility');
  const [text, setText] = useState('I would start by grouping the deviation log by station and shift. The seal temperature drops after the 2 pm changeover suggest the heater warm-up is skipped…');
  const [code, setCode] = useState('public List<String> topK(List<String> words, int k) {\n  // your code\n}');
  const [current, setCurrent] = useState(view === 'coding' ? 13 : view === 'descriptive' ? 18 : 13);
  const connection: ConnState = view === 'reconnecting' ? 'reconnecting' : conn;

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
        question="A Stream pipeline runs only when a terminal operation is called. Which operation is lazy and returns a new stream?"
        kind="single"
        options={[
          { id: 'a', label: 'filter() is terminal' },
          { id: 'b', label: 'map() is lazy and returns a new stream' },
          { id: 'c', label: 'collect() is lazy' },
          { id: 'd', label: 'forEach() returns a stream' },
        ]}
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
        seconds={view === 'finish' ? 245 : 1930}
        saveStatus={connection === 'reconnecting' ? 'offline' : 'saved'}
        savedAt="10:41"
        questions={makeQuestions(20, 16)}
        current={current}
        onNavigate={setCurrent}
        onFinish={() => {}}
        logo={<strong>{COMPANY.shortName}</strong>}
        proctored
        defaultFinishOpen={view === 'finish'}
      >
        <div className="yx-prc-stack">
          <div className="yx-prc-runner-bar">
            <nav className="yx-prc-sections" aria-label="Sections">
              {SECTIONS.map((s) => (
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
              <Calculator onClose={() => setCalc(false)} />
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

export function ResultAppealScreen({ state = 'released' }: { state?: 'released' | 'held' | 'verdict' | 'appeal-form' | 'appeal-sent' | 'window-closed' }) {
  // PRC-27
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

export function PrivacyCentreScreen({ confirmErase = false, legalHold = false, requested = false }: { confirmErase?: boolean; legalHold?: boolean; requested?: boolean }) {
  // PRC-28
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

export function ResultReuseScreen({ expired = false, choice = 'reuse' }: { expired?: boolean; choice?: 'reuse' | 'retake' }) {
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
