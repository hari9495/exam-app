import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyLearningScreen } from './learn-me';
import { CERTS, COURSES, ENROLMENTS, RECS } from './learn-data';

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
