import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FeedbackScreen, OneOnOneScreen, type FeedbackScreenProps, type OneOnOneScreenProps } from './feedback';
import type { FeedbackItem, OneOnOne } from './types';

// Performance batch PM3 screens (M06-BUILD-DESIGN §8, §15.3; PRF-04 / 05; PM-3.04).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const item = (o: Partial<FeedbackItem> = {}): FeedbackItem => ({ id: 'f1', from: 'Sita', fromEmployeeId: 'e2', to: 'Arjun', toEmployeeId: 'e1', kind: 'praise', text: 'Thanks for the cover.', visibility: 'private', goalId: null, fromRequest: false, at: '2026-10-10T09:00:00.000Z', sealed: false, can: { withdraw: true, seal: false }, ...o });
const people = [
  { value: 'e1', label: 'Arjun' },
  { value: 'e2', label: 'Sita' },
];
const fb = (o: Partial<FeedbackScreenProps> = {}): FeedbackScreenProps => ({ state: 'ready', view: 'received', onView: vi.fn(), hasTeam: false, canSeal: false, sealEmployeeId: null, onSealEmployee: vi.fn(), items: [item(), item({ id: 'f2', text: null, sealed: true, can: { withdraw: false, seal: false } })], requests: [], colleagues: people, askAbout: [], concernHref: '/yx/desk/help', onGive: vi.fn(ok), onWithdraw: vi.fn(ok), onRequest: vi.fn(ok), onDecline: vi.fn(ok), onSeal: vi.fn(ok), ...o });
const meeting = (o: Partial<OneOnOne> = {}): OneOnOne => ({ id: 'm1', employee: 'Arjun', employeeId: 'e1', manager: 'Priya', managerEmployeeId: 'e3', role: 'manager', on: '2026-10-13', status: 'planned', sharedNotes: null, agenda: [], actions: [], privateNote: '', version: 1, ...o });
const oo = (o: Partial<OneOnOneScreenProps> = {}): OneOnOneScreenProps => ({ state: 'ready', meeting: meeting(), onBack: vi.fn(), onUpdate: vi.fn(ok), onAgenda: vi.fn(ok), onAgendaDone: vi.fn(ok), onPrivateNote: vi.fn(ok), onAction: vi.fn(ok), onActionDone: vi.fn(ok), ...o });

describe('Feedback and 1:1s (PM3)', () => {
  it('shows sealed feedback as removed by HR and lets the giver withdraw', async () => {
    const p = fb();
    render(<FeedbackScreen {...p} />);
    expect(screen.getAllByText('Removed by HR').length).toBeGreaterThan(0);
    await ue.click(screen.getAllByRole('button', { name: 'Withdraw' })[0]);
    expect(p.onWithdraw).toHaveBeenCalledWith('f1');
    // "My team" and "Concerns" only for managers and sealers.
    expect(screen.queryByRole('radio', { name: 'My team' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Concerns' })).toBeNull();
  });

  it('the feedback form links to the concern channel and sends recipient-only on request', async () => {
    const p = fb();
    render(<FeedbackScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Give feedback' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('link', { name: 'Report a concern instead' })).toHaveAttribute('href', '/yx/desk/help');
    await ue.click(within(sheet).getByRole('button', { name: 'Send feedback' }));
    expect(p.onGive).not.toHaveBeenCalled();
    await ue.type(within(sheet).getByRole('textbox', { name: /^Feedback/ }), 'Great dealer meet.');
    await ue.click(within(sheet).getByRole('combobox', { name: 'For' }));
    await ue.click(screen.getByRole('option', { name: 'Arjun' }));
    await ue.click(within(sheet).getByRole('radio', { name: 'Suggestion' }));
    await ue.click(within(sheet).getByRole('checkbox', { name: /Only they can read it/ }));
    await ue.click(within(sheet).getByRole('button', { name: 'Send feedback' }));
    expect(p.onGive).toHaveBeenCalledWith({ toEmployeeId: 'e1', kind: 'suggestion', text: 'Great dealer meet.', visibility: 'recipient_only' });
  });

  it('HR seals an item with a reason', async () => {
    const p = fb({ view: 'concerns', canSeal: true, sealEmployeeId: 'e1', items: [item({ can: { withdraw: false, seal: true } })] });
    render(<FeedbackScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Seal' }));
    const dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Passed to the confidential channel');
    await ue.click(within(dialog).getByRole('button', { name: 'Seal' }));
    expect(p.onSeal).toHaveBeenCalledWith('f1', 'Passed to the confidential channel');
  });

  it('a 1:1 keeps the private note apart from shared notes and adds agenda and actions', async () => {
    const p = oo();
    render(<OneOnOneScreen {...p} />);
    expect(screen.getByText(/Arjun never sees this/)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: 'Add to the agenda' }), 'Dealer targets');
    await ue.click(screen.getByRole('button', { name: 'Add' }));
    expect(p.onAgenda).toHaveBeenCalledWith('Dealer targets');
    await ue.type(screen.getByRole('textbox', { name: /Only you/ }), 'Ready for more.');
    await ue.click(screen.getByRole('button', { name: 'Save my note' }));
    expect(p.onPrivateNote).toHaveBeenCalledWith('Ready for more.');
    expect(p.onUpdate).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: 'New action' }), 'Send the dealer list');
    await ue.click(screen.getByRole('button', { name: 'Add action' }));
    expect(p.onAction).toHaveBeenCalledWith({ text: 'Send the dealer list', ownerEmployeeId: 'e1', dueOn: null });
    await ue.click(screen.getByRole('button', { name: 'Mark as held' }));
    expect(p.onUpdate).toHaveBeenCalledWith({ status: 'held', version: 1 });
  });
});
