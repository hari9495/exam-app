import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/notify';
import { ContractWorkersLiveScreen, type LiveContractor, type LiveSite, type LiveWorker } from './contract-live';

const SITE: LiveSite = { id: 'hsr', name: 'Hosur plant', state: 'IN-TN', legalEntityId: 'tn' };
const contractor = (max: number, active: number, states = ['IN-TN']): LiveContractor => ({
  id: 'c1',
  legalEntityId: 'tn',
  name: 'Vetri Security Agency',
  work: 'Security',
  pan: null,
  contact: null,
  status: 'active',
  licences: [{ id: 'l1', licenceNo: 'TN/CLRA/2024/0442', locationId: 'hsr', site: 'Hosur plant', states, maxWorkers: max, active, validFrom: '2026-01-01', validTo: '2026-12-31' }],
});
const worker = (status: LiveWorker['status']): LiveWorker => ({ id: 'w1', personId: 'p1', name: 'Anbu Selvan', contractorId: 'c1', contractor: 'Vetri Security Agency', licenceNo: 'TN/CLRA/2024/0442', legalEntity: { id: 'tn', name: 'Kaveri Foods (TN)' }, site: { id: 'hsr', name: 'Hosur plant' }, work: 'Security guard', skill: 'semi_skilled', wage: '16240.00', fromOn: '2026-03-11', toOn: null, status });
const show = (over: Partial<Parameters<typeof ContractWorkersLiveScreen>[0]> = {}) => {
  const p = { state: 'ready' as const, today: '2026-09-29', workers: [worker('deployed')], contractors: [contractor(20, 4)], sites: [SITE], canManage: true, onDeploy: vi.fn(async () => ({})), onApprove: vi.fn(async () => ({})), onRelease: vi.fn(async () => ({})), ...over };
  render(
    <ToastProvider>
      <ContractWorkersLiveScreen {...p} />
    </ToastProvider>,
  );
  return p;
};

describe('Contract workers, live (CLB-02)', () => {
  it('lists workers with their contractor, site, wage in rupees and status', () => {
    show();
    const row = screen.getByRole('row', { name: /Anbu Selvan/ });
    expect(row).toHaveTextContent('Vetri Security Agency');
    expect(row).toHaveTextContent('Hosur plant');
    expect(row).toHaveTextContent('₹16,240');
    expect(row).toHaveTextContent('Deployed');
  });

  it('blocks a deployment when the licence is at its maximum, and names the numbers', () => {
    show({ contractors: [contractor(3, 3)], defaultDeployOpen: true });
    const checks = screen.getByRole('list', { name: 'Deployment checks' });
    expect(checks).toHaveTextContent('Licence allows 3 workers here; 3 are already deployed.');
    expect(screen.getByRole('button', { name: 'Send for site approval' })).toBeDisabled();
  });

  it('blocks a licence that does not cover the site, before anything is sent', async () => {
    const p = show({ contractors: [contractor(20, 4, ['IN-KA'])], defaultDeployOpen: true });
    expect(screen.getByRole('list', { name: 'Deployment checks' })).toHaveTextContent('Licence scope does not cover Tamil Nadu.');
    expect(p.onDeploy).not.toHaveBeenCalled();
  });

  it('asks before releasing a worker', async () => {
    const p = show();
    await userEvent.click(screen.getByRole('button', { name: 'Release' }));
    const dialog = await screen.findByRole('dialog', { name: 'Release Anbu Selvan?' });
    expect(dialog).toHaveTextContent('Release Anbu Selvan?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Release worker' }));
    await waitFor(() => expect(p.onRelease).toHaveBeenCalled());
  });

  it('read only: no Deploy, Approve or Release', () => {
    show({ canManage: false, workers: [worker('pending')] });
    expect(screen.queryByRole('button', { name: /Deploy worker|Approve|Release/ })).not.toBeInTheDocument();
  });
});
