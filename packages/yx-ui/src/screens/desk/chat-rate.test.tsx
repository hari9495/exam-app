import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RequesterChatScreen, type RequesterChatProps } from './chat';
import { CHAT_ENDED, CHAT_QUEUES } from './esm-data';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn().mockResolvedValue(undefined);
const screenWith = (over: Partial<RequesterChatProps>) =>
  render(<RequesterChatScreen state="ready" queues={CHAT_QUEUES} chats={[CHAT_ENDED]} current={{ ...CHAT_ENDED, rating: null }} live={{ connected: true, typing: false }} onStart={ok()} onOpen={() => undefined} onSend={ok()} onUpload={ok()} onOpenFile={() => undefined} onTyping={() => undefined} onEnd={ok()} onRate={ok()} onOpenTicket={() => undefined} onPick={async () => []} {...over} />);

// Answer 1682: the chat's rating takes the desk's preset reason too (optional); with no list no reason is asked.
describe('chat rating reason (1682)', () => {
  it('picks a reason from the desk list and sends it with the stars', async () => {
    const onRate = ok();
    screenWith({ onRate, current: { ...CHAT_ENDED, rating: null, ratingReasons: ['Slow', 'Not solved'] } });
    await ue.click(screen.getByRole('radio', { name: '2 out of 5' }));
    await ue.click(screen.getByRole('combobox', { name: /The main reason/ }));
    await ue.click(await screen.findByRole('option', { name: 'Not solved' }));
    await ue.click(screen.getByRole('button', { name: 'Rate this chat' }));
    await waitFor(() => expect(onRate).toHaveBeenCalledWith(2, '', 'Not solved'));
  });

  it('without a list there is no reason field and the rating goes without one', async () => {
    const onRate = ok();
    screenWith({ onRate });
    expect(screen.queryByRole('combobox', { name: /The main reason/ })).toBeNull();
    await ue.click(screen.getByRole('radio', { name: '5 out of 5' }));
    await ue.click(screen.getByRole('button', { name: 'Rate this chat' }));
    await waitFor(() => expect(onRate).toHaveBeenCalledWith(5, '', undefined));
  });
});
