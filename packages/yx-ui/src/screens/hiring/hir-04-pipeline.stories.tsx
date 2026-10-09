import type { Meta, StoryObj } from '@storybook/react-vite';
import { PipelineBoardScreen } from './hiring-pipeline';
import { CANDIDATES, STAGES } from './hiring-data';

const meta: Meta = { title: 'Screens/Hiring/HIR-04 · Pipeline board', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const JOB = 'Senior QA Engineer';

export const Recruiter: S = { name: 'Recruiter · rich cards', render: () => <PipelineBoardScreen job={JOB} candidates={CANDIDATES} stages={STAGES} persona="recruiter" /> };
export const HiringManager: S = { name: 'Hiring manager', render: () => <PipelineBoardScreen job={JOB} candidates={CANDIDATES} stages={STAGES} persona="hm" /> };
export const MoveMenu: S = { name: 'Move to menu (keyboard alternative)', render: () => <PipelineBoardScreen job={JOB} candidates={CANDIDATES} stages={STAGES} persona="recruiter" defaultMoveMenuFor="c2" /> };
export const RejectReason: S = {
  name: 'Reject asks for a reason',
  render: () => <PipelineBoardScreen job={JOB} candidates={CANDIDATES} stages={STAGES} persona="recruiter" defaultReasonFor={{ cardId: 'c8', to: 'Rejected' }} />,
};
export const Empty: S = { name: 'Empty', render: () => <PipelineBoardScreen job={JOB} candidates={[]} stages={STAGES} persona="recruiter" /> };
export const Loading: S = { name: 'Loading', render: () => <PipelineBoardScreen job={JOB} candidates={[]} stages={STAGES} persona="recruiter" state="loading" /> };
export const Error: S = { name: 'Error', render: () => <PipelineBoardScreen job={JOB} candidates={[]} stages={STAGES} persona="recruiter" state="error" /> };
