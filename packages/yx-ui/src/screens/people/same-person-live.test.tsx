import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MergeReview, SamePersonQueue, type LiveSamePerson, type LiveUnmerge, type SamePersonRow } from './relations';

// PPL-36 / PPL-37 live: the proposals with the evidence side by side, HR's decision, the field-by-field merge and unmerge.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ROW: SamePersonRow = {
  id: 'p1:p2',
  a: { personId: 'p1', name: 'Suresh Nair', email: 'suresh@kaverifoods.in', phone: null, dob: null, pan: null, uan: null, role: 'Login', roles: [{ id: 'r1', role: 'Login', from: '2026-09-01' }] },
  b: { personId: 'p2', name: 'Suresh K Nair', email: 'suresh@kaverifoods.in', phone: '•••• 1224', dob: '1990-02-11', pan: '•••• 712Q', uan: null, role: 'Employee · KF0077', roles: [{ id: 'r2', role: 'Employee', from: '2019-04-01' }] },
  basis: ['login email'],
};

describe('PPL-36 possible same person, live', () => {
  const queue = (o: Partial<LiveSamePerson> = {}): LiveSamePerson => ({ state: 'ready', onRetry: vi.fn(), rows: [ROW], onNotSame: vi.fn(async () => undefined), onReviewMerge: vi.fn(), ...o });

  it('lists the proposal and its basis; Compare shows the evidence with the matching rows marked', async () => {
    const live = queue();
    render(<SamePersonQueue rows={[]} live={live} />);
    expect(screen.getByRole('row', { name: /Suresh Nair Login Suresh K Nair Employee · KF0077 login email/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Compare' }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('Proposed on login email')).toBeInTheDocument();
    expect(within(drawer).getByRole('row', { name: /Email suresh@kaverifoods.in suresh@kaverifoods.in/ })).toHaveAttribute('data-match', 'true');
    expect(within(drawer).getByRole('row', { name: /^Name/ })).not.toHaveAttribute('data-match');
    expect(within(drawer).getByRole('row', { name: /Date of birth — 11 Feb 1990/ })).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Same person: review merge' }));
    expect(live.onReviewMerge).toHaveBeenCalledWith(ROW);
  });

  it('not the same person is recorded; a failure keeps the drawer open with the reason', async () => {
    const onNotSame = vi.fn().mockRejectedValueOnce(new Error('These records are not a proposed match any more.')).mockResolvedValueOnce(undefined);
    render(<SamePersonQueue rows={[]} live={queue({ onNotSame })} />);
    await ue.click(screen.getByRole('button', { name: 'Compare' }));
    await ue.click(screen.getByRole('button', { name: 'Not the same person' }));
    expect(await screen.findByText('These records are not a proposed match any more.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Not the same person' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onNotSame).toHaveBeenCalledTimes(2);
  });

  it('empty, and a failed load can be retried', async () => {
    const { unmount } = render(<SamePersonQueue rows={[]} live={queue({ rows: [] })} />);
    expect(screen.getByText('No possible matches')).toBeInTheDocument();
    unmount();
    const live = queue({ state: 'error' });
    render(<SamePersonQueue rows={[]} live={live} />);
    await ue.click(screen.getByRole('button', { name: /Retry|Try again/ }));
    expect(live.onRetry).toHaveBeenCalled();
  });
});

describe('PPL-37 merge and unmerge, live', () => {
  it('keeps per field the chosen value, needs the audit note, and lists the roles that move', async () => {
    const onMerge = vi.fn(async () => undefined);
    render(<MergeReview live={{ row: ROW, onMerge, onCancel: vi.fn() }} />);
    expect(screen.getByRole('columnheader', { name: 'Record A · login' })).toBeInTheDocument();
    expect(screen.getByText('Login · from 1 Sep 2026')).toBeInTheDocument();
    expect(within(screen.getByText('Login · from 1 Sep 2026').closest('li')!).getByText('Moves')).toBeInTheDocument();
    expect(within(screen.getByText('Employee · from 1 Apr 2019').closest('li')!).getByText('Stays')).toBeInTheDocument();
    expect(within(screen.getByRole('radiogroup', { name: 'Keep Primary phone' })).getByRole('radio', { name: 'A' })).toBeDisabled();
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Keep Name' })).getByRole('radio', { name: 'A' }));
    await ue.click(screen.getByRole('button', { name: 'Merge records' }));
    expect(screen.getByText('Enter why you are merging. It goes to the link log.')).toBeInTheDocument();
    expect(onMerge).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Audit note/ }), 'Same work email; confirmed by phone');
    await ue.click(screen.getByRole('button', { name: 'Merge records' }));
    await waitFor(() => expect(onMerge).toHaveBeenCalledWith({ name: 'a', email: 'b', phone: 'b' }, 'Same work email; confirmed by phone'));
  });

  it('unmerge shows what goes back and asks for a note first', async () => {
    const u: LiveUnmerge = { name: 'Suresh Nair', intoName: 'Suresh K Nair', mergedAt: new Date('2026-09-26T10:00:00'), mergedBy: 'Lakshmi Venkatesan', note: 'Same work email', moved: ['Login'], employeeLinked: true, onUnmerge: vi.fn(async () => undefined) };
    render(<MergeReview liveUnmerge={u} />);
    expect(screen.getByText('Merged into Suresh K Nair on 26 Sep 2026 by Lakshmi Venkatesan · basis: same email, confirmed by HR')).toBeInTheDocument();
    expect(screen.getByText('Login role')).toBeInTheDocument();
    expect(screen.getByText('The login linked to Suresh K Nair’s employee record')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Unmerge' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Unmerge' }));
    expect(within(dialog).getByText('Enter a reason for the audit log.')).toBeInTheDocument();
    expect(u.onUnmerge).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox'), 'Different people after all');
    await ue.click(within(dialog).getByRole('button', { name: 'Unmerge' }));
    await waitFor(() => expect(u.onUnmerge).toHaveBeenCalledWith('Different people after all'));
  });
});
