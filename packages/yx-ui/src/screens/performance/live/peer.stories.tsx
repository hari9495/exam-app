import type { Meta, StoryObj } from '@storybook/react-vite';
import { FeedbackTasksScreen, PeerFormScreen, PeerPanel, PeerSetup, ReviewerBlocksScreen, type PeerPanelProps } from './peer';
import type { PeerForm } from './types';

// Peer and 360° feedback, wired (batch PM5; PRF-07). In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Peer feedback', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;
const panel: PeerPanelProps = {
  data: {
    peer: { minNominees: 3, maxNominees: 6, dueOn: '2026-10-25' },
    nominations: [
      { id: 'n1', reviewer: 'Sita Iyer', reviewerEmployeeId: 'e2', relationship: 'peer', proposedBy: 'employee', status: 'proposed' },
      { id: 'n2', reviewer: 'Ravi Kumar', reviewerEmployeeId: 'e5', relationship: 'peer', proposedBy: 'manager', status: 'approved' },
    ],
    can: { propose: false, decide: true, add: true },
  },
  groups: { advisory: true, peer: null, released: false, responses: 4, shown: [{ group: 'others', responses: 3, ratings: { g: { average: 3.67, low: 3, high: 4, count: 3 } }, texts: ['Calm under pressure at the dealer meet.', 'Shares call notes late.'] }], heldBack: 1 },
  questions: { g: 'Goals' },
  options: [{ id: 'e7', name: 'Meena Pillai', role: 'Buyer' }],
  onSearch: noop,
  onNominate: ok,
  onDecide: ok,
  onWithdraw: ok,
};
const form: PeerForm = {
  reviewId: 'r1',
  employee: 'Arjun Rao',
  cycle: 'FY 2025-26 annual review',
  dueOn: '2026-10-25',
  anonymous: true,
  sections: [{ id: 'c', title: 'Competencies', questions: [{ id: 'c', text: 'Competencies', answer: 'both', required: false, maxChars: 2000, wholeSection: true }] }],
  levels: [1, 2, 3, 4, 5].map((v) => ({ value: v, label: ['Needs improvement', 'Partly meets', 'Meets', 'Exceeds', 'Outstanding'][v - 1] })),
  entry: null,
  can: { answer: true },
};

export const OnTheReview: S = { render: () => <div className="yx-auth__page"><PeerPanel {...panel} /></div> };
export const MyTasks: S = { render: () => <FeedbackTasksScreen state="ready" tasks={[{ id: 't1', reviewId: 'r1', employee: 'Arjun Rao', cycle: 'FY 2025-26 annual review', dueOn: '2026-10-25', done: false, open: true }]} onOpen={noop} /> };
export const AnswerForm: S = { render: () => <PeerFormScreen state="ready" form={form} onBack={noop} onSave={ok} /> };
export const Blocks: S = { render: () => <ReviewerBlocksScreen state="ready" blocks={[{ id: 'b1', a: 'Arjun Rao', b: 'Sita Iyer', employeeA: 'e1', employeeB: 'e2', reasonCode: 'conflict', untilOn: null }]} people={[]} onSearch={noop} onBlock={ok} onEnd={ok} /> };
export const CycleSetup: S = { render: () => <div className="yx-auth__page"><PeerSetup value={null} onSave={ok} /></div> };
