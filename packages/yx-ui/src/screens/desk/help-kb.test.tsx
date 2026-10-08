import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HelpCentreScreen, MyTicketScreen } from './help';
import { ArticleBody, RateTicketCard, type KbArticleView, type KbHome } from './help-kb';
import { InsertArticleButton, TicketKbCard, articleLinkHtml } from './ticket-kb';
import { MY_ROWS, MY_TICKET, RAISE_DESKS } from './data';

// Batch 4 requester knowledge and ratings (SD-1.24 … SD-1.26) and the agent's knowledge tools on a ticket (US-G-023).
const ue = userEvent.setup({ pointerEventsCheck: 0 });

const ARTICLE: KbArticleView = { id: 'a1', number: 12, title: 'Connect to the office Wi-Fi', summary: 'Join KaveriStaff.', bodyHtml: '<p>Choose KaveriStaff.</p>', language: 'en', languages: ['en', 'hi'], fallback: false, updatedAt: '2026-10-08T10:00:00Z' };
const HOME: KbHome = { spaces: [{ id: 's1', slug: 'it-help', name: 'IT help', categories: [{ id: 'c1', parentId: null, name: 'Network' }] }], featured: [{ id: 'a1', number: 12, title: 'Connect to the office Wi-Fi', summary: null }], articles: [{ id: 'a1', number: 12, title: 'Connect to the office Wi-Fi', summary: null, categoryId: 'c1', spaceId: 's1' }] };

describe('help articles for requesters', () => {
  it('suggests articles while the person types the subject, and opens one', async () => {
    const onSearch = vi.fn().mockResolvedValue([{ id: 'a1', number: 12, title: 'Connect to the office Wi-Fi', summary: 'Join KaveriStaff.' }]);
    const onArticle = vi.fn().mockResolvedValue(ARTICLE);
    render(<HelpCentreScreen state="ready" desks={RAISE_DESKS} tickets={MY_ROWS} onRaise={vi.fn()} onOpen={() => {}} kb={{ home: HOME, onSearch, onArticle, onFeedback: vi.fn(), onSolved: vi.fn() }} />);
    await ue.click(screen.getByRole('button', { name: 'Raise a ticket' }));
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'wifi down');
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith(expect.stringContaining('wifi down')));
    const links = await screen.findAllByRole('button', { name: 'Connect to the office Wi-Fi' });
    await ue.click(links[links.length - 1]);
    await waitFor(() => expect(onArticle).toHaveBeenCalledWith(12, undefined));
  });

  it('"This solved it" counts and needs no ticket; feedback once; language is a single choice', async () => {
    const onSolved = vi.fn().mockResolvedValue(undefined);
    const onFeedback = vi.fn().mockResolvedValue(undefined);
    const onLanguage = vi.fn();
    render(<ArticleBody article={ARTICLE} onSolved={onSolved} onFeedback={onFeedback} onLanguage={onLanguage} />);
    await ue.click(screen.getByRole('radio', { name: 'हिन्दी' }));
    expect(onLanguage).toHaveBeenCalledWith('hi');
    await ue.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onFeedback).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'No' })).toBeDisabled();
    await ue.click(screen.getByRole('button', { name: 'This solved it' }));
    expect(onSolved).toHaveBeenCalled();
    expect(await screen.findByText('No ticket was needed.')).toBeTruthy();
  });

  it('shows a notice when the article is not in the reader\'s language', () => {
    render(<ArticleBody article={{ ...ARTICLE, fallback: true }} />);
    expect(screen.getByText(/not in your language yet/)).toBeTruthy();
  });

  it('rates a solved ticket once (1 to 5 as a single choice)', async () => {
    const onRate = vi.fn().mockResolvedValue(undefined);
    render(<RateTicketCard rating={null} onRate={onRate} />);
    await ue.click(screen.getByRole('radio', { name: '2' }));
    await ue.click(screen.getByRole('button', { name: 'Send rating' }));
    expect(onRate).toHaveBeenCalledWith(2, undefined);
    expect(await screen.findByText(/You rated this ticket 2 of 5/)).toBeTruthy();
  });

  it('the requester\'s ticket shows the rating card only when it can be rated or was rated', () => {
    const props = { state: 'ready' as const, onBack: () => {}, onReply: vi.fn(), onUpload: vi.fn(), onOpenFile: vi.fn(), onAddWatcher: vi.fn(), onRate: vi.fn() };
    const { rerender } = render(<MyTicketScreen {...props} ticket={{ ...MY_TICKET, canRate: false, rating: null }} />);
    expect(screen.queryByText('How did we do?')).toBeNull();
    rerender(<MyTicketScreen {...props} ticket={{ ...MY_TICKET, canRate: true, rating: null }} />);
    expect(screen.getByText('How did we do?')).toBeTruthy();
  });
});

describe('knowledge on a ticket', () => {
  it('inserts a link the server will clean, with the title escaped', () => {
    expect(articleLinkHtml({ id: 'a', number: 1, title: 'A <b>bold</b> "title"', summary: null, url: 'https://x.test/a?b=1&c=2' })).toBe('<p><a href="https://x.test/a?b=1&amp;c=2">A &lt;b&gt;bold&lt;/b&gt; &quot;title&quot;</a></p>');
  });

  it('finds and inserts an article', async () => {
    const onFind = vi.fn().mockResolvedValue([{ id: 'a1', number: 12, title: 'Reset VPN', summary: null, url: 'https://x.test/kb/12' }]);
    const onInsert = vi.fn();
    render(<InsertArticleButton onFind={onFind} onInsert={onInsert} />);
    await ue.click(screen.getByRole('button', { name: 'Insert article' }));
    await ue.type(screen.getByRole('textbox', { name: 'Search articles' }), 'vpn');
    await ue.click(await screen.findByRole('button', { name: 'Insert' }));
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('records what solved it, flags with a reason, and makes a draft only for a solved ticket', async () => {
    const p = { links: [{ id: 'a1', number: 12, title: 'Reset VPN', kind: 'linked' as const }], canWork: true, spaces: [{ id: 's1', name: 'IT help' }], onSolvedBy: vi.fn().mockResolvedValue(undefined), onFlag: vi.fn().mockResolvedValue(undefined), onMakeArticle: vi.fn().mockResolvedValue({ id: 'd1' }), onOpenArticle: vi.fn() };
    const { rerender } = render(<TicketKbCard {...p} solved={false} />);
    expect(screen.queryByRole('button', { name: 'Make draft article' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'This solved it' }));
    expect(p.onSolvedBy).toHaveBeenCalledWith('a1');
    await ue.click(screen.getByRole('button', { name: 'Out of date' }));
    const flag = screen.getByRole('button', { name: 'Flag it' });
    expect(flag).toBeDisabled();
    await ue.type(screen.getByRole('textbox', { name: 'What is wrong?' }), 'Menu moved');
    await ue.click(flag);
    expect(p.onFlag).toHaveBeenCalledWith('a1', 'Menu moved');
    rerender(<TicketKbCard {...p} solved />);
    await ue.click(screen.getByRole('button', { name: 'Make draft article' }));
    expect(p.onMakeArticle).toHaveBeenCalledWith('s1');
    expect(await screen.findByText('Draft article made')).toBeTruthy();
  });
});
