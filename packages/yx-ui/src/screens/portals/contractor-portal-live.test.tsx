import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ContractorPortalScreen } from './t9-business';
import type { ContractorPortalData, LiveContractorPortal } from './contractor-portal-live';

// T9-13 contractor portal, live (CL-3): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const DATA: ContractorPortalData = {
  company: 'Kaveri Foods',
  contractor: { name: 'Vetri Security Agency', work: 'Security' },
  contact: { name: 'Meera Pillai', email: 'meera@vetri.in' },
  today: '2026-09-29',
  sites: [{ id: 'hosur', name: 'Hosur plant' }],
  establishments: [{ licenceId: 'l1', site: { id: 'hosur', name: 'Hosur plant' }, licenceNo: 'TN/CLRA/0442', scope: 'Security', states: ['IN-TN'], maxWorkers: 20, deployed: 14, validFrom: '2025-10-21', validTo: '2026-10-20', state: 'expiring', renewal: null }],
  workOrders: [{ id: 'wo1', number: 'WO/7', fromOn: '2026-04-01', toOn: '2027-03-31', headcount: 15, active: 14, sites: ['Hosur plant'] }],
  workers: [{ id: 'd1', name: 'Kannan S', idMasked: 'XXXX XXXX 0123', site: 'Hosur plant', skill: 'Unskilled', wage: '14820.00', fromOn: '2026-09-01', toOn: null, status: 'pending', gatePass: null, gateValidTo: null, uan: null, esicIp: null }],
  due: [{ kind: 'licence', tone: 'danger', text: 'Licence TN/CLRA/0442 for Hosur plant ends in 21 days (2026-10-20). Upload the renewed licence.' }],
};
const live = (p: Partial<LiveContractorPortal> = {}): LiveContractorPortal => ({
  tenant: 'kaveri',
  tab: 'establishments',
  hrefFor: (t) => `?tab=${t}`,
  state: 'ready',
  onRetry: vi.fn(),
  ended: false,
  onSignInAgain: vi.fn(),
  onSignOut: vi.fn(),
  data: DATA,
  onCheck: vi.fn(async () => [{ id: 'age', status: 'pass' as const, label: 'Age 18 or over' }]),
  onAdd: vi.fn(async () => undefined),
  onRenew: vi.fn(async () => undefined),
  ...p,
});

describe('T9-13 contractor portal (live)', () => {
  it('what is due, the licence with its renewal upload, work orders; the packs and bills tabs', () => {
    show(<ContractorPortalScreen live={live()} />);
    expect(screen.getByText(/Upload the renewed licence\./)).toBeInTheDocument();
    expect(screen.getByText('WO/7')).toBeInTheDocument();
    expect(screen.getByText('14 of 20 allowed')).toBeInTheDocument();
    // CL-4: the packs and bills tabs.
    expect(screen.getByRole('link', { name: 'Monthly packs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bills' })).toBeInTheDocument();
  });

  it('renewal: every missing field named and nothing sent', async () => {
    const l = live();
    show(<ContractorPortalScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Upload renewed licence' }));
    await ue.click(screen.getByRole('button', { name: 'Upload renewal' }));
    for (const t of ['Enter the renewed licence number.', 'Choose the day it starts.', 'Choose the day it ends.', 'Attach a copy of the renewed licence.']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(l.onRenew).not.toHaveBeenCalled();
  });

  it('a pending renewal hides the upload and says it is being checked; a rejected one gives the reason', () => {
    const { unmount } = show(<ContractorPortalScreen live={live({ data: { ...DATA, establishments: [{ ...DATA.establishments[0]!, renewal: { id: 'r1', licenceNo: 'TN/CLRA/0900', status: 'pending', validTo: '2027-10-20', rejectReason: null } }] } })} />);
    expect(screen.getByText('Renewal TN/CLRA/0900 is being checked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload renewed licence' })).not.toBeInTheDocument();
    unmount();
    show(<ContractorPortalScreen live={live({ data: { ...DATA, establishments: [{ ...DATA.establishments[0]!, renewal: { id: 'r1', licenceNo: 'TN/CLRA/0900', status: 'rejected', validTo: '2027-10-20', rejectReason: 'The copy is unreadable.' } }] } })} />);
    expect(screen.getByText(/The copy is unreadable\. Upload it again\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload renewed licence' })).toBeInTheDocument();
  });

  it('workers: the waiting worker; the add form names what is missing and never sends', async () => {
    const l = live({ tab: 'workers' });
    show(<ContractorPortalScreen live={l} />);
    expect(screen.getByText('Waiting for site approval')).toBeInTheDocument();
    expect(screen.getByText('XXXX XXXX 0123')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add worker' }));
    await ue.click(screen.getByRole('button', { name: 'Send for site approval' }));
    for (const t of ['Enter the worker’s name.', 'Enter the date of birth.', 'Enter the 12-digit Aadhaar number.', 'Choose the first day.']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(l.onCheck).not.toHaveBeenCalled();
    expect(l.onAdd).not.toHaveBeenCalled();
  });

  it('no site with a valid licence: no Add worker, and why', () => {
    show(<ContractorPortalScreen live={live({ tab: 'workers', data: { ...DATA, sites: [] } })} />);
    expect(screen.queryByRole('button', { name: 'Add worker' })).not.toBeInTheDocument();
    expect(screen.getByText('No site to deploy to')).toBeInTheDocument();
  });

  it('an ended session asks to sign in again; an error offers a retry', async () => {
    const l = live({ ended: true });
    const { unmount } = show(<ContractorPortalScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(l.onSignInAgain).toHaveBeenCalled();
    unmount();
    const e = live({ state: 'error', data: null });
    show(<ContractorPortalScreen live={e} />);
    await ue.click(within(screen.getByRole('main')).getByRole('button', { name: 'Try again' }));
    expect(e.onRetry).toHaveBeenCalled();
  });
});
