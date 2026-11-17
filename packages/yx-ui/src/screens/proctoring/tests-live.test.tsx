import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ScoreReportScreen, TestBuilderScreen } from './bank-tests';
import { BUILDER_TEST, BUILDER_WAITING, COMPANY_SKILLS, JD_PLAN, liveBuilder, liveReport } from './tests-live-samples';
import { timeSettingsListChanges, type TimeSettingsData } from '../settings/time-settings-live';

// AS-2 (answers 2007, 2008, 2123): the designed test builder and score report with live data.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
/** Continue through the builder to the review step (the checklist and the approver). */
const toReview = async () => {
  for (let i = 0; i < 8 && !screen.queryByRole('list', { name: 'Publish checks' }); i++) await ue.click(screen.getByRole('button', { name: /^(Continue|Review)/ }));
};
/** Continue through the builder until a radio named like `name` shows (the proctoring step). */
const toRadio = async (name: RegExp) => {
  for (let i = 0; i < 6 && !screen.queryByRole('radio', { name }); i++) await ue.click(screen.getByRole('button', { name: /^Continue/ }));
  return screen.getByRole('radio', { name });
};

describe('PRC-04 test builder (live)', () => {
  it('lists every pre-publish check on the review step, the pool below depth and the approver the test needs', async () => {
    wrap(<TestBuilderScreen live={liveBuilder()} />);
    expect(screen.queryByRole('list', { name: 'Publish checks' })).toBeNull();
    await toReview();
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
    await toReview();
    expect(screen.getByText('Waiting for approval (asked by Meera Iyer)')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalled();
    expect(await screen.findAllByText('Test approved')).not.toHaveLength(0);
  });

  it('negative: a refused approval shows the server\'s reason on the page', async () => {
    const onApprove = vi.fn().mockRejectedValue(new Error('Another person approves this test: not the one who asked, and not its author.'));
    wrap(<TestBuilderScreen live={liveBuilder({ test: BUILDER_WAITING, onApprove })} />);
    await toReview();
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

  it('answer 2153: the Sections step renames, reweights, adds and removes sections; negative: no name, no new section', async () => {
    const onSaveSection = vi.fn().mockResolvedValue(undefined);
    const onAddSection = vi.fn().mockResolvedValue(undefined);
    const onDeleteSection = vi.fn().mockResolvedValue(undefined);
    wrap(<TestBuilderScreen live={liveBuilder({ onSaveSection, onAddSection, onDeleteSection, onSavePool: vi.fn() })} />);
    const name = screen.getByRole('textbox', { name: 'Name of Aptitude' });
    await ue.clear(name);
    await ue.type(name, 'Reasoning');
    const weight = screen.getByRole('textbox', { name: 'Weight of Aptitude' });
    await ue.clear(weight);
    await ue.type(weight, '40');
    expect(screen.getByText('110 %')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    expect(onSaveSection).toHaveBeenCalledWith('s1', { title: 'Reasoning', weightPercent: 40 });
    await ue.click(screen.getByRole('button', { name: 'Add section' }));
    expect(screen.getByText('Give the section a name.')).toBeInTheDocument();
    expect(onAddSection).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /New section/ }), 'Spring');
    await ue.click(screen.getByRole('button', { name: 'Add section' }));
    expect(onAddSection).toHaveBeenCalledWith('Spring');
    await ue.click(screen.getAllByRole('button', { name: 'Remove' })[2]!);
    await ue.click(screen.getByRole('button', { name: 'Remove section' }));
    expect(onDeleteSection).toHaveBeenCalledWith('s3');
  });

  it('answer 2153: the Blueprint step changes how many a pool draws and at what difficulty; a locked test cannot', async () => {
    const onSavePool = vi.fn().mockResolvedValue(undefined);
    const { unmount } = wrap(<TestBuilderScreen live={liveBuilder({ onSavePool, onSaveSection: vi.fn(), onAddSection: vi.fn(), onDeleteSection: vi.fn() })} />);
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    const drawn = screen.getByRole('textbox', { name: 'Questions drawn in SQL' });
    await ue.clear(drawn);
    await ue.type(drawn, '5');
    await ue.click(within(screen.getByRole('table')).getAllByRole('button', { name: 'Save' })[1]!);
    expect(onSavePool).toHaveBeenCalledWith('s3', { poolSize: 5, poolDifficulty: 'hard' });
    unmount();
    wrap(<TestBuilderScreen live={liveBuilder({ test: { ...BUILDER_TEST, editable: false }, onSavePool, onSaveSection: vi.fn(), onAddSection: vi.fn(), onDeleteSection: vi.fn() })} />);
    expect(screen.queryByRole('textbox', { name: 'Name of Aptitude' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(screen.getByRole('table', { name: /^Blueprint/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Questions drawn in SQL' })).toBeNull();
  });

  it('answer 2151: a job description proposes skills; an unmapped skill blocks the draft until mapped; then it is created', async () => {
    const onProposeFromJd = vi.fn().mockResolvedValue(JD_PLAN);
    const onCreateFromJd = vi.fn().mockResolvedValue(undefined);
    wrap(<TestBuilderScreen live={liveBuilder({ test: null, skills: COMPANY_SKILLS, onProposeFromJd, onCreateFromJd })} />);
    await ue.click(screen.getByRole('tab', { name: 'Build from job description' }));
    expect(screen.getByRole('button', { name: 'Find the skills' })).toBeDisabled();
    await ue.type(screen.getByRole('textbox', { name: /Job description/ }), 'Senior backend developer, Java 17, Spring Boot and SQL for our distributor app.');
    await ue.click(screen.getByRole('button', { name: 'Find the skills' }));
    expect(onProposeFromJd).toHaveBeenCalledWith('Senior backend developer, Java 17, Spring Boot and SQL for our distributor app.');
    expect(await screen.findByText('Not in your library')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: 'Test name' }), 'Backend L3');
    await ue.click(screen.getByRole('button', { name: 'Create draft test' }));
    expect(screen.getByText(/Map the skill not in your library/)).toBeInTheDocument();
    expect(onCreateFromJd).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: 'Your skill for Spring' }));
    await ue.click(await screen.findByRole('option', { name: 'Spring Boot' }));
    await ue.click(screen.getByRole('button', { name: 'Create draft test' }));
    expect(onCreateFromJd).toHaveBeenCalledWith({ title: 'Backend L3', level: 'hard', total: 20, skills: [{ tagId: 'k1', percent: 50 }, { tagId: 'k2', percent: 30 }, { tagId: 'k3', percent: 20 }] });
  });

  it('negative: without the AI setting there is no job description tab', () => {
    wrap(<TestBuilderScreen live={liveBuilder({ test: null })} />);
    expect(screen.queryByRole('tab', { name: 'Build from job description' })).toBeNull();
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
