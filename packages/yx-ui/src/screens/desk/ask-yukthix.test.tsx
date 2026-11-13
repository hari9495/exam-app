import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AskYukthix, type AskYukthixProps } from './ask-yukthix';
import { ASK_CHAT, ASK_STATE, ASK_UNSURE } from './ask-yukthix-data';

const props = (over: Partial<AskYukthixProps> = {}): AskYukthixProps => ({
  state: ASK_STATE,
  contactHref: '/yx/support',
  onAsk: vi.fn().mockResolvedValue({ on: true, remaining: 46, conversation: ASK_CHAT }),
  onFeedback: vi.fn().mockResolvedValue(undefined),
  onRaiseTicket: vi.fn().mockResolvedValue({ ticket: 'YXS-118' }),
  onFeatureRequest: vi.fn().mockResolvedValue({ number: 42 }),
  ...over,
});
const show = (p: AskYukthixProps) => render(<ToastProvider><AskYukthix {...p} /></ToastProvider>);

// Ask YukthiX (answers 2101 to 2108) in the Help drawer.
describe('AskYukthix', () => {
  it('shows the answer with its article, the questions left and that answers never use company records', () => {
    show(props());
    expect(screen.getByRole('link', { name: 'Apply for leave' }).getAttribute('href')).toBe('/yx/help/yukthix/yukthix-help/apply-for-leave');
    expect(screen.getByText(/47 of 50 questions left today/)).toBeTruthy();
    expect(screen.getByText(/never from your company's records/)).toBeTruthy();
  });

  it('a question goes to the same chat', async () => {
    const p = props();
    show(p);
    const ue = userEvent.setup();
    await ue.type(screen.getByRole('textbox'), 'And for a whole day?{Enter}');
    expect(p.onAsk).toHaveBeenCalledWith('And for a whole day?', 'c1');
  });

  it('unsure twice: a person is offered; "Raise support ticket" sends the chat and says so', async () => {
    const p = props({ state: { ...ASK_STATE, conversation: ASK_UNSURE } });
    show(p);
    expect(screen.getByText('Not getting anywhere?')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Raise support ticket' }));
    expect(p.onRaiseTicket).toHaveBeenCalledWith('c1');
    expect(await screen.findByText('Ticket YXS-118 raised with this chat.')).toBeTruthy();
  });

  it('negative: without the Contact YukthiX key there is no ticket button, only who can raise one', () => {
    show(props({ state: { ...ASK_STATE, canRaiseTicket: false, conversation: ASK_UNSURE } }));
    expect(screen.queryByRole('button', { name: 'Raise support ticket' })).toBeNull();
    expect(screen.getByText(/Your System Admin can raise a support ticket/)).toBeTruthy();
  });

  it('negative: a feature request pressed too early says why and sends nothing; then it sends', async () => {
    const p = props();
    show(p);
    const ue = userEvent.setup();
    await ue.click(screen.getByRole('button', { name: 'Send feature request' }));
    await ue.click(screen.getAllByRole('button', { name: 'Send feature request' }).at(-1)!);
    expect(p.onFeatureRequest).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 5 characters/)).toBeTruthy();
    await ue.type(screen.getByRole('textbox', { name: /What would you like/ }), 'Half days for shifts');
    await ue.click(screen.getAllByRole('button', { name: 'Send feature request' }).at(-1)!);
    expect(p.onFeatureRequest).toHaveBeenCalledWith('c1', 'Half days for shifts', '');
    expect(await screen.findByText('Feature request sent.')).toBeTruthy();
  });

  it('not switched on: says so and offers Contact YukthiX (or who to ask), with no chat', () => {
    const { unmount } = show(props({ state: { ...ASK_STATE, on: false, conversation: null } }));
    expect(screen.getByText('Ask YukthiX is not switched on yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Raise a ticket' }).getAttribute('href')).toBe('/yx/support');
    expect(screen.queryByRole('textbox')).toBeNull();
    unmount();
    show(props({ state: { ...ASK_STATE, on: false, canRaiseTicket: false, conversation: null } }));
    expect(screen.queryByRole('link', { name: 'Raise a ticket' })).toBeNull();
  });
});
