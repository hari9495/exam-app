import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusPageScreen, statusFor, type StatusPageProps } from './t9-public';
import { INCIDENT, MAINTENANCE, REGION_LABEL, STATUS_COMPONENTS, STATUS_HISTORY, STATUS_REGIONS, statusHistory } from './t9-pub-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-17 · Public status page', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const history = statusHistory(TODAY, [
  { daysAgo: 15, status: 'partial', note: 'Careers-page apply failed for some candidates' },
  { daysAgo: 55, status: 'degraded', note: 'Proctoring uploads delayed' },
]);
const base: StatusPageProps = { region: 'IN', regions: STATUS_REGIONS, regionLabel: REGION_LABEL, components: STATUS_COMPONENTS, history, past: STATUS_HISTORY };

export const Operational: S = { name: 'All operational', render: () => <StatusPageScreen {...base} /> };
export const Incident: S = {
  name: 'Incident · degraded payslips (payroll-day note)',
  render: () => <StatusPageScreen {...base} components={statusFor(STATUS_COMPONENTS, { Payslips: 'degraded' })} incident={INCIDENT} history={statusHistory(TODAY, [{ daysAgo: 0, status: 'degraded', note: 'Payslip PDFs slow' }])} />,
};
export const MajorOutage: S = {
  name: 'Major outage',
  render: () => (
    <StatusPageScreen
      {...base}
      components={statusFor(STATUS_COMPONENTS, { 'Sign-in (OTP and SSO)': 'major', API: 'partial' })}
      incident={{ ...INCIDENT, title: 'Sign-in failing in India', severity: 'Sev-1', components: 'Sign-in, API', impact: 'Most people cannot sign in. Data is safe.', whatToDo: 'Please wait; do not reset passwords. We will update within 30 minutes.', updates: [{ stage: 'Investigating', at: new Date(2026, 8, 29, 9, 31), text: 'Sign-in requests are failing for most tenants in India.' }] }}
    />
  ),
};
export const Maintenance: S = { name: 'Scheduled maintenance · Singapore', render: () => <StatusPageScreen {...base} region="SG" maintenance={MAINTENANCE} /> };
export const Subscribed: S = { name: 'Subscribe · confirmation sent', render: () => <StatusPageScreen {...base} subscribed /> };
export const Phone: S = { name: 'Incident · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <StatusPageScreen {...base} incident={INCIDENT} components={statusFor(STATUS_COMPONENTS, { Payslips: 'degraded' })} /> };
