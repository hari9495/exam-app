import type { Meta, StoryObj } from '@storybook/react-vite';
import { OrgChartScreen } from './directory';
import { d, ORG, ORG_JUL, ORG_PROMOTED, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-02 · Org chart', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Reporting: S = { name: 'Reporting lines (today)', render: () => <OrgChartScreen people={ORG} asOn={TODAY} today={TODAY} /> };
export const Department: S = { name: 'Department view', render: () => <OrgChartScreen people={ORG} asOn={TODAY} today={TODAY} defaultView="department" /> };
export const Positions: S = { name: 'Position view with vacancies', render: () => <OrgChartScreen people={ORG} asOn={TODAY} today={TODAY} defaultView="position" /> };
export const AsOnPast: S = { name: 'As on 1 Jul 2026', render: () => <OrgChartScreen people={ORG_JUL} asOn={d(2026, 7, 1)} today={TODAY} /> };
export const AsOnFuture: S = { name: 'As on 1 Oct 2026 (scheduled changes)', render: () => <OrgChartScreen people={ORG.map((p) => (p.id === ORG_PROMOTED.id ? { ...p, role: 'Quality Lead' } : p))} asOn={d(2026, 10, 1)} today={TODAY} defaultSelected={ORG_PROMOTED.id} /> };
export const EmployeeView: S = { name: 'Employee view', render: () => <OrgChartScreen people={ORG} asOn={TODAY} today={TODAY} persona="emp" /> };
// Founder 20 Oct 2026 (option B): one legal entity chosen in the top bar; a manager in another entity is a quiet line.
export const OneEntity: S = {
  name: 'One entity · manager in another entity',
  render: () => {
    const head = ORG.find((p) => !p.managerId)!;
    const kept = ORG.filter((p) => p.id !== head.id).map((p) => (p.managerId === head.id ? { ...p, managerId: null, reportsTo: `${head.name} (Kaveri Foods Pvt Ltd)` } : p));
    return <OrgChartScreen people={kept} asOn={TODAY} today={TODAY} />;
  },
};
