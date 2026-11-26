import type { Meta, StoryObj } from '@storybook/react-vite';
import { TimesheetActivityCard, TimesheetNudgeCard, TimesheetScreen, TS_LINES } from './ops';
import { T2D_ACTIVITY, T2D_PROJECTS } from './timesheet-t2d-samples';

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

// Answer 1787 (founder change, 13 Nov 2026, from a reference picture): a comment per day. Under each day with hours a
// "Comment" link opens a small box below the cell, with a live word count; a day with no hours has none. The company's
// rule (Settings › Projects & timesheets) is required, at least 20 words a day with hours, by default; Save draft never asks.
const SENTENCE = 'Built and tested the order history page for the store, fixed two layout bugs on small phones, and walked the client through the new filters. ';
const words = (n: number) => SENTENCE.repeat(Math.ceil(n / 25)).split(' ').filter(Boolean).slice(0, n).join(' ');
const COMMENTED = TS_LINES.map((l, i) => ({ ...l, comments: l.hours.map((h, d) => (h ? [words(24), words(12), ''][(i + d) % 3]! : '')) }));
const RULE = { required: true, minWords: 20 };
export const CommentDays: S = { name: 'Comments · a link under each day with hours, live count', args: { noteRule: RULE, initialLines: COMMENTED } };
export const CommentRefused: S = { name: 'Comments · resubmit refused until each day has 20 words', args: { status: 'sent_back', noteRule: RULE } };
export const CommentOptional: S = { name: 'Comments · optional (company setting off)', args: { noteRule: { required: false, minWords: 20 }, initialLines: COMMENTED } };
export const PhoneComments: S = { name: 'Phone · a comment under each day', args: { layout: 'days', noteRule: RULE, initialLines: COMMENTED }, ...phone };

// Keka ideas (2026-11): Time summary, a bar per week across the year, then each week with its hours and status.
// Batch D A5 (answer 2534): past weeks not sent, with sent-back ones and a locked month.
export const NotSent: S = { name: 'Not sent · past weeks to send', args: { view: 'not-sent' } };
// Batch D A8 (answer 2539): Request leave on the week opens Apply leave on today.
export const RequestLeave: S = { name: 'Request leave from the week', args: { leaveOpen: true } };
// Batch D A14 (answer 2536): the Home card when today has no hours.
export const HomeNudge: S = { name: 'Home nudge · no hours today', render: () => <div style={{ maxWidth: 420, padding: 24 }}><TimesheetNudgeCard href="#" onDismiss={() => {}} /></div> };
export const TimeSummary: S = { name: 'Time summary · hours per week this year', args: { view: 'summary' } };

// T2-D 62 (Keka A6): the week's Activity card, as the live page shows it.
export const Activity: S = { name: 'Activity card · sent, a line reduced, recalled (T2-D 62)', render: () => <TimesheetActivityCard activity={T2D_ACTIVITY} projects={T2D_PROJECTS} /> };
