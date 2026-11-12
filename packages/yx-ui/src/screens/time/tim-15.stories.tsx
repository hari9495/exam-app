import type { Meta, StoryObj } from '@storybook/react-vite';
import { TimesheetScreen, TS_LINES } from './ops';

const meta: Meta<typeof TimesheetScreen> = { title: 'Screens/Time/TIM-15 · Timesheets', component: TimesheetScreen, render: (args) => <TimesheetScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TimesheetScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Draft: S = { name: 'Desk · weekly grid' };
export const Submitted: S = { name: 'Submitted · last week', args: { status: 'submitted' } };
export const SentBack: S = { name: 'Sent back with reason · last week', args: { status: 'sent_back' } };
export const Approved: S = { name: 'Approved · last week', args: { status: 'approved' } };
export const Locked: S = { name: 'Locked · August week', args: { status: 'locked' } };
export const PhoneSentBack: S = { name: 'Phone · sent back, resubmit', args: { layout: 'days', status: 'sent_back' }, ...phone };
export const Phone: S = { name: 'Phone · day list, submit week', args: { layout: 'days' }, ...phone };

// Answers 1731 to 1736 (founder, 12 Nov 2026): a note per row, in the person's own words, with a live word count. The
// company's rule (Settings › Projects & timesheets) is required, at least 200 words, by default; Save draft never asks.
const SENTENCE = 'Built and tested the order history page for the store, fixed two layout bugs on small phones, and walked the client through the new filters on our weekly call. ';
const words = (n: number) => SENTENCE.repeat(Math.ceil(n / 30)).split(' ').filter(Boolean).slice(0, n).join(' ');
const NOTED = TS_LINES.map((l, i) => ({ ...l, note: [words(212), words(142), ''][i % 3] }));
export const NoteRequired: S = { name: 'Notes · required, 200 words, live count', args: { noteRule: { required: true, minWords: 200 }, initialLines: NOTED } };
export const NoteRefused: S = { name: 'Notes · resubmit refused until each row has 200 words', args: { status: 'sent_back', noteRule: { required: true, minWords: 200 } } };
export const NoteOptional: S = { name: 'Notes · optional (company setting off)', args: { noteRule: { required: false, minWords: 200 }, initialLines: NOTED } };
export const PhoneNote: S = { name: 'Phone · notes under each project', args: { layout: 'days', noteRule: { required: true, minWords: 200 }, initialLines: NOTED }, ...phone };
