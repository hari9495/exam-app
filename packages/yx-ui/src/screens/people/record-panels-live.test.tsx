import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PersonWorkspace, type LiveIdentity, type LiveRecord, type LiveWorkAuth } from './record';

// The person record's panels and tabs with the live app's data: Identity (PPL-34), Person roles (PPL-35),
// Work authorisations (PPL-45).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const live = (o: Partial<LiveRecord>): LiveRecord => ({
  directoryHref: '/d', name: 'Arjun Kulkarni', role: 'Quality Analyst', department: 'Quality', location: 'Hosur plant', code: 'KF-0142', manager: 'Divya Raghunathan', joined: day('2021-03-12'), grade: 'G2', badges: [], facts: [], events: [],
  personal: null, identity: null, pending: [], job: [['Designation', 'Quality Analyst']], scheduled: [], pastChanges: 0, pay: { kind: 'none', grantedBy: 'HR' }, time: null, documents: null, assets: null, history: null, asOf: null, onAsOf: vi.fn(), ...o,
});

describe('Person roles panel (PPL-35), live', () => {
  const roles = [
    { role: 'Joiner', from: day('2021-02-20'), to: day('2021-03-12'), link: 'Pre-boarding · Quality Inspector' },
    { role: 'Employee', from: day('2021-03-12'), to: null, link: 'Employment KF-0142 · Kaveri Foods Pvt Ltd' },
  ];

  it('names the company and lists every role, oldest first, from the menu', async () => {
    wrap(<PersonWorkspace persona="hr" relation="other" today={day('2026-10-20')} live={live({ history: { rows: [], roles: [...roles].reverse(), company: 'Kaveri Foods' }, activity: [] })} />);
    expect(screen.queryByText(/links every role/)).toBeNull();
    await ue.click(screen.getByRole('button', { name: /More actions|Actions/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'All roles of this person' }));
    expect(screen.getByText('One person record links every role in Kaveri Foods.')).toBeInTheDocument();
    const items = screen.getByRole('list', { name: 'Roles over time' }).querySelectorAll('li');
    expect([...items].map((li) => li.textContent)).toEqual(['Joiner · 20 Feb 2021 to 12 Mar 2021Pre-boarding · Quality Inspector', 'Employee · 12 Mar 2021 to nowEmployment KF-0142 · Kaveri Foods Pvt Ltd']);
    await ue.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/links every role/)).toBeNull();
  });

  it('is not offered to someone who is not HR', () => {
    wrap(<PersonWorkspace persona="mgr" relation="team" today={day('2026-10-20')} live={live({ history: { rows: [], roles, company: 'Kaveri Foods' }, activity: [] })} />);
    expect(screen.queryByRole('button', { name: /More actions|Actions/ })).toBeNull();
    expect(screen.queryByText(/links every role/)).toBeNull();
  });
});

describe('Identity panel (PPL-34), live', () => {
  const identity = (o: Partial<LiveIdentity> = {}): LiveIdentity => ({
    state: 'ready', onOpen: vi.fn(), onRetry: vi.fn(),
    checks: [{ kind: 'day1', at: day('2021-03-12'), by: 'Lakshmi Venkatesan', note: null }, { kind: 'requested', at: day('2026-10-01'), by: 'Lakshmi Venkatesan', note: 'Passport' }],
    idTypes: [{ key: 'passport', name: 'Passport' }, { key: 'pan_card', name: 'PAN card' }],
    onReverify: vi.fn(async () => undefined), onAttest: vi.fn(async () => undefined), ...o,
  });
  const open = async (id: LiveIdentity) => {
    wrap(<PersonWorkspace persona="hr" relation="other" today={day('2026-10-20')} live={live({ activity: [], identityPanel: id })} />);
    await ue.click(screen.getByRole('button', { name: /More actions|Actions/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Identity panel' }));
  };

  it('opens from the menu (a recorded load) and lists the checks; no face image, no consent on file', async () => {
    const id = identity();
    await open(id);
    expect(id.onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Special class. No face image is shown here. Views are recorded.')).toBeInTheDocument();
    expect(screen.getByText('No face-match consent on file. Identity is checked against the original ID.')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /12 Mar 2021 Day-1 identity check HR: Lakshmi Venkatesan Attested/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /1 Oct 2026 Re-verification HR: Lakshmi Venkatesan · Passport Fresh ID asked for/ })).toBeInTheDocument();
  });

  it('asks for a fresh ID only once one is chosen, and records an attestation with its note', async () => {
    const id = identity();
    await open(id);
    await ue.click(screen.getByRole('button', { name: 'Request re-verification' }));
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Send request' })).toBeDisabled();
    await ue.click(within(dialog).getByRole('combobox', { name: 'ID to upload' }));
    await ue.click(await screen.findByRole('option', { name: 'Passport' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(id.onReverify).toHaveBeenCalledWith('passport'));
    await ue.click(screen.getByRole('button', { name: 'Record HR attestation' }));
    dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox'), 'Original passport seen');
    await ue.click(within(dialog).getByRole('button', { name: 'Record attestation' }));
    await waitFor(() => expect(id.onAttest).toHaveBeenCalledWith('Original passport seen'));
  });

  it('without the right to change identity details there are no actions', async () => {
    const id = identity({ onReverify: undefined, onAttest: undefined, checks: [] });
    await open(id);
    expect(screen.getByText('No identity checks recorded yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request re-verification' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record HR attestation' })).toBeNull();
  });

  it('a failed load offers a retry', async () => {
    const id = identity({ state: 'error' });
    await open(id);
    await ue.click(screen.getByRole('button', { name: /Retry|Try again/ }));
    expect(id.onRetry).toHaveBeenCalled();
  });

  it('is not on the menu without the Special key', async () => {
    wrap(<PersonWorkspace persona="hr" relation="other" today={day('2026-10-20')} live={live({ activity: [], history: { rows: [], roles: [], company: 'K' } })} />);
    await ue.click(screen.getByRole('button', { name: /More actions|Actions/ }));
    expect(screen.queryByRole('menuitem', { name: 'Identity panel' })).toBeNull();
  });
});

describe('Work authorisations tab (PPL-45), live', () => {
  const workAuth = (o: Partial<LiveWorkAuth> = {}): LiveWorkAuth => ({
    designation: 'Quality Lead',
    reminderDays: [90, 60, 30],
    rows: [
      { id: 'w1', kind: 'employment_visa', country: 'AE', number: '•••• 7731', sponsor: 'Kaveri Foods FZE', occupation: 'Quality Inspector', expires: day('2026-11-25'), remindedDays: [90, 60] },
      { id: 'w2', kind: 'national_id', country: 'AE', number: '•••• 0004', sponsor: 'Kaveri Foods FZE', occupation: null, expires: day('2027-11-19'), remindedDays: [] },
      { id: 'passport', kind: 'passport', country: null, number: '•••• 7728', sponsor: null, occupation: null, expires: day('2031-02-08'), remindedDays: [] },
    ],
    onAdd: vi.fn(async () => undefined),
    ...o,
  });
  const open = async (w: LiveWorkAuth | null) => {
    wrap(<PersonWorkspace persona="hr" relation="other" today={day('2026-10-20')} live={live({ workAuth: w })} />);
    if (w) await ue.click(screen.getByRole('tab', { name: /Work authorisations/ }));
  };

  it('lists each document masked, flags an occupation that differs and the visa about to lapse', async () => {
    await open(workAuth());
    expect(screen.getByRole('tab', { name: /Work authorisations/ })).toHaveTextContent('3');
    expect(screen.getByText('Employment visa expires on 25 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('Reminders went at 90 and 60 days. The next goes at 30 days. Payroll approval is held once it expires.')).toBeInTheDocument();
    expect(screen.getByText('Emirates ID')).toBeInTheDocument();
    expect(screen.getAllByText('United Arab Emirates')).toHaveLength(2);
    expect(screen.getByText('•••• 7731')).toBeInTheDocument();
    expect(screen.getByText('Differs from designation')).toBeInTheDocument();
    expect(screen.getByText('Passport')).toBeInTheDocument();
  });

  it('an expired visa is named as expired', async () => {
    await open(workAuth({ rows: [{ id: 'w1', kind: 'work_permit', country: 'AE', number: '•••• 7731', sponsor: null, occupation: 'Quality Lead', expires: day('2026-10-01'), remindedDays: [90, 60, 30] }] }));
    expect(screen.getByText('Work permit expired on 1 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Reminders went at 90, 60 and 30 days. Payroll approval is held once it has expired.')).toBeInTheDocument();
    expect(screen.queryByText('Differs from designation')).toBeNull();
  });

  it('adds a document only once it is complete and the dates make sense', async () => {
    const w = workAuth({ rows: [] });
    await open(w);
    expect(screen.getByText('No work authorisations')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Add document' })[0]);
    const drawer = screen.getByRole('dialog');
    await ue.click(within(drawer).getByRole('button', { name: 'Add document' }));
    expect(within(drawer).getByText('Fix these before saving')).toBeInTheDocument();
    expect(w.onAdd).not.toHaveBeenCalled();
    await ue.click(within(drawer).getByRole('combobox', { name: 'Document' }));
    await ue.click(await screen.findByRole('option', { name: 'Employment visa' }));
    await ue.click(within(drawer).getByRole('combobox', { name: 'Country' }));
    await ue.type(await screen.findByPlaceholderText('Search'), 'United Arab');
    await ue.click(await screen.findByRole('option', { name: 'United Arab Emirates' }));
    await ue.type(within(drawer).getByRole('textbox', { name: /Number/ }), '784-2025-1234567');
    await ue.type(within(drawer).getByRole('textbox', { name: /Occupation on permit/ }), 'Quality Inspector');
    await ue.type(within(drawer).getByRole('textbox', { name: 'Issued on' }), '2 Nov 2025');
    await ue.type(within(drawer).getByRole('textbox', { name: 'Expires on' }), '1 Oct 2025');
    await ue.tab();
    await ue.click(within(drawer).getByRole('button', { name: 'Add document' }));
    expect(within(drawer).getAllByText('The expiry date must be after the issue date.').length).toBeGreaterThan(0);
    expect(w.onAdd).not.toHaveBeenCalled();
    await ue.clear(within(drawer).getByRole('textbox', { name: 'Expires on' }));
    await ue.type(within(drawer).getByRole('textbox', { name: 'Expires on' }), '1 Nov 2026');
    await ue.tab();
    await ue.click(within(drawer).getByRole('button', { name: 'Add document' }));
    await waitFor(() => expect(w.onAdd).toHaveBeenCalledWith({ kind: 'employment_visa', country: 'AE', number: '784-2025-1234567', occupation: 'Quality Inspector', issuedOn: '2025-11-02', expiresOn: '2026-11-01' }));
  });

  it('without the right to change identity details there is no Add document', async () => {
    await open(workAuth({ onAdd: undefined }));
    expect(screen.queryByRole('button', { name: 'Add document' })).toBeNull();
  });

  it('no tab without identity access', () => {
    wrap(<PersonWorkspace persona="hr" relation="other" today={day('2026-10-20')} live={live({ workAuth: null })} />);
    expect(screen.queryByRole('tab', { name: /Work authorisations/ })).toBeNull();
  });
});
