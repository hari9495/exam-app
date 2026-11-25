// Help & onboarding UX patterns (APX-D §6). H-1 (answers 941, 945): the drawer, irreversible actions, bulk approve and
// empty states show the live parts; never a second version.
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '../../components/button';
import { PageHeader } from '../../components/shell';
import { EmptyState, NotFoundReferenceContext } from '../../components/feedback';
import { DesktopFrame, PhoneFrame, type AreaId } from '../_kit/frames';
import { AccessDeniedState, AvailabilityBanner, AvailabilityState, NotFoundState, TOURS, TourCard, ToursPanel, type LiveTours } from './help';
import { WhatsNewPanel, type LiveWhatsNew } from '../platform-b/growth-screens';
// Answers 941 and 945: the one Help drawer is the live desk drawer; irreversible actions are the kit's
// IrreversibleSheet; bulk approve is the Approvals inbox; empty states are the kit's EmptyState.
import { HelpDrawer, PageHelp } from '../desk/help';
import { AskYukthix, type AskState } from '../desk/ask-yukthix';
import { ASK_BUYING, ASK_CHAT, ASK_STATE, ASK_UNSURE } from '../desk/ask-yukthix-data';
import { MY_BANNERS, MY_ROWS, RAISE_DESKS } from '../desk/data';
import { IrreversibleSheet } from '../../components/irreversible';
import { ApprovalsInboxScreen } from '../platform-a/inbox';
import { APPROVALS, SENT_BY_ME } from '../platform-a/platform-data';
import { Checkbox } from '../../components/choice';
import { Badge } from '../../components/display';
import './settings.css';

const meta: Meta = { title: 'Screens/Help and onboarding/Patterns', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

// What's new is H-4's live panel (PLT-50).
const NEWS: LiveWhatsNew = {
  state: 'ready',
  onRetry: () => {},
  onMarkAllRead: async () => {},
  unread: 1,
  entries: [
    { id: 'n1', date: '2026-09-24', product: 'YukthiX HR', title: 'Fix a missed punch from the day card', body: 'Tap the red marker on any day to fix it; the effect on pay shows before you send.', unread: true },
    { id: 'n2', date: '2026-09-17', product: 'YukthiX HR', title: 'Why is my pay different?', body: 'Your payslip now explains each line that changed from last month.', unread: false },
  ],
};

const Desk = ({ area = 'home', title, children }: { area?: AreaId; title: string; children: ReactNode }) => (
  <DesktopFrame area={area} panelTitle={title} panel={[{ items: [{ label: title, active: true }] }]}>
    {children}
  </DesktopFrame>
);

const tour = (id: string) => TOURS.find((t) => t.id === id)!;

/* 6.1 tours */
export const TourEmployee: S = {
  name: '6.1 Tour · employee first sign-in (phone)',
  ...phone,
  render: () => (
    <PhoneFrame tab="home" title="Good morning, Divya">
      <div className="yx-tour-target">
        <Button variant="primary" fullWidth>
          Check in
        </Button>
      </div>
      <TourCard tour={tour('employee')} />
    </PhoneFrame>
  ),
};
export const TourEmployeeStep3: S = {
  name: '6.1 Tour · employee, last step',
  ...phone,
  render: () => (
    <PhoneFrame tab="pay" title="Pay">
      <TourCard tour={tour('employee')} defaultStep={2} />
    </PhoneFrame>
  ),
};
export const TourManager: S = {
  name: '6.1 Tour · manager first approval',
  render: () => (
    <Desk title="Approvals">
      <PageHeader title="Approvals" description="1 waiting for you" />
      <div className="yx-tour-stage">
        <div className="yx-tour-target yx-m-card">
          <p className="yx-m-card__title">Casual leave · Arjun Kulkarni</p>
          <p className="yx-m-muted">1–2 Oct 2026 · 2 days · balance after: 2</p>
        </div>
        <TourCard tour={tour('manager')} />
      </div>
    </Desk>
  ),
};
export const TourPayroll: S = {
  name: '6.1 Tour · payroll admin first run',
  render: () => (
    <Desk area="pay" title="Payroll">
      <PageHeader title="Payroll · September 2026" description="Kaveri Foods Pvt Ltd · 248 people" />
      <div className="yx-tour-stage">
        <div className="yx-tour-target yx-m-card">
          <p className="yx-m-card__title">Readiness · 6 items to fix</p>
          <p className="yx-m-muted">3 missing bank details · 2 new joiners without templates · 1 attendance not frozen</p>
        </div>
        <TourCard tour={tour('payroll')} defaultStep={1} />
      </div>
    </Desk>
  ),
};
export const TourAdmin: S = {
  name: '6.1 Tour · HR / System Admin first sign-in',
  render: () => (
    <Desk area="settings" title="Set-up hub">
      <PageHeader title="Set up Kaveri Foods" description="4 of 11 cards complete" />
      <div className="yx-tour-stage">
        <div className="yx-tour-target yx-m-card">
          <p className="yx-m-card__title">Time & Leave · 3 of 5 done</p>
        </div>
        <TourCard tour={tour('admin')} />
      </div>
    </Desk>
  ),
};

/* 6.2 help drawer and what's new */
// Answer 942: "This page" lists the help articles tagged with the page (here the apply-leave page).
const LEAVE_ARTICLES = [
  { id: 'k1', number: 41, title: 'How leave is counted at Kaveri Foods', summary: 'Half days, weekly offs between leave days, and what unpaid leave does to pay.' },
  { id: 'k2', number: 44, title: 'Apply leave in 90 seconds', summary: 'Pick the dates, choose the type, check the summary and send.' },
  { id: 'k3', number: 52, title: 'Plant staff: apply 3 days ahead', summary: 'So the roster can be covered. Written by Plant HR.' },
];
const drawer = (over: Partial<Parameters<typeof HelpDrawer>[0]> = {}) => (
  <HelpDrawer
    open
    onOpenChange={() => {}}
    desks={RAISE_DESKS}
    tickets={MY_ROWS}
    banners={MY_BANNERS}
    onMeToo={async () => undefined}
    onRaise={async () => ({ id: 'x', number: 'HR-1042' })}
    ticketHref={(id) => `#${id}`}
    articleHref={(a) => `#article-${a.number}`}
    pageHelp={{ state: 'ready', articles: LEAVE_ARTICLES }}
    whatsNew={<WhatsNewPanel live={NEWS} />}
    tours={<ToursPanel live={TOURS_LIVE} />}
    {...over}
  />
);
// Answer 944 (H-5): the Tours tab's content, as the live app fills it.
const TOURS_LIVE: LiveTours = {
  state: 'ready',
  onRetry: () => {},
  stopped: false,
  onStart: () => {},
  onStopped: async () => undefined,
  tours: [
    { id: 'employee', status: 'completed', step: 2 },
    { id: 'manager', status: 'in_progress', step: 1 },
    { id: 'payroll', status: 'skipped', step: 0 },
  ],
};
export const HelpDrawerPage: S = {
  name: '6.2 Help drawer · this page (TIM-18 apply leave)',
  render: () => (
    <Desk area="time" title="Leave">
      <PageHeader title="Apply leave" />
      {drawer()}
    </Desk>
  ),
};
export const HelpDrawerNews: S = {
  name: "6.2 Help drawer · what's new",
  render: () => (
    <Desk title="Home">
      <PageHeader title="Home" />
      {drawer({ defaultTab: 'new' })}
    </Desk>
  ),
};
export const HelpDrawerNewsEmpty: S = {
  name: "6.2 Help drawer · what's new, nothing yet (the tab is hidden)",
  render: () => <Desk title="Home">{drawer({ whatsNew: undefined })}</Desk>,
};
// Ask YukthiX (answers 2101 to 2108): the help assistant in the Help drawer.
const ask = (state: AskState | null) => (
  <AskYukthix
    state={state}
    contactHref="#contact-yukthix"
    onAsk={async () => ({ on: true, remaining: 46, conversation: ASK_CHAT })}
    onFeedback={async () => undefined}
    onRaiseTicket={async () => ({ ticket: 'YXS-118' })}
    onFeatureRequest={async () => ({ number: 42 })}
    onSalesRequest={async () => ({ dueAt: '2026-11-17T10:30:00Z' })}
  />
);
export const HelpDrawerAsk: S = { name: '6.2 Help drawer · Ask YukthiX · an answer with its article', render: () => <Desk title="Leave">{drawer({ defaultTab: 'assistant', assistant: ask(ASK_STATE) })}</Desk> };
export const HelpDrawerAskEmpty: S = { name: '6.2 Help drawer · Ask YukthiX · a new chat', render: () => <Desk title="Home">{drawer({ defaultTab: 'assistant', assistant: ask({ ...ASK_STATE, remaining: 50, conversation: null }) })}</Desk> };
export const HelpDrawerAskUnsure: S = { name: '6.2 Help drawer · Ask YukthiX · unsure twice: a person is offered', render: () => <Desk title="Leave">{drawer({ defaultTab: 'assistant', assistant: ask({ ...ASK_STATE, conversation: ASK_UNSURE }) })}</Desk> };
export const HelpDrawerAskNoKey: S = { name: '6.2 Help drawer · Ask YukthiX · an employee (no Contact YukthiX key)', render: () => <Desk title="Leave">{drawer({ defaultTab: 'assistant', assistant: ask({ ...ASK_STATE, canRaiseTicket: false, conversation: ASK_UNSURE }) })}</Desk> };
export const HelpDrawerAskHandedOver: S = { name: '6.2 Help drawer · Ask YukthiX · ticket raised, feature request sent', render: () => <Desk title="Leave">{drawer({ defaultTab: 'assistant', assistant: ask({ ...ASK_STATE, conversation: { ...ASK_UNSURE, ticketRef: 'YXS-118', featureRequestSent: true } }) })}</Desk> };
// Answer 2112: a buying question offers a sales request to whoever manages the plan.
export const HelpDrawerAskBuying: S = { name: '6.2 Help drawer · Ask YukthiX · buying: send a sales request', render: () => <Desk title="Home">{drawer({ defaultTab: 'assistant', assistant: ask({ ...ASK_STATE, canAskSales: true, conversation: ASK_BUYING }) })}</Desk> };
export const HelpDrawerAskBuyingNoKey: S = { name: '6.2 Help drawer · Ask YukthiX · buying, without the plan key', render: () => <Desk title="Home">{drawer({ defaultTab: 'assistant', assistant: ask({ ...ASK_STATE, canAskSales: false, conversation: ASK_BUYING }) })}</Desk> };
export const HelpDrawerAskBuyingSent: S = { name: '6.2 Help drawer · Ask YukthiX · buying, sales request sent', render: () => <Desk title="Home">{drawer({ defaultTab: 'assistant', assistant: ask({ ...ASK_STATE, canAskSales: true, conversation: { ...ASK_BUYING, salesRequestSent: true } }) })}</Desk> };
export const HelpDrawerAskOff: S = { name: '6.2 Help drawer · Ask YukthiX · not switched on yet', render: () => <Desk title="Home">{drawer({ defaultTab: 'assistant', assistant: ask({ ...ASK_STATE, on: false, conversation: null }) })}</Desk> };
export const HelpDrawerAskLoading: S = { name: '6.2 Help drawer · Ask YukthiX · loading', render: () => <Desk title="Home">{drawer({ defaultTab: 'assistant', assistant: ask(null) })}</Desk> };

export const HelpDrawerTours: S = {
  name: '6.2 Help drawer · tours (resume, replay)',
  render: () => (
    <Desk title="Home">
      {drawer({
        defaultTab: 'tours',
        tours: (
          <ToursPanel live={TOURS_LIVE} />
        ),
      })}
    </Desk>
  ),
};
export const HelpPhone: S = {
  name: '6.2 Help · phone (bottom sheet content)',
  ...phone,
  render: () => (
    <PhoneFrame tab="time" title="Help · Apply leave">
      <PageHelp page={{ state: 'ready', articles: LEAVE_ARTICLES }} hrefOf={(a) => `#article-${a.number}`} onAsk={() => {}} />
    </PhoneFrame>
  ),
};
export const WhatsNewManager: S = {
  name: "6.2 What's new · manager",
  render: () => (
    <Desk title="What's new">
      <PageHeader title="What's new" description="Changes to the products you use" />
      <WhatsNewPanel live={NEWS} />
    </Desk>
  ),
};

/* 6.3 permission */
export const AccessDenied: S = {
  name: '6.3 Access denied · with Request access',
  render: () => (
    <Desk area="people" title="People">
      <AccessDeniedState recordType="salary history" ownerRole="Payroll Manager" />
    </Desk>
  ),
};
export const AccessRequestForm: S = {
  name: '6.3 Request access · form',
  render: () => (
    <Desk area="people" title="People">
      <AccessDeniedState recordType="salary history" ownerRole="Payroll Manager" defaultRequesting />
    </Desk>
  ),
};
export const AccessRequestSent: S = {
  name: '6.3 Request access · sent',
  render: () => (
    <Desk area="people" title="People">
      <AccessDeniedState recordType="salary history" ownerRole="Payroll Manager" sent />
    </Desk>
  ),
};
export const AccessDeniedPhone: S = {
  name: '6.3 Access denied · phone',
  ...phone,
  render: () => (
    <PhoneFrame tab="me" title="Team member">
      <AccessDeniedState recordType="performance review" ownerRole="HR Business Partner" />
    </PhoneFrame>
  ),
};
export const NotFound: S = {
  name: '6.3 Not found (missing or restricted, identical)',
  render: () => (
    <Desk area="helpdesk" title="Helpdesk">
      <NotFoundState reference="NF-7KQ2MP" />
    </Desk>
  ),
};
// Answer 947: a record page's own Not found shows the reference the API sent with its 404.
export const NotFoundRecord: S = {
  name: '6.3 Not found · a record page, with its reference',
  render: () => (
    <Desk area="people" title="People">
      <NotFoundReferenceContext.Provider value="NF-7KQ2MP">
        <EmptyState title="Not found" description="This person doesn't exist in your company, or the link is out of date." />
      </NotFoundReferenceContext.Provider>
    </Desk>
  ),
};
export const NotFoundPhone: S = { name: '6.3 Not found · phone', ...phone, render: () => <PhoneFrame tab="home" title="Not found"><NotFoundState reference="NF-7KQ2MP" /></PhoneFrame> };

/* 6.4 irreversible */
const PUBLISH = {
  open: true,
  onOpenChange: () => {},
  title: 'Publish payslips for September 2026?',
  impact: [
    { label: 'Payslips', value: '248' },
    { label: 'Net pay', value: '₹1,82,40,500' },
    { label: 'Entity', value: 'Kaveri Foods Pvt Ltd' },
  ],
  cannotUndo: 'Published payslips cannot be withdrawn. 248 people get their payslip by app and email.',
  correction: 'Changes after this go to October 2026 as arrears.',
  phrase: 'KAVERI SEP 2026',
  confirmLabel: 'Publish payslips',
  maker: 'Suresh Pillai',
  checker: 'Meera Iyer',
  onConfirm: () => {},
};
export const IrreversiblePublish: S = {
  name: '6.4 Irreversible · publish payslips',
  render: () => (
    <Desk area="pay" title="Payroll">
      <IrreversibleSheet {...PUBLISH} />
    </Desk>
  ),
};
export const IrreversibleTyped: S = {
  name: '6.4 Irreversible · phrase typed, ready',
  render: () => (
    <Desk area="pay" title="Payroll">
      <IrreversibleSheet {...PUBLISH} defaultTyped="KAVERI SEP 2026" />
    </Desk>
  ),
};
export const IrreversibleSamePerson: S = {
  name: '6.4 Irreversible · maker is the checker (blocked)',
  render: () => (
    <Desk area="pay" title="Payroll">
      <IrreversibleSheet {...PUBLISH} checker="Suresh Pillai" otherApprover="Meera Iyer" onSendToChecker={() => {}} defaultTyped="KAVERI SEP 2026" />
    </Desk>
  ),
};
export const IrreversibleReopen: S = {
  name: '6.4 Irreversible · reopen period (reason required)',
  render: () => (
    <Desk area="time" title="Periods">
      <IrreversibleSheet
        {...PUBLISH}
        title="Reopen attendance for August 2026?"
        impact={[
          { label: 'People', value: '248' },
          { label: 'Period', value: 'Aug 2026' },
        ]}
        cannotUndo="Reopening is recorded permanently. Attendance for 248 people becomes editable again; the August payroll run is marked needs recalculation."
        correction="Lock the period again when your fixes are done."
        phrase="KAVERI AUG 2026"
        confirmLabel="Reopen period"
        reasonRequired
        maker="Lakshmi Venkatesan"
        checker="Suresh Pillai"
      />
    </Desk>
  ),
};
export const BulkApprove: S = {
  name: '6.4 Bulk approve · count confirmation',
  render: () => <ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={[]} defaultSelected={['a1', 'a2']} bulkConfirmOpen />,
};

/* 6.5 availability */
export const Maintenance: S = {
  name: '6.5 Availability · maintenance banner',
  render: () => (
    <Desk title="Home">
      <AvailabilityBanner kind="maintenance" />
      <PageHeader title="Home" />
    </Desk>
  ),
};
export const MaintenancePage: S = { name: '6.5 Availability · down for maintenance', render: () => <Desk area="pay" title="Payroll"><AvailabilityState kind="maintenance" feature="Payroll" until="1:00 am" /></Desk> };
export const Degraded: S = {
  name: '6.5 Availability · degraded',
  render: () => (
    <Desk area="pay" title="Pay">
      <AvailabilityBanner kind="degraded" />
      <AvailabilityState kind="degraded" feature="Payslip downloads" />
    </Desk>
  ),
};
export const ReadOnly: S = {
  name: '6.5 Availability · read-only account',
  render: () => (
    <Desk title="Home">
      <AvailabilityBanner kind="read-only" />
      <AvailabilityState kind="read-only" feature="Kaveri Foods account" />
    </Desk>
  ),
};
export const ReadOnlyPhone: S = { name: '6.5 Availability · read-only (phone)', ...phone, render: () => <PhoneFrame tab="home" title="Home"><AvailabilityBanner kind="read-only" /></PhoneFrame> };
export const Wave: S = { name: '6.5 Availability · available in wave 6', render: () => <Desk area="visitors" title="Visitors"><AvailabilityState kind="wave" feature="Visitors" wave={6} /></Desk> };
export const NotEnabledAdmin: S = { name: '6.5 Availability · not enabled (admin)', render: () => <Desk area="projects" title="Projects"><AvailabilityState kind="not-enabled" feature="Projects" /></Desk> };
export const NotEnabledEmployee: S = { name: '6.5 Availability · not enabled (deep link, employee)', render: () => <Desk area="projects" title="Projects"><AvailabilityState kind="not-enabled" feature="Projects" isAdmin={false} /></Desk> };
export const SetupNeeded: S = { name: '6.5 Availability · set-up needed', render: () => <Desk area="time" title="Time"><AvailabilityState kind="setup-needed" feature="Roster" /></Desk> };

/* 6.6 empty states */
const howItWorks = <Button icon={ArrowUpRight}>How it works</Button>;
export const EmptyEmployee: S = { name: '6.6 Empty · first use, employee', render: () => <Desk title="My requests"><EmptyState title="You have no requests yet." description="Requests you raise, and ones raised for you, appear here with their status." action={<Button variant="primary">New request</Button>} help={howItWorks} /></Desk> };
export const EmptyManager: S = { name: '6.6 Empty · first use, manager', render: () => <Desk title="Approvals"><EmptyState title="Nothing is waiting for your approval." description="Your team's leave, attendance and expense requests appear here when they need you." action={<Button>Set a delegate</Button>} help={howItWorks} /></Desk> };
export const EmptyHr: S = { name: '6.6 Empty · first use, HR', render: () => <Desk area="settings" title="Leave types"><EmptyState title="No leave types yet." description="Leave types decide what people can apply for and how balances build up." action={<Button variant="primary">Add leave type</Button>} help={howItWorks} /></Desk> };
export const EmptyPayroll: S = { name: '6.6 Empty · first use, payroll admin', render: () => <Desk area="pay" title="Payroll"><EmptyState title="No payroll runs yet." description="Create your first run once pay groups and salary templates are ready." action={<Button variant="primary">Create payroll run</Button>} help={howItWorks} /></Desk> };
export const EmptySandbox: S = {
  name: '6.6 Empty · sandbox with sample data toggle',
  render: () => (
    <Desk area="settings" title="Leave types">
      <div className="yx-help">
        <div className="yx-sample">
          <Checkbox checked onChange={() => {}} label="Load sample data" description="Sandbox only. Sample records are labelled and removed in one action." />
          <Badge tone="info">42 sample records</Badge>
        </div>
        <EmptyState title="No leave types yet." description="Leave types decide what people can apply for and how balances build up." action={<Button variant="primary">Add leave type</Button>} help={howItWorks} />
      </div>
    </Desk>
  ),
};
export const EmptyFiltered: S = { name: '6.6 Empty · filtered to nothing', render: () => <Desk area="people" title="Directory"><EmptyState title="No results for these filters." description="Try fewer filters or a different date range." action={<Button>Clear filters</Button>} /></Desk> };
export const EmptyNotDue: S = { name: '6.6 Empty · not due', render: () => <Desk area="pay" title="Tax"><EmptyState title="Not due yet." description="Tax proofs open on 1 Jan 2027. We'll remind you a week before." /></Desk> };
export const EmptyNotCovered: S = { name: '6.6 Empty · not covered', render: () => <Desk area="pay" title="Earned wage access"><EmptyState title="Not covered by your policy." description="Earned wage access isn't part of the Hosur plant pay group. Ask HR if you think this is wrong." /></Desk> };
export const EmptyPending: S = { name: '6.6 Empty · pending', render: () => <Desk area="pay" title="Expenses"><EmptyState title="Pending with Finance." description="Your August claims are approved and waiting for the next payout on 5 Oct 2026." /></Desk> };
export const EmptyPhone: S = { name: '6.6 Empty · first use (phone)', ...phone, render: () => <PhoneFrame tab="requests" title="Requests"><EmptyState title="You have no requests yet." description="Requests you raise, and ones raised for you, appear here with their status." action={<Button variant="primary">New request</Button>} /></PhoneFrame> };
