// Mobile tab map (APX-D §5): first run (MOB-01), Home tab (MOB-02 + Home flows), Time and Pay tab landings, expenses.
// Flows that are TIM / PAY / PLT screen IDs are only linked from here (built by those areas).
import { useState } from 'react';
import {
  Bell,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Gift,
  Globe2,
  HandCoins,
  Landmark,
  MapPin,
  Megaphone,
  Receipt,
  Repeat,
  Search,
  Smartphone,
  Sun,
  Timer,
  Users,
  WalletCards,
} from 'lucide-react';
import { Avatar, Badge, PersonLabel } from '../../components/display';
import { Button, IconButton } from '../../components/button';
import { Checkbox, RadioGroup } from '../../components/choice';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { PageBanner } from '../../components/notify';
import { formatDate, formatINR } from '../../lib/format';
import { COMPANY, ME } from '../_kit/data';
import { PhoneFrame } from '../_kit/frames';
import { EWA_INPUT } from '../pay/pay-data';
import { EWA_STARTER, ewaAvailable } from '../pay/pay-logic';
import { BackButton, MCard, MList, MPin, MRow, MSection, Segment } from './mobile-kit';
import './settings.css';

const d = (day: number, month = 8) => new Date(2026, month, day);

/* ============================== MOB-01 · First run ============================== */

export type FirstRunStep = 'otp' | 'language' | 'notifications' | 'device' | 'install';
const FIRST_RUN: { id: FirstRunStep; label: string }[] = [
  { id: 'otp', label: 'Sign in' },
  { id: 'language', label: 'Language' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'device', label: 'This phone' },
  { id: 'install', label: 'Add to home screen' },
];

export function MobileFirstRunScreen({ step = 'otp', otpError, restricted }: { step?: FirstRunStep; otpError?: boolean; restricted?: boolean }) {
  const [lang, setLang] = useState('English');
  const idx = FIRST_RUN.findIndex((s) => s.id === step);
  return (
    <PhoneFrame tab="home" title={COMPANY.shortName} hideTabs>
      <p className="yx-m-muted">
        Step {idx + 1} of {FIRST_RUN.length} · {FIRST_RUN[idx].label}
      </p>
      {step === 'otp' && (
        <>
          <h2 className="yx-m-card__title">Sign in with your mobile number</h2>
          <FormField label="Mobile number" helper="We sent a 6-digit code to +91 98•••• 4521. It expires in 5 minutes.">
            <TextField value="98•••• 4521" prefix="+91" readOnly />
          </FormField>
          <FormField label="One-time code" required error={otpError ? 'That code did not match. Check the SMS and enter the 6 digits again.' : undefined}>
            <TextField className="yx-m-otp" inputMode="numeric" autoComplete="one-time-code" defaultValue={otpError ? '482915' : ''} placeholder="6 digits" />
          </FormField>
          <MPin>
            <Button variant="primary" fullWidth>
              Verify and continue
            </Button>
            <Button fullWidth>Resend code in 0:42</Button>
          </MPin>
        </>
      )}
      {step === 'language' && (
        <>
          <h2 className="yx-m-card__title">Choose your language</h2>
          <RadioGroup aria-label="App language" value={lang} onChange={setLang} options={['English', 'हिन्दी', 'தமிழ்', 'తెలుగు'].map((l) => ({ value: l, label: l }))} />
          <p className="yx-m-muted">You can change this later in Me › Settings.</p>
          <MPin>
            <Button variant="primary" fullWidth>
              Continue
            </Button>
          </MPin>
        </>
      )}
      {step === 'notifications' && (
        <>
          <h2 className="yx-m-card__title">Get told when something needs you</h2>
          <MList>
            <MRow nav={false} icon={CheckCircle2} title="Approvals and replies" sub="Your leave and requests" />
            <MRow nav={false} icon={Megaphone} title="Announcements to acknowledge" />
            <MRow nav={false} icon={WalletCards} title="Payslip published" />
          </MList>
          <p className="yx-m-muted">Quiet hours 10:00 pm to 7:00 am are on. Nothing else is sent at night.</p>
          <MPin>
            <Button variant="primary" fullWidth icon={Bell}>
              Allow notifications
            </Button>
            <Button fullWidth>Not now</Button>
          </MPin>
        </>
      )}
      {step === 'device' && (
        <>
          <h2 className="yx-m-card__title">Use this phone for check-in</h2>
          {restricted ? (
            <InlineAlert tone="warning" title="Your company links check-in to one phone">
              Plant staff at Hosur check in only from their linked phone. If you change phones, ask HR to move the link.
            </InlineAlert>
          ) : (
            <p>Linking this phone lets you check in with your location. You can unlink it in Me › Settings › Devices.</p>
          )}
          <MCard>
            <MRow nav={false} icon={Smartphone} title="This phone" sub="Android 15 · added 29 Sep 2026" />
          </MCard>
          <MPin>
            <Button variant="primary" fullWidth>
              Link this phone
            </Button>
            {!restricted && <Button fullWidth>Skip for now</Button>}
          </MPin>
        </>
      )}
      {step === 'install' && (
        <>
          <h2 className="yx-m-card__title">You're all set, {ME.name.split(' ')[0]}</h2>
          <p>Add {COMPANY.shortName} to your home screen to open it like an app.</p>
          <MPin>
            <Button variant="primary" fullWidth>
              Add to home screen
            </Button>
            <Button fullWidth>Go to Home</Button>
          </MPin>
        </>
      )}
    </PhoneFrame>
  );
}

/* ============================== MOB-02 · Home ============================== */

export interface TodoItem {
  id: string;
  title: string;
  sub: string;
  due?: string;
  kind: 'approval' | 'review' | 'proof' | 'task' | 'policy';
}

export const TODOS: TodoItem[] = [
  { id: 't1', title: 'Approve leave · Arjun Kulkarni', sub: '2 days casual leave, 1–2 Oct', due: 'Due today', kind: 'approval' },
  { id: 't2', title: 'Acknowledge POSH policy v3', sub: 'Updated 22 Sep 2026', due: 'Due 30 Sep', kind: 'policy' },
  { id: 't3', title: 'Upload rent receipts', sub: 'Tax proofs for FY 2026–27', due: 'Due 15 Oct', kind: 'proof' },
  { id: 't4', title: 'Self-review · H1 2026', sub: 'Performance cycle', due: 'Due 10 Oct', kind: 'review' },
];

export const TEAM_TODAY = [
  { name: 'Arjun Kulkarni', status: 'In · 9:12 am', tone: 'success' as const },
  { name: 'Sana Nizami', status: 'Late · 10:05 am', tone: 'warning' as const },
  { name: 'Prakash Menon', status: 'On leave', tone: 'neutral' as const },
  { name: 'Thomas George', status: 'Missing punch', tone: 'danger' as const },
  { name: 'Kavya Reddy', status: 'Work from home', tone: 'info' as const },
];

export interface MobileHomeProps {
  manager?: boolean;
  defaultSegment?: 'me' | 'team';
  todos?: TodoItem[];
  checkedIn?: boolean;
  state?: 'ready' | 'loading' | 'error' | 'offline';
}

export function MobileHomeScreen({ manager, defaultSegment = 'me', todos = TODOS, checkedIn, state = 'ready' }: MobileHomeProps) {
  const [seg, setSeg] = useState<'me' | 'team'>(defaultSegment);
  return (
    <PhoneFrame tab="home" title={`Good morning, ${ME.name.split(' ')[0]}`} actions={<IconButton icon={Search} label="Search records and actions" />}>
      {state === 'offline' && <PageBanner tone="warning">You're offline. Check-in and requests are saved and sent when you reconnect.</PageBanner>}
      {manager && <Segment label="Show" value={seg} onChange={setSeg} options={[{ value: 'me', label: 'Me' }, { value: 'team', label: 'Team' }]} />}
      {state === 'loading' && (
        <div role="status" aria-busy="true" aria-label="Loading home" className="yx-m-actions">
          <Skeleton height={120} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      )}
      {state === 'error' && <ErrorState title="We couldn't load your home." description="Pull down to retry. Your check-in still works." onRetry={() => {}} reference="MOB-2C81" />}
      {(state === 'ready' || state === 'offline') && seg === 'me' && (
        <>
          <MCard title="Today · Tue 29 Sep" end={<Badge tone={checkedIn ? 'success' : 'neutral'}>{checkedIn ? 'Checked in 9:28 am' : 'Not checked in'}</Badge>}>
            <p className="yx-m-muted">General shift · 9:30 am – 6:30 pm · Chennai office</p>
            <Button variant="primary" fullWidth icon={MapPin}>
              {checkedIn ? 'Check out' : 'Check in'}
            </Button>
            <p className="yx-m-muted">Check-in sheet: TIM-12</p>
          </MCard>
          <MSection title={`To do (${todos.length})`}>
            {todos.length ? (
              <MList label="To do">
                {todos.map((t) => (
                  <MRow key={t.id} title={t.title} sub={t.sub} end={t.due && <Badge tone={t.due === 'Due today' ? 'warning' : 'neutral'}>{t.due}</Badge>} />
                ))}
              </MList>
            ) : (
              <EmptyState compact title="Nothing to do right now." description="Approvals, proofs and acknowledgements appear here when they are due." />
            )}
          </MSection>
          <MSection title="Announcement">
            <MCard title="Deepavali shutdown at Hosur plant" end={<Badge tone="warning">Acknowledge</Badge>}>
              <p className="yx-m-muted">Plant closed 7–9 Nov. Posted by Fatima Shaikh, 28 Sep.</p>
              <Button fullWidth>Read and acknowledge</Button>
            </MCard>
          </MSection>
          <MSection title="Celebrations">
            <div className="yx-m-strip">
              {[
                ['Meera Iyer', 'Birthday'],
                ['Imran Qureshi', '5 years'],
                ['Kavya Reddy', 'Birthday'],
                ['Rohit Bhat', 'Joined today'],
              ].map(([n, w]) => (
                <div key={n}>
                  <Avatar name={n} size={40} />
                  <span>{n.split(' ')[0]}</span>
                  <span className="yx-m-muted">{w}</span>
                </div>
              ))}
            </div>
            <div className="yx-m-grid2">
              <Button icon={Gift}>Give kudos</Button>
              <Button>Take pulse survey</Button>
            </div>
          </MSection>
          <MSection title="Quick actions">
            <div className="yx-m-grid2">
              <Button icon={CalendarDays}>Apply leave</Button>
              <Button icon={Receipt}>Add expense</Button>
              <Button icon={WalletCards}>Latest payslip</Button>
              <Button icon={Clock}>Fix attendance</Button>
            </div>
          </MSection>
        </>
      )}
      {(state === 'ready' || state === 'offline') && seg === 'team' && <TeamSegment />}
    </PhoneFrame>
  );
}

function TeamSegment() {
  return (
    <>
      <MCard title="Team today · 5 people">
        <div className="yx-m-grid2">
          <p className="yx-m-muted">2 in · 1 late</p>
          <p className="yx-m-muted">1 on leave · 1 missing</p>
        </div>
      </MCard>
      <MSection title="Exceptions">
        <MList label="Team exceptions">
          {TEAM_TODAY.filter((p) => p.tone === 'warning' || p.tone === 'danger').map((p) => (
            <MRow key={p.name} lead={<Avatar name={p.name} size={32} />} title={p.name} sub={p.status} nav={false} end={<Button size="sm">Nudge</Button>} />
          ))}
        </MList>
      </MSection>
      <MSection title="Everyone">
        <MList label="Team">
          {TEAM_TODAY.map((p) => (
            <MRow key={p.name} lead={<Avatar name={p.name} size={32} />} title={p.name} end={<Badge tone={p.tone}>{p.status}</Badge>} />
          ))}
        </MList>
      </MSection>
      <Button fullWidth icon={CalendarDays}>
        Team calendar
      </Button>
    </>
  );
}

/** Home › Team › member profile (M04 Q5): only what the manager's grant reaches. */
export function MobileTeamMemberScreen() {
  return (
    <PhoneFrame tab="home" title="Sana Nizami" back={<BackButton />}>
      <PersonLabel name="Sana Nizami" secondary="Quality Inspector · Quality · Chennai office" size={40} />
      <MCard title="Today" end={<Badge tone="warning">Late 35 min</Badge>}>
        <p className="yx-m-muted">Checked in 10:05 am · General shift 9:30 am</p>
      </MCard>
      <MList label="Sana's details">
        <MRow icon={CalendarDays} title="Leave balance" sub="Casual 4 · Earned 11.5 · Sick 6" />
        <MRow icon={Clock} title="Attendance this month" sub="18 present · 2 late · 1 missing punch" />
        <MRow icon={FileText} title="Goals" sub="3 goals · 62% average progress" />
      </MList>
      <p className="yx-m-muted">Salary and personal details are not shown to managers (P02 Q3).</p>
      <MPin>
        <Button fullWidth>Send a nudge</Button>
      </MPin>
    </PhoneFrame>
  );
}

/** Home › To-dos, full list with filter chips. */
export function MobileTodosScreen({ todos = TODOS }: { todos?: TodoItem[] }) {
  const [kind, setKind] = useState<'all' | TodoItem['kind']>('all');
  const shown = todos.filter((t) => kind === 'all' || t.kind === kind);
  return (
    <PhoneFrame tab="home" title="To do" back={<BackButton />}>
      <div className="yx-m-strip" role="group" aria-label="Filter to-dos">
        {(['all', 'approval', 'policy', 'proof', 'review'] as const).map((k) => (
          <Button key={k} size="sm" variant={k === kind ? 'primary' : 'secondary'} onClick={() => setKind(k)} aria-pressed={k === kind}>
            {k === 'all' ? 'All' : k === 'approval' ? 'Approvals' : k === 'policy' ? 'Policies' : k === 'proof' ? 'Proofs' : 'Reviews'}
          </Button>
        ))}
      </div>
      {shown.length ? (
        <MList label="To do">
          {shown.map((t) => (
            <MRow key={t.id} title={t.title} sub={t.sub} end={t.due} />
          ))}
        </MList>
      ) : (
        <EmptyState compact title="No to-dos of this type." action={<Button onClick={() => setKind('all')}>Show all</Button>} />
      )}
    </PhoneFrame>
  );
}

/** Home › Announcement with acknowledgement (P04 Q8). */
export function MobileAnnouncementScreen({ acknowledged }: { acknowledged?: boolean }) {
  const [read, setRead] = useState(Boolean(acknowledged));
  const [done, setDone] = useState(Boolean(acknowledged));
  return (
    <PhoneFrame tab="home" title="Announcement" back={<BackButton />}>
      <Badge tone="info">Hosur plant · Operations</Badge>
      <h2 className="yx-m-card__title">Deepavali shutdown at Hosur plant</h2>
      <p className="yx-m-muted">Fatima Shaikh · Internal Communications · 28 Sep 2026</p>
      <p>The plant is closed from 7 Nov to 9 Nov 2026 for Deepavali and annual maintenance. Shifts resume with Plant A at 6:00 am on 10 Nov. Maintenance staff on the standby roster get a separate notice.</p>
      {done ? (
        <InlineAlert tone="success" title="Acknowledged on 29 Sep 2026, 9:40 am" />
      ) : (
        <MPin>
          <Checkbox checked={read} onChange={setRead} label="I have read and understood this announcement" />
          <Button variant="primary" fullWidth disabled={!read} onClick={() => setDone(true)}>
            Acknowledge
          </Button>
          <p className="yx-m-muted">Reminder in 2 days if not acknowledged.</p>
        </MPin>
      )}
    </PhoneFrame>
  );
}

/** Home › Give kudos (quick, from the celebrations strip). */
export function MobileKudosScreen({ sent }: { sent?: boolean }) {
  return (
    <PhoneFrame tab="home" title="Give kudos" back={<BackButton />}>
      {sent ? (
        <InlineAlert tone="success" title="Kudos sent to Meera Iyer">
          It shows on the recognition wall. 20 points added from your monthly budget (80 left).
        </InlineAlert>
      ) : (
        <>
          <FormField label="To" required>
            <TextField defaultValue="Meera Iyer" />
          </FormField>
          <FormField label="Value">
            <RadioGroup aria-label="Company value" defaultValue="Ownership" options={['Customer first', 'Ownership', 'Do it right'].map((v) => ({ value: v, label: v }))} />
          </FormField>
          <FormField label="Message" required helper="Visible to the whole company.">
            <TextArea defaultValue="Thanks for closing the Q2 audit a week early." rows={3} />
          </FormField>
          <p className="yx-m-muted">Points: 20 of your 100 this month</p>
          <MPin>
            <Button variant="primary" fullWidth>
              Send kudos
            </Button>
          </MPin>
        </>
      )}
    </PhoneFrame>
  );
}

/* ============================== Time tab landing ============================== */

/** Time tab: every flow lives in a TIM screen; this landing only routes to them. */
export function MobileTimeTabScreen({ longLeave }: { longLeave?: boolean }) {
  return (
    <PhoneFrame tab="time" title="Time">
      {longLeave && (
        <InlineAlert tone="info" title="On maternity leave until 4 Jan 2027">
          Paid leave · 26 weeks. Status and pay effect: TIM-25.
        </InlineAlert>
      )}
      <MCard title="Today" end={<Badge tone="success">Checked in 9:28 am</Badge>}>
        <Button variant="primary" fullWidth icon={MapPin}>
          Check out
        </Button>
      </MCard>
      <MSection title="Attendance">
        <MList label="Attendance">
          <MRow icon={CalendarDays} title="My attendance" sub="2 late · 1 missing punch this month" end={<Badge tone="danger">Fix 1</Badge>} />
          <MRow icon={Repeat} title="Regularise, WFH, on-duty, OT" />
          <MRow icon={Clock} title="My shifts and swaps" sub="Next: General, Wed 30 Sep" />
          <MRow icon={Timer} title="Timesheets" sub="Week of 28 Sep · 16 of 40 hours" />
          <MRow icon={MapPin} title="Field visits" sub="Beat plan: 4 visits today" />
          <MRow icon={Users} title="Open shifts" sub="3 shifts you can claim" />
        </MList>
      </MSection>
      <MSection title="Leave">
        <MCard>
          <div className="yx-m-grid2">
            <div>
              <span className="yx-m-big">11.5</span>
              <p className="yx-m-muted">Earned leave</p>
            </div>
            <div>
              <span className="yx-m-big">4</span>
              <p className="yx-m-muted">Casual leave</p>
            </div>
            <div>
              <span className="yx-m-big">6</span>
              <p className="yx-m-muted">Sick leave</p>
            </div>
            <div>
              <span className="yx-m-big">2</span>
              <p className="yx-m-muted">Unpaid leave taken</p>
            </div>
          </div>
          <Button variant="secondary" fullWidth icon={CalendarDays}>
            Apply leave
          </Button>
        </MCard>
        <MList label="Leave">
          <MRow icon={Sun} title="Comp-off claim" sub="1 day available to claim" />
          <MRow icon={Gift} title="Optional holidays" sub="Choose 2 of 6 · 1 chosen" />
        </MList>
      </MSection>
      <p className="yx-m-muted">Built as TIM-03, 07, 08, 12, 15, 17, 18, 21, 22, 23, 25, 33, 35.</p>
    </PhoneFrame>
  );
}

/* ============================== Pay tab landing + expenses ============================== */

export function MobilePayTabScreen({ ewa = true }: { ewa?: boolean }) {
  return (
    <PhoneFrame tab="pay" title="Pay">
      <MCard title="September 2026 payslip" end={<Badge tone="success">Published</Badge>}>
        <span className="yx-m-big">{formatINR(84250)}</span>
        <p className="yx-m-muted">Net pay · credited 30 Sep to Cauvery Co-operative Bank ••4521</p>
        <Button fullWidth>View payslip</Button>
      </MCard>
      <MList label="Pay">
        <MRow icon={FileText} title="Payslips and YTD" sub="Raise a query from any payslip" />
        <MRow icon={Landmark} title="Tax" sub="New regime · 3 proofs pending · Form 16" />
        <MRow icon={HandCoins} title="Loans and salary advances" sub="1 active · ₹6,500 EMI" />
        <MRow icon={Receipt} title="Expenses, trips and advances" sub="2 claims in review" />
        {ewa && <MRow icon={WalletCards} title="Earned wage access" sub={`Up to ${formatINR(ewaAvailable(EWA_STARTER, EWA_INPUT).available)} available now`} />}
      </MList>
      <p className="yx-m-muted">Built as PAY-18, 21, 22, 26 and EXP-02, 04, 05.</p>
    </PhoneFrame>
  );
}

export interface ClaimRow {
  id: string;
  title: string;
  amount: number;
  date: Date;
  status: 'Draft' | 'In review' | 'Approved' | 'Paid' | 'Sent back';
}

export const CLAIMS: ClaimRow[] = [
  { id: 'c1', title: 'Client visit · Hosur plant', amount: 2340, date: d(24), status: 'In review' },
  { id: 'c2', title: 'Team lunch · audit close', amount: 4800, date: d(19), status: 'Sent back' },
  { id: 'c3', title: 'Cab to airport', amount: 1150, date: d(8), status: 'Paid' },
  { id: 'c4', title: 'Mobile bill · August', amount: 799, date: d(3), status: 'Approved' },
];
const CLAIM_TONE = { Draft: 'neutral', 'In review': 'info', Approved: 'success', Paid: 'success', 'Sent back': 'warning' } as const;

/** Pay › Expenses (camera-first claims). The claim composer itself is EXP-02. */
export function MobileExpensesScreen({ claims = CLAIMS }: { claims?: ClaimRow[] }) {
  return (
    <PhoneFrame tab="pay" title="Expenses" back={<BackButton />}>
      <MPin>
        <Button variant="primary" fullWidth icon={Camera}>
          Snap a receipt
        </Button>
      </MPin>
      {claims.length ? (
        <MList label="My claims">
          {claims.map((c) => (
            <MRow key={c.id} title={c.title} sub={`${formatDate(c.date)} · ${formatINR(c.amount)}`} end={<Badge tone={CLAIM_TONE[c.status]}>{c.status}</Badge>} />
          ))}
        </MList>
      ) : (
        <EmptyState compact title="No expense claims yet." description="Take a photo of a receipt and we fill in the amount, date and GST for you." />
      )}
      <MList label="More">
        <MRow icon={Globe2} title="Trips" sub="1 upcoming · Pune, 12–14 Oct" />
        <MRow icon={HandCoins} title="Advances" sub={`${formatINR(5000)} to settle by 20 Oct`} />
      </MList>
    </PhoneFrame>
  );
}

