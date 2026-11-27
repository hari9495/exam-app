import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { NotificationPreferencesScreen, type DigestMode, type NotificationPreference, type PushPreferences } from './preferences';

// PLT-65 · Notification preferences (designed 15 Oct 2026, design audit step 2): Home › Me › Notification preferences.
const meta: Meta = { title: 'Screens/Platform/PLT-65 · Notification preferences', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const TYPES: NotificationPreference[] = [
  { type: 'workflow.approval.needed', group: 'approvals', label: 'A request needs your approval', emailEnabled: true },
  { type: 'workflow.approval.decided', group: 'approvals', label: 'A request you sent or were asked about was decided', emailEnabled: true },
  { type: 'journey.task.assigned', group: 'assignments', label: 'An onboarding or offboarding task was given to you or your team', emailEnabled: true },
  { type: 'letter.ready', group: 'assignments', label: 'A letter for you is ready', emailEnabled: false },
  { type: 'perf.feedback.received', group: 'mentions', label: 'A colleague gave you feedback', emailEnabled: true },
  { type: 'journey.task.due', group: 'reminders', label: 'A checklist task is due today', emailEnabled: false },
  { type: 'document.expiring', group: 'reminders', label: 'A document of yours expires soon', emailEnabled: true },
];

function Prefs({ digest: start = 'immediate', state }: { digest?: DigestMode; state?: 'loading' | 'error' }) {
  const [types, setTypes] = useState(TYPES);
  const [digest, setDigest] = useState<DigestMode>(start);
  return (
    <NotificationPreferencesScreen
      state={state}
      types={types}
      digest={digest}
      onToggle={(type, on) => setTypes((xs) => xs.map((x) => (x.type === type ? { ...x, emailEnabled: on } : x)))}
      onDigest={setDigest}
    />
  );
}

export const Default: S = { name: 'PLT-65 · Notification preferences', render: () => <Prefs /> };
export const Daily: S = { name: 'PLT-65 · Notification preferences · daily summary', render: () => <Prefs digest="daily" /> };
export const Off: S = { name: 'PLT-65 · Notification preferences · email off', render: () => <Prefs digest="off" /> };
export const Loading: S = { name: 'PLT-65 · Notification preferences · loading', render: () => <Prefs state="loading" /> };
export const LoadError: S = { name: 'PLT-65 · Notification preferences · error', render: () => <Prefs state="error" /> };

// T2-E 52 (answers 2875 to 2878): a Push column next to Email, this device, Pause push and quiet hours (21:00-08:00).
export const PUSH: PushPreferences = { available: true, device: 'on', paused: false, quietFrom: '21:00', quietTo: '08:00', onDevice: () => {}, onPause: () => {}, onQuiet: () => {}, onTogglePush: () => {} };
export const PUSH_TYPES = TYPES.map((t) => ({ ...t, pushEnabled: t.group === 'approvals' }));
const withPush = (push: Partial<PushPreferences> = {}) => <NotificationPreferencesScreen types={PUSH_TYPES} digest="immediate" onToggle={() => {}} onDigest={() => {}} push={{ ...PUSH, ...push }} />;
export const Push: S = { name: 'Push · on for this device, approvals on by default (T2-E 52)', render: () => withPush() };
export const PushOff: S = { name: 'Push · not yet on for this device', render: () => withPush({ device: 'off' }) };
export const PushIphone: S = { name: 'Push · iPhone, add to the Home Screen first (2878)', render: () => withPush({ device: 'ios-install' }) };
export const PushBlocked: S = { name: 'Push · blocked in the browser', render: () => withPush({ device: 'blocked' }) };
export const PushCompanyOff: S = { name: 'Push · switched off for the company', render: () => withPush({ available: false }) };
