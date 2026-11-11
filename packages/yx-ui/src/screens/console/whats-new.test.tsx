import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { actionWords } from './console-kit';
import { WhatsNewConsoleScreen, newsInput, type NewsEntryRow } from './whats-new';
import { WhatsNewPanel, type LiveWhatsNew } from '../platform-b/growth-screens';

// Help H-4 (answer 943): YukthiX staff write What's new entries; people read them in the Help drawer.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn().mockResolvedValue(undefined);
const PRODUCTS = [{ code: 'hrms', name: 'YukthiX HR' }, { code: 'service_desk', name: 'YukthiX Service Desk' }];
const ROWS: NewsEntryRow[] = [
  { id: 'n1', title: 'Comp-off expiry on the balance card', body: 'Employees see when comp-off lapses.', products: ['hrms'], audiences: ['employee', 'manager'], publishOn: '2026-11-20', state: 'scheduled', version: 1 },
  { id: 'n2', title: 'Old entry', body: 'Gone.', products: ['hrms'], audiences: ['everyone'], publishOn: '2026-10-01', state: 'withdrawn', version: 2 },
];
const screenOf = (o: Partial<Parameters<typeof WhatsNewConsoleScreen>[0]> = {}) => {
  const p = { state: 'ready' as const, entries: ROWS, products: PRODUCTS, today: '2026-11-12', canManage: true, onCreate: ok(), onUpdate: ok(), onWithdraw: ok(), ...o };
  render(
    <ToastProvider>
      <WhatsNewConsoleScreen {...p} />
    </ToastProvider>,
  );
  return p;
};

describe("Console › What's new", () => {
  it('the input mirrors the API: title, text, a product, who, a real date; no < or >', () => {
    expect(newsInput({ title: 'ab', body: '', products: [], audiences: [], publishOn: '2026-02-30' }).errors.map((e) => e.fieldId)).toEqual(['wn-title', 'wn-body', 'wn-products', 'wn-for', 'wn-on']);
    expect(newsInput({ title: 'Hello <b>', body: 'x', products: ['hrms'], audiences: ['everyone'], publishOn: '2026-11-12' }).errors[0]!.message).toMatch(/without < or >/);
    expect(newsInput({ title: '  New shortcuts  ', body: ' Press ? ', products: ['hrms'], audiences: ['everyone'], publishOn: '2026-11-12' }).input).toEqual({ title: 'New shortcuts', body: 'Press ?', products: ['hrms'], audiences: ['everyone'], publishOn: '2026-11-12' });
  });

  it('adding an entry: errors and focus on the summary first (nothing sent), then it is sent and a toast says so', async () => {
    const p = screenOf();
    await ue.click(screen.getByRole('button', { name: 'New entry' }));
    const drawer = await screen.findByRole('dialog');
    await ue.click(within(drawer).getByRole('button', { name: 'Add entry' }));
    expect(within(drawer).getAllByText('Write a title of at least 3 characters').length).toBeGreaterThan(0);
    // The drawer's error summary takes focus; each line links to its field (house EditorDrawer).
    await waitFor(() => expect(document.activeElement?.textContent).toMatch(/Fix these before saving/));
    expect(p.onCreate).not.toHaveBeenCalled();
    await ue.type(within(drawer).getByRole('textbox', { name: /Title/ }), 'Press ? for shortcuts');
    await ue.type(within(drawer).getByRole('textbox', { name: /Text/ }), 'Every page lists them.');
    await ue.click(within(drawer).getByRole('checkbox', { name: 'YukthiX HR' }));
    await ue.click(within(drawer).getByRole('checkbox', { name: 'Everyone' }));
    await ue.click(within(drawer).getByRole('button', { name: 'Add entry' }));
    await waitFor(() => expect(p.onCreate).toHaveBeenCalledWith({ title: 'Press ? for shortcuts', body: 'Every page lists them.', products: ['hrms'], audiences: ['everyone'], publishOn: '2026-11-12' }));
    expect((await screen.findAllByText('Entry added')).length).toBeGreaterThan(0);
  });

  it('changing sends the version; withdrawing asks first; a withdrawn entry has no actions', async () => {
    const p = screenOf();
    expect(screen.getByText('Planned')).toBeInTheDocument();
    expect(screen.getByText('Withdrawn')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions for Old entry' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'More actions for Comp-off expiry on the balance card' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Withdraw entry' }));
    const dialog = await screen.findByRole('dialog');
    expect(p.onWithdraw).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('button', { name: 'Withdraw entry' }));
    await waitFor(() => expect(p.onWithdraw).toHaveBeenCalledWith('n1'));
    await ue.click(screen.getByRole('button', { name: 'More actions for Comp-off expiry on the balance card' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Change entry' }));
    const drawer = await screen.findByRole('dialog');
    await ue.click(within(drawer).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(p.onUpdate).toHaveBeenCalledWith('n1', expect.objectContaining({ title: 'Comp-off expiry on the balance card', version: 1 })));
  });

  it('without the key: no New entry and no row actions', () => {
    screenOf({ canManage: false });
    expect(screen.queryByRole('button', { name: 'New entry' })).toBeNull();
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
  });

  it('the audit log says what staff did', () => {
    expect(actionWords('platform.whats_new.created', { title: 'Press ?', publishOn: '2026-11-12' })).toBe('Added the What\'s new entry “Press ?” (from 2026-11-12)');
    expect(actionWords('platform.whats_new.withdrawn', { title: 'Press ?' })).toBe('Withdrew the What\'s new entry “Press ?”');
  });
});

describe("Help › What's new (the panel H-1 puts in the tab)", () => {
  const live = (o: Partial<LiveWhatsNew> = {}): LiveWhatsNew => ({ state: 'ready', onRetry: vi.fn(), unread: 1, onMarkAllRead: ok(), entries: [{ id: 'e1', date: '2026-11-10', product: 'YukthiX HR', title: 'Press ? for shortcuts', body: 'Every page lists them.', unread: true }, { id: 'e2', date: '2026-11-01', product: 'YukthiX HR', title: 'Older', body: 'Read already.', unread: false }], ...o });
  const wrap = (l: LiveWhatsNew) => render(<ToastProvider><WhatsNewPanel live={l} /></ToastProvider>);

  it('lists the entries with New on unread ones; Mark all read marks them and says so', async () => {
    const l = live();
    wrap(l);
    const list = screen.getByRole('list', { name: "What's new" });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getAllByText('New')).toHaveLength(1);
    expect(screen.getByText('1 new update')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(l.onMarkAllRead).toHaveBeenCalled();
    expect((await screen.findAllByText('Marked as read')).length).toBeGreaterThan(0);
  });

  it('nothing unread: no Mark all read; nothing at all: says so; failure: retry', async () => {
    const { unmount } = wrap(live({ unread: 0, entries: live().entries.map((e) => ({ ...e, unread: false })) }));
    expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull();
    unmount();
    const u2 = wrap(live({ unread: 0, entries: [] }));
    expect(screen.getByText('Nothing new for you yet.')).toBeInTheDocument();
    u2.unmount();
    const l = live({ state: 'error' });
    wrap(l);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(l.onRetry).toHaveBeenCalled();
  });

  it('a failed mark shows the reason and keeps the entries', async () => {
    wrap(live({ onMarkAllRead: vi.fn().mockRejectedValue(new Error('No connection.')) }));
    await ue.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByText('No connection.')).toBeInTheDocument();
    expect(screen.getByText('Press ? for shortcuts')).toBeInTheDocument();
  });
});
