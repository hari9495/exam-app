// Mobile tab map (APX-D §5): Requests tab and Me tab flows, Me › More, and MOB-03 settings & security.
// Request sheet (PLT-05), My requests (PLT-06), approvals inbox (PLT-04) and delegation (PLT-07) are PLT screens, linked only.
import { useState } from 'react';
import {
  Award,
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  DoorOpen,
  Eye,
  FileText,
  FolderKanban,
  HardHat,
  Headphones,
  KeyRound,
  Languages,
  LifeBuoy,
  LogOut,
  Megaphone,
  MessagesSquare,
  Monitor,
  Package,
  ScrollText,
  ShieldAlert,
  Smartphone,
  Target,
  UserRound,
  Users,
} from 'lucide-react';
import { Avatar, Badge, PersonLabel } from '../../components/display';
import { Button } from '../../components/button';
import { Checkbox, RadioGroup } from '../../components/choice';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { TimesheetApprovalCard } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { formatINR } from '../../lib/format';
import { ME } from '../_kit/data';
import { PhoneFrame } from '../_kit/frames';
import { BackButton, MCard, MList, MPin, MRow, MSection, Segment } from './mobile-kit';
import './settings.css';

/* ============================== Requests tab ============================== */

export function MobileRequestsTabScreen({ defaultSegment = 'mine', manager = true }: { defaultSegment?: 'mine' | 'team'; manager?: boolean }) {
  const [seg, setSeg] = useState(defaultSegment);
  return (
    <PhoneFrame tab="requests" title="Requests">
      <MPin>
        <Button variant="primary" fullWidth>
          New request
        </Button>
      </MPin>
      {manager && <Segment label="Show" value={seg} onChange={setSeg} options={[{ value: 'mine', label: 'Mine' }, { value: 'team', label: 'Team · 3' }]} />}
      {seg === 'mine' ? (
        <MList label="My requests">
          <MRow title="Casual leave · 1–2 Oct" sub="With Karthik Subramanian since 27 Sep" end={<Badge tone="info">Pending</Badge>} />
          <MRow title="Uniform request · Safety shoes" sub="Raised on your behalf by Ravi Menon" end={<Badge tone="info">Pending</Badge>} />
          <MRow title="Address change" sub="Approved 21 Sep" end={<Badge tone="success">Approved</Badge>} />
        </MList>
      ) : (
        <MList label="Waiting for you">
          <MRow title="Probation review · Rohit Bhat" sub="Probation ends 5 Oct" end={<Badge tone="warning">Due in 6 days</Badge>} />
          <MRow title="Timesheets · Quality automation" sub="4 people · week of 21 Sep" end={<Badge tone="info">32 h</Badge>} />
          <MRow title="Leave · Arjun Kulkarni" sub="2 days casual leave" end={<Badge tone="warning">Due today</Badge>} />
        </MList>
      )}
      <p className="yx-m-muted">Request sheet PLT-05, my requests PLT-06, approvals inbox PLT-04.</p>
    </PhoneFrame>
  );
}

/** Requests › New request › type picker with company-defined (custom) types (P18, B20). */
export function MobileRequestTypePickerScreen() {
  return (
    <PhoneFrame tab="requests" title="New request" back={<BackButton />}>
      <MSection title="Common">
        <MList>
          <MRow icon={CalendarDays} title="Leave" />
          <MRow icon={ClipboardCheck} title="Attendance fix, WFH, on-duty" />
          <MRow icon={FileText} title="Letter or certificate" />
        </MList>
      </MSection>
      <MSection title="Kaveri Foods requests">
        <MList>
          <MRow icon={Package} title="Uniform request" sub="Custom type · Hosur plant" />
          <MRow icon={HardHat} title="Safety incident near-miss" sub="Custom type · all locations" />
          <MRow icon={Monitor} title="Laptop accessory" sub="Custom type · desk staff" />
        </MList>
      </MSection>
      <MSection title="Money and help">
        <MList>
          <MRow icon={FileText} title="Expense or trip" />
          <MRow icon={FileText} title="Loan or salary advance" />
          <MRow icon={LifeBuoy} title="Ask HR (helpdesk)" />
          <MRow icon={BookOpen} title="Training" />
          <MRow icon={DoorOpen} title="Resignation" />
        </MList>
      </MSection>
    </PhoneFrame>
  );
}

/** Custom request type form (mobile-enabled layout from the form builder, PLT-23). */
export function MobileCustomRequestScreen({ sent }: { sent?: boolean }) {
  const [size, setSize] = useState<string | null>('8');
  return (
    <PhoneFrame tab="requests" title="Uniform request" back={<BackButton />}>
      {sent ? (
        <InlineAlert tone="success" title="Request sent to Stores, Hosur plant">
          You'll get a notification when the uniform is ready to collect. Track it in Requests › Mine.
        </InlineAlert>
      ) : (
        <>
          <FormField label="Item" required>
            <RadioGroup aria-label="Item" defaultValue="Safety shoes" options={['Safety shoes', 'Coverall', 'Hair net pack'].map((v) => ({ value: v, label: v }))} />
          </FormField>
          <FormField label="Size (UK)" required>
            <Select value={size} onChange={setSize} options={['6', '7', '8', '9', '10'].map((v) => ({ value: v, label: v }))} />
          </FormField>
          <FormField label="Reason" optional>
            <TextArea rows={2} defaultValue="Sole worn out" />
          </FormField>
          <MCard title="What happens next">
            <p className="yx-m-muted">Goes to Stores, Hosur plant. One pair of shoes a year is free; this is your first this year.</p>
          </MCard>
          <MPin>
            <Button variant="primary" fullWidth>
              Send request
            </Button>
          </MPin>
        </>
      )}
    </PhoneFrame>
  );
}

/** Requests › Team › Probation review form (manager, M01 §3.4). */
export function MobileProbationReviewScreen({ decision = 'confirm', errors }: { decision?: 'confirm' | 'extend' | 'terminate'; errors?: boolean }) {
  const [value, setValue] = useState(decision);
  return (
    <PhoneFrame tab="requests" title="Probation review" back={<BackButton />}>
      <PersonLabel name="Rohit Bhat" secondary="Quality Inspector · joined 5 Apr 2026" size={40} />
      <MCard title="Probation ends 5 Oct 2026" end={<Badge tone="warning">Due in 6 days</Badge>}>
        <p className="yx-m-muted">6 months · 2 goals met · attendance 97%</p>
      </MCard>
      <FormField label="Your decision" required>
        <RadioGroup
          aria-label="Your decision"
          value={value}
          onChange={(v) => setValue(v as typeof value)}
          options={[
            { value: 'confirm', label: 'Confirm', description: 'Confirmation letter goes out after HR approves.' },
            { value: 'extend', label: 'Extend probation', description: 'Up to 3 more months (company limit).' },
            { value: 'terminate', label: 'Do not confirm', description: 'HR contacts you before anything is shared.' },
          ]}
        />
      </FormField>
      {value === 'extend' && (
        <FormField label="Extend by" required>
          <Select value="2" onChange={() => {}} options={['1', '2', '3'].map((m) => ({ value: m, label: `${m} months` }))} />
        </FormField>
      )}
      <FormField label="Comments for HR" required={value !== 'confirm'} error={errors ? 'Add a reason. HR needs it before the decision can go ahead.' : undefined}>
        <TextArea rows={3} defaultValue={errors ? '' : 'Consistent inspection quality; ready for line audits.'} />
      </FormField>
      <MPin>
        <Button variant="primary" fullWidth>
          Send to HR
        </Button>
      </MPin>
    </PhoneFrame>
  );
}

/** Requests › Team › Timesheet approvals for project managers (M12). */
export function MobileTimesheetApprovalsScreen({ empty }: { empty?: boolean }) {
  return (
    <PhoneFrame tab="requests" title="Timesheets" back={<BackButton />}>
      {empty ? (
        <EmptyState compact title="No timesheets waiting." description="Submitted weeks for your projects appear here." />
      ) : (
        <>
          <p className="yx-m-muted">Quality automation · 4 people · week of 21 Sep 2026</p>
          <TimesheetApprovalCard
            employee={{ name: 'Sana Nizami', secondary: 'Quality Inspector' }}
            weekLabel="Week of 21 Sep 2026"
            lines={[
              { id: 'l1', project: 'Quality automation', task: 'Line sensor tests', hours: 22, billable: true },
              { id: 'l2', project: 'Quality automation', task: 'Supplier audit', hours: 12, billable: true },
              { id: 'l3', project: 'Internal', task: 'Training', hours: 6 },
            ]}
            onApprove={() => {}}
            onSendBack={() => {}}
          />
        </>
      )}
    </PhoneFrame>
  );
}

/* ============================== Me tab ============================== */

export function MobileMeTabScreen({ servingNotice, hasVisitors = true }: { servingNotice?: boolean; hasVisitors?: boolean }) {
  return (
    <PhoneFrame tab="me" title="Me">
      <PersonLabel name={ME.name} secondary={`${ME.code} · ${ME.role} · ${ME.location}`} size={40} />
      {servingNotice && (
        <MCard title="Your exit · last day 30 Oct 2026" end={<Badge tone="warning">3 steps left</Badge>}>
          <Button fullWidth>Open my exit</Button>
        </MCard>
      )}
      <MList label="About me">
        <MRow icon={UserRound} title="Profile" sub="1 change waiting for approval" />
        <MRow icon={FileText} title="Documents and letters" />
        <MRow icon={ScrollText} title="Policies" end={<Badge tone="warning">1 to acknowledge</Badge>} />
      </MList>
      <MList label="Growth">
        <MRow icon={Target} title="Goals, feedback and 1:1s" sub="Self-review due 10 Oct" />
        <MRow icon={BookOpen} title="Learning and my tests" sub="1 test assigned" />
        <MRow icon={Briefcase} title="Internal jobs and referrals" />
        <MRow icon={Award} title="Rewards" sub="340 points" />
      </MList>
      <MList label="Help">
        <MRow icon={LifeBuoy} title="Help centre and my tickets" />
        <MRow icon={ShieldAlert} title="Speak up" sub="Grievance, POSH or ethics concern" />
      </MList>
      <MList label="Settings">
        {hasVisitors && <MRow icon={DoorOpen} title="My visitors" sub="1 expected today" />}
        <MRow icon={Monitor} title="Attendance presence" sub="Desktop agent consent" />
        <MRow icon={Users} title="Delegation" sub="Off" />
        <MRow icon={Eye} title="Privacy" sub="My data, who accessed my data" />
        <MRow icon={KeyRound} title="Settings and security" />
        <MRow icon={LifeBuoy} title="Help and tours" />
        <MRow icon={FolderKanban} title="More" sub="People, Helpdesk, Engage and other areas" />
      </MList>
    </PhoneFrame>
  );
}

/** Me › More: rail areas that have no tab, filtered to the person's grants. */
export function MobileMoreScreen() {
  return (
    <PhoneFrame tab="me" title="More" back={<BackButton />}>
      <MList label="Areas">
        <MRow icon={Users} title="People directory" />
        <MRow icon={MessagesSquare} title="Engage" sub="Feed, surveys, recognition" />
        <MRow icon={Headphones} title="Helpdesk" />
        <MRow icon={Target} title="Performance" />
        <MRow icon={BookOpen} title="Learning" />
        <MRow icon={FolderKanban} title="Projects" />
        <MRow icon={Megaphone} title="Announcements" />
      </MList>
      <p className="yx-m-muted">Only areas your role can open are listed. Admin screens open read-only on phones.</p>
    </PhoneFrame>
  );
}

/** Me › Profile and change requests (profile change sheet is PPL-32). */
export function MobileProfileScreen({ pending = true }: { pending?: boolean }) {
  return (
    <PhoneFrame tab="me" title="Profile" back={<BackButton />}>
      <PersonLabel name={ME.name} secondary={`${ME.role} · ${ME.department}`} size={64} />
      {pending && (
        <InlineAlert tone="info" title="Bank account change waiting for approval">
          Sent 27 Sep to Lakshmi Venkatesan. Pay goes to your current account until approved.
        </InlineAlert>
      )}
      <MList label="Details">
        <MRow title="Personal" sub="Name, date of birth, address" />
        <MRow title="Contact" sub="+91 98•••• 4521 · divya.r@kaverifoods.in" />
        <MRow title="Bank" sub="Cauvery Co-operative Bank ••4521" />
        <MRow title="Family and nominees" sub="3 people" />
        <MRow title="Emergency contact" sub="Ramesh Raghunathan" />
        <MRow title="Job" sub={`Reports to ${ME.manager}`} nav={false} />
      </MList>
    </PhoneFrame>
  );
}

/** Me › Documents, letters, certificates (full list is PPL-30). */
export function MobileDocumentsScreen() {
  return (
    <PhoneFrame tab="me" title="Documents" back={<BackButton />}>
      <MPin>
        <Button variant="primary" fullWidth>
          Get a letter
        </Button>
      </MPin>
      <MList label="Letters">
        <MRow icon={FileText} title="Employment certificate" sub="Issued 12 Sep 2026 · QR verified" />
        <MRow icon={FileText} title="Appointment letter" sub="5 Apr 2019" />
        <MRow icon={FileText} title="Form 16 · FY 2025–26" sub="15 Jun 2026" />
      </MList>
      <MList label="My uploads">
        <MRow icon={FileText} title="PAN card" end={<Badge tone="success">Verified</Badge>} />
        <MRow icon={FileText} title="Passport" end={<Badge tone="warning">Expires 2 Nov 2026</Badge>} />
      </MList>
    </PhoneFrame>
  );
}

/** Me › Policies and acknowledgement (click or OTP, M08 Q6). */
export function MobilePolicyAckScreen({ method = 'click', done }: { method?: 'click' | 'otp'; done?: boolean }) {
  const [read, setRead] = useState(false);
  return (
    <PhoneFrame tab="me" title="POSH policy v3" back={<BackButton />}>
      <Badge tone="warning">Acknowledge by 30 Sep 2026</Badge>
      <p className="yx-m-muted">Major version: everyone acknowledges again. 6 min read.</p>
      <MCard title="What changed">
        <p className="yx-m-muted">New Internal Committee members for Hosur plant; complaints can now be filed from the app.</p>
      </MCard>
      <Button fullWidth icon={FileText}>
        Read full policy
      </Button>
      {done ? (
        <InlineAlert tone="success" title="Acknowledged on 29 Sep 2026" />
      ) : (
        <MPin>
          <Checkbox checked={read} onChange={setRead} label="I have read and understood this policy" />
          {method === 'otp' && (
            <FormField label="Code sent to +91 98•••• 4521" required>
              <TextField inputMode="numeric" className="yx-m-otp" placeholder="6 digits" />
            </FormField>
          )}
          <Button variant="primary" fullWidth disabled={!read}>
            Acknowledge
          </Button>
        </MPin>
      )}
    </PhoneFrame>
  );
}

/** Me › Goals, check-ins, quick feedback, 1:1s, review acknowledgement, PIP acknowledgement (M06). */
export function MobileGrowthScreen({ pip }: { pip?: boolean }) {
  return (
    <PhoneFrame tab="me" title="Goals and reviews" back={<BackButton />}>
      {pip && (
        <MCard title="Performance improvement plan" end={<Badge tone="warning">Acknowledge</Badge>}>
          <p className="yx-m-muted">60 days from 1 Oct 2026 with Karthik Subramanian. Acknowledging means you have read it, not that you agree.</p>
          <Button fullWidth>Read and acknowledge</Button>
        </MCard>
      )}
      <MCard title="H1 2026 review" end={<Badge tone="info">Self-review due 10 Oct</Badge>}>
        <Button fullWidth>Start self-review</Button>
      </MCard>
      <MSection title="Goals">
        {[
          ['Cut line rejection rate to 1.5%', 72],
          ['Automate 3 inspection checks', 40],
          ['Train 4 new inspectors', 75],
        ].map(([g, v]) => (
          <MCard key={g as string} title={g}>
            <Meter value={v as number} max={100} label={`${g} progress`} />
            <Button size="sm">Check in</Button>
          </MCard>
        ))}
      </MSection>
      <MList label="Conversations">
        <MRow title="1:1 with Karthik Subramanian" sub="Thu 1 Oct · 3 agenda items" />
        <MRow title="Quick feedback" sub="2 received this month" />
      </MList>
    </PhoneFrame>
  );
}

/** Me › Learning, My tests, skills (M07, T03 D2). */
export function MobileLearningScreen() {
  return (
    <PhoneFrame tab="me" title="Learning" back={<BackButton />}>
      <MCard title="Food safety refresher" end={<Badge tone="warning">Due 15 Oct</Badge>}>
        <Meter value={3} max={5} label="Modules done" valueText="3 of 5 modules" />
        <Button fullWidth>Continue</Button>
      </MCard>
      <MSection title="My tests">
        <MList>
          <MRow title="HACCP level 2 assessment" sub="Opens 5 Oct, 10:00 am · 45 min · proctored" end={<Badge tone="info">Assigned</Badge>} />
          <MRow title="Excel for inspectors" sub="Scored 82% · 12 Sep" end={<Badge tone="success">Passed</Badge>} />
        </MList>
      </MSection>
      <MList label="Skills">
        <MRow title="Skills" sub="2 suggestions to confirm" />
        <MRow title="Catalogue" sub="46 courses" />
      </MList>
    </PhoneFrame>
  );
}

/** Me › Help centre and my tickets (M08). */
export function MobileHelpTicketsScreen({ empty }: { empty?: boolean }) {
  return (
    <PhoneFrame tab="me" title="Help centre" back={<BackButton />}>
      <FormField label="Search help" hideLabel>
        <TextField type="search" placeholder="Search help, e.g. change bank account" />
      </FormField>
      <MSection title="My tickets">
        {empty ? (
          <EmptyState compact title="No tickets yet." description="Ask HR anything; most answers come within one working day." />
        ) : (
          <MList>
            <MRow title="Form 16 shows old address" sub="HR-2381 · reply due by 1 Oct, 5:00 pm" end={<Badge tone="info">In progress</Badge>} />
            <MRow title="Canteen card not working" sub="HR-2290 · closed 18 Sep" end={<Badge tone="success">Resolved</Badge>} />
          </MList>
        )}
      </MSection>
      <MPin>
        <Button variant="primary" fullWidth>
          Ask HR
        </Button>
      </MPin>
    </PhoneFrame>
  );
}

/** Me › Speak up: grievance / POSH / whistleblower, my cases, show-cause reply (M08). */
export function MobileSpeakUpScreen({ anonymousDone }: { anonymousDone?: boolean }) {
  const [kind, setKind] = useState('grievance');
  const [anon, setAnon] = useState(true);
  if (anonymousDone)
    return (
      <PhoneFrame tab="me" title="Report sent" back={<BackButton />} hideTabs>
        <InlineAlert tone="success" title="Your report was sent to the ethics desk" />
        <p>Save this access code. It's the only way to see replies, and we can't show it again.</p>
        <p className="yx-m-code"><span className="yx-visually-hidden">Access code: </span>KF7-Q2M-84XT</p>
        <MPin>
          <Button variant="primary" fullWidth>
            Copy code
          </Button>
          <Button fullWidth>I've saved it</Button>
        </MPin>
      </PhoneFrame>
    );
  return (
    <PhoneFrame tab="me" title="Speak up" back={<BackButton />}>
      <FormField label="What do you want to raise?">
        <RadioGroup
          aria-label="What do you want to raise?"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'grievance', label: 'Grievance', description: 'A problem at work you want HR to look into.' },
            { value: 'posh', label: 'Sexual harassment (POSH)', description: 'Goes only to the Internal Committee.' },
            { value: 'ethics', label: 'Ethics or fraud concern', description: 'Goes to the ethics officer. Can be anonymous.' },
          ]}
        />
      </FormField>
      {kind !== 'posh' && <Checkbox checked={anon} onChange={setAnon} label="Report anonymously" description="No name or device details are stored. You get an access code to follow up." />}
      <MList label="My cases">
        <MRow title="Show-cause notice SC-014" sub="Reply by 3 Oct 2026" end={<Badge tone="warning">Reply due</Badge>} />
      </MList>
      <MPin>
        <Button variant="primary" fullWidth>
          Continue
        </Button>
      </MPin>
    </PhoneFrame>
  );
}

/** Me › Referrals and internal jobs (M10). */
export function MobileCareersScreen() {
  return (
    <PhoneFrame tab="me" title="Jobs and referrals" back={<BackButton />}>
      <MSection title="Internal jobs">
        <MList>
          <MRow title="Quality Manager" sub="Hosur plant · posted 22 Sep" end={<Badge tone="success">You match 4 of 5</Badge>} />
          <MRow title="Senior Software Engineer" sub="Bengaluru head office" />
        </MList>
      </MSection>
      <MSection title="My referrals">
        <MList>
          <MRow title="Aisha Khan · Account Executive" sub={`Interviewing · bonus ${formatINR(25000)} after 90 days`} />
        </MList>
      </MSection>
      <MPin>
        <Button variant="primary" fullWidth>
          Refer someone
        </Button>
      </MPin>
    </PhoneFrame>
  );
}

/** Me › Rewards (points, catalogue). */
export function MobileRewardsScreen() {
  return (
    <PhoneFrame tab="me" title="Rewards" back={<BackButton />}>
      <MCard title="Your points">
        <span className="yx-m-big">340</span>
        <p className="yx-m-muted">1 point = ₹1 · expires 31 Mar 2027</p>
      </MCard>
      <MList label="Catalogue">
        <MRow title="Book voucher" sub="250 points" end={<Button size="sm">Redeem</Button>} nav={false} />
        <MRow title="Extra half-day off" sub="400 points · needs manager approval" end={<Badge tone="neutral">60 more</Badge>} nav={false} />
      </MList>
    </PhoneFrame>
  );
}

/** Me › My visitors: pre-register, arrival alert (M02 §B11; invite sheet is VIS-02). */
export function MobileVisitorsScreen({ arrived }: { arrived?: boolean }) {
  return (
    <PhoneFrame tab="me" title="My visitors" back={<BackButton />}>
      {arrived && (
        <InlineAlert tone="info" title="Anand Rao has arrived at reception" actions={<Button size="sm">I'm coming</Button>}>
          Chennai office · 9:38 am · badge V-0412
        </InlineAlert>
      )}
      <MList label="Expected">
        <MRow lead={<Avatar name="Anand Rao" size={32} />} title="Anand Rao · Nilgiri Packaging" sub="Today, 9:30 am · Chennai office" end={<Badge tone={arrived ? 'success' : 'info'}>{arrived ? 'Arrived' : 'Expected'}</Badge>} />
      </MList>
      <MPin>
        <Button variant="primary" fullWidth>
          Invite a visitor
        </Button>
      </MPin>
    </PhoneFrame>
  );
}

/** Me › Attendance presence consent (desktop agent / chat presence), withdraw (M02 §B10). */
export function MobilePresenceConsentScreen({ given = true }: { given?: boolean }) {
  return (
    <PhoneFrame tab="me" title="Attendance presence" back={<BackButton />}>
      <p>Your company can mark you present from the desktop agent on your work laptop. It reads only sign-in and idle times, never screens or keystrokes.</p>
      <MCard title="Status" end={<Badge tone={given ? 'success' : 'neutral'}>{given ? 'Consent given 2 Jul 2026' : 'Not given'}</Badge>}>
        <p className="yx-m-muted">If you withdraw, you check in from the app instead. Nothing else changes.</p>
      </MCard>
      <MPin>{given ? <Button variant="danger" fullWidth>Withdraw consent</Button> : <Button variant="primary" fullWidth>Give consent</Button>}</MPin>
    </PhoneFrame>
  );
}

/** Me › My exit while serving notice: resignation status, clearance, exit interview, asset return (M01 §3.7). */
export function MobileMyExitScreen() {
  return (
    <PhoneFrame tab="me" title="My exit" back={<BackButton />}>
      <MCard title="Resignation accepted" end={<Badge tone="warning">Serving notice</Badge>}>
        <p className="yx-m-muted">Last working day 30 Oct 2026 · 31 days left</p>
      </MCard>
      <MList label="Steps">
        <MRow title="Exit clearance" sub="IT done · Finance, Admin pending" end={<Badge tone="info">1 of 3</Badge>} />
        <MRow title="Exit interview" sub="Takes about 8 minutes" end={<Badge tone="warning">To do</Badge>} />
        <MRow title="Return assets" sub="Laptop KF-LT-0231, ID card" end={<Badge tone="warning">2 items</Badge>} />
        <MRow title="Full and final settlement" sub="Estimated after your last day" end={<Badge tone="neutral">Later</Badge>} />
      </MList>
    </PhoneFrame>
  );
}

/** Me › Privacy: My data, Who accessed my data (P02 §7, P08 Q6). */
export function MobilePrivacyScreen() {
  return (
    <PhoneFrame tab="me" title="Privacy" back={<BackButton />}>
      <MList label="My data">
        <MRow title="Download my data" sub="A copy of everything we hold about you" />
        <MRow title="Correct or erase" sub="Raise a data request" />
      </MList>
      <MSection title="Who accessed my data · last 30 days">
        <MList>
          <MRow nav={false} title="Lakshmi Venkatesan · HR" sub="Viewed bank details · 27 Sep, 4:12 pm · approving your change" />
          <MRow nav={false} title="Suresh Pillai · Payroll" sub="Viewed salary · 24 Sep, 11:02 am · payroll run" />
        </MList>
      </MSection>
    </PhoneFrame>
  );
}

/* ============================== MOB-03 · Settings & security ============================== */

export function MobileSettingsScreen({ confirmSignOut }: { confirmSignOut?: boolean }) {
  const [lang, setLang] = useState<string | null>('English');
  const rows: [string, boolean, boolean, boolean][] = [
    ['Approvals', true, true, false],
    ['Announcements', true, false, true],
    ['Payslips', true, true, false],
    ['Reminders', true, false, false],
  ];
  return (
    <PhoneFrame tab="me" title="Settings and security" back={<BackButton />}>
      <FormField label="Language">
        <Select value={lang} onChange={setLang} options={['English', 'हिन्दी', 'தமிழ்', 'తెలుగు'].map((l) => ({ value: l, label: l }))} />
      </FormField>
      <MSection title="Notifications">
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Notification channels, scrolls sideways on small screens">
        <table className="yx-m-matrix">
          <caption className="yx-visually-hidden">Notification channels</caption>
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">App</th>
              <th scope="col">Email</th>
              <th scope="col">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([t, a, e, w]) => (
              <tr key={t}>
                <th scope="row">{t}</th>
                <td><Checkbox defaultChecked={a} aria-label={`${t} in app`} /></td>
                <td><Checkbox defaultChecked={e} aria-label={`${t} by email`} /></td>
                <td><Checkbox defaultChecked={w} aria-label={`${t} on WhatsApp`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <MRow title="Quiet hours" sub="10:00 pm – 7:00 am" />
      </MSection>
      <MSection title="Devices">
        <MList>
          <MRow icon={Smartphone} nav={false} title="This phone · Android 15" sub="Linked for check-in · signed in 29 Sep" />
          <MRow icon={Monitor} nav={false} title="Work laptop · browser" sub="Last used 28 Sep, 6:10 pm" end={<Button size="sm">Sign out</Button>} />
        </MList>
      </MSection>
      <MList label="Security">
        <MRow icon={KeyRound} title="Re-check on sensitive screens" sub="Payslips, bank details · fingerprint" />
        <MRow icon={Languages} title="Help and tours" sub="Replay the app intro" />
      </MList>
      <p className="yx-m-muted">You stay signed in for 30 days on this phone.</p>
      <MPin>
        <Button variant="danger" fullWidth icon={LogOut}>
          Sign out of all devices
        </Button>
      </MPin>
      <ConfirmDialog
        defaultOpen={confirmSignOut}
        title="Sign out of all devices?"
        consequence="You'll need a new one-time code on each device, including this phone."
        confirmLabel="Sign out everywhere"
        destructive
        onConfirm={() => {}}
      />
    </PhoneFrame>
  );
}
