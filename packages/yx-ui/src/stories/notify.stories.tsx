import '../components/overlay.css';
import '../components/notify.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Link } from '../components/button';
import {
  ApprovalInbox,
  AssistantPanel,
  MilestoneMoment,
  NotificationCentre,
  PageBanner,
  TimesheetApprovalCard,
  ToastProvider,
  useToast,
  type ApprovalItem,
  type AssistantMessage,
  type NotificationItem,
  type TimesheetApprovalLine,
} from '../components/notify';
import { formatINR } from '../lib/format';
import { Row, Section, Stack } from './story-kit';

const meta: Meta = { title: 'Overlays/Notifications and approvals', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

const mobile = { globals: { viewport: { value: 'mobile2', isRotated: false } } };
const NOW = new Date(2026, 8, 29, 11, 30);
const at = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m);

/* ---------- Toasts ---------- */

function ToastDemo({ seed }: { seed: boolean }) {
  const { toast } = useToast();
  const done = useRef(false);
  useEffect(() => {
    if (!seed || done.current) return;
    done.current = true;
    toast({ title: 'Leave approved', description: 'Divya Raghunathan · 06–08 Oct 2026', tone: 'success' });
    toast({ title: 'Shift deleted', description: 'General shift · Hosur plant', onUndo: () => toast({ title: 'Shift restored' }) });
    toast({
      title: "We couldn't approve Karthik Iyer's expense",
      description: 'The approval service did not respond. Try again in a minute. Reference EXP-4821.',
      tone: 'error',
    });
  }, [seed, toast]);
  return (
    <Section title="Toasts sit bottom-left; hover or focus pauses the 5 s timer; errors stay until closed">
      <Row>
        <Button onClick={() => toast({ title: 'Payslips published', description: '248 employees can see September payslips', tone: 'success' })}>Show success</Button>
        <Button onClick={() => toast({ title: 'Employee archived', onUndo: () => toast({ title: 'Employee restored' }) })}>Show with Undo</Button>
        <Button onClick={() => toast({ title: "We couldn't save the roster", description: 'Check your connection and try again.', tone: 'error' })}>Show error</Button>
      </Row>
    </Section>
  );
}

export const ToastStack: Story = {
  name: 'Toasts · stack of 3 (success, undo, error)',
  render: () => (
    <ToastProvider>
      <ToastDemo seed />
    </ToastProvider>
  ),
};

export const ToastPlayground: Story = {
  name: 'Toasts · playground (queue beyond 3)',
  render: () => (
    <ToastProvider>
      <ToastDemo seed={false} />
    </ToastProvider>
  ),
};

/* ---------- Page banners ---------- */

export const Banners: Story = {
  name: 'Page banner · every tone',
  render: function Render() {
    const [trial, setTrial] = useState(true);
    return (
      <Stack gap={16}>
        {trial && (
          <PageBanner tone="info" onDismiss={() => setTrial(false)} action={<Button size="sm">Choose a plan</Button>}>
            Your trial ends in 5 days, on 04 Oct 2026. Choose a plan to keep your data and settings.
          </PageBanner>
        )}
        <PageBanner tone="warning" onDismiss={() => {}}>
          Scheduled maintenance on 04 Oct 2026, 11:00 pm to 01:00 am. You can't run payroll during this window.
        </PageBanner>
        <PageBanner tone="danger" action={<Link href="#billing">Update billing</Link>}>
          Your account is read-only because the September invoice is unpaid. Employees can still view payslips.
        </PageBanner>
        <PageBanner tone="warning" action={<Button size="sm">Exit</Button>}>
          You are viewing as Divya Raghunathan. Everything you do is recorded in the audit log.
        </PageBanner>
        <PageBanner tone="info">Payroll for September 2026 is locked. Changes to pay now go into the October run.</PageBanner>
      </Stack>
    );
  },
};

export const BannerMobile: Story = {
  name: 'Page banner · mobile',
  ...mobile,
  render: () => (
    <PageBanner tone="warning" action={<Button size="sm">Exit</Button>}>
      You are viewing as Divya Raghunathan.
    </PageBanner>
  ),
};

/* ---------- Notification centre ---------- */

function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>(() => [
    {
      id: 'n1',
      actor: { name: 'Divya Raghunathan' },
      text: 'Divya Raghunathan applied for 3 days of casual leave, 06–08 Oct 2026',
      at: at(29, 10, 12),
      read: false,
      href: '#leave/LV-2291',
      approval: { onApprove: () => new Promise((r) => setTimeout(r, 800)).then(() => approveItem('n1')) },
    },
    { id: 'n2', actor: { name: 'Karthik Iyer' }, text: `Karthik Iyer submitted an expense claim of ${formatINR(12450)} for a client dinner`, at: at(29, 9, 40), read: false, href: '#expenses/EXP-4821' },
    { id: 'n3', actor: { name: 'Payroll' }, text: 'September 2026 payroll is locked. 248 payslips are ready to publish.', at: at(29, 8, 5), read: true, href: '#payroll' },
    { id: 'n4', actor: { name: 'Meera Pillai' }, text: 'Meera Pillai submitted her timesheet for the week of 21 Sep 2026 (42 h)', at: at(28, 18, 20), read: false, href: '#timesheets' },
    { id: 'n5', actor: { name: 'Arjun Kulkarni' }, text: 'Arjun Kulkarni mentioned you on the Q3 hiring plan: "Can you confirm the Chennai headcount?"', at: at(28, 11, 0), read: true },
    { id: 'n6', actor: { name: 'Lakshmi Venkatesan' }, text: 'Lakshmi Venkatesan accepted the offer for Senior Accountant. Joining on 03 Nov 2026.', at: at(24, 16, 45), read: true },
  ]);
  function approveItem(id: string) {
    setItems((xs) => xs.map((x) => (x.id === id && x.approval ? { ...x, read: true, approval: { ...x.approval, approved: true } } : x)));
  }
  return {
    items,
    onMarkAllRead: () => setItems((xs) => xs.map((x) => ({ ...x, read: true }))),
    onOpenItem: (it: NotificationItem) => setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, read: true } : x))),
  };
}

const bellWrap = (node: ReactNode) => <div style={{ display: 'flex', justifyContent: 'flex-end', maxWidth: 720 }}>{node}</div>;

export const NotificationsOpen: Story = {
  name: 'Notification centre · open, mixed items',
  render: function Render() {
    const n = useNotifications();
    return bellWrap(<NotificationCentre defaultOpen now={NOW} settingsHref="#settings/notifications" {...n} />);
  },
};

export const NotificationsClosed: Story = {
  name: 'Notification centre · closed with unread count',
  render: function Render() {
    const n = useNotifications();
    return bellWrap(<NotificationCentre now={NOW} settingsHref="#settings/notifications" {...n} />);
  },
};

export const NotificationsEmpty: Story = {
  name: 'Notification centre · empty',
  render: () => bellWrap(<NotificationCentre defaultOpen now={NOW} items={[]} settingsHref="#settings/notifications" onMarkAllRead={() => {}} />),
};

export const NotificationsLoading: Story = {
  name: 'Notification centre · loading',
  render: () => bellWrap(<NotificationCentre defaultOpen loading now={NOW} items={[]} settingsHref="#settings/notifications" onMarkAllRead={() => {}} />),
};

export const NotificationsMobile: Story = {
  name: 'Notification centre · mobile',
  ...mobile,
  render: function Render() {
    const n = useNotifications();
    return bellWrap(<NotificationCentre defaultOpen now={NOW} settingsHref="#settings/notifications" {...n} />);
  },
};

/* ---------- Approvals inbox ---------- */

const INBOX: ApprovalItem[] = [
  { id: 'a1', requester: { name: 'Divya Raghunathan', secondary: 'Payroll Executive' }, type: 'leave', summary: 'Casual leave · 3 days', detail: '06 Oct – 08 Oct 2026', policy: { ok: true }, lowRisk: true },
  { id: 'a2', requester: { name: 'Karthik Iyer', secondary: 'Account Manager' }, type: 'expense', summary: 'Client dinner, Chennai', detail: formatINR(12450), policy: { ok: false, reason: `Over the ${formatINR(8000)} meal limit by ${formatINR(4450)}` } },
  { id: 'a3', requester: { name: 'Meera Pillai', secondary: 'Senior Developer' }, type: 'timesheet', summary: 'Week of 21 Sep 2026 · 42 h', detail: 'ACME-Website, Internal', policy: { ok: false, reason: '2 h more than attendance worked hours' } },
  { id: 'a4', requester: { name: 'Rohan Deshmukh', secondary: 'Talent Partner' }, type: 'offer', summary: 'Senior Accountant · Lakshmi Venkatesan', detail: `${formatINR(1450000)} a year`, policy: { ok: true } },
  { id: 'a5', requester: { name: 'Sana Nizami', secondary: 'Machine Operator · Hosur plant' }, type: 'regularisation', summary: 'Missed punch-out', detail: '26 Sep 2026 · 06:00 am – 02:00 pm', policy: { ok: true }, lowRisk: true },
  { id: 'a6', requester: { name: 'Arjun Kulkarni', secondary: 'Operations Lead' }, type: 'leave', summary: 'Sick leave · 1 day', detail: '29 Sep 2026', policy: { ok: true }, lowRisk: true },
  { id: 'a7', requester: { name: 'Priya Subramaniam', secondary: 'Sales Executive' }, type: 'expense', summary: 'Cab to client site', detail: formatINR(640), policy: { ok: true }, lowRisk: true },
];

function useInbox() {
  const [items, setItems] = useState(INBOX);
  return {
    items,
    onApprove: (ids: string[]) => setItems((xs) => xs.filter((x) => !ids.includes(x.id))),
    onReject: (id: string) => setItems((xs) => xs.filter((x) => x.id !== id)),
  };
}

export const Inbox: Story = {
  name: 'Approvals inbox · all types',
  render: function Render() {
    return <ApprovalInbox {...useInbox()} />;
  },
};

export const InboxRejectOpen: Story = {
  name: 'Approvals inbox · reject reason open',
  render: function Render() {
    return <ApprovalInbox {...useInbox()} defaultRejectId="a2" />;
  },
};

export const InboxFiltered: Story = {
  name: 'Approvals inbox · filtered to Leave',
  render: function Render() {
    return <ApprovalInbox {...useInbox()} defaultType="leave" />;
  },
};

export const InboxFilteredEmpty: Story = {
  name: 'Approvals inbox · filter with nothing',
  render: function Render() {
    return <ApprovalInbox items={INBOX.filter((i) => i.type !== 'offer')} onApprove={() => {}} onReject={() => {}} defaultType="offer" />;
  },
};

export const InboxEmpty: Story = {
  name: 'Approvals inbox · empty',
  render: () => <ApprovalInbox items={[]} onApprove={() => {}} onReject={() => {}} />,
};

export const InboxLoading: Story = {
  name: 'Approvals inbox · loading',
  render: () => <ApprovalInbox items={INBOX} loading onApprove={() => {}} onReject={() => {}} />,
};

export const InboxMobile: Story = {
  name: 'Approvals inbox · mobile',
  ...mobile,
  render: function Render() {
    return <ApprovalInbox {...useInbox()} />;
  },
};

/* ---------- Timesheet approval ---------- */

const TS_LINES: TimesheetApprovalLine[] = [
  { id: 't1', project: 'ACME-Website', task: 'Daily stand-up', hours: 7, billable: true },
  { id: 't2', project: 'ACME-Website', task: 'Checkout redesign', hours: 24, billable: true },
  { id: 't3', project: 'Sundaram Logistics portal', task: 'Bug fixes', hours: 8, billable: true },
  { id: 't4', project: 'Internal', task: 'Hiring interviews', hours: 3 },
];
const tsProps = {
  employee: { name: 'Meera Pillai', secondary: 'Senior Developer · Design team' },
  weekLabel: 'Week of 21 Sep 2026 · 42 h submitted',
  lines: TS_LINES,
  onApprove: () => {},
  onSendBack: () => {},
};

export const TimesheetReduced: Story = {
  name: 'Timesheet approval · one line reduced',
  render: () => (
    <TimesheetApprovalCard {...tsProps} defaultDecisions={{ t1: { status: 'reduced', hours: 5, reason: 'Duplicate stand-up entry on Wednesday' }, t4: { status: 'approved' } }} />
  ),
};

export const TimesheetPending: Story = {
  name: 'Timesheet approval · undecided',
  render: () => <TimesheetApprovalCard {...tsProps} />,
};

export const TimesheetMixed: Story = {
  name: 'Timesheet approval · approved, reduced, rejected',
  render: () => (
    <TimesheetApprovalCard
      {...tsProps}
      defaultDecisions={{
        t1: { status: 'reduced', hours: 5, reason: 'Duplicate stand-up entry on Wednesday' },
        t2: { status: 'approved' },
        t3: { status: 'rejected', reason: 'Sundaram Logistics work is billed from next week. Move these hours to Internal.' },
      }}
    />
  ),
};

export const TimesheetMobile: Story = {
  name: 'Timesheet approval · mobile',
  ...mobile,
  render: () => <TimesheetApprovalCard {...tsProps} defaultDecisions={{ t1: { status: 'reduced', hours: 5, reason: 'Duplicate stand-up entry' } }} />,
};

/* ---------- Milestone moments ---------- */

export const Milestones: Story = {
  name: 'Milestone moment · every milestone',
  render: () => (
    <Row align="flex-start" gap={24}>
      <MilestoneMoment title="Payroll for September 2026 is locked" description="248 payslips are ready to publish." action={<Button variant="primary">Publish payslips</Button>} />
      <MilestoneMoment title="Your first payroll is paid" description={`${formatINR(4826300)} reached 248 employees on 30 Sep 2026.`} action={<Button>View payroll summary</Button>} />
      <MilestoneMoment title="Lakshmi Venkatesan accepted the offer" description="Joining on 03 Nov 2026 as Senior Accountant, Chennai." action={<Button>Start onboarding</Button>} />
      <MilestoneMoment title="Onboarding complete" description="Rahul Menon has everything he needs for his first day." action={<Button>View profile</Button>} />
      <MilestoneMoment title="Your test is submitted" description="We'll email you at rahul.menon@example.in when the results are ready." action={<Button>Back to careers</Button>} />
    </Row>
  ),
};

/* ---------- AI assistant panel ---------- */

const CONVO: AssistantMessage[] = [
  { id: 'm1', role: 'user', text: 'How many casual leaves does Divya Raghunathan have left this year?' },
  {
    id: 'm2',
    role: 'assistant',
    text: (
      <>
        <p>Divya Raghunathan has 4 casual leaves left for 2026. She has used 8 of 12, including the 3 days she applied for from 06 Oct 2026, which are still pending.</p>
      </>
    ),
    sources: [
      { label: 'Leave policy 2026, section 3', href: '#policies/leave-2026' },
      { label: "Divya's leave balance", href: '#people/EMP-0142/leave' },
    ],
    feedback: 'up',
  },
  { id: 'm3', role: 'user', text: 'Her comp-off from the Diwali weekend should add 2 days. Can you add it?' },
  {
    id: 'm4',
    role: 'assistant',
    text: <p>I found 2 days of weekend work on 18 and 19 Oct 2025 approved by Arjun Kulkarni. Comp-off is usually credited within 90 days, so these may have lapsed.</p>,
    uncertain: 'The policy allows HR to extend the 90-day window, but I could not find an extension for Divya. Check with HR before crediting.',
    sources: [{ label: 'Comp-off rules, section 5', href: '#policies/comp-off' }],
  },
];

const panelFrame = (node: ReactNode) => (
  <div style={{ height: 720, display: 'flex', justifyContent: 'flex-end', border: '1px solid var(--yx-color-border)' }}>{node}</div>
);

export const AssistantConversation: Story = {
  name: 'Assistant · mid-conversation, generating',
  render: function Render() {
    const [msgs, setMsgs] = useState(CONVO);
    const [generating, setGenerating] = useState(true);
    return panelFrame(
      <AssistantPanel
        messages={msgs}
        generating={generating}
        onStop={() => setGenerating(false)}
        onSend={(t) => setMsgs((m) => [...m, { id: `u${m.length}`, role: 'user', text: t }])}
        onFeedback={(id, v) => setMsgs((m) => m.map((x) => (x.id === id ? { ...x, feedback: v } : x)))}
        onClose={() => {}}
      />,
    );
  },
};

export const AssistantPreview: Story = {
  name: 'Assistant · action preview awaiting Confirm',
  render: function Render() {
    const [confirming, setConfirming] = useState(false);
    return panelFrame(
      <AssistantPanel
        messages={[
          ...CONVO,
          { id: 'm5', role: 'user', text: 'HR extended it last month. Please credit the 2 days.' },
          { id: 'm6', role: 'assistant', text: <p>Here is the change. Nothing is saved until you confirm.</p>, sources: [{ label: 'HR note, 12 Sep 2026', href: '#notes/HR-331' }] },
        ]}
        onSend={() => {}}
        onFeedback={() => {}}
        onClose={() => {}}
        preview={{
          title: "Credit comp-off to Divya Raghunathan's leave",
          changes: [
            { field: 'Comp-off balance', from: '0 days', to: '2 days' },
            { field: 'Comp-off expiry', from: '—', to: '31 Dec 2026' },
            { field: 'Audit note', from: '—', to: 'Diwali weekend work, extended by HR' },
          ],
          confirming,
          onConfirm: () => setConfirming(true),
          onCancel: () => {},
        }}
      />,
    );
  },
};

export const AssistantEmpty: Story = {
  name: 'Assistant · new conversation',
  render: () => panelFrame(<AssistantPanel messages={[]} onSend={() => {}} onClose={() => {}} defaultDraft="What is the notice period for managers?" />),
};

export const AssistantMobile: Story = {
  name: 'Assistant · mobile',
  ...mobile,
  render: () => panelFrame(<AssistantPanel messages={CONVO} onSend={() => {}} onFeedback={() => {}} onClose={() => {}} />),
};
