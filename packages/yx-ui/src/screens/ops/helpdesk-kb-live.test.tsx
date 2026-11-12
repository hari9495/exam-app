import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { KbEditorScreen } from './helpdesk';
import { articleStatus, categoryTree } from './helpdesk-kb-live';
import { KB_ARTICLE, KB_DRAFT, KB_REVIEW_DUE, KB_SPACES, liveKb, openKb } from './helpdesk-kb-live-samples';

// HLP-04 Knowledge base editor, live: the designed screen with the real articles (Helpdesk design wiring, round 4).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('HLP-04 rules', () => {
  it('orders the category tree with sections under their category', () => {
    expect(categoryTree(KB_SPACES[0].categories).map((t) => t.path)).toEqual(['Laptops', 'Network', 'Network › Wi-Fi']);
  });

  it('the header status: review due wins over published; drafts and retired keep their own', () => {
    expect(articleStatus({ state: 'published', reviewOverdue: true })).toEqual({ label: 'Review due', tone: 'warning' });
    expect(articleStatus({ state: 'published', reviewOverdue: false }).label).toBe('Published');
    expect(articleStatus({ state: 'draft', reviewOverdue: true }).label).toBe('Draft');
    expect(articleStatus({ state: 'retired', reviewOverdue: false }).label).toBe('Retired');
  });
});

describe('HLP-04 Knowledge base editor (live)', () => {
  it('lists the space articles with status, health and review date; a row opens the article', async () => {
    const onOpenArticle = vi.fn();
    show(<KbEditorScreen live={liveKb({ onOpenArticle })} />);
    expect(screen.getByText(/2 articles in IT help · People who ask this desk/)).toBeInTheDocument();
    expect(screen.getByText('Change waiting for review')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
    await ue.click(screen.getByText('Wi-Fi keeps dropping'));
    expect(onOpenArticle).toHaveBeenCalledWith('a1');
  });

  it('a publisher sees the waiting version and publishes it through the design dialog (toast)', async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    show(<KbEditorScreen live={openKb(KB_ARTICLE, { onReview })} />);
    expect(screen.getByText(/Version 2 by Farah Khan is waiting for your review: “New network name”/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Publish changes' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/suggested to the people who ask this desk/)).toBeInTheDocument();
    await ue.click(within(dlg).getByRole('button', { name: 'Publish article' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith('a1', { version: 2, approve: true }));
    expect((await screen.findAllByText('Version 2 is published.')).length).toBeGreaterThan(0);
  });

  it('send back needs a note of 3 letters or more', async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    show(<KbEditorScreen live={openKb(KB_ARTICLE, { onReview, start: { dialog: 'send-back' } })} />);
    const dlg = await screen.findByRole('dialog');
    await ue.click(within(dlg).getByRole('button', { name: 'Send back' }));
    expect(within(dlg).getByText(/Write at least 3 letters/)).toBeInTheDocument();
    expect(onReview).not.toHaveBeenCalled();
    await ue.type(within(dlg).getByRole('textbox', { name: /Note to the writer/ }), 'Add the new name');
    await ue.click(within(dlg).getByRole('button', { name: 'Send back' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith('a1', { version: 2, approve: false, note: 'Add the new name' }));
  });

  it('an author saves the "Where it shows" choices, then the words as a draft version', async () => {
    const onUpdateMeta = vi.fn().mockResolvedValue(undefined);
    const onSaveDraft = vi.fn().mockResolvedValue({ version: 2 });
    show(<KbEditorScreen live={openKb(KB_DRAFT, { onUpdateMeta, onSaveDraft })} />);
    expect(screen.queryByRole('button', { name: /^Publish/ })).not.toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Also suggest for these words/ }), 'password, login');
    await ue.click(screen.getByRole('switch', { name: 'Use in assistant answers' }));
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith('a2', expect.objectContaining({ title: 'Reset your laptop password', version: 1 })));
    expect(onUpdateMeta).toHaveBeenCalledWith('a2', 4, { keywords: 'password, login', assistantUse: false });
  });

  it('pressed too early: no title stops Save draft; no answer stops Send for review; bad keywords say so', async () => {
    const onSaveDraft = vi.fn();
    show(<KbEditorScreen live={openKb({ ...KB_DRAFT, versions: [{ ...KB_DRAFT.versions[0], bodyHtml: '' }] }, { onSaveDraft })} />);
    await ue.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(screen.getByText('Write the answer before sending it for review.')).toBeInTheDocument();
    await ue.clear(screen.getByRole('textbox', { name: /^Title/ }));
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getAllByText('Give the article a title.').length).toBeGreaterThan(0);
    await ue.type(screen.getByRole('textbox', { name: /^Title/ }), 'Reset');
    await ue.type(screen.getByRole('textbox', { name: /Also suggest for these words/ }), '<script>');
    await ue.tab();
    expect(screen.getAllByText(/Use letters, digits, spaces and commas/).length).toBeGreaterThan(0);
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it('review due: the banner and Mark reviewed (toast with the next date)', async () => {
    const onMarkReviewed = vi.fn().mockResolvedValue({ reviewDueOn: '2027-10-29' });
    show(<KbEditorScreen live={openKb(KB_REVIEW_DUE, { onMarkReviewed })} />);
    expect(screen.getByText('Review due')).toBeInTheDocument();
    expect(screen.getByText(/was due for review on 1 Sept? 2026/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(onMarkReviewed).toHaveBeenCalledWith('a1', 4));
    expect((await screen.findAllByText(/Marked reviewed. The next check is due on 29 Oct 2027/)).length).toBeGreaterThan(0);
  });

  it('a reader without author rights sees the article read only, with no save or send', () => {
    show(<KbEditorScreen live={openKb({ ...KB_ARTICLE, canAuthor: false, canPublish: false }, { blocks: null, templates: null })} />);
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send for review' })).not.toBeInTheDocument();
    expect(screen.getByText('wifi, wireless, network drops')).toBeInTheDocument();
  });

  it('compare shows the waiting version beside the published one', async () => {
    show(<KbEditorScreen live={openKb(KB_ARTICLE, { start: { dialog: 'compare', compare: 2 } })} />);
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText('Waiting for review: version 2')).toBeInTheDocument();
    expect(within(dlg).getByText('Published now: version 1')).toBeInTheDocument();
  });

  it('1647: content gaps list the articles that led to tickets, with no task button; an empty period says so', async () => {
    const { unmount } = show(<KbEditorScreen live={liveKb({ start: { tab: 'gaps' } })} />);
    const list = await screen.findByRole('list', { name: 'Articles that led to tickets' });
    expect(within(list).getByText('KB-12 · Connect to the office VPN from home')).toBeInTheDocument();
    expect(within(list).getByText('4 tickets were raised while reading it')).toBeInTheDocument();
    expect(within(list).queryByRole('button')).toBeNull();
    // 1684: searches that led to tickets, one ticket said in the singular; each may become an article-request task.
    const searches = screen.getByRole('list', { name: 'Searches that led to tickets' });
    expect(within(searches).getByText('3 tickets were raised after this search')).toBeInTheDocument();
    expect(within(searches).getByText('1 ticket was raised after this search')).toBeInTheDocument();
    expect(within(searches).getByRole('button', { name: 'Make an article-request task for gratuity' })).toBeInTheDocument();
    unmount();
    show(<KbEditorScreen live={liveKb({ start: { tab: 'gaps' }, onLoadGaps: async () => ({ noResult: [], noClick: [], noArticle: [] }) })} />);
    await waitFor(() => expect(screen.getAllByText('Nothing in this period.')).toHaveLength(5));
  });

  it('1642, 1681: search words have their own tab; an empty list is stopped, the starter list fills it in and is saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(<KbEditorScreen live={liveKb({ searchWords: { value: 'cl, casual leave', starter: 'pf, provident fund', onSave } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Search words' }));
    const box = await screen.findByLabelText('Words, one group a line');
    expect(box).toHaveValue('cl, casual leave');
    await ue.clear(box);
    await ue.click(screen.getByRole('button', { name: 'Save search words' }));
    expect((await screen.findAllByText('Write at least one line, or press Use the starter list.')).length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Use the starter list' }));
    await ue.click(screen.getByRole('button', { name: 'Save search words' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('pf, provident fund'));
    expect((await screen.findAllByText('Search words saved.')).length).toBeGreaterThan(0);
  });

  it('1681: without the right (no searchWords) there is no Search words tab', () => {
    show(<KbEditorScreen live={liveKb()} />);
    expect(screen.queryByRole('tab', { name: 'Search words' })).toBeNull();
  });

  it('no access (403) shows the kit no-access state', () => {
    show(<KbEditorScreen live={liveKb({ state: 'no-access' })} />);
    expect(screen.getByText(/You don't have access to the knowledge base/)).toBeInTheDocument();
  });
});
