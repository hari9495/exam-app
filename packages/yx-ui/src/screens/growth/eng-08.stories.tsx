import type { Meta, StoryObj } from '@storybook/react-vite';
import { GiveKudosScreen } from './engage-recognition';
import { BADGES, VALUES } from './engage-data';
import { PEOPLE } from './perf-data-2';

const meta: Meta = { title: 'Screens/Engage/ENG-08 · Give kudos', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const OPTS = PEOPLE.map((p) => ({ value: p.id, label: p.name }));
const POINTS = { allowance: 300, approvalThreshold: 100, managerChainLimit: 50, managerChain: ['Karthik Subramanian'] };

export const BadgesOnly: S = { name: 'Badges only (company default)', render: () => <GiveKudosScreen me="Divya Raghunathan" people={OPTS} values={VALUES} badges={BADGES} points={null} defaults={{ to: ['t3'], value: 'Customer first', message: 'Thanks for re-running the seal-strength tests.' }} /> };
export const WithPoints: S = { name: 'With points', render: () => <GiveKudosScreen me="Divya Raghunathan" people={OPTS} values={VALUES} badges={BADGES} points={POINTS} defaults={{ to: ['t3'], value: 'Customer first', points: 50, message: 'Thanks for re-running the seal-strength tests.' }} /> };
export const NeedsApproval: S = { name: 'Above threshold: needs approval', render: () => <GiveKudosScreen me="Divya Raghunathan" people={OPTS} values={VALUES} badges={BADGES} points={POINTS} defaults={{ to: ['t2'], value: 'Do it right', points: 150, message: 'Caught the mislabelled allergen batch.' }} /> };
export const Errors: S = { name: 'Errors: over allowance, manager chain', render: () => <GiveKudosScreen me="Divya Raghunathan" people={OPTS} values={VALUES} badges={BADGES} points={POINTS} defaults={{ to: ['t2', 'x1'], value: 'Ownership', points: 200, message: 'Thank you both.' }} /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <GiveKudosScreen device="phone" me="Divya Raghunathan" people={OPTS} values={VALUES} badges={BADGES} points={null} /> };
export const Sent: S = { name: 'Sent', render: () => <GiveKudosScreen me="Divya Raghunathan" people={OPTS} values={VALUES} badges={BADGES} points={null} defaults={{ to: ['t3'] }} sent /> };
