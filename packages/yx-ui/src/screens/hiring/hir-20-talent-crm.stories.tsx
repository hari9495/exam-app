import type { Meta, StoryObj } from '@storybook/react-vite';
import { TalentCrmScreen } from './hiring-offers';
import { CAPTURES, ENGAGEMENT, POOLS, POOL_MEMBERS, POSTINGS, SEQ_STEPS } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-20 · Talent CRM', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const base = {
  pools: POOLS,
  members: POOL_MEMBERS,
  captures: CAPTURES,
  postings: [
    { job: 'Senior QA Engineer · JOB-0311', postings: POSTINGS },
    { job: 'Quality Inspector · JOB-0287 (closed: all postings closed)', postings: POSTINGS.slice(0, 3).map((p) => ({ ...p, status: 'closed' as const })) },
  ],
  steps: SEQ_STEPS,
  today: TODAY,
  engagement: ENGAGEMENT,
};

export const Pools: S = { name: 'Pools and hotlists', render: () => <TalentCrmScreen {...base} /> };
export const Campaigns: S = { name: 'Sequence and engagement timeline', render: () => <TalentCrmScreen {...base} defaultTab="campaigns" /> };
export const SequenceBuilder: S = { name: 'Sequence builder · consent-based audience', render: () => <TalentCrmScreen {...base} defaultTab="campaigns" builderOpen /> };
export const Sourced: S = { name: 'Sourced profiles · pending consent', render: () => <TalentCrmScreen {...base} defaultTab="sourced" /> };
export const Postings: S = { name: 'Job-board postings', render: () => <TalentCrmScreen {...base} defaultTab="postings" /> };
export const Empty: S = { name: 'Empty', render: () => <TalentCrmScreen {...base} pools={[]} captures={[]} /> };
