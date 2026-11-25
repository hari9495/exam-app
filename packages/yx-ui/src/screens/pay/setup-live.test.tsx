import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PayrollSetupScreen } from './comp-setup';
import { parseCsv } from './live/setup';
import type { LivePayrollSetup } from './setup-live';
import { GROUP_MEMBERS, LEGAL_OPTIONS, PAY_CALENDAR, PAY_GROUPS, PEOPLE_HITS, REGISTRATIONS, SETUP_ENTITIES, SETUP_STATE } from './live/fixtures-5ab';
import { GO_LIVE, PARALLEL, RUN } from './live/fixtures-5j';

// The designed PAY-16 set-up wizard with the live app's data: /yx/payroll/setup, /pay-groups, /imports and /go-live
// each open their step of it. Ported from pay-5b-live / pay-5j-live, plus negatives for every page.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn(async () => ({}));
const live = (over: Partial<LivePayrollSetup> = {}): LivePayrollSetup => ({
  page: 'reg',
  state: 'ready',
  entities: SETUP_ENTITIES,
  entityId: 'le-kfpl',
  onEntity: vi.fn(),
  today: '2026-10-28',
  onOpen: vi.fn(),
  setup: SETUP_STATE,
  registrations: REGISTRATIONS,
  options: LEGAL_OPTIONS,
  onSaveRegistrations: ok(),
  onSetOption: ok(),
  groups: PAY_GROUPS,
  onSaveGroup: ok(),
  onMembers: vi.fn(async () => GROUP_MEMBERS),
  onAddMembers: ok(),
  onSearch: vi.fn(async () => PEOPLE_HITS),
  onCalendar: vi.fn(async () => PAY_CALENDAR),
  onStage: vi.fn(async () => ({ id: 'b1', kind: 'as_paid_lines' as const, rows: 1, valid: 1, errors: [], status: 'staged' })),
  onCommit: ok(),
  onGoLiveCheck: vi.fn(async () => ({ fyStart: '2026-04-01', goLiveMonth: '2026-10', ready: true, missing: [] })),
  readiness: GO_LIVE,
  runs: [{ ...RUN, legalEntityId: 'le-kfpl' }],
  parallel: PARALLEL,
  me: 'u-me',
  can: { upload: true, decide: true },
  onUpload: ok(),
  onDecide: ok(),
  ...over,
});
const shown = () => document.querySelector('.yx-stepper__panel:not([hidden])') as HTMLElement;
const csv = (text: string) => new File([text], 'rows.csv', { type: 'text/csv' });

describe('PAY-16 live: page states', () => {
  it('loading, error with retry, and no access', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<PayrollSetupScreen live={live({ state: 'loading' })} />);
    expect(screen.getByRole('status', { name: 'Loading payroll set-up' })).toBeInTheDocument();
    rerender(<PayrollSetupScreen live={live({ state: 'error', onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<PayrollSetupScreen live={live({ state: 'no-access' })} />);
    expect(screen.getByText(/your payroll admin/)).toBeInTheDocument();
  });

  it('no entity chosen: asks for one; no entity at all: says who grants it', () => {
    const { rerender } = render(<PayrollSetupScreen live={live({ entityId: null })} />);
    expect(screen.getAllByText('Choose a legal entity').length).toBeGreaterThan(0);
    rerender(<PayrollSetupScreen live={live({ entities: [], entityId: null })} />);
    expect(screen.getByText('No legal entity to set up')).toBeInTheDocument();
  });
});

describe('PAY-16 live: Registrations (/yx/payroll/setup)', () => {
  it('lists what is missing; Fix opens the drawer, Save too early names the field, then saves the edited row', async () => {
    const l = live();
    render(<PayrollSetupScreen live={l} />);
    expect(screen.getAllByText('IN.TDS: the entity TAN').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Fix Income tax (TDS)' }));
    const drawer = screen.getByRole('dialog');
    await ue.click(within(drawer).getByRole('radio', { name: 'Registered' }));
    await ue.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(within(drawer).getByText('Enter the registration number.')).toBeInTheDocument();
    expect(l.onSaveRegistrations).not.toHaveBeenCalled();
    await ue.type(within(drawer).getByRole('textbox', { name: /Registration number/ }), 'BLRK04512E');
    await ue.click(within(drawer).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(l.onSaveRegistrations).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ statute: 'IN.TDS', status: 'on', registrationNo: 'BLRK04512E' })])));
    expect((await screen.findAllByText('Registrations saved.')).length).toBeGreaterThan(0);
  });

  it('a new PT registration needs its state code', async () => {
    const l = live();
    render(<PayrollSetupScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Add a registration' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter the state code, like IN-KA.')).toBeInTheDocument();
    expect(l.onSaveRegistrations).not.toHaveBeenCalled();
  });

  it('a refused save stays in the drawer with the reason', async () => {
    render(<PayrollSetupScreen live={live({ onSaveRegistrations: vi.fn(async () => Promise.reject(new Error('The PF number is already used by another legal entity.'))) })} />);
    await ue.click(screen.getByRole('button', { name: 'Edit Provident fund' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/already used by another legal entity/)).toBeInTheDocument();
  });

  it('a legal option is picked with the joined control; Save option is never disabled', async () => {
    const l = live();
    render(<PayrollSetupScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Save option' }));
    expect(screen.getByText('Choose the value.')).toBeInTheDocument();
    expect(l.onSetOption).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('radio', { name: 'On actual wage' }));
    await ue.type(screen.getByLabelText('From'), '2026-04-01');
    await ue.click(screen.getByRole('button', { name: 'Save option' }));
    await waitFor(() => expect(l.onSetOption).toHaveBeenCalledWith('pf.on_actual_wage', 'yes', '2026-04-01'));
  });

  it('without the statutory key the step says who keeps it, and shows no table', () => {
    render(<PayrollSetupScreen live={live({ entityId: 'le-tn' })} />);
    expect(screen.getByText("You can't change statutory registrations for this legal entity")).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Statutory registrations' })).not.toBeInTheDocument();
  });
});

describe('PAY-16 live: Pay groups (/yx/payroll/pay-groups)', () => {
  it('lists only this entity’s groups; Save too early names the group; then saves for the entity', async () => {
    const l = live({ page: 'group' });
    render(<PayrollSetupScreen live={l} />);
    const table = within(shown()).getByRole('table', { name: 'Pay groups' });
    expect(table).toHaveTextContent('Head office monthly');
    expect(table).not.toHaveTextContent('Hosur plant workers');
    await ue.click(within(shown()).getByRole('button', { name: 'Add pay group' }));
    const drawer = screen.getByRole('dialog');
    await ue.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(within(drawer).getByText('Name the group.')).toBeInTheDocument();
    expect(l.onSaveGroup).not.toHaveBeenCalled();
    await ue.type(within(drawer).getByRole('textbox', { name: /Pay group name/ }), 'Plant weekly');
    await ue.click(within(drawer).getByRole('radio', { name: 'Weekly' }));
    await ue.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(within(drawer).getByText('Choose the first day of a pay period.')).toBeInTheDocument();
    await ue.type(within(drawer).getByLabelText(/First day of a pay period/), '2026-11-02');
    await ue.click(within(drawer).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(l.onSaveGroup).toHaveBeenCalledWith(null, expect.objectContaining({ legalEntityId: 'le-kfpl', name: 'Plant weekly', frequency: 'weekly', anchorDate: '2026-11-02' })));
  });

  it('members and calendar: Add with no one ticked names the search; ticked people are added from the date', async () => {
    const l = live({ page: 'group' });
    render(<PayrollSetupScreen live={l} />);
    await ue.click(within(shown()).getByRole('button', { name: 'Members and calendar' }));
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('Kavitha Sundaram')).toBeInTheDocument();
    expect(within(drawer).getByRole('table', { name: 'Pay calendar' })).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: /^Add .*to this group/ }));
    expect(within(drawer).getByText('Find and tick the people to add.')).toBeInTheDocument();
    expect(l.onAddMembers).not.toHaveBeenCalled();
    await ue.click(within(drawer).getByRole('button', { name: 'Search' }));
    await ue.click(await within(drawer).findByRole('checkbox', { name: /Arjun Kulkarni/ }));
    await ue.click(within(drawer).getByRole('button', { name: 'Add 1 to this group' }));
    await waitFor(() => expect(l.onAddMembers).toHaveBeenCalledWith('g1', ['e-arjun'], '2026-10-28'));
  });

  it('without set-up rights the step says so', () => {
    render(<PayrollSetupScreen live={live({ page: 'group', entities: [{ ...SETUP_ENTITIES[0], keys: [] }] })} />);
    expect(screen.getByText("You can't change pay groups for this legal entity")).toBeInTheDocument();
  });
});

describe('PAY-16 live: Opening balances (/yx/payroll/imports)', () => {
  it('reads a CSV; rows with errors block the commit; a clean file commits', async () => {
    expect(parseCsv('employeeCode,month,componentCode,amount\nKF-0142,2026-03,basic,24200\n')).toEqual([{ employeeCode: 'KF-0142', month: '2026-03', componentCode: 'basic', amount: '24200' }]);
    const onStage = vi.fn(async () => ({ id: 'b1', kind: 'as_paid_lines' as const, rows: 1, valid: 0, errors: [{ row: 1, message: 'No employee with that code in this legal entity.' }], status: 'staged' }));
    const l = live({ page: 'opening', onStage });
    render(<PayrollSetupScreen live={l} />);
    await ue.upload(shown().querySelector('input[type=file]') as HTMLInputElement, csv('employeeCode,month,componentCode,amount\nNOPE,2026-03,basic,1'));
    await waitFor(() => expect(onStage).toHaveBeenCalledWith('le-kfpl', 'as_paid_lines', [{ employeeCode: 'NOPE', month: '2026-03', componentCode: 'basic', amount: '1' }]));
    expect(await screen.findByText(/Row 1: No employee/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Commit 0 rows' }));
    expect(screen.getByText(/nothing is imported while a row has a problem/)).toBeInTheDocument();
    expect(l.onCommit).not.toHaveBeenCalled();
  });

  it('a clean file commits and says so', async () => {
    const l = live({ page: 'opening' });
    render(<PayrollSetupScreen live={l} />);
    await ue.upload(shown().querySelector('input[type=file]') as HTMLInputElement, csv('employeeCode,month,componentCode,amount\nKF-0142,2026-03,basic,24200'));
    await ue.click(await screen.findByRole('button', { name: 'Commit 1 row' }));
    await waitFor(() => expect(l.onCommit).toHaveBeenCalledWith('b1'));
    expect((await screen.findAllByText('1 row imported.')).length).toBeGreaterThan(0);
  });

  it('a file with only the header is refused before anything is sent; the go-live check needs a month', async () => {
    const l = live({ page: 'opening' });
    render(<PayrollSetupScreen live={l} />);
    await ue.upload(shown().querySelector('input[type=file]') as HTMLInputElement, csv('employeeCode,month,componentCode,amount\n'));
    expect(await screen.findByText(/no rows under the header line/)).toBeInTheDocument();
    expect(l.onStage).not.toHaveBeenCalled();
    await ue.clear(screen.getByLabelText('First month paid in YukthiX'));
    await ue.click(within(shown()).getByRole('button', { name: 'Check' }));
    expect(screen.getByText('Choose the first month paid in YukthiX.')).toBeInTheDocument();
    expect(l.onGoLiveCheck).not.toHaveBeenCalled();
  });
});

describe('PAY-16 live: Go-live (/yx/payroll/go-live)', () => {
  it('what is left, and differences signed off only with a reason, never by their uploader', async () => {
    const l = live({ page: 'golive', me: 'u-other' });
    const { rerender } = render(<PayrollSetupScreen live={l} />);
    expect(screen.getByRole('table', { name: 'Readiness checks' })).toHaveTextContent('UAN on file');
    expect(screen.getByText(/someone else signs it off/)).toBeInTheDocument();
    expect(within(shown()).queryByRole('button', { name: 'Sign off' })).not.toBeInTheDocument();
    rerender(<PayrollSetupScreen live={{ ...l, me: 'u-me' }} />);
    expect(screen.getByRole('table', { name: 'Differences' })).toHaveTextContent('Divya Raghunathan');
    await ue.click(within(shown()).getByRole('button', { name: 'Sign off' }));
    const drawer = screen.getByRole('dialog');
    await ue.click(within(drawer).getByRole('button', { name: 'Sign off' }));
    expect(within(drawer).getByText('Write at least 5 characters.')).toBeInTheDocument();
    expect(l.onDecide).not.toHaveBeenCalled();
    await ue.type(within(drawer).getByRole('textbox', { name: /accepted/ }), 'Old payroll rounded PT wrongly');
    await ue.click(within(drawer).getByRole('button', { name: 'Sign off' }));
    await waitFor(() => expect(l.onDecide).toHaveBeenCalledWith('pr1', 'signed_off', 'Old payroll rounded PT wrongly'));
  });

  it('Upload pressed with no run chosen names the run; without the approve right nobody sees Sign off', async () => {
    const l = live({ page: 'golive', can: { upload: true, decide: false } });
    render(<PayrollSetupScreen live={l} />);
    await ue.click(within(shown()).getByRole('button', { name: 'Upload old register' }));
    expect(screen.getByText('Choose the run to compare.')).toBeInTheDocument();
    expect(l.onUpload).not.toHaveBeenCalled();
    expect(within(shown()).queryByRole('button', { name: 'Sign off' })).not.toBeInTheDocument();
  });

  it('the review: not ready says what is left; ready opens payroll runs', async () => {
    const l = live({ page: 'golive' });
    const { unmount } = render(<PayrollSetupScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Open payroll runs' }));
    expect(screen.getByText('Not ready for the first live month')).toBeInTheDocument();
    expect(l.onOpen).not.toHaveBeenCalled();
    unmount();
    const r = live({ page: 'golive', readiness: { ...GO_LIVE, ready: true } });
    render(<PayrollSetupScreen live={r} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Open payroll runs' }));
    expect(r.onOpen).toHaveBeenCalledWith('runs');
  });
});
