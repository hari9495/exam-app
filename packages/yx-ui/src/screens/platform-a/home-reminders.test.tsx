import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISMISS_KEY, dismissForToday, dismissedToday, HomeReminderCards } from './home-reminders';
import { REMINDERS } from './home-reminders.stories';

// T2-E 51 (answer 2874): Home reminder cards, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
afterEach(() => window.localStorage.removeItem(DISMISS_KEY));

describe('Home reminder cards (T2-E 51)', () => {
  it('each card has its title, its action link and Not today', async () => {
    const onDismiss = vi.fn();
    render(<HomeReminderCards cards={REMINDERS} onDismiss={onDismiss} />);
    expect(screen.getByRole('heading', { name: 'A request of yours was sent back' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload proofs' })).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Not today' })[0]!);
    expect(onDismiss).toHaveBeenCalledWith('sent_back:r1');
  });

  it('negative: no cards render nothing', () => {
    render(<HomeReminderCards cards={[]} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('Not today lasts for the day only; blocked storage never breaks it', () => {
    dismissForToday('2026-11-27', 'survey:s1');
    expect(dismissedToday('2026-11-27')).toEqual(['survey:s1']);
    expect(dismissedToday('2026-11-28')).toEqual([]);
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(dismissedToday('2026-11-27')).toEqual([]);
    expect(dismissForToday('2026-11-27', 'x')).toEqual(['x']);
    get.mockRestore();
    set.mockRestore();
  });
});
