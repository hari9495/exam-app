import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { HelpEditorScreen } from './console-ops';
import type { HelpDetail, HelpRow, LiveHelpCentre } from './console-helpcentre-live';

// Console C-8, YX-11 (answer 1057): the live help-centre editor.
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const ROWS: HelpRow[] = [{ id: 'h1', number: 12, title: 'Approve and lock a payroll run', state: 'published', pages: ['/yx/payroll/runs'], publishedAt: '2026-11-02T09:00:00Z', updatedAt: '2026-11-02T09:00:00Z' }];
const detail = (mine: boolean): HelpDetail => ({
  id: 'h2',
  title: 'Apply for leave',
  summary: null,
  pages: ['/yx/time/leave'],
  state: 'in_review',
  publicUrl: null,
  versions: [{ version: 2, title: 'Apply for leave', summary: null, bodyHtml: '<p>Press Apply.</p>', author: 'Joseph Thomas', mine, reviewNote: null, state: 'in_review' }],
});
const live = (o: Partial<LiveHelpCentre> = {}): LiveHelpCentre => ({
  state: 'ready',
  onRetry: () => {},
  articles: ROWS,
  gaps: [{ query: 'esi challan', companies: 7, times: 31 }],
  settings: [{ key: 'helpcentre.gaps_min_companies', label: 'Show a no-result search once this many companies searched it', value: 5, default: 5, min: 5, max: 100 }],
  loadArticle: vi.fn(),
  onCreate: vi.fn(),
  onSave: vi.fn(),
  onSubmit: vi.fn(),
  onReview: vi.fn(),
  onSaveSettings: vi.fn().mockResolvedValue(undefined),
  ...o,
});
const show = (l: LiveHelpCentre) => wrap(<HelpEditorScreen articles={[]} noResults={[]} today={new Date('2026-11-12')} live={l} />);

describe('Help centre (live)', () => {
  it('lists the articles with their pages, and no-result searches as counts only', () => {
    show(live());
    expect(screen.getByText('Approve and lock a payroll run')).toBeInTheDocument();
    expect(screen.getByText('/yx/payroll/runs')).toBeInTheDocument();
    const gaps = screen.getByRole('list', { name: 'Searches with no results' });
    expect(within(gaps).getByText('7 companies · 31 searches')).toBeInTheDocument();
    expect(screen.getByText(/never which company or who searched/)).toBeInTheDocument();
  });

  it('a new article needs a title and app-address pages before it is saved', async () => {
    const onCreate = vi.fn().mockResolvedValue({ ...detail(true), state: 'draft' });
    show(live({ onCreate }));
    await userEvent.click(screen.getByRole('button', { name: 'New article' }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Save draft' }));
    expect(within(drawer).getByText('Write a title of at least 3 characters.')).toBeInTheDocument();
    expect(within(drawer).getByText(/Name at least one page it explains/)).toBeInTheDocument();
    await userEvent.type(within(drawer).getByRole('textbox', { name: /Title/ }), 'Apply for leave');
    await userEvent.type(within(drawer).getByRole('textbox', { name: /Pages it explains/ }), 'time/leave');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Save draft' }));
    expect(within(drawer).getByText(/Pages are app addresses/)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    await userEvent.clear(within(drawer).getByRole('textbox', { name: /Pages it explains/ }));
    await userEvent.type(within(drawer).getByRole('textbox', { name: /Pages it explains/ }), '/yx/time/leave');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Apply for leave', pages: ['/yx/time/leave'] })));
    expect((await screen.findAllByText('Draft saved')).length).toBeGreaterThan(0);
  });

  it('the writer cannot publish their own article', async () => {
    show(live({ defaultOpen: detail(true) }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('In review: another staff member publishes it.')).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  it('another staff member publishes it; sending back needs a note', async () => {
    const onReview = vi.fn().mockResolvedValue({ ...detail(false), state: 'published' });
    show(live({ defaultOpen: detail(false), onReview }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send back' }));
    expect(within(drawer).getByText('Say what to change before sending it back.')).toBeInTheDocument();
    expect(onReview).not.toHaveBeenCalled();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith('h2', 2, true));
    expect((await screen.findAllByText('Published for every company')).length).toBeGreaterThan(0);
  });

  it('the rule cannot be saved empty; a valid one is saved', async () => {
    const onSaveSettings = vi.fn().mockResolvedValue(undefined);
    show(live({ onSaveSettings }));
    const field = screen.getByRole('textbox', { name: /Show a no-result search/ });
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onSaveSettings).not.toHaveBeenCalled();
    await userEvent.type(field, '6');
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    await waitFor(() => expect(onSaveSettings).toHaveBeenCalledWith({ 'helpcentre.gaps_min_companies': 6 }));
  });
});
