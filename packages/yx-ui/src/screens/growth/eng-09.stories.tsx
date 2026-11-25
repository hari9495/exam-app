import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecognitionWallScreen } from './engage-recognition';
import { KUDOS_WALL, LEADERS, VALUES } from './engage-data';
import { liveWall } from './engage-live-samples';

const meta: Meta = { title: 'Screens/Engage/ENG-09 · Recognition wall and leaderboard', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Wall: S = { name: 'Wall and leaderboard', render: () => <RecognitionWallScreen kudos={KUDOS_WALL} values={VALUES} leaders={LEADERS} /> };
export const LeaderboardOff: S = { name: 'Company switched leaderboard off', render: () => <RecognitionWallScreen kudos={KUDOS_WALL} values={VALUES} leaders={LEADERS} leaderboardOn={false} /> };
export const OptedOut: S = { name: 'Employee opted out of leaderboards', render: () => <RecognitionWallScreen kudos={KUDOS_WALL} values={VALUES} leaders={LEADERS} optedOut /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <RecognitionWallScreen device="phone" kudos={KUDOS_WALL} values={VALUES} leaders={LEADERS} /> };
export const Empty: S = { render: () => <RecognitionWallScreen kudos={[]} values={VALUES} leaders={[]} /> };
// Batch G2 item 73: the company's kudos by value; badges only, so no leaderboard.
export const CompanyWall: S = { name: 'Company kudos by value (badges only)', render: () => <RecognitionWallScreen live={liveWall()} /> };
export const CompanyWallEmpty: S = { name: 'Company wall · no kudos for a value yet', render: () => <RecognitionWallScreen live={liveWall({ kudos: [], value: 'Win together' })} /> };
