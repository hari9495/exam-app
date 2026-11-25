import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LicenceRequirementsScreen } from './roster';
import { codeOf, type LicencesData, type LiveLicences } from './licences-live';

// TIM-40 Licence requirements, live: the designed screen's states with the API's data (list, empty, loading, error,
// no access, holders drawer, override / record / edit dialogs, refusals kept on screen).

const ue = userEvent.setup({ pointerEventsCheck: 0 });

const DATA: LicencesData = {
  today: '2026-10-29',
  types: [
    {
      id: 't-fork', code: 'FORK', name: 'Forklift licence', note: 'LMV endorsement', legal: true, remindDays: [60, 30, 7], active: true, version: 1, holders: 5,
      requirements: [{ id: 'r1', kind: 'role', targetId: 'd-fork', target: 'Forklift driver', locationId: 'loc', location: 'Hosur plant' }],
      watch: [
        { employeeId: 'e-babu', name: 'Babu Raj', expiresOn: '2026-10-20', number: 'TN-FL-01', override: null },
        { employeeId: 'e-irfan', name: 'Mohammed Irfan', expiresOn: '2026-11-12', number: null, override: null },
      ],
    },
    {
      id: 't-aid', code: 'FIRST-AID', name: 'First aid', note: null, legal: false, remindDays: [60, 30, 7], active: true, version: 3, holders: 9,
      requirements: [{ id: 'r2', kind: 'shift', targetId: 's-m', target: 'Morning', locationId: null, location: null }],
      watch: [
        { employeeId: 'e-gopal', name: 'Gopal Iyer', expiresOn: '2026-10-10', number: null, override: null },
        { employeeId: 'e-nisha', name: 'Nisha Menon', expiresOn: '2026-10-14', number: null, override: { until: '2026-11-20', reason: 'Course booked for 6 Nov' } },
      ],
    },
    { id: 't-boil', code: 'BOILER', name: 'Boiler attendant', note: null, legal: true, remindDays: [60, 30, 7], active: true, version: 1, holders: 4, requirements: [], watch: [] },
  ],
  shifts: [{ id: 's-m', code: 'M', name: 'Morning' }],
  designations: [{ id: 'd-fork', name: 'Forklift driver' }],
  locations: [{ id: 'loc', name: 'Hosur plant' }],
  people: [{ id: 'e-babu', name: 'Babu Raj', code: 'KFT-0101' }, { id: 'e-gopal', name: 'Gopal Iyer', code: null }],
};
const live = (over: Partial<LiveLicences> = {}): LiveLicences => ({
  state: 'ready',
  data: DATA,
  onRetry: vi.fn(),
  onCreateType: vi.fn(async () => ({ id: 't-new' })),
  onUpdateType: vi.fn(async () => ({})),
  onAddRequirement: vi.fn(async () => ({})),
  onRemoveRequirement: vi.fn(async () => ({})),
  onRecord: vi.fn(async () => ({})),
  onOverride: vi.fn(async () => ({})),
  onAskRenew: vi.fn(async () => ({ asked: 1, alreadyAskedToday: 0 })),
  ...over,
});
const row = (text: string) => screen.getByText(text).closest('tr')!;

describe('TIM-40 Licence requirements, live', () => {
  it('List: one row per licence type with requirements, type, holders and needs-action badges', () => {
    render(<LicenceRequirementsScreen live={live()} />);
    expect(screen.getByRole('heading', { name: 'Licence requirements' })).toBeInTheDocument();
    const fork = row('Forklift driver at Hosur plant');
    expect(within(fork).getByText('Forklift licence')).toBeInTheDocument();
    expect(within(fork).getByText('Legal')).toBeInTheDocument();
    expect(within(fork).getByText('1 expired')).toBeInTheDocument();
    expect(within(fork).getByText('1 expiring')).toBeInTheDocument();
    const aid = row('Morning');
    expect(within(aid).getByText('Company')).toBeInTheDocument();
    expect(within(aid).getByText('1 overridden')).toBeInTheDocument();
    expect(screen.getByText('Not required yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Only needing action \(2\)/ })).toBeInTheDocument();
  });

  it('Empty, loading, error and no access', async () => {
    const { rerender } = render(<LicenceRequirementsScreen live={live({ data: { ...DATA, types: [] } })} />);
    expect(screen.getByText('No licence requirements yet')).toBeInTheDocument();
    rerender(<LicenceRequirementsScreen live={live({ state: 'loading', data: null })} />);
    expect(screen.getByText('Requirements are loading')).toBeInTheDocument();
    const l = live({ state: 'error', data: null });
    rerender(<LicenceRequirementsScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(l.onRetry).toHaveBeenCalled();
    rerender(<LicenceRequirementsScreen live={live({ state: 'no-access', data: null })} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('Drawer: watch list with due badges; Ask to renew calls renew-asks; legal licences have no Override', async () => {
    const l = live();
    render(<LicenceRequirementsScreen live={l} />);
    await ue.click(within(row('Forklift driver at Hosur plant')).getByRole('button', { name: 'Who needs action' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/Expired 20 Oct 2026 · TN-FL-01/)).toBeInTheDocument();
    expect(within(dlg).queryByRole('button', { name: 'Override…' })).not.toBeInTheDocument();
    await ue.click(within(dlg).getAllByRole('button', { name: 'Ask to renew' })[0]);
    await waitFor(() => expect(l.onAskRenew).toHaveBeenCalledWith({ employeeIds: ['e-babu'], licenceTypeId: 't-fork' }));
    expect(await within(dlg).findByRole('button', { name: 'Reminder sent' })).toBeInTheDocument();
  });

  it('Override: pressed too early shows the field error and focuses Reason; a refusal stays in the dialog', async () => {
    const l = live({ onOverride: vi.fn(async () => { throw Object.assign(new Error('First aid is required by law. No one can override it; the person needs a valid licence.'), { status: 409, code: 'LEGAL_LICENCE' }); }) });
    render(<LicenceRequirementsScreen live={l} />);
    await ue.click(within(row('Morning')).getByRole('button', { name: 'Who needs action' }));
    await ue.click(await screen.findByRole('button', { name: 'Override…' }));
    await ue.click(screen.getByRole('button', { name: 'Override' }));
    expect(await screen.findByText('Enter a reason of at least 5 letters.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Reason/ })).toHaveFocus());
    expect(l.onOverride).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Course booked for 6 Nov');
    await ue.type(screen.getByRole('textbox', { name: /Until/ }), '20 Nov 2026{Tab}');
    await ue.click(screen.getByRole('button', { name: 'Override' }));
    await waitFor(() => expect(l.onOverride).toHaveBeenCalledWith({ employeeId: 'e-gopal', licenceTypeId: 't-aid', reason: 'Course booked for 6 Nov', until: '2026-11-20' }));
    expect(await screen.findByText(/required by law/)).toBeInTheDocument();
  });

  it('Record licence: person and dates are required; a full entry calls holders', async () => {
    const l = live();
    render(<LicenceRequirementsScreen live={l} />);
    await ue.click(within(row('Not required yet')).getByRole('button', { name: 'Who needs action' }));
    expect(await screen.findByText(/All 4 holders have a licence valid/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Record licence' }));
    const save = screen.getAllByRole('button', { name: 'Record licence' }).at(-1)!;
    await ue.click(save);
    expect(await screen.findByText('Choose the person.')).toBeInTheDocument();
    expect(screen.getByText('Enter the date the licence is valid from.')).toBeInTheDocument();
    expect(l.onRecord).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /Person/ }));
    await ue.click(await screen.findByRole('option', { name: /Babu Raj/ }));
    await ue.type(screen.getByRole('textbox', { name: /Valid from/ }), '28 Oct 2026{Tab}');
    await ue.type(screen.getByRole('textbox', { name: /Expires on/ }), '27 Oct 2031{Tab}');
    await ue.click(save);
    await waitFor(() => expect(l.onRecord).toHaveBeenCalledWith({ employeeId: 'e-babu', licenceTypeId: 't-boil', validFrom: '2026-10-28', expiresOn: '2031-10-27' }));
  });

  it('Edit: a version conflict keeps the dialog open with the message; sends the version it opened with', async () => {
    const l = live({ onUpdateType: vi.fn(async () => { throw new Error('Someone else changed this licence. Reload to see their change.'); }) });
    render(<LicenceRequirementsScreen live={l} />);
    await ue.click(within(row('Morning')).getByRole('button', { name: 'Edit' }));
    await ue.click(screen.getByRole('button', { name: 'Save requirement' }));
    await waitFor(() => expect(l.onUpdateType).toHaveBeenCalledWith('t-aid', { name: 'First aid', note: '', legal: false, remindDays: [60, 30, 7], active: true, version: 3 }));
    expect(await screen.findByText(/Someone else changed this licence/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit requirement' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Remove Morning' }));
    await waitFor(() => expect(l.onRemoveRequirement).toHaveBeenCalledWith('r2'));
  });

  it('Add requirement: too early shows errors; then creates the type (code from the name) and its first requirement', async () => {
    const l = live();
    render(<LicenceRequirementsScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Add requirement' }));
    await ue.click(screen.getByRole('button', { name: 'Save requirement' }));
    expect(await screen.findByText('Enter the licence name (at least 2 letters).')).toBeInTheDocument();
    expect(screen.getByText('Choose the role.')).toBeInTheDocument();
    expect(l.onCreateType).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /^Licence/ }), 'Crane operator');
    await ue.click(screen.getByRole('combobox', { name: /Role/ }));
    await ue.click(await screen.findByRole('option', { name: 'Forklift driver' }));
    await ue.click(screen.getByRole('button', { name: 'Save requirement' }));
    await waitFor(() => expect(l.onCreateType).toHaveBeenCalledWith({ code: 'CRANE-OPERATOR', name: 'Crane operator', note: '', legal: true, remindDays: [60, 30, 7] }));
    await waitFor(() => expect(l.onAddRequirement).toHaveBeenCalledWith({ licenceTypeId: 't-new', kind: 'role', targetId: 'd-fork' }));
    expect(await screen.findByText('Crane operator: no one holds this licence yet')).toBeInTheDocument();
  });

  it('codeOf follows the API code rule', () => {
    expect(codeOf('Forklift licence')).toBe('FORKLIFT-LICENCE');
    expect(codeOf('3rd party crane')).toBe('RD-PARTY-CRANE');
    expect(codeOf('A very long licence name indeed')).toMatch(/^[A-Z][A-Z0-9-]{0,19}$/);
  });
});
