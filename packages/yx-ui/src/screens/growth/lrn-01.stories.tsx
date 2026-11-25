import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyLearningScreen } from './learn-me';
import { CERTS, COURSES, ENROLMENTS, RECS } from './learn-data';
import { liveMyLearning } from './learn-live-samples';

const meta: Meta = { title: 'Screens/Learning/LRN-01 · My learning and catalogue', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const base = { enrolments: ENROLMENTS, certificates: CERTS, catalogue: COURSES, recommendations: RECS, points: { total: 120, badges: ['First course', 'On-time streak'] } };

export const MyLearning: S = { name: 'My learning', render: () => <MyLearningScreen {...base} /> };
export const Catalogue: S = { name: 'Catalogue with filters', render: () => <MyLearningScreen {...base} tab="catalogue" /> };
export const Certificates: S = { name: 'Certificates (valid, expired, badges)', render: () => <MyLearningScreen {...base} tab="certificates" /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <MyLearningScreen {...base} device="phone" /> };
export const PhoneCatalogue: S = { name: 'Phone · catalogue', globals: PHONE, render: () => <MyLearningScreen {...base} device="phone" tab="catalogue" /> };
export const GamificationOff: S = { name: 'Gamification off', render: () => <MyLearningScreen {...base} points={null} /> };
export const Empty: S = { name: 'Empty (nothing assigned)', render: () => <MyLearningScreen {...base} enrolments={[]} certificates={[]} recommendations={[]} state="empty" /> };
export const Loading: S = { render: () => <MyLearningScreen {...base} state="loading" /> };
// Batch G3a: my enrolments (assigned, nominated, requested), the catalogue and my certificates.
export const Mine: S = { name: 'My courses, catalogue and certificates', render: () => <MyLearningScreen live={liveMyLearning()} /> };
export const MineCatalogue: S = { name: 'Catalogue · enrol or request', render: () => <MyLearningScreen live={liveMyLearning({ tab: 'catalogue', onNominate: () => undefined })} /> };
export const MineNothing: S = { name: 'Nothing assigned yet', render: () => <MyLearningScreen live={liveMyLearning({ enrolments: [], certificates: [] })} /> };
