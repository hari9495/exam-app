import type { Meta, StoryObj } from '@storybook/react-vite';
import { JourneyRecord } from './onboarding';
import { d, KAVYA_JOIN, ONBOARDING_TASKS, TODAY } from './people-data';
import type { Journey, JourneyTask } from './live/types';

const meta: Meta = { title: 'Screens/People/PPL-13 · Journey record', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Hr: S = { name: 'HR · all tasks with owners and relative dates', render: () => <JourneyRecord tasks={ONBOARDING_TASKS} joining={KAVYA_JOIN} today={TODAY} /> };
export const It: S = { name: 'IT · own tasks', render: () => <JourneyRecord tasks={ONBOARDING_TASKS} joining={KAVYA_JOIN} today={TODAY} view="it" /> };
export const Manager: S = { name: 'Manager · manager and buddy tasks', render: () => <JourneyRecord tasks={ONBOARDING_TASKS} joining={KAVYA_JOIN} today={TODAY} view="mgr" /> };
export const NewHire: S = { name: 'New hire · own tasks', render: () => <JourneyRecord tasks={ONBOARDING_TASKS} joining={KAVYA_JOIN} today={TODAY} view="hire" /> };
export const LetterOverdue: S = { name: 'Appointment letter overdue (compliance alert)', render: () => <JourneyRecord tasks={ONBOARDING_TASKS} joining={KAVYA_JOIN} today={d(2026, 10, 3)} /> };

/** PPL-15 live: a joiner's checklist after the joining plan changed (a cancelled joiner; one past the day, not joined). */
const TASK = (over: Partial<JourneyTask>): JourneyTask => ({ id: 't1', key: 'welcome_call', title: 'Call the joiner before day one', kind: 'tick', ownerType: 'manager', ownerLabel: 'Manager', assignee: 'Divya Raghunathan', dueOn: '2026-11-05', dueOffsetDays: -3, status: 'open', overdue: false, required: true, locked: false, form: null, documentType: null, answers: null, link: null, completedAt: null, completedBy: null, skipReason: null, canComplete: true, canSkip: false, version: 1, ...over });
const JOURNEY = (over: Partial<Journey>): Journey => ({ id: 'j1', kind: 'onboarding', person: 'Meghna Sample', personId: 'p1', subjectType: 'preboarding', subjectId: 'pb1', anchorOn: '2026-11-08', status: 'active', progress: 0, template: 'Standard onboarding', owner: 'Lakshmi Venkatesan', canManage: true, today: '2026-10-27', tasks: [TASK({}), TASK({ id: 't2', key: 'collect_pan', title: 'Collect the PAN card', kind: 'document', ownerType: 'hr', ownerLabel: 'HR', assignee: 'Lakshmi Venkatesan', documentType: 'pan_card', canComplete: false, dueOn: '2026-11-01', dueOffsetDays: -7 })], ...over });
const live = (journey: Journey) => ({ state: 'ready' as const, onRetry: () => {}, journey, joiner: { role: 'QA Analyst', location: 'Bengaluru head office', manager: null, buddy: null }, actions: { onComplete: async () => {}, onSkip: async () => {} } });
export const Cancelled: S = {
  name: 'Live · cancelled joiner (reneged)',
  render: () => <JourneyRecord tasks={[]} joining={d(2026, 11, 8)} today={d(2026, 10, 27)} live={live(JOURNEY({ status: 'cancelled', joiner: { status: 'cancelled', outcome: 'reneged', joined: false }, tasks: JOURNEY({}).tasks.map((t) => ({ ...t, status: 'cancelled' as const })) }))} />,
};
export const WasDue: S = {
  name: 'Live · joining day passed, not joined',
  render: () => <JourneyRecord tasks={[]} joining={d(2026, 10, 25)} today={d(2026, 10, 27)} live={live(JOURNEY({ person: 'Harish Sample', anchorOn: '2026-10-25', joiner: { status: 'invited', outcome: null, joined: false } }))} />,
};
