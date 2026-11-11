import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ConvertWorkerScreen, WorkersView, type ConversionData, type LiveConvert } from './contract';
import { CONTRACTORS, WORKERS } from './contract-data';

// CL-7 (CLB-05, answer 637): convert a contract worker to an employee through the joiner flow. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const data = (over: Partial<ConversionData> = {}): ConversionData => ({
  deploymentId: 'd1', version: 3, canStart: true, block: null, person: { id: 'p1', name: 'Murugan S', email: null, phone: null }, rehire: false, contractor: 'Sri Lakshmi Facility Services', site: { id: 'hsr', name: 'Hosur plant', legalEntityId: 'tn' },
  fromOn: '2026-01-05', gatePass: 'GP-HSR-0101', uan: '100200300400', esicIp: null, idMasked: 'XXXX XXXX 4417', today: '2026-11-12', ...over,
});
const live = (over: Partial<LiveConvert> = {}): LiveConvert => ({
  state: 'ready', onRetry: vi.fn(), data: data(), canChange: true,
  places: { entities: [{ value: 'tn', label: 'Kaveri Foods Pvt Ltd' }], locations: [{ value: 'hsr', label: 'Hosur plant', entityId: 'tn' }], departments: [{ value: 'fac', label: 'Facilities' }], designations: [{ value: 'hk', label: 'Housekeeping associate' }], employmentTypes: [{ value: 'perm', label: 'Permanent' }], managers: [] },
  onStart: vi.fn(async () => ({ id: 'pb1' })), onDone: vi.fn(), ...over,
});
const next = () => ue.click(screen.getByRole('button', { name: 'Continue' }));

describe('CLB-05 convert a contract worker (live)', () => {
  it('pre-filled from the person and the deployment; the joining date is required; then pre-boarding starts', async () => {
    const l = live();
    show(<ConvertWorkerScreen worker={WORKERS[0]} live={l} />);
    expect(screen.getByText('Make Murugan S an employee')).toBeInTheDocument();
    expect(screen.getByText(/Contract worker, Sri Lakshmi Facility Services, Hosur plant/)).toBeInTheDocument();
    await next();
    expect(screen.getByText('The day before the joining date (chosen next)')).toBeInTheDocument();
    await next();
    // Entity and location come from the deployment's site; the joining date is not guessed.
    await next();
    expect(screen.getAllByText('Choose the joining date.').length).toBeGreaterThan(0);
    // Walk finding: focus moves to the field with the error.
    await waitFor(() => expect(document.activeElement?.id).toBe('cv-joining'));
    await ue.type(screen.getByLabelText(/^Joining date/), '01/12/2026');
    await next();
    expect(screen.getByText('UAN 100200300400')).toBeInTheDocument();
    expect(screen.getByText('No ESIC IP number on the deployment')).toBeInTheDocument();
    await next();
    await ue.click(screen.getByRole('button', { name: 'Start pre-boarding' }));
    await waitFor(() => expect(l.onStart).toHaveBeenCalledWith({ joiningOn: '2026-12-01', legalEntityId: 'tn', locationId: 'hsr', departmentId: null, designationId: null, employmentTypeId: null, managerEmployeeId: null, version: 3 }));
    expect(l.onDone).toHaveBeenCalledWith('pb1');
  });

  it('a joining date on or before the deployment start is refused', async () => {
    const l = live();
    show(<ConvertWorkerScreen worker={WORKERS[0]} live={l} />);
    await next();
    await next();
    await ue.type(screen.getByLabelText(/^Joining date/), '05/01/2026');
    await next();
    expect(screen.getAllByText(/Join after 5 Jan 2026/).length).toBeGreaterThan(0);
  });

  it('a worker who cannot be converted says why and starts nothing', async () => {
    const l = live({ data: data({ canStart: false, block: 'This person works here as an employee now.' }) });
    show(<ConvertWorkerScreen worker={WORKERS[0]} live={l} />);
    expect(screen.getByText('This person works here as an employee now.')).toBeInTheDocument();
    await next();
    expect(screen.getByText('This person works here as an employee now.')).toBeInTheDocument();
    expect(l.onStart).not.toHaveBeenCalled();
  });

  it('a refusal from the server shows on the review step', async () => {
    const l = live({ onStart: vi.fn(async () => { throw new Error('This person is already a joiner.'); }) });
    show(<ConvertWorkerScreen worker={WORKERS[0]} live={l} />);
    await next();
    await next();
    await ue.type(screen.getByLabelText(/^Joining date/), '01/12/2026');
    await next();
    await next();
    await ue.click(screen.getByRole('button', { name: 'Start pre-boarding' }));
    expect(await screen.findByText('This person is already a joiner.')).toBeInTheDocument();
    expect(l.onDone).not.toHaveBeenCalled();
  });

  it('CLB-02: Make employee only on deployed workers, only when the page offers it', async () => {
    const onConvert = vi.fn();
    const { unmount } = show(<WorkersView workers={WORKERS} contractors={CONTRACTORS} locations={[{ id: 'hsr', name: 'Hosur plant', state: 'TN' }]} today={new Date(2026, 8, 29)} state="ready" sheet={null} canManage inductionRequired inductionMonths={12} onConvert={onConvert} />);
    const deployed = WORKERS.filter((w) => w.status === 'Deployed').length;
    expect(screen.getAllByRole('button', { name: 'Make employee' })).toHaveLength(deployed);
    await ue.click(screen.getAllByRole('button', { name: 'Make employee' })[0]!);
    expect(onConvert).toHaveBeenCalledWith(WORKERS.find((w) => w.status === 'Deployed')!.id);
    unmount();
    show(<WorkersView workers={WORKERS} contractors={CONTRACTORS} locations={[]} today={new Date(2026, 8, 29)} state="ready" sheet={null} canManage inductionRequired inductionMonths={12} />);
    expect(screen.queryByRole('button', { name: 'Make employee' })).not.toBeInTheDocument();
    expect(within(document.body).getAllByRole('button', { name: 'Release' }).length).toBeGreaterThan(0);
  });
});

describe('CLB-05 after the walk (answers 808, 809)', () => {
  it('809: the gate pass photo on the same-person step; without one the placeholder', async () => {
    const photoUrl = vi.fn(async () => 'blob:photo-1');
    const { unmount } = show(<ConvertWorkerScreen worker={WORKERS[0]} live={live({ data: data({ photo: true }), photoUrl })} />);
    expect(await screen.findByAltText('Photo of Murugan S')).toHaveAttribute('src', 'blob:photo-1');
    expect(photoUrl).toHaveBeenCalledTimes(1);
    unmount();
    const none = vi.fn(async () => 'blob:x');
    show(<ConvertWorkerScreen worker={WORKERS[0]} live={live({ data: data({ photo: false }), photoUrl: none })} />);
    expect(document.querySelector('img')).toBeNull();
    expect(none).not.toHaveBeenCalled();
  });

  it('808: designation, department and employment type open on request; the review has one note box and short summaries', async () => {
    show(<ConvertWorkerScreen worker={WORKERS[0]} live={live()} />);
    await next();
    await next();
    expect(screen.queryByText('Designation')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Designation, department and employment type' }));
    for (const t of ['Designation', 'Department', 'Employment type']) expect(screen.getByText(t)).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/^Joining date/), '01/12/2026');
    await next();
    await next();
    expect(screen.getByText(/joins the Onboarding board on the same person record/)).toBeInTheDocument();
    expect(document.querySelectorAll('.yx-stepper__review-step [role="status"] [role="status"], .yx-stepper__review-step .yx-alert .yx-alert')).toHaveLength(0);
    expect(screen.getByText(/Joins 1 Dec 2026 at Hosur plant/)).toBeInTheDocument();
    expect(screen.queryByText('Murugan S, same person record')).not.toBeInTheDocument();
  });

  it('a failed start shows "Not started" once, above the steps', async () => {
    const l = live({ onStart: vi.fn(async () => { throw new Error('This person is already joining.'); }) });
    show(<ConvertWorkerScreen worker={WORKERS[0]} live={l} />);
    await next();
    await next();
    await ue.type(screen.getByLabelText(/^Joining date/), '01/12/2026');
    await next();
    await next();
    await ue.click(screen.getByRole('button', { name: 'Start pre-boarding' }));
    expect(await screen.findByText('This person is already joining.')).toBeInTheDocument();
    expect(screen.getAllByText('Not started')).toHaveLength(1);
  });
});

