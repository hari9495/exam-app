import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PipelineSheet, type EditablePipeline, type PipelineSheetProps } from './pipeline-sheet';
import { JobBoardsScreen } from './live/boards';

// Answer 2631: the pipeline editor (Settings › Hiring) and Easy Apply on Job boards. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const PIPE: EditablePipeline = {
  id: 'p1',
  name: 'Office staff',
  isDefault: false,
  stages: [
    { id: 'a', name: 'Applied', category: 'active', position: 0, statuses: [{ id: 'a1', name: 'New', position: 0 }] },
    { id: 'b', name: 'Interview', category: 'active', position: 1, statuses: [], rules: [] },
  ],
};
const props = (over: Partial<PipelineSheetProps> = {}): PipelineSheetProps => ({ open: true, onOpenChange: vi.fn(), pipeline: PIPE, tests: [{ value: 'e1', label: 'Safety test' }], canEdit: true, onCreate: vi.fn().mockResolvedValue({}), onDeletePipeline: vi.fn().mockResolvedValue({}), onAddStage: vi.fn().mockResolvedValue({}), onSaveStage: vi.fn().mockResolvedValue({}), onMoveStage: vi.fn().mockResolvedValue({}), onRemoveStage: vi.fn().mockResolvedValue({}), ...over });

describe('PipelineSheet (answer 2631)', () => {
  it('a new pipeline needs a name', async () => {
    const p = props({ pipeline: null });
    show(<PipelineSheet {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Add pipeline' }));
    expect(await screen.findByText('Name the pipeline.')).toBeInTheDocument();
    expect(p.onCreate).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Pipeline name/ }), 'Campus hiring');
    await ue.click(screen.getByRole('button', { name: 'Add pipeline' }));
    expect(p.onCreate).toHaveBeenCalledWith('Campus hiring');
  });

  it('a stage saves its name, statuses and a test rule; the test must be chosen first', async () => {
    const p = props();
    show(<PipelineSheet {...p} />);
    await ue.click(screen.getAllByRole('switch', { name: 'A test is passed' })[1]);
    await ue.click(screen.getByRole('button', { name: 'Save Interview' }));
    expect(await screen.findByText('Choose the test.')).toBeInTheDocument();
    expect(p.onSaveStage).not.toHaveBeenCalled();
    await ue.click(screen.getAllByRole('combobox', { name: /Test/ })[0]);
    await ue.click(await screen.findByRole('option', { name: 'Safety test' }));
    await ue.click(screen.getAllByRole('button', { name: 'Add status' })[1]);
    await ue.type(screen.getAllByRole('textbox', { name: 'Status 1' })[1], 'Scheduled');
    await ue.click(screen.getByRole('button', { name: 'Save Interview' }));
    expect(p.onSaveStage).toHaveBeenCalledWith('b', expect.objectContaining({ name: 'Interview', category: 'active', rules: [expect.objectContaining({ type: 'exam_passed', examId: 'e1' })], statuses: { add: ['Scheduled'], rename: [], remove: [] } }));
  });

  it('the first stage cannot move up (it says so); a refused removal shows the reason; view-only has no editors', async () => {
    const p = props({ onRemoveStage: vi.fn().mockRejectedValue(new Error('Stage still has entries in it')) });
    const { unmount } = show(<PipelineSheet {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Move Applied up' }));
    expect(await screen.findByText('Applied is already the first stage.')).toBeInTheDocument();
    expect(p.onMoveStage).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Remove Applied' }));
    await ue.click(await screen.findByRole('button', { name: 'Remove stage' }));
    expect(await screen.findByText('Stage still has entries in it')).toBeInTheDocument();
    unmount();
    show(<PipelineSheet {...props({ canEdit: false })} />);
    expect(screen.queryByRole('button', { name: /^Save / })).toBeNull();
  });
});

describe('Job boards: Easy Apply (answer 2631)', () => {
  const base = { state: 'ready' as const, boards: [], providers: [], onCreate: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(), onCopy: vi.fn().mockResolvedValue(undefined) };
  it('a secret needs 16 characters; the address copies', async () => {
    const onSet = vi.fn().mockResolvedValue({});
    show(<JobBoardsScreen {...base} easyApply={{ providers: [{ id: 'indeed', label: 'Indeed', configured: false, ingestUrl: 'https://api.example/ea/indeed' }], onSet, onTurnOff: vi.fn() }} />);
    await ue.click(screen.getByRole('button', { name: 'Copy address' }));
    expect(base.onCopy).toHaveBeenCalledWith('https://api.example/ea/indeed');
    await ue.click(screen.getByRole('button', { name: 'Set secret' }));
    const d = await screen.findByRole('dialog');
    await ue.type(within(d).getByLabelText(/Shared secret/), 'short');
    await ue.click(within(d).getByRole('button', { name: 'Save secret' }));
    expect(await within(d).findByText('Enter at least 16 characters.')).toBeInTheDocument();
    expect(onSet).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/Shared secret/), '-and-long-enough');
    await ue.click(within(d).getByRole('button', { name: 'Save secret' }));
    expect(onSet).toHaveBeenCalledWith('indeed', 'short-and-long-enough');
  });
});
