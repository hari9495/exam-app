import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClientPortalScreen, type ClientPortalProps } from './t9-business';
import { PortalSignInScreen } from './portals-kit';
import { CLIENT, CLIENT_INTERVIEWS, CLIENT_INVOICES, CLIENT_JOBS, CLIENT_SUBMISSIONS, CLIENT_TICKETS, CLIENT_TIMESHEETS, STAFFING_ACCENT, STAFFING_TENANT } from './t9-biz-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-06 · Client portal', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base: ClientPortalProps = {
  tenant: STAFFING_TENANT,
  accent: STAFFING_ACCENT,
  client: CLIENT,
  today: TODAY,
  tab: 'jobs',
  jobs: CLIENT_JOBS,
  submissions: CLIENT_SUBMISSIONS,
  interviews: CLIENT_INTERVIEWS,
  timesheets: CLIENT_TIMESHEETS,
  invoices: CLIENT_INVOICES,
  tickets: CLIENT_TICKETS,
};

export const SignIn: S = {
  name: 'Sign in (email OTP)',
  render: () => (
    <PortalSignInScreen
      tenant={STAFFING_TENANT}
      portal="Client portal"
      accent={STAFFING_ACCENT}
      footer={{ privacy: 'Privacy notice for client contacts (G-09)' }}
      signIn={{ title: 'Sign in to the client portal', intro: 'Use your work email. You also accept the confidentiality and no-onward-sharing undertaking.', notice: 'client confidentiality undertaking (G-09)' }}
    />
  ),
};
export const Jobs: S = { render: () => <ClientPortalScreen {...base} /> };
export const Submissions: S = { render: () => <ClientPortalScreen {...base} tab="submissions" /> };
export const RejectWithFeedback: S = { name: 'Submissions · reject with feedback', render: () => <ClientPortalScreen {...base} tab="submissions" defaultRejectId="S-8812" /> };
export const Interviews: S = { render: () => <ClientPortalScreen {...base} tab="interviews" /> };
export const ScheduleInterview: S = { name: 'Interviews · schedule', render: () => <ClientPortalScreen {...base} tab="interviews" defaultScheduleOpen /> };
export const Timesheets: S = { name: 'Timesheets · approve (incl. vendor workers)', render: () => <ClientPortalScreen {...base} tab="timesheets" /> };
export const Invoices: S = { name: 'Invoices · one overdue', render: () => <ClientPortalScreen {...base} tab="invoices" /> };
export const Tickets: S = { render: () => <ClientPortalScreen {...base} tab="tickets" /> };
export const RaiseTicket: S = { name: 'Tickets · raise a ticket', render: () => <ClientPortalScreen {...base} tab="tickets" defaultTicketOpen /> };
export const Phone: S = { name: 'Submissions · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <ClientPortalScreen {...base} tab="submissions" /> };
export const EmptyJobs: S = { name: 'Jobs · empty', render: () => <ClientPortalScreen {...base} jobs={[]} /> };
export const OtherClientRecord: S = { name: "Another client's record (403)", render: () => <ClientPortalScreen {...base} tab="submissions" forbidden /> };
