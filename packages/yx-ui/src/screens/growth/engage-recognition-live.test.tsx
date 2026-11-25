import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { GiveKudosScreen, RecognitionWallScreen } from './engage-recognition';
import { FeedScreen } from './engage-feed';
import { liveFeedWithPosts, liveGiveKudos, liveWall } from './engage-live-samples';

// Batch G2 item 73: ENG-08 Give kudos and ENG-09 Recognition wall, badges only. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('ENG-08 Give kudos (live)', () => {
  it('Send with nothing chosen says what is missing; nothing is sent', async () => {
    const onSend = vi.fn();
    show(<GiveKudosScreen live={liveGiveKudos({ onSend })} />);
    await ue.click(screen.getByRole('button', { name: 'Send kudos' }));
    expect(await screen.findByText('Choose at least one person to thank.')).toBeInTheDocument();
    expect(screen.getByText('Pick a company value for this kudos.')).toBeInTheDocument();
    expect(screen.getByText('Write what they did.')).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends to the chosen people with the value and badge; says who was thanked', async () => {
    const onSend = vi.fn().mockResolvedValue({ held: false });
    const onClose = vi.fn();
    show(<GiveKudosScreen live={liveGiveKudos({ onSend, onClose, defaults: { to: ['p1'] } })} />);
    await ue.click(screen.getByRole('radio', { name: 'Own it' }));
    await ue.type(screen.getByRole('textbox', { name: /Message/ }), 'Closed the audit on time.');
    await ue.click(screen.getByRole('button', { name: 'Send kudos' }));
    expect(onSend).toHaveBeenCalledWith({ to: ['p1'], value: 'Own it', message: 'Closed the audit on time.' });
    expect((await screen.findAllByText('Kudos sent to Meera Iyer.')).length).toBeGreaterThan(0);
    expect(onClose).toHaveBeenCalled();
  });

  it('a blocked word warns; a refusal shows and keeps the sheet open', async () => {
    const onClose = vi.fn();
    show(<GiveKudosScreen live={liveGiveKudos({ onClose, defaults: { to: ['p1'] }, onSend: vi.fn().mockRejectedValue(new Error('Pick one of the company values.')) })} />);
    await ue.click(screen.getByRole('radio', { name: 'Own it' }));
    await ue.type(screen.getByRole('textbox', { name: /Message/ }), 'You idiot, you did it');
    expect(screen.getByText('This kudos will be held for review')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send kudos' }));
    expect(await screen.findByText('Pick one of the company values.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ENG-09 Recognition wall (live)', () => {
  it('shows kudos with the people thanked, value and badge; filters by value; no leaderboard with badges only', async () => {
    const onValue = vi.fn();
    show(<RecognitionWallScreen live={liveWall({ onValue })} />);
    const k = screen.getByRole('article', { name: /Kudos by Rekha/ });
    expect(within(k).getByText('Meera Iyer')).toBeInTheDocument();
    expect(within(k).getByText('Customer first · Above and beyond')).toBeInTheDocument();
    expect(screen.getByText(/no points or leaderboard/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Own it · 1' }));
    expect(onValue).toHaveBeenCalledWith('Own it');
  });

  it('no kudos for a value: says so and offers Give kudos', async () => {
    const onGive = vi.fn();
    show(<RecognitionWallScreen live={liveWall({ kudos: [], value: 'Win together', onGive })} />);
    expect(screen.getByText('No kudos for Win together yet')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Give kudos' })[1]);
    expect(onGive).toHaveBeenCalled();
  });

  it('a kudos shows in the feed as Kudos with the people thanked', () => {
    show(<FeedScreen live={liveFeedWithPosts({ updates: [{ id: 'k1', kind: 'update', spaceId: 's-co', space: 'Company', body: 'Thanks!', author: 'Rekha', authorLeft: false, mine: false, at: '2026-09-30T10:00:00Z', state: 'published', likes: 0, liked: false, comments: 0, kudos: { to: ['Meera Iyer'], value: 'Own it', badge: null } }] })} />);
    const k = screen.getByRole('article', { name: /Kudos by Rekha/ });
    expect(within(k).getByText('Meera Iyer')).toBeInTheDocument();
    expect(within(k).getByText('Own it')).toBeInTheDocument();
  });
});
