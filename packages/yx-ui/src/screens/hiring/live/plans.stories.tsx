import type { Meta, StoryObj } from '@storybook/react-vite';
import { ApprovalRoutesScreen } from './routes';

// Recruitment, wired (batch AT2; M10-BUILD-DESIGN §5). In the affordance guard set ('screens-hiring-live').
const meta: Meta = { title: 'Screens/Hiring/Live · Plans and approvals', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
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
