import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { EmployeeImportWizard } from './changes';
import type { ImportFile, LiveImport } from './import';
import { BuddyPanel, type LiveBuddies } from './onboarding';
import { SuccessionScreen, type LiveSuccession } from './assets';
import { UnionRegister, type LiveUnionRegister } from './relations';

// People › Import, Buddies, Succession and Union register with the live app's data (founder decision 20 Oct 2026).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Employee import (PPL-07)', () => {
  const FILE: ImportFile = {
    columns: [
      { column: 'Emp No', sample: 'KF0261', field: 'code' },
      { column: 'Full Name', sample: 'Harini Suresh', field: 'name' },
      { column: 'DOJ', sample: '01 Oct 2026', field: 'joined' },
      { column: 'Dept', sample: 'Quality', field: null },
    ],
    rows: [
      { row: 2, cells: ['KF0261', 'Harini Suresh', '01 Oct 2026', 'Quality'] },
      { row: 3, cells: ['KF0262', '', '1/10/26', 'Quality'] },
    ],
    fields: [
      { key: 'code', label: 'Employee code', required: false },
      { key: 'name', label: 'Name', required: true },
      { key: 'joined', label: 'Joining date', required: true },
      { key: 'department', label: 'Department', required: true },
    ],
  };
  const live = (o: Partial<LiveImport> = {}): LiveImport => ({
    entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd' }],
    onRead: vi.fn().mockResolvedValue(FILE),
    onCheck: vi.fn().mockResolvedValue({
      ready: 1,
      rows: [
        { row: 2, name: 'Harini Suresh', code: 'KF0261', joined: '01 Oct 2026', manager: null, issues: [], duplicate: false },
        { row: 3, name: '', code: 'KF0262', joined: '1/10/26', manager: null, issues: [{ field: 'Name', message: 'Enter the employee name.' }], duplicate: false },
      ],
    }),
    onImport: vi.fn().mockResolvedValue({ ready: 1, created: 1, rows: [] }),
    onSaveFile: vi.fn(),
    ...o,
  });

  it('reads the file, needs every required field matched, checks the rows in plain words and imports the ones that pass', async () => {
    const l = live();
    const { container } = wrap(<EmployeeImportWizard live={l} />);
    await ue.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'joiners.csv', { type: 'text/csv' }));
    await waitFor(() => expect(l.onRead).toHaveBeenCalled());
    expect(await screen.findByText('2 rows found.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    // Department is required and not matched yet.
    expect(screen.getByText(/Match a column to Department/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await ue.click(screen.getByRole('combobox', { name: 'Field for Dept' }));
    await ue.click(await screen.findByRole('option', { name: 'Department' }));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(l.onCheck).toHaveBeenCalledWith({ legalEntityId: 'e1', fileName: 'joiners.csv', rows: [{ row: 2, values: { code: 'KF0261', name: 'Harini Suresh', joined: '01 Oct 2026', department: 'Quality' } }, { row: 3, values: { code: 'KF0262', joined: '1/10/26', department: 'Quality' } }] }));
    expect(await screen.findByText('1 of 2 rows are ready')).toBeInTheDocument();
    expect(screen.getByText('Enter the employee name.')).toBeInTheDocument();
    // A fix typed here goes with the next check.
    await ue.type(screen.getByRole('textbox', { name: 'Name for row 3' }), 'Farook Basha');
    await ue.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(l.onCheck).toHaveBeenLastCalledWith(expect.objectContaining({ rows: expect.arrayContaining([{ row: 3, values: { code: 'KF0262', name: 'Farook Basha', joined: '1/10/26', department: 'Quality' } }]) })));
    await ue.click(screen.getByRole('button', { name: 'Download rows with problems' }));
    expect(l.onSaveFile).toHaveBeenCalledWith('joiners-problems.csv', expect.stringContaining('Name: Enter the employee name.'));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Import 1 employee' }));
    await waitFor(() => expect(l.onImport).toHaveBeenCalled());
  });

  it('the template and the problem rows never carry a formula', async () => {
    const l = live();
    wrap(<EmployeeImportWizard live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Download template' }));
    expect(l.onSaveFile).toHaveBeenCalledWith('employee-import-template.csv', expect.stringMatching(/^Employee code,Name,PAN,Manager code,Joining date/));
  });
});

describe('Buddies (PPL-41)', () => {
  const data: NonNullable<LiveBuddies['data']> = {
    pool: [
      { employeeId: 'b1', name: 'Lakshmi Gowda', team: 'Quality', location: 'Hosur plant', cap: 2, load: 2, joiners: [{ name: 'Kavya Reddy', joins: '2026-10-25' }], leavingOn: null },
      { employeeId: 'b2', name: 'Imran Qureshi', team: 'Quality', location: 'Hosur plant', cap: 2, load: 0, joiners: [], leavingOn: null },
      { employeeId: 'm1', name: 'Ramesh Gowda', team: 'Quality', location: 'Hosur plant', cap: 2, load: 0, joiners: [], leavingOn: null },
    ],
    needs: [{ id: 'j1', version: 3, name: 'Murugan K', role: 'Analyst', team: 'Quality', location: 'Hosur plant', manager: 'Ramesh Gowda', managerEmployeeId: 'm1', joins: '2026-10-28' }],
    checkins: [{ id: 'c1', title: 'Welcome call', pair: 'Kavya Reddy and Lakshmi Gowda', due: '2026-10-22', status: 'Pending' }],
  };
  const base = (o: Partial<LiveBuddies> = {}): LiveBuddies => ({ state: 'ready', onRetry: vi.fn(), today: new Date('2026-10-20T00:00:00'), data, people: [], ...o });

  it('suggests a free buddy who is not the manager, and assigns through the joiner', async () => {
    const onAssign = vi.fn().mockResolvedValue(undefined);
    wrap(<BuddyPanel pool={[]} live={base({ onAssign, onAdd: vi.fn(), onRemove: vi.fn() })} />);
    expect(screen.getByText('Needs a buddy (1)')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Assign buddy' }));
    const drawer = await screen.findByRole('dialog', { name: 'Assign a buddy to Murugan K' });
    // Lakshmi is full and Ramesh is the manager: Imran is suggested.
    expect(within(drawer).getByText('Imran Qureshi')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Assign buddy' }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(data.needs[0], 'b2'));
  });

  it('without the manage key: no Add to pool and no Assign buddy', () => {
    wrap(<BuddyPanel pool={[]} live={base()} />);
    expect(screen.queryByRole('button', { name: 'Add to pool' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Assign buddy' })).toBeNull();
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
  });
});

describe('Succession (PPL-26)', () => {
  const data: NonNullable<LiveSuccession['data']> = {
    updatedOn: '2026-10-19',
    positions: [
      { id: 'p1', title: 'Head of Quality', incumbent: { id: 'e1', name: 'Divya Menon', band: null }, successors: [{ id: 'e2', name: 'Arjun Kulkarni', readiness: '3+ years', band: null }] },
      { id: 'p2', title: 'Head of Sales', incumbent: null, successors: [{ id: 'e3', name: 'Priya Nair', readiness: 'Ready now', band: 'Exceeds' }] },
    ],
  };
  const base = (o: Partial<LiveSuccession> = {}): LiveSuccession => ({
    state: 'ready',
    onRetry: vi.fn(),
    data,
    people: [
      { id: 'e1', name: 'Divya Menon' },
      { id: 'e4', name: 'Neha Joshi' },
    ],
    onAddPosition: vi.fn().mockResolvedValue(undefined),
    onNominate: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    ...o,
  });

  it('no grant: no plans shown', () => {
    wrap(<SuccessionScreen positions={[]} live={base({ state: 'forbidden', data: null })} />);
    expect(screen.queryByText('Head of Quality')).toBeNull();
    expect(screen.getByText(/Succession is Confidential/)).toBeInTheDocument();
  });

  it('counts positions at risk and nominates with a readiness (never the person in the role)', async () => {
    const l = base();
    wrap(<SuccessionScreen positions={[]} live={l} />);
    expect(screen.getByText('1 of 2 critical positions have no ready-now successor.')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Nominate successor' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Nominate a successor for Head of Quality' });
    await ue.click(within(dialog).getByRole('combobox'));
    expect(screen.queryByRole('option', { name: /Divya Menon/ })).toBeNull();
    await ue.click(await screen.findByRole('option', { name: /Neha Joshi/ }));
    await ue.click(within(dialog).getByRole('radio', { name: 'Ready now' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Nominate successor' }));
    await waitFor(() => expect(l.onNominate).toHaveBeenCalledWith(data.positions[0], 'e4', 'now'));
  });
});

describe('Union register (PPL-39)', () => {
  const base = (o: Partial<LiveUnionRegister> = {}): LiveUnionRegister => ({
    state: 'ready',
    onRetry: vi.fn(),
    data: {
      entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' }],
      unions: [{ id: 'u1', name: 'Hosur Food Workers Union', registrationNo: 'TN/HSR/TU/1187', legalEntityId: 'e1', locationId: 'l1', establishment: 'Hosur plant', recognition: 'recognised', basis: 'Sole negotiating union', validFrom: '2025-04-01', validTo: '2028-03-31', bearers: 'President Murugesan V', checkOff: 12 }],
    },
    locations: [{ value: 'l1', label: 'Hosur plant', entityId: 'e1' }],
    onSave: vi.fn().mockResolvedValue(undefined),
    ...o,
  });

  it('lists unions with check-off counts and opens a record', async () => {
    wrap(<UnionRegister rows={[]} live={base()} />);
    expect(screen.getByText('TN/HSR/TU/1187')).toBeInTheDocument();
    await ue.click(screen.getByText('Hosur Food Workers Union'));
    expect(await screen.findByText('12 workers have signed a check-off authorisation')).toBeInTheDocument();
  });

  it('a recognised union needs its basis before it is saved', async () => {
    const l = base({ data: { entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' }], unions: [] } });
    wrap(<UnionRegister rows={[]} live={l} />);
    await ue.click(screen.getAllByRole('button', { name: 'Add union' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Add a union' });
    await ue.type(within(dialog).getByRole('textbox', { name: /Union name/ }), 'Kaveri Staff Association');
    await ue.click(within(dialog).getByRole('radio', { name: 'Recognised' }));
    expect(within(dialog).getByText('Say on what basis the union is recognised.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add union' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Basis/ }), 'Over 20% of workers');
    await ue.click(within(dialog).getByRole('button', { name: 'Add union' }));
    await waitFor(() =>
      expect(l.onSave).toHaveBeenCalledWith(null, { legalEntityId: 'e1', name: 'Kaveri Staff Association', registrationNo: null, locationId: null, recognition: 'recognised', basis: 'Over 20% of workers', validFrom: null, validTo: null, bearers: null }),
    );
  });
});
