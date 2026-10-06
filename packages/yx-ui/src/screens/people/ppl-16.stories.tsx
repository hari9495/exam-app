import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProbationQueue } from './onboarding';
import { PROBATIONS, TODAY } from './people-data';
import { ME } from '../_kit/data';

const meta: Meta = { title: 'Screens/People/PPL-16 · Probation reviews queue', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Hr: S = { name: 'HR · due, overdue, escalated', render: () => <ProbationQueue rows={PROBATIONS} today={TODAY} /> };
export const Manager: S = { name: 'Manager · my team', render: () => <ProbationQueue rows={PROBATIONS.filter((p) => p.manager === ME.name)} today={TODAY} persona="mgr" /> };
export const Decide: S = { name: 'HR · decide an escalated review', render: () => <ProbationQueue rows={PROBATIONS} today={TODAY} defaultOpenId="p3" /> };
export const Empty: S = { name: '· empty', render: () => <ProbationQueue rows={[]} today={TODAY} /> };
