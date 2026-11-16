import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ScoreReportScreen, TestBuilderScreen } from './bank-tests';
import { BUILDER_TEST, BUILDER_WAITING, liveBuilder, liveReport } from './tests-live-samples';
import { timeSettingsListChanges, type TimeSettingsData } from '../settings/time-settings-live';

// AS-2 (answers 2007, 2008, 2123): the designed test builder and score report with live data.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
/** Continue through the builder until a radio named like `name` shows (the proctoring step). */
const toRadio = async (name: RegExp) => {
  for (let i = 0; i < 6 && !screen.queryByRole('radio', { name }); i++) await ue.click(screen.getByRole('button', { name: /^Continue/ }));
  return screen.getByRole('radio', { name });
};

describe('PRC-04 test builder (live)', () => {
  it('lists every pre-publish check, the pool below depth and the approver the test needs', () => {
    wrap(<TestBuilderScreen live={liveBuilder()} />);
    const checks = screen.getByRole('list', { name: 'Publish checks' });
    expect(within(checks).getByText('Section "SQL" pool requires 8 matching questions, only 5 available')).toBeInTheDocument();
    expect(within(checks).getAllByText('Blocks publishing')).toHaveLength(2);
    expect(screen.getByText('For more than 500 candidates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask for approval' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('negative: Publish with a check failing says why and sends nothing', async () => {
    const onPublish = vi.fn().mockResolvedValue(undefined);
    wrap(<TestBuilderScreen live={liveBuilder({ onPublish })} />);
    for (let i = 0; i < 6 && !screen.queryByRole('button', { name: 'Publish' }); i++) await ue.click(screen.getByRole('button', { name: /Continue|Review/ }));
    await ue.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).not.toHaveBeenCalled();
    expect(await screen.findAllByText('Section "SQL" pool requires 8 matching questions, only 5 available')).not.toHaveLength(0);
  });

  it('the second person approves a test waiting for them, with a toast', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    wrap(<TestBuilderScreen live={liveBuilder({ test: BUILDER_WAITING, onApprove })} />);
    expect(screen.getByText('Waiting for approval (asked by Meera Iyer)')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalled();
    expect(await screen.findAllByText('Test approved')).not.toHaveLength(0);
  });

  it('negative: a refused approval shows the server\'s reason on the page', async () => {
    const onApprove = vi.fn().mockRejectedValue(new Error('Another person approves this test: not the one who asked, and not its author.'));
    wrap(<TestBuilderScreen live={liveBuilder({ test: BUILDER_WAITING, onApprove })} />);
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Another person approves this test: not the one who asked, and not its author.')).toBeInTheDocument();
  });

  it('picking a mode sets it; a test set switch by switch says so; a locked test refuses with a note', async () => {
    const onSetMode = vi.fn().mockResolvedValue(undefined);
    const { unmount } = wrap(<TestBuilderScreen live={liveBuilder({ test: { ...BUILDER_WAITING, proctoringMode: 'custom' }, onSetMode })} />);
    const record = await toRadio(/Record & review/);
    expect(screen.getByText('Set switch by switch')).toBeInTheDocument();
    await ue.click(record);
    expect(onSetMode).toHaveBeenCalledWith('record');
    unmount();
    const locked = vi.fn();
    wrap(<TestBuilderScreen live={liveBuilder({ test: { ...BUILDER_TEST, status: 'published', editable: false }, onSetMode: locked })} />);
    await ue.click(await toRadio(/^Open/));
    expect(locked).not.toHaveBeenCalled();
    expect(await screen.findAllByText('This test is locked. Copy it to change proctoring.')).not.toHaveLength(0);
  });

  it('negative: a new test without a name is not created; with one it is', async () => {
    const onNew = vi.fn().mockResolvedValue(undefined);
    wrap(<TestBuilderScreen live={liveBuilder({ test: null, onNew })} />);
    await ue.click(screen.getByRole('button', { name: 'Create test' }));
    expect(onNew).not.toHaveBeenCalled();
    expect(screen.getByText('Name the test.')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /New test/ }), 'Data Analyst · L1');
    await ue.click(screen.getByRole('button', { name: 'Create test' }));
    expect(onNew).toHaveBeenCalledWith('Data Analyst · L1');
  });
});

describe('PRC-06 score report (live)', () => {
  it('a test writer sees raw marks; a recruiter does not', () => {
    const { unmount } = wrap(<ScoreReportScreen live={liveReport()} />);
    expect(screen.getByText('58 / 80')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    unmount();
    wrap(<ScoreReportScreen live={liveReport({ viewer: 'recruiter' })} />);
    expect(screen.queryByText('58 / 80')).toBeNull();
    expect(screen.getByText('Not shown to recruiters. Compare candidates on the score.')).toBeInTheDocument();
  });

  it('a held result says so (evidence kept) and never shows Passed', () => {
    wrap(<ScoreReportScreen live={liveReport({ report: { ...liveReport().report!, releaseOverride: 'held', released: false } })} />);
    expect(screen.getByText('Result held')).toBeInTheDocument();
    expect(screen.getByText('Held while it is reviewed')).toBeInTheDocument();
    expect(screen.queryByText('Passed')).toBeNull();
  });
});

describe('Settings 6.5 collections that need a second approver (answer 2123)', () => {
  const data = { registry: { 'asmt.bank.second_approver_collections': { label: 'x', values: [], default: '', text: { maxLength: 500 } }, 'asmt.retention': { label: 'y', values: ['30'], default: '30' } } } as unknown as TimeSettingsData;
  it('saves the table rows as the comma list, without blanks, repeats or commas inside a name', () => {
    expect(timeSettingsListChanges({ 'asmt.bank.second_approver_collections': [['Food safety'], [' Java, coding '], [''], ['Food safety']] }, data)).toEqual([{ key: 'asmt.bank.second_approver_collections', value: 'Food safety,Java coding' }]);
  });
  it('negative: rows for a setting that is not a list are ignored', () => {
    expect(timeSettingsListChanges({ 'asmt.retention': [['90']], unknown: [['x']] }, data)).toEqual([]);
  });
});
