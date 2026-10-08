import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeScreen, categoryTree } from './knowledge';
import { KB_ARTICLE, KB_SPACES, kbProps } from './kb-data';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const open = { articleId: KB_ARTICLE.id, article: KB_ARTICLE };

describe('HLP-04 knowledge', () => {
  it('orders the category tree with sections under their category', () => {
    expect(categoryTree(KB_SPACES[0].categories).map((t) => t.path)).toEqual(['Laptops', 'Network', 'Network › Wi-Fi']);
  });

  it('lists articles with their state, health and review badge', () => {
    render(<KnowledgeScreen {...kbProps()} />);
    expect(screen.getByRole('button', { name: 'Wi-Fi keeps dropping' })).toBeInTheDocument();
    expect(screen.getAllByText('Waiting for review').length).toBeGreaterThan(0);
    expect(screen.getByText('Health 31')).toBeInTheDocument();
    expect(screen.getByText(/People who ask this desk/)).toBeInTheDocument();
  });

  it('saves the editor as a draft version', async () => {
    const onSaveDraft = vi.fn().mockResolvedValue({ version: 3 });
    render(<KnowledgeScreen {...kbProps({ ...open, onSaveDraft })} />);
    const title = screen.getByRole('textbox', { name: /^Title/ });
    await ue.clear(title);
    await ue.type(title, 'Wi-Fi drops on floor 2');
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSaveDraft).toHaveBeenCalledWith('a1', expect.objectContaining({ title: 'Wi-Fi drops on floor 2', version: 2, bodyHtml: expect.stringContaining('Kaveri-Staff') }));
    expect(await screen.findByText('Draft saved as version 3.')).toBeInTheDocument();
  });

  it('shows the four-eyes refusal in words when a publisher approves their own version', async () => {
    const onReview = vi.fn().mockRejectedValue(new Error('Someone else reviews your changes (four eyes).'));
    const mine = { ...KB_ARTICLE, versions: KB_ARTICLE.versions.map((v) => (v.version === 2 ? { ...v, mine: true } : v)) };
    render(<KnowledgeScreen {...kbProps({ articleId: 'a1', article: mine, onReview })} />);
    expect(screen.getByText('You wrote this version, so someone else must review it.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve and publish' }));
    expect(onReview).toHaveBeenCalledWith('a1', { version: 2, approve: true });
    expect(await screen.findByText('Someone else reviews your changes (four eyes).')).toBeInTheDocument();
  });

  it('offers approve and send back only to publishers', async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<KnowledgeScreen {...kbProps({ ...open, onReview })} />);
    await ue.type(screen.getByRole('textbox', { name: /Note to the writer/ }), 'Add a screenshot');
    await ue.click(screen.getByRole('button', { name: 'Send back' }));
    expect(onReview).toHaveBeenCalledWith('a1', { version: 2, approve: false, note: 'Add a screenshot' });
    unmount();
    render(<KnowledgeScreen {...kbProps({ articleId: 'a1', article: { ...KB_ARTICLE, canPublish: false } })} />);
    expect(screen.queryByRole('button', { name: 'Approve and publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.getByText('Version 2 is waiting for a publisher to review it.')).toBeInTheDocument();
  });

  it('sends only changed details, and moves a category with its siblings', async () => {
    const onUpdateMeta = vi.fn().mockResolvedValue(undefined);
    const onReorderCategories = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<KnowledgeScreen {...kbProps({ ...open, onUpdateMeta })} />);
    await ue.type(screen.getByRole('textbox', { name: /Search title/ }), 'Wi-Fi help');
    expect(screen.getByText('10 of 70 letters. Shown by search engines.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save details' }));
    expect(onUpdateMeta).toHaveBeenCalledWith('a1', 4, { seoTitle: 'Wi-Fi help' });
    unmount();
    render(<KnowledgeScreen {...kbProps({ onReorderCategories })} />);
    await ue.click(screen.getByRole('button', { name: 'Move Network up' }));
    expect(onReorderCategories).toHaveBeenCalledWith('sp1', ['c2', 'c1']);
  });
});
