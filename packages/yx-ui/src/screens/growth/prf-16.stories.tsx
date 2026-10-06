import type { Meta, StoryObj } from '@storybook/react-vite';
import { ManagerCoachHome } from './perf-goals';
import { OneOnOneScreen } from './perf-people';
import { NUDGES, d } from './perf-data';
import { ONE_ON_ONES, SUGGESTED_AGENDA } from './perf-data-2';

const meta: Meta = { title: 'Screens/Performance/PRF-16 · Manager coach and 1:1 agenda', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const CoachCard: S = { name: 'Coach card on manager home', render: () => <ManagerCoachHome nudges={NUDGES} weekOf={d(28)} /> };
export const CoachCardPhone: S = { name: 'Coach card · phone', globals: PHONE, render: () => <ManagerCoachHome device="phone" nudges={NUDGES} weekOf={d(28)} /> };
export const NoNudges: S = { name: 'No nudges this week', render: () => <ManagerCoachHome nudges={[]} weekOf={d(28)} /> };
export const OptedOut: S = { name: 'Opted out', render: () => <ManagerCoachHome nudges={NUDGES} weekOf={d(28)} optedOut /> };
export const SuggestedAgenda: S = { name: 'Suggested 1:1 agenda panel', render: () => <OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" suggestedAgenda={SUGGESTED_AGENDA} /> };
export const SuggestedAgendaPhone: S = { name: 'Suggested 1:1 agenda · phone', globals: PHONE, render: () => <OneOnOneScreen persona="mgr" device="phone" items={ONE_ON_ONES} openId="o1" suggestedAgenda={SUGGESTED_AGENDA} /> };
