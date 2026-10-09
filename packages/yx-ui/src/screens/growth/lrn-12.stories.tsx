import type { Meta, StoryObj } from '@storybook/react-vite';
import { TrainingFeedbackScreen } from './learn-me';

const meta: Meta = { title: 'Screens/Learning/LRN-12 · Session feedback and 60-day check', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Reaction: S = { name: 'Employee · reaction survey', render: () => <TrainingFeedbackScreen mode="reaction" course="Fire safety and evacuation" trainer="Ramesh Kamath" /> };
export const ReactionPhone: S = { name: 'Employee · phone', globals: PHONE, render: () => <TrainingFeedbackScreen mode="reaction" device="phone" course="Fire safety and evacuation" trainer="Ramesh Kamath" /> };
export const ManagerCheck: S = { name: 'Manager · 60-day check', render: () => <TrainingFeedbackScreen mode="manager-check" course="Statistical process control" trainer="Anita Deshpande" person="Rohit Bhat" /> };
export const ManagerCheckPhone: S = { name: 'Manager · 60-day check on phone', globals: PHONE, render: () => <TrainingFeedbackScreen mode="manager-check" device="phone" course="Statistical process control" trainer="Anita Deshpande" person="Rohit Bhat" /> };
export const Sent: S = { name: 'Sent', render: () => <TrainingFeedbackScreen mode="reaction" course="Fire safety and evacuation" trainer="Ramesh Kamath" sent /> };
