import type { Meta, StoryObj } from '@storybook/react-vite';
import { JourneyRecord } from './onboarding';
import { d, KAVYA_JOIN, ONBOARDING_TASKS, TODAY } from './people-data';
import type { Journey, JourneyTask } from './live/types';
import { JoinerPanel } from './live/joining';
import { BuddyCard, RehireCard } from './live/special';
import { JOINER_FORMS, JOINER_PLACES, REHIRE_VIEW } from './people-data';
import { fails, ok, pick, play, press, tick } from './popup-play';

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

// The joiner's own cards on the checklist page (People › Onboarding › a joiner): pre-boarding forms and Mark joined,
// the background check, the rehire choices and the buddy. The live components with sample data.
const plan = { departmentId: 'd-qa', designationId: 'g-qa', employmentTypeId: 't-perm' };
const bgv = { onAsk: ok, onAdd: ok, onUpdate: ok };
const joiner = (over: Partial<Parameters<typeof JoinerPanel>[0]> = {}) => <JoinerPanel forms={JOINER_FORMS} today="2026-10-05" joiningOn="2026-10-05" places={JOINER_PLACES} plan={plan} canJoin onPlan={ok} onJoin={ok} bgv={bgv} {...over} />;
export const Joiner: S = { name: 'Joiner · forms and background check (joining day)', render: () => joiner() };
export const JoinerEarly: S = { name: 'Joiner · Mark joined pressed before the joining day', render: () => joiner({ today: '2026-09-29' }), play: play(press('Mark joined')) };
export const JoinerNoPlan: S = { name: 'Joiner · job details missing, Save pressed empty', render: () => joiner({ plan: { departmentId: null, designationId: null, employmentTypeId: null } }), play: play(press('Add job details'), press('Save')) };
export const JoinerMarkJoined: S = { name: 'Mark joined · open', render: () => joiner(), play: play(press('Mark joined')) };
export const JoinerMarkJoinedMissing: S = { name: 'Mark joined · ID check not ticked', render: () => joiner(), play: play(press('Mark joined'), press('Mark joined')) };
export const JoinerMarkJoinedFailed: S = { name: 'Mark joined · the server refuses', render: () => joiner({ onJoin: fails('PAN for Kavya Reddy is still waiting for approval.') }), play: play(press('Mark joined'), tick(/original ID/), press('Mark joined')) };
export const JoinerAddCheck: S = { name: 'Background check · add a check', render: () => joiner(), play: play(press('Add a check'), pick('What to check', 'Criminal')) };
export const JoinerNoConsent: S = { name: 'Background check · not asked yet', render: () => joiner({ forms: { ...JOINER_FORMS, bgv: { requested: false, consent: null, checks: [] } } }) };
export const JoinerJoined: S = { name: 'Joiner · joined', render: () => joiner({ forms: { ...JOINER_FORMS, status: 'joined' } }) };
const rehire = (onSave: Parameters<typeof RehireCard>[0]['onSave'] = ok) => <RehireCard data={REHIRE_VIEW} onSave={onSave} />;
export const Rehire: S = { name: 'Rehire · company policy choices', render: () => rehire() };
export const RehireChoices: S = { name: 'Rehire · change choices open', render: () => rehire(), play: play(press('Change choices')) };
export const RehireMissing: S = { name: 'Rehire · a choice away from policy without a reason', render: () => rehire(), play: play(press('Change choices'), pick('Gratuity service', 'Add prior'), press('Save choices')) };
export const RehireFailed: S = { name: 'Rehire · the server refuses', render: () => rehire(fails('Someone else changed these choices. Open the page again.')), play: play(press('Change choices'), press('Save choices')) };
const buddy = (current: string | null, onSave: Parameters<typeof BuddyCard>[0]['onSave'] = ok) => <BuddyCard people={JOINER_PLACES.managers} current={current} managerEmployeeId="m-divya" onSave={onSave} />;
export const Buddy: S = { name: 'Buddy · none yet', render: () => buddy(null) };
export const BuddyPicked: S = { name: 'Buddy · picked', render: () => buddy(null), play: play(pick('Buddy', /Joseph Mathew/)) };
export const BuddyUnchanged: S = { name: 'Buddy · Save pressed without a change', render: () => buddy('m-ramesh'), play: play(press('Save buddy')) };
export const BuddyFailed: S = { name: 'Buddy · the server refuses', render: () => buddy(null, fails('Joseph Mathew already looks after two joiners.')), play: play(pick('Buddy', /Joseph Mathew/), press('Save buddy')) };
