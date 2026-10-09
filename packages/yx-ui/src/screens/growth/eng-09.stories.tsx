import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecognitionWallScreen } from './engage-recognition';
import { KUDOS_WALL, LEADERS, VALUES } from './engage-data';

const meta: Meta = { title: 'Screens/Engage/ENG-09 · Recognition wall and leaderboard', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Wall: S = { name: 'Wall and leaderboard', render: () => <RecognitionWallScreen kudos={KUDOS_WALL} values={VALUES} leaders={LEADERS} /> };
export const LeaderboardOff: S = { name: 'Company switched leaderboard off', render: () => <RecognitionWallScreen kudos={KUDOS_WALL} values={VALUES} leaders={LEADERS} leaderboardOn={false} /> };
export const OptedOut: S = { name: 'Employee opted out of leaderboards', render: () => <RecognitionWallScreen kudos={KUDOS_WALL} values={VALUES} leaders={LEADERS} optedOut /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <RecognitionWallScreen device="phone" kudos={KUDOS_WALL} values={VALUES} leaders={LEADERS} /> };
export const Empty: S = { render: () => <RecognitionWallScreen kudos={[]} values={VALUES} leaders={[]} /> };
