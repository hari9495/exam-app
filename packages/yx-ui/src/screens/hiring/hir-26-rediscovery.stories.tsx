import type { Meta, StoryObj } from '@storybook/react-vite';
import { RediscoveryPanel, RequisitionsScreen } from './hiring-plan';
import { PLAN_LINES, REDISCOVERY, REQUISITIONS } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-26 · Rediscovery panel', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const OnRequisition: S = {
  name: 'On the requisition · recruiter',
  render: () => <RequisitionsScreen rows={REQUISITIONS} planLines={PLAN_LINES} persona="recruiter" openId="r1" rediscovery={REDISCOVERY} now={TODAY} />,
};
export const Recruiter: S = { name: 'Panel · recruiter', render: () => <div style={{ maxWidth: 640 }}><RediscoveryPanel matches={REDISCOVERY} viewer="recruiter" /></div> };
export const HiringManager: S = { name: 'Panel · hiring manager', render: () => <div style={{ maxWidth: 640 }}><RediscoveryPanel matches={REDISCOVERY} viewer="hm" /></div> };
export const NoMatches: S = { name: 'Empty · no matches', render: () => <div style={{ maxWidth: 640 }}><RediscoveryPanel matches={[]} viewer="recruiter" /></div> };
export const AiNotes: S = {
  name: 'Panel · AI notes, advice only',
  render: () => (
    <div style={{ maxWidth: 640 }}>
      <RediscoveryPanel matches={[]} viewer="recruiter" live={{ state: 'ready', onRetry: () => {}, mode: 'ai', ai: 'on', matches: REDISCOVERY.map((m, i) => ({ ...m, aiNote: i === 0 ? 'Reached the final panel for a QA role last year and lists Selenium and API testing.' : null })), onAdd: async () => {} }} />
    </div>
  ),
};
export const PlainSearch: S = {
  name: 'Panel · plain search, AI off',
  render: () => (
    <div style={{ maxWidth: 640 }}>
      <RediscoveryPanel matches={[]} viewer="hm" live={{ state: 'ready', onRetry: () => {}, mode: 'text', ai: 'off', matches: REDISCOVERY }} />
    </div>
  ),
};
