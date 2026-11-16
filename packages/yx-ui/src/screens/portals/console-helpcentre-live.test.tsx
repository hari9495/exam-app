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

  // Answer 1261: the rule is read here and changed in Console › Platform settings.
  it('the rule shows its value and default; only someone who may change it gets the link', async () => {
    const onOpenPlatformSettings = vi.fn();
    const first = show(live({ settings: [{ key: 'helpcentre.gaps_min_companies', label: 'Show a no-result search once this many companies searched it', value: 7, default: 5, min: 5, max: 100 }], onOpenPlatformSettings }));
    expect(screen.getByText('7 (default 5)')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Show a no-result search/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Change in Platform settings' }));
    expect(onOpenPlatformSettings).toHaveBeenCalled();
    first.unmount();
    show(live());
    expect(screen.getByText('5 (the default)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change in Platform settings' })).toBeNull();
  });
});

// Answer 1203: retiring a published article takes two staff members.
describe('retiring an article', () => {
  const published = (retire: HelpDetail['retire']): HelpDetail => ({ ...detail(false), id: 'h1', state: 'published', publicUrl: '/yx/help/x/y/z', versions: [{ ...detail(false).versions[0]!, state: 'published' }], retire });

  it('Retire asks why (field error, focus), then sends the request', async () => {
    const onRetire = vi.fn().mockResolvedValue(published({ requestedBy: 'You', mine: true, reason: 'Old', at: '2026-11-12T08:00:00Z' }));
    show(live({ defaultOpen: published(null), onRetire, onApproveRetire: vi.fn() }));
    await userEvent.click(screen.getByRole('button', { name: 'Retire' }));
    const dialog = await screen.findByRole('dialog', { name: /Retire/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ask to retire' }));
    expect(within(dialog).getByText(/Say why it is retired/)).toBeInTheDocument();
    expect(document.activeElement?.id).toBe('hc-retire');
    expect(onRetire).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Why/ }), 'Replaced by a new guide');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ask to retire' }));
    await waitFor(() => expect(onRetire).toHaveBeenCalledWith('h1', 'Replaced by a new guide'));
  });

  it('the person who asked cannot approve; someone else can', async () => {
    const onApproveRetire = vi.fn().mockResolvedValue(published(null));
    const mine = show(live({ defaultOpen: published({ requestedBy: 'You', mine: true, reason: 'Old', at: '2026-11-12T08:00:00Z' }), onRetire: vi.fn(), onApproveRetire }));
    expect(screen.queryByRole('button', { name: 'Approve retire' })).toBeNull();
    expect(screen.getByText(/another staff member approves/)).toBeInTheDocument();
    mine.unmount();
    show(live({ defaultOpen: published({ requestedBy: 'Joseph Thomas', mine: false, reason: 'Old', at: '2026-11-12T08:00:00Z' }), onRetire: vi.fn(), onApproveRetire }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve retire' }));
    await waitFor(() => expect(onApproveRetire).toHaveBeenCalledWith('h1'));
  });

  // Answer 1263: the person who asked withdraws while it waits; nobody else sees Withdraw.
  it('the person who asked withdraws the request; someone else cannot', async () => {
    const onWithdrawRetire = vi.fn().mockResolvedValue(published(null));
    const theirs = show(live({ defaultOpen: published({ requestedBy: 'Joseph Thomas', mine: false, reason: 'Old', at: '2026-11-12T08:00:00Z' }), onRetire: vi.fn(), onApproveRetire: vi.fn(), onWithdrawRetire }));
    expect(screen.queryByRole('button', { name: 'Withdraw request' })).toBeNull();
    theirs.unmount();
    show(live({ defaultOpen: published({ requestedBy: 'You', mine: true, reason: 'Old', at: '2026-11-12T08:00:00Z' }), onRetire: vi.fn(), onApproveRetire: vi.fn(), onWithdrawRetire }));
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw request' }));
    await waitFor(() => expect(onWithdrawRetire).toHaveBeenCalledWith('h1'));
    expect((await screen.findAllByText('Retire request withdrawn')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument();
  });

  // Answer 2116: "Use in assistant answers" in the console editor, on by default, saved with the draft.
  it('Use in assistant answers is on by default and is saved with the draft when switched off', async () => {
    const d: HelpDetail = { ...detail(true), state: 'draft', versions: [{ ...detail(true).versions[0]!, state: 'draft' }] };
    const onSave = vi.fn().mockResolvedValue({ ...d, assistantUse: false });
    show(live({ defaultOpen: d, onSave }));
    const sw = screen.getByRole('switch', { name: /Use in assistant answers/ });
    expect(sw).toBeChecked();
    await userEvent.click(sw);
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('h2', expect.objectContaining({ assistantUse: false })));
  });

  it('negative: an article switched off shows it off; while in review it cannot be switched', async () => {
    show(live({ defaultOpen: { ...detail(false), assistantUse: false } }));
    const sw = screen.getByRole('switch', { name: /Use in assistant answers/ });
    expect(sw).not.toBeChecked();
    expect(sw).toBeDisabled();
  });
});
