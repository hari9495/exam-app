import type { Meta, StoryObj } from '@storybook/react-vite';
import { HomeReminderCards, type HomeReminder } from './home-reminders';

const meta: Meta = { title: 'Screens/Platform/Home reminders (T2-E 51)', parameters: { layout: 'padded' }, excludeStories: ['REMINDERS'] };
export default meta;
type S = StoryObj;

// T2-E 51 (answer 2874): at most 2 cards on Home, each with its action and "Not today".
export const REMINDERS: HomeReminder[] = [
  { kind: 'sent_back', id: 'sent_back:r1', title: 'A request of yours was sent back', body: 'Change it and send it again, or withdraw it.', href: '#', closesOn: null },
  { kind: 'tax_proofs', id: 'tax_proofs:2026-27', title: 'Tax proofs are due by 31 Jan', body: 'Upload your proofs; after the cut-off only verified amounts count.', href: '#', closesOn: '2027-01-31' },
];
const frame = (cards: HomeReminder[]) => (
  <div style={{ maxWidth: 420, display: 'grid', gap: 16 }}>
    <HomeReminderCards cards={cards} onDismiss={() => {}} />
  </div>
);
export const TwoCards: S = { name: 'Two cards · sent back and proofs due', render: () => frame(REMINDERS) };
export const Review: S = { name: 'A self-review due in 3 days', render: () => frame([{ kind: 'review', id: 'review:v1', title: 'Your self-review is due on 30 Nov', body: 'Finish it before it closes.', href: '#', closesOn: '2026-11-30' }]) };
export const Survey: S = { name: 'A survey closing in 2 days', render: () => frame([{ kind: 'survey', id: 'survey:s1', title: 'A survey closes on 29 Nov', body: 'Pulse check, November: it takes a few minutes.', href: '#', closesOn: '2026-11-29' }]) };
export const None: S = { name: 'Nothing closing (no cards)', render: () => frame([]) };
