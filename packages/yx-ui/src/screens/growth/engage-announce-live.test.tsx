import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AnnouncementScreen, FeedScreen } from './engage-feed';
import { liveAnnouncements, liveFeed } from './engage-live-samples';
import { carriesAmount } from './growth-logic';

// Batch G2 item 12: ENG-03 announcements and the ENG-01 feed with real records. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('ENG-03 announcements (live)', () => {
  it('lists them with how far each went; a row opens it', async () => {
    const onOpen = vi.fn();
    show(<AnnouncementScreen live={liveAnnouncements({ onOpen })} />);
    expect(screen.getByText('64 of 96')).toBeInTheDocument();
    expect(screen.getByText('Not asked')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    expect(onOpen).toHaveBeenCalledWith('a1');
  });

  it('Publish with nothing written says what is missing and sends nothing', async () => {
    const onPublish = vi.fn();
    show(<AnnouncementScreen live={liveAnnouncements({ view: 'compose', onPublish })} />);
    await ue.click(screen.getByRole('button', { name: /Publish to 248 people/ }));
    expect(await screen.findByText('Write a title (at least 3 letters).')).toBeInTheDocument();
    expect(screen.getByText('Write the message.')).toBeInTheDocument();
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('an amount in the title cannot go by email', async () => {
    show(<AnnouncementScreen live={liveAnnouncements({ view: 'compose' })} />);
    await ue.type(screen.getByRole('textbox', { name: /Title/ }), 'September bonus: ₹12,000 credited');
    await ue.click(screen.getByRole('checkbox', { name: /Email/ }));
    expect(screen.getByText('Remove the amount before sending outside the app')).toBeInTheDocument();
    expect(carriesAmount('Hall 2 on floor 3')).toBe(false);
  });

  it('tracking shows read and acknowledged per person; Remind sends to those who have not acknowledged', async () => {
    const onRemind = vi.fn().mockResolvedValue({ reminded: 2 });
    show(<AnnouncementScreen live={liveAnnouncements({ view: 'tracking', onRemind })} />);
    expect(screen.getByText('Read, not acknowledged')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Remind 2 people' }));
    expect(onRemind).toHaveBeenCalled();
    expect((await screen.findAllByText('Reminder sent to 2 people.')).length).toBeGreaterThan(0);
  });

  it('reminded today: the button says so and cannot send again', () => {
    show(<AnnouncementScreen live={liveAnnouncements({ view: 'tracking', detail: { ...liveAnnouncements().detail!, canRemind: false } })} />);
    expect(screen.getByRole('button', { name: 'Reminded today' })).toBeDisabled();
  });

  it('without the key: no access', () => {
    show(<AnnouncementScreen live={liveAnnouncements({ state: 'no-access' })} />);
    expect(screen.queryByText('Revised canteen hygiene rules, Hosur plant')).toBeNull();
  });
});

describe('ENG-01 feed (live): announcements', () => {
  it('shows my announcements, pinned first, a former author marked; Acknowledge records it', async () => {
    const onAck = vi.fn().mockResolvedValue(undefined);
    show(<FeedScreen live={liveFeed({ onAck })} />);
    expect(screen.getByText('Revised canteen hygiene rules, Hosur plant')).toBeInTheDocument();
    expect(screen.getByText(/Former employee/)).toBeInTheDocument();
    const post = screen.getByRole('article', { name: /Announcement by Rekha/ });
    await ue.click(within(post).getByRole('button', { name: 'Acknowledge' }));
    expect(onAck).toHaveBeenCalledWith('a1');
    expect(await within(post).findByText('You acknowledged this')).toBeInTheDocument();
  });

  it('a refused acknowledgement is undone and said', async () => {
    const onAck = vi.fn().mockRejectedValue(new Error('No such announcement.'));
    show(<FeedScreen live={liveFeed({ onAck })} />);
    const post = screen.getByRole('article', { name: /Announcement by Rekha/ });
    await ue.click(within(post).getByRole('button', { name: 'Acknowledge' }));
    expect((await screen.findAllByText('No such announcement.')).length).toBeGreaterThan(0);
    expect(within(post).getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
  });

  it('nothing for me: says so', () => {
    show(<FeedScreen live={liveFeed({ posts: [] })} />);
    expect(screen.getByText('Your feed is empty')).toBeInTheDocument();
  });
});
