import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '../components/display';
import { PlainTable } from '../components/plain-table';
import { formatDate, formatINR } from '../lib/format';
import { Section, Stack } from './story-kit';

const meta: Meta = { title: 'Data/Plain table' };
export default meta;

type Held = { what: string; cls: string; keep: string };
const HELD: Held[] = [
  { what: 'Name, work email, job', cls: 'Internal', keep: '8 years after you leave' },
  { what: 'Home address, personal phone', cls: 'Personal', keep: '3 years after you leave' },
  { what: 'Aadhaar, background check', cls: 'Special', keep: '1 year after you leave' },
];

type Option = { option: string; policy: string; choice: string };
const OPTIONS: Option[] = [
  { option: 'Employee code', policy: 'Keep the old code', choice: 'Keep the old code' },
  { option: 'Service for gratuity', policy: 'Break counted', choice: 'Continuous' },
];

type Task = { id: string; title: string; was: string; now: string | null };
const TASKS: Task[] = [
  { id: 't1', title: 'Laptop ready', was: '2026-11-10', now: '2026-11-17' },
  { id: 't2', title: 'Welcome email', was: '2026-11-03', now: null },
];

export const Basic: StoryObj = {
  name: 'Basic · a few read-only rows',
  render: () => (
    <Stack>
      <Section title="What we hold" note="No sort, filter or paging. For a list people work through, use the Data table.">
        <PlainTable label="What we hold" columns={[
          { key: 'what', header: 'What we hold', cell: (r: Held) => r.what, rowHeader: true },
          { key: 'cls', header: 'Class', cell: (r: Held) => <Badge tone={r.cls === 'Special' ? 'danger' : 'neutral'}>{r.cls}</Badge> },
          { key: 'keep', header: 'How long', cell: (r: Held) => r.keep },
        ]} rows={HELD} getRowId={(r) => r.what} />
      </Section>
    </Stack>
  ),
};

export const ChangedCells: StoryObj = {
  name: 'Changed cells and a badge',
  render: () => (
    <Stack>
      <Section title="Rehire impact" note="A changed value is medium weight and carries a badge in its row heading.">
        <PlainTable label="Rehire impact" columns={[
          { key: 'o', header: 'Option', rowHeader: true, cell: (r: Option) => <>{r.option} {r.choice !== r.policy && <Badge tone="warning">Changed</Badge>}</> },
          { key: 'p', header: 'Company policy', cell: (r: Option) => r.policy },
          { key: 'c', header: 'For this rehire', cell: (r: Option) => r.choice, changed: (r: Option) => r.choice !== r.policy },
        ]} rows={OPTIONS} getRowId={(r) => r.option} />
      </Section>
    </Stack>
  ),
};

export const WithCaptionAndDates: StoryObj = {
  name: 'Visible caption and date columns',
  render: () => (
    <Stack>
      <Section title="Dates never break across lines">
        <PlainTable label="Tasks" caption="Open tasks move with the date; done tasks stay" columns={[
          { key: 'title', header: 'Task', cell: (r: Task) => r.title },
          { key: 'was', header: 'Was due', date: true, cell: (r: Task) => formatDate(new Date(`${r.was}T00:00:00`)) },
          { key: 'now', header: 'Now due', date: true, changed: (r: Task) => Boolean(r.now), cell: (r: Task) => (r.now ? formatDate(new Date(`${r.now}T00:00:00`)) : 'Done') },
        ]} rows={TASKS} getRowId={(r) => r.id} />
      </Section>
    </Stack>
  ),
};

type Line = { id: string; line: string; month: number; year: number; flag?: boolean };
const LINES: Line[] = [
  { id: 'basic', line: 'Basic', month: 40_000, year: 480_000 },
  { id: 'hra', line: 'House rent allowance', month: 20_000, year: 240_000 },
  { id: 'special', line: 'Special allowance', month: 12_500, year: 150_000, flag: true },
];

export const NumbersAndTotals: StoryObj = {
  name: 'Number columns, flagged rows and totals',
  render: () => (
    <Stack>
      <Section title="Pay lines" note="Amounts and their headings are right-aligned with tabular figures. A flagged row has a tint, a bar on its start edge and a word read out first. Total rows sit in the foot.">
        <PlainTable
          label="Pay lines"
          columns={[
            { key: 'line', header: 'Line', rowHeader: true, cell: (r: Line) => <>{r.line} {r.flag && <Badge tone="warning">Above band</Badge>}</> },
            { key: 'month', header: 'A month', num: true, cell: (r: Line) => formatINR(r.month) },
            { key: 'year', header: 'A year', num: true, cell: (r: Line) => formatINR(r.year) },
          ]}
          rows={LINES}
          getRowId={(r) => r.id}
          rowTone={(r) => (r.flag ? { tone: 'warning', label: 'Flagged' } : undefined)}
          footer={[
            { id: 'gross', label: 'Gross', cells: { month: formatINR(72_500), year: formatINR(870_000) } },
            { id: 'ctc', label: 'Cost to company', cells: { year: formatINR(930_000) } },
          ]}
        />
      </Section>
    </Stack>
  ),
};
