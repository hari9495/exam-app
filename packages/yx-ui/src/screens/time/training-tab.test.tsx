import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DevicesScreen } from './ops';
import { TrainingTab, zonedIso, type TrainingRow, type TrainingTabProps } from './training-tab';

// TIM-14 · Training: HR adds, changes and cancels training sessions; the same designed tab in the story and the app.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const LOCS = [{ id: 'l1', name: 'Hosur plant', zone: 'Asia/Kolkata' }, { id: 'l2', name: 'Chennai office', zone: 'Asia/Kolkata' }];
const ROWS: TrainingRow[] = [
  { id: 's1', title: 'Fire drill', room: null, location: LOCS[0]!, startsAt: '2026-11-03T04:00:00Z', endsAt: '2026-11-03T05:00:00Z', invitees: [], present: 0, state: 'upcoming', version: 3 },
  { id: 's2', title: 'Food safety', room: 'Room 1', location: LOCS[1]!, startsAt: '2026-10-29T04:00:00Z', endsAt: '2026-10-29T06:00:00Z', invitees: [{ id: 'e1', name: 'Meera Krishnan' }], present: 4, state: 'running', version: 1 },
  { id: 's3', title: 'POSH', room: null, location: LOCS[1]!, startsAt: '2026-10-25T04:00:00Z', endsAt: '2026-10-25T06:00:00Z', invitees: [], present: 20, state: 'ended', version: 1 },
];
const tab = (o: Partial<TrainingTabProps> = {}): TrainingTabProps => ({ rows: ROWS, locations: LOCS, onFindPeople: vi.fn(async () => [{ id: 'e2', label: 'Arvind Natarajan', detail: 'KF-0201' }]), onAdd: vi.fn(async () => ({})), onEdit: vi.fn(async () => ({})), onCancel: vi.fn(async () => ({})), ...o });
const typeIn = async (field: HTMLElement, text: string) => {
  await ue.clear(field);
  await ue.type(field, text);
  await ue.tab();
};

describe('zonedIso', () => {
  it('a local date and time at the location is the right instant (India, and a zone with daylight saving)', () => {
    expect(zonedIso('2026-11-03', '09:30', 'Asia/Kolkata')).toBe('2026-11-03T04:00:00.000Z');
    expect(zonedIso('2026-07-01', '09:00', 'Europe/London')).toBe('2026-07-01T08:00:00.000Z');
    expect(zonedIso('2026-12-31', '23:30', 'Asia/Kolkata')).toBe('2026-12-31T18:00:00.000Z');
  });
});

describe('TIM-14 · Training', () => {
  it('lists sessions with when, where, who and status; only upcoming ones can be changed; ended ones have no actions', () => {
    render(<TrainingTab {...tab()} />);
    const table = screen.getByRole('table', { name: 'Training sessions' });
    expect(within(table).getByText('Everyone at Hosur plant')).toBeInTheDocument();
    expect(within(table).getByText('Meera Krishnan')).toBeInTheDocument();
    expect(within(table).getByText('On now')).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(within(table).getAllByRole('button', { name: 'Cancel session' })).toHaveLength(2);
  });

  it('Add: pressed too early says what is missing and focuses it; filled in, it sends the times at the location', async () => {
    const t = tab();
    render(<TrainingTab {...t} rows={[]} />);
    await ue.click(screen.getAllByRole('button', { name: 'Add training' })[0]!);
    const drawer = await screen.findByRole('dialog', { name: 'Add training' });
    const save = within(drawer).getByRole('button', { name: 'Add training' });
    expect(save).not.toBeDisabled();
    await ue.click(save);
    expect(within(drawer).getByText('Enter a title.')).toBeInTheDocument();
    expect(within(drawer).getByText('Choose the location.')).toBeInTheDocument();
    expect(within(drawer).getByLabelText(/^Title/)).toHaveFocus();
    expect(t.onAdd).not.toHaveBeenCalled();
    await ue.type(within(drawer).getByLabelText(/^Title/), 'Forklift renewal');
    await ue.click(within(drawer).getByRole('combobox', { name: /Location/ }));
    await ue.click(await screen.findByRole('option', { name: 'Hosur plant' }));
    await typeIn(within(drawer).getByLabelText(/^Date/), '3 Nov 2026');
    await typeIn(within(drawer).getByLabelText(/^Start/), '9:30 am');
    await typeIn(within(drawer).getByLabelText(/^End/), '9:00 am');
    await ue.click(save);
    // Negative: the end before the start.
    expect(within(drawer).getByText('The end must be after the start.')).toBeInTheDocument();
    await typeIn(within(drawer).getByLabelText(/^End/), '11:00 am');
    // Who: chosen people needs at least one.
    await ue.click(within(drawer).getByRole('radio', { name: 'Chosen people' }));
    await ue.click(save);
    expect(within(drawer).getByText('Choose at least one person, or pick Everyone.')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('radio', { name: 'Everyone at Hosur plant' }));
    await ue.click(save);
    await waitFor(() => expect(t.onAdd).toHaveBeenCalledWith({ title: 'Forklift renewal', room: undefined, locationId: 'l1', startsAt: '2026-11-03T04:00:00.000Z', endsAt: '2026-11-03T05:30:00.000Z', invitees: [] }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add training' })).toBeNull());
  });

  it('Edit starts from the session and sends the change; a conflict from the server stays in the form', async () => {
    const t = tab({ onEdit: vi.fn().mockRejectedValueOnce(new Error('Someone else changed this session. Reload to see their change.')).mockResolvedValueOnce({}) });
    render(<TrainingTab {...t} />);
    await ue.click(screen.getByRole('button', { name: 'Edit' }));
    const drawer = await screen.findByRole('dialog', { name: 'Change training' });
    expect(within(drawer).getByLabelText(/^Title/)).toHaveValue('Fire drill');
    await ue.clear(within(drawer).getByLabelText(/^Title/));
    await ue.type(within(drawer).getByLabelText(/^Title/), 'Fire drill (east wing)');
    await ue.click(within(drawer).getByRole('button', { name: 'Save changes' }));
    expect(await within(drawer).findByText('Someone else changed this session. Reload to see their change.')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(t.onEdit).toHaveBeenLastCalledWith(ROWS[0], expect.objectContaining({ title: 'Fire drill (east wing)', locationId: 'l1', startsAt: '2026-11-03T04:00:00.000Z', endsAt: '2026-11-03T05:00:00.000Z' })));
  });

  it('Cancel asks first, keeps who already marked, then cancels; a refusal says why', async () => {
    const t = tab({ onCancel: vi.fn().mockRejectedValueOnce(new Error('That session has ended, so it stays on record.')).mockResolvedValueOnce({}) });
    render(<TrainingTab {...t} />);
    await ue.click(screen.getAllByRole('button', { name: 'Cancel session' })[1]!);
    const confirm = await screen.findByRole('dialog', { name: 'Cancel Food safety?' });
    expect(within(confirm).getByText(/the 4 already marked stay on record/)).toBeInTheDocument();
    await ue.click(within(confirm).getByRole('button', { name: 'Cancel session' }));
    expect(await within(confirm).findByText('That session has ended, so it stays on record.')).toBeInTheDocument();
    await ue.click(within(confirm).getByRole('button', { name: 'Cancel session' }));
    await waitFor(() => expect(t.onCancel).toHaveBeenCalledTimes(2));
    expect(t.onCancel).toHaveBeenLastCalledWith(ROWS[1]);
  });

  it('none yet, and in the app: the Training tab shows only when the app passes it', async () => {
    render(<TrainingTab {...tab({ rows: [] })} />);
    expect(screen.getByText('No training sessions')).toBeInTheDocument();
  });

  it('the design story: Training tab with its sessions, add form and cancel confirmation', async () => {
    const { unmount } = render(<DevicesScreen tab="training" training={{ form: 'new' }} />);
    expect(await screen.findByRole('dialog', { name: 'Add training' })).toBeInTheDocument();
    unmount();
    render(<DevicesScreen tab="training" training={{ cancel: 'tr1' }} />);
    expect(await screen.findByRole('dialog', { name: 'Cancel Food safety refresher?' })).toBeInTheDocument();
  });
});
