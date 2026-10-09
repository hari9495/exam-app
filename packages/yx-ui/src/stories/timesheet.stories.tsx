import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { TimesheetGrid, type TimesheetDay, type TimesheetLine, type TimesheetProject, type TimesheetStatus } from '../components/timesheet';

const meta: Meta = { title: 'Data/Timesheet (M12)', parameters: { layout: 'fullscreen' } };
export default meta;

const PROJECTS: TimesheetProject[] = [
  {
    id: 'acme-web',
    code: 'ACME-WEB',
    name: 'Website rebuild',
    client: 'Acme Retail',
    billable: true,
    tasks: [
      { id: 'dev', name: 'Development' },
      { id: 'qa', name: 'Testing' },
      { id: 'mtg', name: 'Client meetings' },
    ],
  },
  { id: 'nova-erp', code: 'NOVA-ERP', name: 'ERP integration', client: 'Nova Logistics', billable: true, tasks: [{ id: 'int', name: 'Integration' }, { id: 'sup', name: 'Go-live support' }] },
  { id: 'int-train', code: 'INT-LRN', name: 'Training and learning', billable: false, tasks: [{ id: 'course', name: 'Courses' }] },
  { id: 'int-admin', code: 'INT-ADM', name: 'Internal admin', billable: false, tasks: [{ id: 'meet', name: 'Team meetings' }, { id: 'hire', name: 'Interviews' }] },
];

const WEEK = new Date(2026, 8, 28); // Mon 28 Sep 2026
const NORMAL: TimesheetDay[] = [
  { expected: 8 },
  { expected: 8 },
  { expected: 8 },
  { expected: 8 },
  { expected: 8 },
  { expected: 0, kind: 'weekend' },
  { expected: 0, kind: 'weekend' },
];
// Fri 2 Oct 2026 is Gandhi Jayanti; Wednesday is a casual leave day.
const HOLIDAY_WEEK: TimesheetDay[] = [
  { expected: 8 },
  { expected: 8 },
  { expected: 0, kind: 'leave', label: 'Casual leave' },
  { expected: 8 },
  { expected: 0, kind: 'holiday', label: 'Gandhi Jayanti' },
  { expected: 0, kind: 'weekend' },
  { expected: 0, kind: 'weekend' },
];

const FILLED: TimesheetLine[] = [
  { id: 'l1', projectId: 'acme-web', taskId: 'dev', billable: true, hours: [6, 5.5, 6, 7, 4, null, null] },
  { id: 'l2', projectId: 'acme-web', taskId: 'mtg', billable: true, hours: [1, null, 1, null, 1.5, null, null] },
  { id: 'l3', projectId: 'nova-erp', taskId: 'sup', billable: true, hours: [null, 2, null, 1, 2, 3, null] },
  { id: 'l4', projectId: 'int-admin', taskId: 'meet', billable: false, hours: [1, 0.5, 1, 0.5, 0.5, null, null] },
];

function Sheet({ status: initial = 'draft' as TimesheetStatus, lines: init = FILLED, days = NORMAL, layout = 'auto' as 'auto' | 'grid' | 'days', reason = undefined as string | undefined }) {
  const [lines, setLines] = useState(init);
  const [status, setStatus] = useState<TimesheetStatus>(initial);
  const [saving, setSaving] = useState(false);
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: '0 0 16px', fontSize: 22, lineHeight: '28px', fontWeight: 600 }}>My timesheet</h1>
      <TimesheetGrid
        weekStart={WEEK}
        days={days}
        status={status}
        lines={lines}
        onLinesChange={setLines}
        projects={PROJECTS}
        sentBackReason={reason}
        onPrevWeek={() => {}}
        onNextWeek={() => {}}
        onThisWeek={() => {}}
        onCopyLastWeek={() => setLines(FILLED.map((l) => ({ ...l, id: `${l.id}-copy`, hours: [...l.hours] })))}
        onSaveDraft={() => {
          setSaving(true);
          setTimeout(() => setSaving(false), 900);
        }}
        onSubmit={() => setStatus('submitted')}
        saving={saving}
        layout={layout}
      />
    </div>
  );
}

export const Draft: StoryObj = {
  name: 'Draft week · editable',
  render: () => <Sheet layout="grid" />,
};

export const EmptyWeek: StoryObj = {
  name: 'New week · copy last week',
  render: () => <Sheet layout="grid" lines={[{ id: 'n1', projectId: null, taskId: null, billable: false, hours: Array(7).fill(null) }]} />,
};

export const SubmitWithProblems: StoryObj = {
  name: 'Submit blocked · problems listed',
  render: () => (
    <Sheet
      layout="grid"
      lines={[
        { id: 'p1', projectId: 'acme-web', taskId: 'dev', billable: true, hours: [9, 8, 14, 8, 8, null, null] },
        { id: 'p2', projectId: 'nova-erp', taskId: 'int', billable: true, hours: [null, null, 12, null, null, null, null] },
        { id: 'p3', projectId: null, taskId: null, billable: false, hours: [1, null, null, null, null, null, null] },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const btn = [...canvasElement.querySelectorAll('button')].find((b) => b.textContent?.includes('Submit week'));
    btn?.click();
  },
};

export const SentBack: StoryObj = {
  name: 'Sent back by the manager',
  render: () => <Sheet layout="grid" status="sent_back" reason="Rohit Bhat: Wednesday's 6 h on ACME-WEB should be on NOVA-ERP go-live support. Please move them and resubmit." />,
};

export const Submitted: StoryObj = {
  name: 'Submitted · read-only',
  render: () => <Sheet layout="grid" status="submitted" />,
};

export const Approved: StoryObj = {
  name: 'Approved',
  render: () => <Sheet layout="grid" status="approved" />,
};

export const HolidayWeek: StoryObj = {
  name: 'Week with leave and a holiday',
  render: () => (
    <Sheet
      layout="grid"
      days={HOLIDAY_WEEK}
      lines={[
        { id: 'h1', projectId: 'acme-web', taskId: 'dev', billable: true, hours: [7, 7.5, null, 8, 2, null, null] },
        { id: 'h2', projectId: 'int-admin', taskId: 'hire', billable: false, hours: [1, 0.5, null, null, null, null, null] },
      ]}
    />
  ),
};

export const PhoneDayList: StoryObj = {
  name: 'Phone · day list',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <Sheet layout="auto" />,
};
