import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExpectationsScreen, type Expectations } from './perf-expectations';

// PRF-18 (T2-C item 68, answer 2842): Performance › What is expected of me, a new design built from the kit (read-only; no ratings). A manager picks a report.
const meta: Meta = { title: 'Screens/Performance/PRF-18 · What is expected of me', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const noop = () => undefined;

export const MINE: Expectations = {
  employee: { id: 'e1', name: 'Arjun Rao', designation: 'Quality Engineer', mine: true },
  competencies: [
    { id: 'c1', name: 'Ownership', group: 'core', description: 'Takes responsibility for outcomes and follows work through to the end.', expectedLevel: 2, levelLabel: 'Completes own work without reminders', behaviours: 'Plans the week, flags risks early, closes the loop with the plant.', levels: 4 },
    { id: 'c2', name: 'Line safety', group: 'functional', description: 'Keeps the line safe for everyone.', expectedLevel: 3, levelLabel: 'Coaches others', behaviours: 'Runs the daily safety check and coaches new joiners.', levels: 4 },
  ],
  values: ['Customer first', 'Own it', 'Win together', 'Do the right thing'],
  reports: [],
};

export const Mine: S = { name: 'Employee · my expectations', render: () => <ExpectationsScreen state="ready" onRetry={noop} data={MINE} onPerson={noop} /> };
export const ManagerForReport: S = { name: 'Manager · a report’s expectations', render: () => <ExpectationsScreen state="ready" onRetry={noop} data={{ ...MINE, employee: { ...MINE.employee, mine: false }, reports: [{ value: 'e1', label: 'Arjun Rao' }, { value: 'e2', label: 'Meena S' }] }} onPerson={noop} /> };
export const NothingSet: S = { name: 'No competencies set for the job', render: () => <ExpectationsScreen state="ready" onRetry={noop} data={{ ...MINE, competencies: [], employee: { ...MINE.employee, designation: null } }} onPerson={noop} /> };
export const Loading: S = { render: () => <ExpectationsScreen state="loading" onRetry={noop} data={null} onPerson={noop} /> };
