import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IndustrialActionScreen, PeriodsScreen, type LiveIndustrialAction, type LivePeriods } from './requests';
import { FieldVisitPhone, PresenceDayScreen } from './field';
import { PERIODS, PREFLIGHT_READY } from './live/fixtures';
import type { IndustrialEvent, MyPresence } from './live/types';

// Founder decisions of 29 Oct 2026 (attendance): 6 withdraw consent, 7a open a frozen month again, 7b past strikes and
// lockouts. The designed screens with live data: each state renders, pressed too early a button says why and focuses
// the field, and every action calls the API once.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn(async () => ({}));

describe('decision 6: withdraw consent', () => {
  const mine: MyPresence = { month: '2026-10', today: '2026-10-28', enabled: true, notice: 'Presence notice v1', consent: { id: 'c', givenAt: '2026-10-01T04:00:00Z', noticeVersion: 'Presence notice v1' }, history: [], days: [] };

  it('presence (live): the dialog says what happens; "Keep it" changes nothing; "Withdraw consent" calls the API once', async () => {
    const onConsent = ok();
    render(<PresenceDayScreen live={{ state: 'ready', month: '2026-10', onMonth: vi.fn(), mine, onConsent }} />);
    await ue.click(screen.getByRole('button', { name: 'Withdraw consent' }));
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Presence tracking stops now.')).toBeInTheDocument();
    expect(within(dialog).getByText(/presence trail .* is deleted/)).toBeInTheDocument();
    expect(within(dialog).getByText('Your attendance days stay, because pay needs them.')).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(onConsent).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Withdraw consent' }));
    dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Withdraw consent' });
    expect(confirm).toBeEnabled();
    await ue.click(confirm);
    await waitFor(() => expect(onConsent).toHaveBeenCalledWith('withdraw'));
    expect(onConsent).toHaveBeenCalledTimes(1);
  });

  it('presence (live): a refusal stays in the dialog', async () => {
    const onConsent = vi.fn(async () => { throw new Error('You have not given consent, so there is nothing to withdraw.'); });
    render(<PresenceDayScreen live={{ state: 'ready', month: '2026-10', onMonth: vi.fn(), mine, onConsent }} />);
    await ue.click(screen.getByRole('button', { name: 'Withdraw consent' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Withdraw consent' }));
    expect(await within(screen.getByRole('dialog')).findByText(/nothing to withdraw/)).toBeInTheDocument();
  });

  it('presence design story and field-tracking phone story open the same dialog', async () => {
    const { unmount } = render(<PresenceDayScreen dialog="withdraw" />);
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep it' })).toBeInTheDocument();
    unmount();
    render(<FieldVisitPhone view="withdraw" />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Your location trail is deleted.')).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Withdraw consent' }));
    expect(await screen.findByText('Tracking is off')).toBeInTheDocument();
  });
});

describe('decision 7a: open a frozen month again (TIM-11, live)', () => {
  const frozen = { ...PERIODS, entities: [{ ...PERIODS.entities[0]!, canLock: true, canApprove: false, months: PERIODS.entities[0]!.months.map((m) => (m.month === '2026-09' ? { ...m, stage: 'frozen' as const } : m)) }] };
  const periods = (o: Partial<LivePeriods> = {}): LivePeriods => ({ state: 'ready', data: frozen, year: '2026', onYear: vi.fn(), onPreflight: vi.fn(async () => PREFLIGHT_READY), onLock: ok(), onUnlock: ok(), onUnfreeze: ok(), ...o });

  it('pressed without a reason it says why and focuses the reason; with one it calls the API once', async () => {
    const l = periods();
    render(<PeriodsScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Open the month again' }));
    const dialog = screen.getByRole('dialog', { name: /Open September 2026 · Kaveri Foods Pvt Ltd again/ });
    expect(within(dialog).getByText(/authenticator code/)).toBeInTheDocument();
    const go = within(dialog).getByRole('button', { name: 'Open the month again' });
    expect(go).toBeEnabled();
    await ue.click(go);
    expect(within(dialog).getByText(/at least 10 letters/)).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox')).toHaveFocus();
    expect(l.onUnfreeze).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox'), 'A missed fix for Arjun');
    await ue.click(go);
    await waitFor(() => expect(l.onUnfreeze).toHaveBeenCalledWith('le-kfpl', '2026-09', 'A missed fix for Arjun'));
    expect(l.onUnfreeze).toHaveBeenCalledTimes(1);
  });

  it('a person who cannot lock the entity sees no button', () => {
    render(<PeriodsScreen live={periods({ data: { ...frozen, entities: [{ ...frozen.entities[0]!, canLock: false, canApprove: true }] } })} />);
    expect(screen.queryByRole('button', { name: 'Open the month again' })).toBeNull();
  });
});

describe('decision 7b: past strikes and lockouts (TIM-37, live)', () => {
  const ev = (i: number, o: Partial<IndustrialEvent> = {}): IndustrialEvent => ({ id: `e${i}`, kind: 'strike', from: '2026-11-03', to: '2026-11-05', days: 3, location: { id: 'l', name: 'Hosur plant', state: 'IN-TN' }, department: null, workers: 134, legality: 'undetermined', legalitySetAt: null, legalitySetBy: null, notice: 'n', status: 'active', version: 1, today: '2026-10-28', ...o });
  const ia = (list: LiveIndustrialAction['list'], o: Partial<LiveIndustrialAction> = {}): LiveIndustrialAction => ({ state: 'ready', options: null, event: null, onRecord: vi.fn(), onLegality: vi.fn(), onDates: vi.fn(), onCancel: vi.fn(), links: { cancel: '/c', people: '/p', muster: '/m', list: '/ia' }, list, ...o });
  const list = (events: IndustrialEvent[], total = events.length) => ({ data: { events, total, page: 1, pageSize: 25, today: '2026-10-28' }, page: 1, pageSize: 25, onPage: vi.fn(), onPageSize: vi.fn(), openHref: (id: string) => `/ia?id=${id}`, recordHref: '/ia?new=1' });

  it('lists the events with house dates, a link to each and to record a new one', () => {
    render(<IndustrialActionScreen live={ia(list([ev(1), ev(2, { kind: 'lockout', from: '2026-08-24', to: '2026-08-24', days: 1, status: 'cancelled', department: { id: 'd', name: 'Maintenance' }, workers: 14 })]))} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Industrial action' })).toBeInTheDocument();
    expect(screen.getByText('3 Nov 2026 – 5 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('24 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('Maintenance · 14 workers')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open' })[0]).toHaveAttribute('href', '/ia?id=e1');
    expect(screen.getByRole('link', { name: 'Record event' })).toHaveAttribute('href', '/ia?new=1');
  });

  it('empty: says so and offers to record one; long: pages 25 / 50 / 100 from the server', async () => {
    const { unmount } = render(<IndustrialActionScreen live={ia(list([]))} />);
    expect(screen.getByText('No strikes, lockouts or lay-offs yet')).toBeInTheDocument();
    unmount();
    const l = list(Array.from({ length: 25 }, (_, i) => ev(i)), 60);
    render(<IndustrialActionScreen live={ia(l)} />);
    await ue.click(screen.getByRole('button', { name: /next/i }));
    expect(l.onPage).toHaveBeenCalledWith(2);
  });

  it('no access says who grants it', () => {
    render(<IndustrialActionScreen live={ia(list([]), { state: 'no-access' })} />);
    expect(screen.getByText(/You don't have access/)).toBeInTheDocument();
  });
});
