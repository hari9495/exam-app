import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { StageMessageSheet, stageMessageRow, type StageMessageSheetProps, type StageMessageView } from './stage-message-sheet';

// Settings 6.1 › Stage message templates (answer 2434): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const SMS: StageMessageView = { channel: 'sms', id: 't1', name: 'Moving to interview', triggerStageId: 's4', triggerMode: 'prompt', body: 'Hi {{candidateName}}', enabled: true, isDefault: false };
const STAGES = [{ value: 's1', label: 'Applied' }, { value: 's4', label: 'Interview' }];
const show = (p: Partial<StageMessageSheetProps> = {}) => {
  const props: StageMessageSheetProps = { open: true, onOpenChange: vi.fn(), template: SMS, stages: STAGES, canEdit: true, onSave: vi.fn().mockResolvedValue({}), onDelete: vi.fn().mockResolvedValue({}), ...p };
  render(<ToastProvider><StageMessageSheet {...props} /></ToastProvider>);
  return props;
};
const save = () => ue.click(screen.getByRole('button', { name: 'Save template' }));

describe('stageMessageRow', () => {
  it('names the channel, the stage and how it is sent; a template with no stage is sent by hand', () => {
    const name = (id: string) => ({ s4: 'Interview' })[id];
    expect(stageMessageRow(SMS, name)).toEqual(['Moving to interview', 'SMS', 'Interview', 'Ask before sending']);
    expect(stageMessageRow({ ...SMS, triggerStageId: null, triggerMode: 'auto', enabled: false, isDefault: true }, name)).toEqual(['Moving to interview', 'SMS', 'No stage', 'Sent by hand · Off · Standard wording']);
    expect(stageMessageRow({ ...SMS, triggerStageId: 'gone' }, name)[2]).toBe('A stage no longer used');
  });
});

describe('StageMessageSheet', () => {
  it('edits a template: saves its channel, id, stage, sending and wording, then a toast', async () => {
    const p = show();
    await ue.click(screen.getByRole('radio', { name: 'Send automatically' }));
    await save();
    await waitFor(() => expect(p.onSave).toHaveBeenCalledWith('sms', 't1', { name: 'Moving to interview', triggerStageId: 's4', triggerMode: 'auto', body: 'Hi {{candidateName}}', enabled: true }));
    expect((await screen.findAllByText('Message template saved')).length).toBeGreaterThan(0);
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a new email needs a name, a subject and a message: nothing saves and the first empty field gets focus', async () => {
    const p = show({ template: null });
    expect(screen.getByRole('radio', { name: 'Email' })).toHaveAttribute('aria-checked', 'true');
    const button = screen.getByRole('button', { name: 'Save template' });
    expect(button).not.toBeDisabled();
    await save();
    expect(p.onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter the name.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toHaveFocus());
    await ue.type(screen.getByLabelText(/^Name/), 'Welcome');
    await save();
    expect(p.onSave).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText(/^Subject/)).toHaveFocus());
    await ue.type(screen.getByLabelText(/^Subject/), 'Hello');
    await ue.type(screen.getByLabelText(/^Message/), 'Hi there');
    await save();
    await waitFor(() => expect(p.onSave).toHaveBeenCalledWith('email', null, { name: 'Welcome', triggerStageId: null, triggerMode: 'manual', subject: 'Hello', body: 'Hi there', enabled: true }));
  });

  it('an SMS over 1600 characters is refused with the limit', async () => {
    const p = show({ template: { ...SMS, body: 'x'.repeat(1601) } });
    await save();
    expect(p.onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Keep it to 1600 characters.')).toBeInTheDocument();
  });

  it('a refused save keeps the sheet open and says why', async () => {
    const p = show({ onSave: vi.fn().mockRejectedValue(new Error('That stage is not in your pipelines. Choose a stage from the list.')) });
    await save();
    expect(await screen.findByText('That stage is not in your pipelines. Choose a stage from the list.')).toBeInTheDocument();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('deletes after a confirmation; a standard template not changed yet has nothing to delete', async () => {
    const p = show();
    await ue.click(screen.getByRole('button', { name: 'Delete template' }));
    await screen.findByText('Delete Moving to interview?');
    await ue.click(screen.getAllByRole('button', { name: 'Delete template' }).at(-1)!);
    await waitFor(() => expect(p.onDelete).toHaveBeenCalledWith('sms', 't1'));
  });

  it('without the key: read-only, Close only, the channel cannot change', () => {
    show({ canEdit: false, template: { ...SMS, id: null, isDefault: true } });
    expect(screen.queryByRole('button', { name: 'Save template' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete template' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('radio', { name: 'SMS' })).toBeDisabled();
  });
});
