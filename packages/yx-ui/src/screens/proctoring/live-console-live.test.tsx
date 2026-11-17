import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LiveConsoleScreen } from './live';
import type { LiveConsole } from './live-console-live';

// AS-5 part 2 (PRC-13, answer 2006): the live console with a real test.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const LIVE = (over: Partial<LiveConsole> = {}): LiveConsole => ({
  testName: 'Java Backend Developer · L2',
  connection: 'connected',
  state: 'ready',
  onRetry: vi.fn(),
  tiles: [
    { id: 'a1', name: 'Sneha Iyer', status: 'in-progress', level: 'high', flags: 2, lastFlag: 'multiple faces', question: '5 of 20 answered', secondsLeft: 1800 },
    { id: 'a2', name: 'Arjun Nair', status: 'paused', level: 'clear', flags: 0, question: '9 of 20 answered', secondsLeft: 2400 },
  ],
  events: { a1: [{ id: 'e1', type: 'webcam_multiple_faces', severity: 'high', at: '2026-11-17T08:23:15.000Z' }] },
  onPause: vi.fn().mockResolvedValue(undefined),
  onResume: vi.fn().mockResolvedValue(undefined),
  onEnd: vi.fn().mockResolvedValue(undefined),
  onMessage: vi.fn().mockResolvedValue(undefined),
  ...over,
});
const openTile = (name: string) => ue.click(screen.getByRole('button', { name: new RegExp(`^${name},`) }));

describe('PRC-13 live console', () => {
  it('orders by concern, filters, and shows the flags of the one opened', async () => {
    render(<LiveConsoleScreen tiles={[]} live={LIVE()} />);
    const tiles = screen.getAllByRole('button', { name: /answered|, (High concern|Clear)/ }).filter((b) => b.className.includes('yx-ptile'));
    expect(tiles[0]).toHaveAccessibleName(/^Sneha Iyer/);
    await ue.click(screen.getByRole('button', { name: 'High concern 1' }));
    expect(screen.queryByRole('button', { name: /^Arjun Nair,/ })).not.toBeInTheDocument();
    await openTile('Sneha Iyer');
    expect(screen.getByText(/webcam multiple faces \(high\)/)).toBeInTheDocument();
  });

  it('pauses with a reason and a message to the candidate; ends with a reason', async () => {
    const live = LIVE();
    render(<LiveConsoleScreen tiles={[]} live={live} />);
    await openTile('Sneha Iyer');
    await ue.click(screen.getByRole('button', { name: 'Pause' }));
    const dialog = screen.getByRole('dialog', { name: /\?$/ });
    await ue.type(within(dialog).getByLabelText(/^Reason/), 'A second person came into the room.');
    await ue.type(within(dialog).getByLabelText(/Message to the candidate/), 'Please ask them to leave.');
    await ue.click(within(dialog).getByRole('button', { name: 'Pause test' }));
    expect(live.onPause).toHaveBeenCalledWith('a1', 'A second person came into the room.', 'Please ask them to leave.');
    await ue.click(screen.getByRole('button', { name: 'End attempt' }));
    const end = screen.getByRole('dialog', { name: /\?$/ });
    await ue.type(within(end).getByLabelText(/^Reason/), 'Second person seen again after the pause.');
    await ue.click(within(end).getByRole('button', { name: 'End attempt' }));
    expect(live.onEnd).toHaveBeenCalledWith('a1', 'Second person seen again after the pause.');
  });

  it('negative: nothing is sent without a reason of 10 characters; a paused attempt offers Resume', async () => {
    const live = LIVE();
    render(<LiveConsoleScreen tiles={[]} live={live} />);
    await openTile('Arjun Nair');
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Resume' }));
    const dialog = screen.getByRole('dialog', { name: /\?$/ });
    await ue.type(within(dialog).getByLabelText(/^Reason/), 'ok');
    await ue.click(within(dialog).getByRole('button', { name: 'Resume test' }));
    expect(screen.getByText(/at least 10 characters/)).toBeInTheDocument();
    expect(live.onResume).not.toHaveBeenCalled();
  });

  it('negative: a failed action says why; an empty test says when tiles appear', async () => {
    const live = LIVE({ onPause: vi.fn().mockRejectedValue(new Error('Attempt cannot be paused from status "submitted"')) });
    const { unmount } = render(<LiveConsoleScreen tiles={[]} live={live} />);
    await openTile('Sneha Iyer');
    await ue.click(screen.getByRole('button', { name: 'Pause' }));
    await ue.type(within(screen.getByRole('dialog', { name: /\?$/ })).getByLabelText(/^Reason/), 'A second person came into the room.');
    await ue.click(within(screen.getByRole('dialog', { name: /\?$/ })).getByRole('button', { name: 'Pause test' }));
    expect(await screen.findByText(/cannot be paused/)).toBeInTheDocument();
    unmount();
    render(<LiveConsoleScreen tiles={[]} live={LIVE({ tiles: [] })} />);
    expect(screen.getByText('No candidates in this test yet.')).toBeInTheDocument();
  });

  it('2269: the drawer shows the thread both ways and reloads it after a message is sent', async () => {
    const onThread = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'm1', fromCandidate: false, body: 'Please keep your face in view.', sentAt: '2026-11-17T05:00:00.000Z', readAt: '2026-11-17T05:01:00.000Z' }, { id: 'm2', fromCandidate: true, body: 'Sorry, fixed now.', sentAt: '2026-11-17T05:02:00.000Z', readAt: null }])
      .mockResolvedValue([{ id: 'm3', fromCandidate: false, body: 'Thanks.', sentAt: '2026-11-17T05:03:00.000Z', readAt: null }]);
    const live = LIVE({ onThread });
    render(<LiveConsoleScreen tiles={[]} live={live} />);
    await openTile('Sneha Iyer');
    const list = await screen.findByRole('list', { name: 'Messages with the candidate' });
    expect(within(list).getByText('Sorry, fixed now.')).toBeInTheDocument();
    expect(within(list).getByText('Sneha Iyer')).toBeInTheDocument();
    expect(within(list).getByText(/· read/)).toBeInTheDocument();
    expect(onThread).toHaveBeenCalledWith('a1');
    await ue.type(screen.getByLabelText(/^Message to the candidate/), 'Thanks.');
    await ue.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Thanks.', { selector: 'span' })).toBeInTheDocument();
  });
});

describe('PRC-13 integrity score and camera frame (answer 2268)', () => {
  it('scores the flags so far: any high flag is high concern; mediums and lows lower it', async () => {
    const { scoreFromFlags, tileLevel } = await import('./proctoring-logic');
    expect(scoreFromFlags([])).toBe(100);
    expect(tileLevel({ score: scoreFromFlags([{ severity: 'high' }]) })).toBe('high');
    expect(scoreFromFlags([{ severity: 'medium' }, { severity: 'low' }])).toBe(85);
    expect(tileLevel({ score: scoreFromFlags([{ severity: 'medium' }, { severity: 'medium' }]) })).toBe('review');
    expect(scoreFromFlags(Array.from({ length: 10 }, () => ({ severity: 'high' })))).toBe(0);
    expect(scoreFromFlags([{ severity: 'unknown' }])).toBe(100);
  });

  it('a tile shows the score and its latest camera frame; without a frame the placeholder shows', () => {
    render(<LiveConsoleScreen tiles={[]} live={LIVE({ tiles: [{ id: 'a1', name: 'Sneha Iyer', status: 'in-progress', score: 49, flags: 1, question: '5 of 20 answered', secondsLeft: 1800, thumbUrl: 'https://blob.test/f.jpg' }, { id: 'a2', name: 'Arjun Nair', status: 'in-progress', score: 100, flags: 0, question: '9 of 20 answered', secondsLeft: 2400 }] })} />);
    expect(screen.getByRole('img', { name: 'Sneha Iyer: latest camera frame' })).toHaveAttribute('src', 'https://blob.test/f.jpg');
    expect(screen.getByText('49 · High concern')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Arjun Nair: latest camera frame' })).not.toBeInTheDocument();
  });
});
