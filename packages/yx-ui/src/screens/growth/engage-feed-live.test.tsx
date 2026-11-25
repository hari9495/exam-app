import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { FeedScreen, ModerationScreen, PostComposerScreen } from './engage-feed';
import { liveFeedWithPosts, liveModeration, livePostComposer } from './engage-live-samples';

// Batch G2 item 100: ENG-01 feed and spaces, ENG-02 composer, ENG-11 moderation with real records. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('ENG-01 feed (live): updates', () => {
  it('shows updates of my spaces with likes; my waiting post is marked and has no Like', async () => {
    const onLike = vi.fn().mockResolvedValue(undefined);
    show(<FeedScreen live={liveFeedWithPosts({ onLike })} />);
    const post = screen.getByRole('article', { name: /Update by Selvi/ });
    await ue.click(within(post).getByRole('button', { name: /Like · 12/ }));
    expect(onLike).toHaveBeenCalledWith('u1');
    expect(within(post).getByRole('button', { name: /Liked · 13/ })).toBeInTheDocument();
    const mine = screen.getByRole('article', { name: /Update by Me/ });
    expect(within(mine).getByText('Waiting for approval')).toBeInTheDocument();
    expect(within(mine).queryByRole('button', { name: /Like/ })).toBeNull();
  });

  it('a refused like is undone', async () => {
    show(<FeedScreen live={liveFeedWithPosts({ onLike: vi.fn().mockRejectedValue(new Error('No such post.')) })} />);
    const post = screen.getByRole('article', { name: /Update by Selvi/ });
    await ue.click(within(post).getByRole('button', { name: /Like · 12/ }));
    expect(await within(post).findByRole('button', { name: /Like · 12/ })).toBeInTheDocument();
  });

  it('comments open in a drawer; an empty comment is refused; a held one is said', async () => {
    const onComment = vi.fn().mockResolvedValue({ held: true });
    show(<FeedScreen live={liveFeedWithPosts({ onComment })} />);
    await ue.click(within(screen.getByRole('article', { name: /Update by Selvi/ })).getByRole('button', { name: /Comment · 2/ }));
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText('Well done, team!')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Comment' }));
    expect(await within(d).findByText('Write the comment first.')).toBeInTheDocument();
    expect(onComment).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Your comment/ }), 'Great going');
    await ue.click(within(d).getByRole('button', { name: 'Comment' }));
    expect(onComment).toHaveBeenCalledWith('u1', 'Great going');
    expect((await screen.findAllByText(/held for review/)).length).toBeGreaterThan(0);
  });

  it('reporting a post thanks the reporter; my own post has no Report', async () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    show(<FeedScreen live={liveFeedWithPosts({ onReport })} />);
    await ue.click(within(screen.getByRole('article', { name: /Update by Selvi/ })).getByRole('button', { name: 'Post actions' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Report post' }));
    expect(onReport).toHaveBeenCalledWith('u1');
    expect(await screen.findByText('Thanks for reporting')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: /Update by Me/ })).queryByRole('button', { name: 'Post actions' })).toBeNull();
  });

  it('the directory: a moderator turns approval on for a location; the company space has no switch', async () => {
    const onApproval = vi.fn().mockResolvedValue(undefined);
    show(<FeedScreen live={liveFeedWithPosts({ start: { tab: 'spaces' }, onApproval })} />);
    expect(screen.getByText('Announcers post; others need approval')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /Turn (on|off) approval/ });
    expect(buttons).toHaveLength(3);
    await ue.click(screen.getAllByRole('button', { name: 'Turn on approval' })[0]);
    expect(onApproval).toHaveBeenCalledWith('s-hsr', true);
  });
});

describe('ENG-02 composer (live)', () => {
  it('Post with nothing written says so; a blocked word warns; posting tells the outcome', async () => {
    const onPost = vi.fn().mockResolvedValue({ state: 'held' });
    const onClose = vi.fn();
    show(<PostComposerScreen live={livePostComposer({ onPost, onClose })} />);
    await ue.click(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByText('Write the post.')).toBeInTheDocument();
    expect(onPost).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /^Post/ }), 'The supervisor is an idiot');
    expect(screen.getByText('This post will be held for review')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Post' }));
    expect(onPost).toHaveBeenCalledWith('s-hsr', 'The supervisor is an idiot', undefined);
    expect((await screen.findAllByText(/held for review/)).length).toBeGreaterThan(0);
    expect(onClose).toHaveBeenCalled();
  });

  it('the company space needs approval for someone who does not announce', () => {
    show(<PostComposerScreen live={livePostComposer({ defaultSpace: 's-co' })} />);
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeInTheDocument();
  });

  it('a refused post shows why and stays open', async () => {
    const onClose = vi.fn();
    show(<PostComposerScreen live={livePostComposer({ onPost: vi.fn().mockRejectedValue(new Error('You can post only in your own spaces.')), onClose })} />);
    await ue.type(screen.getByRole('textbox', { name: /^Post/ }), 'Hello');
    await ue.click(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByText('You can post only in your own spaces.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ENG-11 moderation (live)', () => {
  it('approves a waiting post, restores a held one, and warns only with a note', async () => {
    const onAct = vi.fn().mockResolvedValue(undefined);
    show(<ModerationScreen live={liveModeration({ onAct, start: { open: 'm1' } })} />);
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText('Repeat pattern')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Warn author' }));
    expect(await within(d).findByText('Write the note first.')).toBeInTheDocument();
    expect(onAct).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Note to the author/ }), 'Please keep it civil.');
    await ue.click(within(d).getByRole('button', { name: 'Warn author' }));
    expect(onAct).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 'warn', 'Please keep it civil.');
    await ue.click(within(d).getByRole('button', { name: 'Restore' }));
    expect(onAct).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'm1' }), 'restore', undefined);
  });

  it('delete asks first', async () => {
    const onAct = vi.fn().mockResolvedValue(undefined);
    show(<ModerationScreen live={liveModeration({ onAct, start: { open: 'm3' } })} />);
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await ue.click(await screen.findByRole('button', { name: 'Delete comment' }));
    expect(onAct).toHaveBeenCalledWith(expect.objectContaining({ id: 'm3' }), 'delete', undefined);
  });

  it('without the key: no access; nothing to review: says so', () => {
    const { unmount } = show(<ModerationScreen live={liveModeration({ state: 'no-access' })} />);
    expect(screen.queryByText('Ravi K.')).toBeNull();
    unmount();
    show(<ModerationScreen live={liveModeration({ items: [] })} />);
    expect(screen.getByText('Nothing to review')).toBeInTheDocument();
  });
});
