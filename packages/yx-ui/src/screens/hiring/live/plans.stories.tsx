import type { Meta, StoryObj } from '@storybook/react-vite';
import { HeadcountPlansScreen, type HeadcountPlansScreenProps } from './plans';
import { ApprovalRoutesScreen } from './routes';

// Recruitment, wired (batch AT2; M10-BUILD-DESIGN §5). In the affordance guard set ('screens-hiring-live').
const meta: Meta = { title: 'Screens/Hiring/Live · Plans and approvals', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const plans: HeadcountPlansScreenProps = {
  state: 'ready',
  fy: 2026,
  years: [2025, 2026, 2027],
  onFy: () => undefined,
  plans: [
    { id: 'p1', departmentId: 'd1', department: 'Finance', legalEntityId: null, fyStart: 2026, status: 'approved', note: null, version: 3, lines: [{ id: 'l1', designationId: 'x1', designation: 'Accountant', gradeId: null, grade: null, locationId: 'c1', location: 'Chennai', count: 3, budget: 2_700_000, committed: 1, committedBudget: 900_000, filled: 1 }] },
    { id: 'p2', departmentId: 'd2', department: 'Operations', legalEntityId: null, fyStart: 2026, status: 'draft', note: 'Second shift from October', version: 1, lines: [{ id: 'l2', designationId: 'x2', designation: 'Supervisor', gradeId: 'g2', grade: 'G2', locationId: null, location: null, count: 2, budget: null, committed: 0, committedBudget: 0, filled: 0 }] },
  ],
  departments: [{ value: 'd1', label: 'Finance' }, { value: 'd2', label: 'Operations' }],
  designations: [{ value: 'x1', label: 'Accountant' }, { value: 'x2', label: 'Supervisor' }],
  grades: [{ value: 'g2', label: 'G2' }],
  locations: [{ value: 'c1', label: 'Chennai' }],
  onSave: ok,
  onSubmit: ok,
};

export const Plans: S = { render: () => <HeadcountPlansScreen {...plans} /> };
export const NoPlans: S = { render: () => <HeadcountPlansScreen {...plans} plans={[]} /> };
export const Routes: S = {
  render: () => (
    <ApprovalRoutesScreen
      state="ready"
      requisition={{ enabled: true, steps: [{ name: 'Department head', approverType: 'reporting_manager', approverUserIds: [], managerLevel: 1, groupId: null }] }}
      offer={{ enabled: false, steps: [] }}
      people={[{ value: 'u1', label: 'Priya Nair' }]}
      groups={[{ value: 'g1', label: 'Finance approvers' }]}
      onSave={ok}
    />
  ),
};
