// Help & onboarding UX patterns (APX-D §6).
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { Button } from '../../components/button';
import { PageHeader } from '../../components/shell';
import { DesktopFrame, PhoneFrame, type AreaId } from '../_kit/frames';
import {
  APPLY_LEAVE_HELP,
  AccessDeniedState,
  AvailabilityBanner,
  AvailabilityState,
  BulkApproveConfirm,
  HelpDrawer,
  HelpTopicBody,
  IrreversibleActionDialog,
  NEWS,
  NotFoundState,
  RoleEmptyState,
  TOURS,
  TourCard,
  WhatsNewList,
  newsFor,
} from './help';
import './settings.css';

const meta: Meta = { title: 'Screens/Help and onboarding/Patterns', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

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
export const HelpDrawerPage: S = {
  name: '6.2 Help drawer · this page (TIM-18 apply leave)',
  render: () => (
    <Desk area="time" title="Leave">
      <PageHeader title="Apply leave" />
      <HelpDrawer topic={APPLY_LEAVE_HELP} />
    </Desk>
  ),
};
export const HelpDrawerNews: S = {
  name: "6.2 Help drawer · what's new",
  render: () => (
    <Desk title="Home">
      <PageHeader title="Home" />
      <HelpDrawer topic={APPLY_LEAVE_HELP} defaultTab="new" news={newsFor(NEWS, 'Employee', ['Time', 'Pay'])} />
    </Desk>
  ),
};
export const HelpDrawerNewsEmpty: S = {
  name: "6.2 Help drawer · what's new, nothing yet",
  render: () => (
    <Desk title="Home">
      <HelpDrawer topic={APPLY_LEAVE_HELP} defaultTab="new" news={[]} />
    </Desk>
  ),
};
export const HelpDrawerTours: S = {
  name: '6.2 Help drawer · tours (resume, replay)',
  render: () => (
    <Desk title="Home">
      <HelpDrawer
        topic={APPLY_LEAVE_HELP}
        defaultTab="tours"
        tourHistory={[
          { tourId: 'employee', version: 2, status: 'completed' },
          { tourId: 'manager', version: 1, status: 'in-progress', step: 1 },
          { tourId: 'payroll', version: 3, status: 'skipped' },
        ]}
      />
    </Desk>
  ),
};
export const HelpPhone: S = {
  name: '6.2 Help · phone (bottom sheet content)',
  ...phone,
  render: () => (
    <PhoneFrame tab="time" title="Help · Apply leave">
      <HelpTopicBody topic={APPLY_LEAVE_HELP} lang="English" setLang={() => {}} />
    </PhoneFrame>
  ),
};
export const WhatsNewManager: S = {
  name: "6.2 What's new · manager",
  render: () => (
    <Desk title="What's new">
      <PageHeader title="What's new" description="Changes to the products you use" />
      <WhatsNewList items={newsFor(NEWS, 'Manager', ['Time', 'Performance'])} />
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
      <NotFoundState />
    </Desk>
  ),
};
export const NotFoundPhone: S = { name: '6.3 Not found · phone', ...phone, render: () => <PhoneFrame tab="home" title="Not found"><NotFoundState /></PhoneFrame> };

/* 6.4 irreversible */
const PUBLISH = {
  title: 'Publish payslips for September 2026?',
  whatHappens: ['248 people get their payslip by app and email.', 'Payslips become visible in Pay and in the alumni portal.'],
  figures: [
    { label: 'Payslips', value: '248' },
    { label: 'Net pay', value: '₹1,82,40,500' },
    { label: 'Entity', value: 'Kaveri Foods Pvt Ltd' },
  ],
  cannotUndo: 'Published payslips cannot be withdrawn.',
  correction: 'Changes after this go to October 2026 as arrears.',
  phrase: 'KAVERI SEP 2026',
  confirmLabel: 'Publish payslips',
  maker: 'Suresh Pillai',
  checker: 'Meera Iyer',
};
export const IrreversiblePublish: S = {
  name: '6.4 Irreversible · publish payslips',
  render: () => (
    <Desk area="pay" title="Payroll">
      <IrreversibleActionDialog {...PUBLISH} />
    </Desk>
  ),
};
export const IrreversibleTyped: S = {
  name: '6.4 Irreversible · phrase typed, ready',
  render: () => (
    <Desk area="pay" title="Payroll">
      <IrreversibleActionDialog {...PUBLISH} defaultTyped="KAVERI SEP 2026" />
    </Desk>
  ),
};
export const IrreversibleSamePerson: S = {
  name: '6.4 Irreversible · maker is the checker (blocked)',
  render: () => (
    <Desk area="pay" title="Payroll">
      <IrreversibleActionDialog {...PUBLISH} checker="Suresh Pillai" sameAsMaker defaultTyped="KAVERI SEP 2026" />
    </Desk>
  ),
};
export const IrreversibleReopen: S = {
  name: '6.4 Irreversible · reopen period (reason required)',
  render: () => (
    <Desk area="time" title="Periods">
      <IrreversibleActionDialog
        title="Reopen attendance for August 2026?"
        whatHappens={['Attendance for 248 people becomes editable again.', 'The August payroll run is marked "needs recalculation".']}
        figures={[
          { label: 'People', value: '248' },
          { label: 'Period', value: 'Aug 2026' },
        ]}
        cannotUndo="Reopening is recorded permanently."
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
  render: () => (
    <Desk title="Approvals">
      <BulkApproveConfirm count={14} type="leave requests" />
    </Desk>
  ),
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
export const EmptyEmployee: S = { name: '6.6 Empty · first use, employee', render: () => <Desk title="My requests"><RoleEmptyState kind="first-use" role="Employee" /></Desk> };
export const EmptyManager: S = { name: '6.6 Empty · first use, manager', render: () => <Desk title="Approvals"><RoleEmptyState kind="first-use" role="Manager" /></Desk> };
export const EmptyHr: S = { name: '6.6 Empty · first use, HR', render: () => <Desk area="settings" title="Leave types"><RoleEmptyState kind="first-use" role="HR" /></Desk> };
export const EmptyPayroll: S = { name: '6.6 Empty · first use, payroll admin', render: () => <Desk area="pay" title="Payroll"><RoleEmptyState kind="first-use" role="Payroll admin" /></Desk> };
export const EmptySandbox: S = { name: '6.6 Empty · sandbox with sample data toggle', render: () => <Desk area="settings" title="Leave types"><RoleEmptyState kind="first-use" role="HR" sandbox /></Desk> };
export const EmptyFiltered: S = { name: '6.6 Empty · filtered to nothing', render: () => <Desk area="people" title="Directory"><RoleEmptyState kind="filtered" role="HR" /></Desk> };
export const EmptyNotDue: S = { name: '6.6 Empty · not due', render: () => <Desk area="pay" title="Tax"><RoleEmptyState kind="not-due" role="Employee" /></Desk> };
export const EmptyNotCovered: S = { name: '6.6 Empty · not covered', render: () => <Desk area="pay" title="Earned wage access"><RoleEmptyState kind="not-covered" role="Employee" /></Desk> };
export const EmptyPending: S = { name: '6.6 Empty · pending', render: () => <Desk area="pay" title="Expenses"><RoleEmptyState kind="pending" role="Employee" /></Desk> };
export const EmptyPhone: S = { name: '6.6 Empty · first use (phone)', ...phone, render: () => <PhoneFrame tab="requests" title="Requests"><RoleEmptyState kind="first-use" role="Employee" /></PhoneFrame> };
