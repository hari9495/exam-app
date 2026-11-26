import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { StageMessagePrompt, type PendingStageMessage, type StageMessagePromptProps } from './stage-message-prompt';

// Answer 2434 follow-up: "Ask before sending" after a stage move: positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const EMAIL: PendingStageMessage = { channel: 'email', templateId: 't1', subject: 'Interview', body: 'Hi {{candidateName}}' };
const SMS: PendingStageMessage = { channel: 'sms', templateId: null, body: 'Hi' };
const show = (messages = [EMAIL, SMS], over: { onSend?: ReturnType<typeof vi.fn> } = {}) => {
  const p = { onSend: over.onSend ?? vi.fn().mockResolvedValue({}), onSkip: vi.fn().mockResolvedValue({}), onDone: vi.fn() };
  render(<ToastProvider><StageMessagePrompt candidate="Priya" stage="Interview" messages={messages} {...(p as unknown as Pick<StageMessagePromptProps, 'onSend' | 'onSkip' | 'onDone'>)} /></ToastProvider>);
  return p;
};

describe('StageMessagePrompt', () => {
  it('sends the first message as written, with a toast, then hands over to the next', async () => {
    const p = show();
    const d = await screen.findByRole('dialog', { name: 'Send the Email message to Priya?' });
    await ue.click(within(d).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(p.onSend).toHaveBeenCalledWith(EMAIL, false));
    expect((await screen.findAllByText('Email sent to Priya')).length).toBeGreaterThan(0);
    expect(p.onDone).toHaveBeenCalled();
  });

  it('edit first: the edited text is sent and marked edited; an emptied message is refused with focus', async () => {
    const p = show([SMS]);
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Edit first' }));
    await ue.clear(within(d).getByLabelText(/^Message/));
    await ue.click(within(d).getByRole('button', { name: 'Send edited message' }));
    expect(p.onSend).not.toHaveBeenCalled();
    expect(within(d).getByText('Enter the message.')).toBeInTheDocument();
    await waitFor(() => expect(within(d).getByLabelText(/^Message/)).toHaveFocus());
    await ue.type(within(d).getByLabelText(/^Message/), 'See you Monday');
    await ue.click(within(d).getByRole('button', { name: 'Send edited message' }));
    await waitFor(() => expect(p.onSend).toHaveBeenCalledWith({ ...SMS, body: 'See you Monday' }, true));
  });

  it("don't send records the skip; a failed send keeps the question open with the reason", async () => {
    const p = show([EMAIL], { onSend: vi.fn().mockRejectedValue(new Error('No email address for this candidate.')) });
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('No email address for this candidate.')).toBeInTheDocument();
    expect(p.onDone).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('button', { name: "Don't send" }));
    await waitFor(() => expect(p.onSkip).toHaveBeenCalledWith(EMAIL));
    expect(p.onDone).toHaveBeenCalled();
  });

  it('nothing pending: nothing shown', () => {
    show([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
