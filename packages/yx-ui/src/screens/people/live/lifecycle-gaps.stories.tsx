import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent } from 'storybook/test';
import { fails, never, ok, pick, play, press, pressFirst, type } from '../../_kit/story-play';
import { choose } from '../popup-play';
import { MyAssetsScreen, type MyAssetsScreenProps } from './exits';
import { SignatoriesDrawer, type SignatoriesDrawerProps } from './joining';
import { FirstThirtyDaysScreen, type FirstThirtyDaysScreenProps } from './lifecycle';
import { JourneyTemplatesScreen, type JourneyTemplatesScreenProps } from './templates';
import type { FirstThirtyDays, JourneyTask, JourneyTemplates, MyAsset, Signatory } from './types';

// Live People pieces that had no design story: Me › My assets, Me › My first 30 days, Settings › Checklists and the
// letter signatories drawer. The same components the pages render, with Kaveri Foods data (3 Nov 2026).
const meta: Meta = { title: 'Screens/People/Live · My assets, first 30 days, checklists and signatories', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ Me › My assets (PPL-25 acknowledge)
const ASSETS: MyAsset[] = [
  { assignmentId: 'a1', name: 'Dell Latitude 5440', category: 'Laptop', tag: 'KF-LT-0418', serial: 'SN-5440-88213', issuedOn: '2026-11-03', condition: 'New, with charger and bag', acknowledgedAt: null },
  { assignmentId: 'a2', name: 'Samsung Galaxy Tab A9', category: 'Tablet', tag: 'KF-TAB-0044', serial: 'SN-TB44-0192', issuedOn: '2026-11-03', condition: 'Used, screen guard fitted', acknowledgedAt: null },
  { assignmentId: 'a3', name: 'Access card, Hosur plant', category: 'ID card', tag: 'KF-ID-2291', serial: null, issuedOn: '2026-10-27', condition: 'New', acknowledgedAt: '2026-10-27T05:10:00Z' },
];
const assets = (over: Partial<MyAssetsScreenProps> = {}) => <MyAssetsScreen state="ready" rows={ASSETS} onAcknowledge={ok} {...over} />;
export const Assets: S = { name: 'My assets · two to confirm', render: () => assets() };
export const AssetsAllConfirmed: S = { name: 'My assets · all confirmed', render: () => assets({ rows: ASSETS.map((a) => ({ ...a, acknowledgedAt: a.acknowledgedAt ?? '2026-11-03T06:00:00Z' })) }) };
export const AssetsConfirming: S = { name: 'My assets · confirming', render: () => assets({ onAcknowledge: never }), play: play(pressFirst('I have it')) };
export const AssetsEmpty: S = { name: 'My assets · none held', render: () => assets({ rows: [] }) };
export const AssetsLoading: S = { name: 'My assets · loading', render: () => assets({ state: 'loading', rows: null }) };
export const AssetsError: S = { name: 'My assets · could not load', render: () => assets({ state: 'error', rows: null, onRetry: () => undefined }) };
export const AssetsPhone: S = { name: 'My assets · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => assets() };

// ------------------------------------------------------------------ Me › My first 30 days (LIFE-6.04)
const task = (id: string, title: string, dueOn: string, over: Partial<JourneyTask> = {}): JourneyTask => ({
  id, key: id, title, kind: 'tick', ownerType: 'person', ownerLabel: 'You', assignee: 'Kavya Reddy', dueOn, dueOffsetDays: 0, status: 'open', overdue: false, required: true, locked: false,
  form: null, documentType: null, answers: null, link: null, completedAt: null, completedBy: null, skipReason: null, canComplete: true, canSkip: false, version: 1, ...over,
});
const FIRST: FirstThirtyDays = {
  journeyId: 'j-kavya',
  joinedOn: '2026-10-27',
  date: '2026-11-03',
  day: 8,
  manager: 'Divya Raghunathan',
  buddy: 'Arjun Kulkarni',
  done: 6,
  today: [
    task('t1', 'Read the leave and attendance policy', '2026-11-03', { kind: 'read', content: { text: 'You get 12 days of casual leave and 15 days of earned leave a year.\nMark attendance at the Hosur gate or in the app.', url: 'https://kaverifoods.example.in/policies/leave' } }),
    task('t2', 'Add a nominee for PF and insurance', '2026-11-02', { overdue: true, canSkip: true, required: false }),
  ],
  week: [
    task('t3', 'Watch the food safety induction', '2026-11-05', { kind: 'watch', content: { url: 'https://kaverifoods.example.in/learn/food-safety', minutes: 20 } }),
    task('t4', 'Lunch with your buddy, Arjun Kulkarni', '2026-11-06', { ownerType: 'buddy', ownerLabel: 'Buddy', assignee: 'Arjun Kulkarni', canComplete: false }),
  ],
  month: [task('t5', 'How is your first month going?', '2026-11-26', { kind: 'survey', content: { questions: ['I know what is expected of me', 'I have what I need to do my work'] } })],
};
const first = (over: Partial<FirstThirtyDaysScreenProps> = {}) => <FirstThirtyDaysScreen state="ready" data={FIRST} onComplete={ok} onSkip={ok} {...over} />;
export const First: S = { name: 'My first 30 days · day 8', render: () => first() };
export const FirstQuiet: S = { name: 'My first 30 days · nothing for today or this week', render: () => first({ data: { ...FIRST, today: [], week: [], manager: null, buddy: null } }) };
export const FirstRead: S = { name: 'My first 30 days · a step to read', render: () => first(), play: play(pressFirst('Read')) };
export const FirstSkip: S = { name: 'My first 30 days · Skip pressed with no reason', render: () => first(), play: play(pressFirst('Skip'), press('Skip task')) };
export const FirstSurveyMissing: S = { name: 'My first 30 days · survey sent with no ratings', render: () => first(), play: play(pressFirst('Answer'), press('Send answers')) };
export const FirstFailed: S = { name: 'My first 30 days · the server refuses', render: () => first({ onComplete: fails('This step was changed by HR a moment ago. Reload the page and try again.') }), play: play(pressFirst('Read'), press('I have read this')) };
export const FirstLoading: S = { name: 'My first 30 days · loading', render: () => first({ state: 'loading', data: null }) };
export const FirstError: S = { name: 'My first 30 days · could not load', render: () => first({ state: 'error', data: null, onRetry: () => undefined }) };

// ------------------------------------------------------------------ Settings › Checklists (LIFE-1.04 / 1.06)
const TEMPLATES: JourneyTemplates = {
  templates: [
    {
      id: 'tpl-1', kind: 'onboarding', name: 'Plant joiners, Hosur', legalEntityId: null, locationId: null, departmentId: null, starterKey: 'onboarding_standard', active: true, version: 3,
      tasks: [
        { key: 'laptop', title: 'Issue a laptop', ownerType: 'it', ownerLabel: 'IT', ownerUserId: null, ownerGroupId: 'g-it', kind: 'desk_request', config: { itemId: 'i-laptop' }, dueOffsetDays: -2, dependsOn: [], required: true, locked: false },
        { key: 'appointment_letter', title: 'Issue the appointment letter', ownerType: 'hr', ownerLabel: 'HR', ownerUserId: null, ownerGroupId: null, kind: 'letter', config: {}, dueOffsetDays: 0, dependsOn: [], required: true, locked: true },
        { key: 'safety', title: 'Food safety induction', ownerType: 'person', ownerLabel: 'The joiner', ownerUserId: null, ownerGroupId: null, kind: 'watch', config: { url: 'https://kaverifoods.example.in/learn/food-safety', minutes: 20 }, dueOffsetDays: 3, dependsOn: [], required: true, locked: false },
        { key: 'buddy_lunch', title: 'Lunch with the buddy', ownerType: 'buddy', ownerLabel: 'Buddy', ownerUserId: null, ownerGroupId: null, kind: 'tick', config: {}, dueOffsetDays: 7, dependsOn: [], required: false, locked: false },
      ],
    },
    {
      id: 'tpl-2', kind: 'new_manager', name: 'First team', legalEntityId: null, locationId: null, departmentId: null, starterKey: 'new_manager', active: false, version: 1,
      tasks: [{ key: 'one_on_ones', title: 'Set up 1:1s with each person', ownerType: 'manager', ownerLabel: 'Manager', ownerUserId: null, ownerGroupId: null, kind: 'tick', config: {}, dueOffsetDays: 14, dependsOn: [], required: true, locked: false }],
    },
  ],
  starters: [{ key: 'offboarding_standard', kind: 'offboarding', name: 'Standard leaving (YukthiX starter)', summary: 'Handover, clearance by IT, Admin and Finance, the exit interview and the relieving letter.', tasks: 9, copied: false }],
};
const TEAMS = [{ value: 'g-it', label: 'IT and Admin, Hosur' }, { value: 'g-fin', label: 'Finance' }];
const ITEMS = [{ value: 'i-laptop', label: 'New laptop', desk: 'IT help' }, { value: 'i-card', label: 'Access card', desk: 'Admin' }];
const checklists = (over: Partial<JourneyTemplatesScreenProps> = {}) => <JourneyTemplatesScreen state="ready" data={TEMPLATES} teams={TEAMS} catalogItems={ITEMS} onUseStarter={ok} onSave={ok} {...over} />;
export const Checklists: S = { name: 'Checklists · joining', render: () => checklists() };
export const ChecklistsLeaving: S = { name: 'Checklists · leaving, the starter to copy', render: () => checklists(), play: play(choose('Leaving')) };
export const ChecklistsLife: S = { name: 'Checklists · life events', render: () => checklists(), play: play(choose('Life events')) };
export const ChecklistsStarterFailed: S = { name: 'Checklists · copying the starter refused', render: () => checklists({ onUseStarter: fails('You already have a copy of this starter. Reload the page to see it.') }), play: play(choose('Leaving'), press('Use this starter')) };
export const ChecklistsEmpty: S = { name: 'Checklists · none yet', render: () => checklists({ data: { templates: [], starters: [] } }) };
export const ChecklistsLoading: S = { name: 'Checklists · loading', render: () => checklists({ state: 'loading', data: null }) };
export const ChecklistsError: S = { name: 'Checklists · could not load', render: () => checklists({ state: 'error', data: null, onRetry: () => undefined }) };
export const ChecklistsNoAccess: S = { name: 'Checklists · no access', render: () => checklists({ state: 'no-access', data: null }) };
export const EditChecklist: S = { name: 'Edit a checklist · open', render: () => checklists(), play: play(pressFirst('Edit checklist')) };
export const EditChecklistMissing: S = { name: 'Edit a checklist · a new task saved with no name', render: () => checklists(), play: play(pressFirst('Edit checklist'), press('Add a task'), press('Save checklist')) };
export const EditChecklistFailed: S = { name: 'Edit a checklist · the server refuses', render: () => checklists({ onSave: fails('Someone else saved this checklist a moment ago. Close it and open it again.') }), play: play(pressFirst('Edit checklist'), press('Save checklist')) };

// ------------------------------------------------------------------ Settings › Letter templates › Signatories
const ENTITIES = [{ value: 'le-kfpl', label: 'Kaveri Foods Pvt Ltd' }, { value: 'le-tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }];
const SIGNATORIES: Signatory[] = [
  { id: 's1', legalEntityId: 'le-kfpl', userId: 'u1', name: 'Lakshmi Venkatesan', title: 'Head of HR', hasSignatureImage: true },
  { id: 's2', legalEntityId: 'le-tn', userId: 'u2', name: 'Suresh Pillai', title: 'Plant HR Manager, Chennai', hasSignatureImage: false },
];
const USERS = [{ value: 'u1', label: 'Lakshmi Venkatesan' }, { value: 'u2', label: 'Suresh Pillai' }, { value: 'u3', label: 'Meena Raghavan' }];
const signatories = (over: Partial<SignatoriesDrawerProps> = {}) => <SignatoriesDrawer onClose={() => undefined} signatories={SIGNATORIES} entities={ENTITIES} users={USERS} onAdd={ok} onRemove={ok} {...over} />;
export const Signatories: S = { name: 'Signatories · open', render: () => signatories() };
export const SignatoriesEmpty: S = { name: 'Signatories · no one yet', render: () => signatories({ signatories: [] }) };
export const SignatoriesRemoveFailed: S = { name: 'Signatories · Remove refused', render: () => signatories({ onRemove: fails('Lakshmi Venkatesan signs 3 letters waiting for approval. Approve or withdraw them first.') }), play: play(pressFirst(/^More actions for Lakshmi/), async (s) => userEvent.click(await s.findByRole('menuitem', { name: 'Remove' }))) };
export const AddSignatory: S = { name: 'Add a signatory · open', render: () => signatories(), play: play(press('Add signatory')) };
export const AddSignatoryFilled: S = { name: 'Add a signatory · filled', render: () => signatories(), play: play(press('Add signatory'), pick('Legal entity', 'Kaveri Foods Pvt Ltd'), pick('Person', 'Meena Raghavan'), type(/^Title on letters/, 'Finance Controller')) };
export const AddSignatoryMissing: S = { name: 'Add a signatory · Add pressed with nothing filled', render: () => signatories(), play: play(press('Add signatory'), press('Add')) };
export const AddSignatoryFailed: S = { name: 'Add a signatory · the server refuses', render: () => signatories({ onAdd: fails('Meena Raghavan is already a signatory for Kaveri Foods Pvt Ltd.') }), play: play(press('Add signatory'), pick('Legal entity', 'Kaveri Foods Pvt Ltd'), pick('Person', 'Meena Raghavan'), type(/^Title on letters/, 'Finance Controller'), press('Add')) };
