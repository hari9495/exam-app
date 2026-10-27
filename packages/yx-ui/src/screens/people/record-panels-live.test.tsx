import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PersonWorkspace, type LiveIdentity, type LiveRecord } from './record';

// The person record's panels and tabs with the live app's data: Identity (PPL-34), Person roles (PPL-35).

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
