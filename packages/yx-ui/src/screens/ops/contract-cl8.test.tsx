import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ClientEstablishmentsScreen, ClientPacksScreen, OwnLicencesScreen, type ClientPacksData, type ClientSitesData, type LiveClientPacks, type LiveClientSites, type LiveOwnLicences, type OwnLicencesData } from './contract';

// CL-8 (CLB-06 … 08, answers 638, 639): we are the contractor. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const sitesData = (over: Partial<ClientSitesData> = {}): ClientSitesData => ({
  canManage: true,
  clients: [{ id: 'c1', name: 'Nilgiri Pharma Ltd' }],
  sites: [
    { id: 's1', clientId: 'c1', client: 'Nilgiri Pharma Ltd', site: 'Ambattur unit', principal: 'Nilgiri Pharma Ltd', registrationNo: 'TN/OSH/REG/2025/77410', state: 'IN-TN', address: null, packChannel: 'Client vendor portal', packDueDay: 10, deployed: 50, max: 50, licenceNo: 'TN/1' },
    { id: 's2', clientId: 'c1', client: 'Nilgiri Pharma Ltd', site: 'Kochi warehouse', principal: 'Nilgiri Pharma Ltd', registrationNo: 'KL/1', state: 'IN-KL', address: null, packChannel: 'Email', packDueDay: 15, deployed: 0, max: 0, licenceNo: null },
  ],
  ...over,
});
const sitesLive = (over: Partial<LiveClientSites> = {}): LiveClientSites => ({ state: 'ready', onRetry: vi.fn(), data: sitesData(), onAdd: vi.fn(async () => undefined), ...over });

describe('CLB-06 client establishments (live)', () => {
  it('lists the sites with the registration and licence use; adds a site', async () => {
    const l = sitesLive();
    show(<ClientEstablishmentsScreen clients={[]} live={l} />);
    expect(screen.getByText('TN/OSH/REG/2025/77410')).toBeInTheDocument();
    expect(screen.getByText('No licence covers this site')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add client site' }));
    await ue.type(screen.getByRole('textbox', { name: /^Site/ }), 'Hosur unit');
    await ue.click(screen.getByRole('combobox', { name: /State/ }));
    await ue.click(await screen.findByRole('option', { name: 'Tamil Nadu' }));
    await ue.type(screen.getByRole('textbox', { name: /^Principal employer/ }), 'Nilgiri Pharma Ltd');
    await ue.type(screen.getByRole('textbox', { name: /^Principal registration/ }), 'TN/OSH/REG/2026/1');
    await ue.type(screen.getByRole('textbox', { name: /^Pack goes to/ }), 'Vendor portal');
    await ue.click(screen.getByRole('button', { name: 'Add site' }));
    await waitFor(() => expect(l.onAdd).toHaveBeenCalledWith({ clientId: 'c1', name: 'Hosur unit', state: 'IN-TN', principalName: 'Nilgiri Pharma Ltd', registrationNo: 'TN/OSH/REG/2026/1', packChannel: 'Vendor portal', packDueDay: 10 }));
  });

  it('negative: an empty form says what is missing and sends nothing; a viewer has no add', async () => {
    const l = sitesLive();
    const { unmount } = show(<ClientEstablishmentsScreen clients={[]} live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Add client site' }));
    await ue.click(screen.getByRole('button', { name: 'Add site' }));
    expect(await screen.findByText('Give the client’s registration number for this site.')).toBeInTheDocument();
    expect(l.onAdd).not.toHaveBeenCalled();
    unmount();
    show(<ClientEstablishmentsScreen clients={[]} live={sitesLive({ data: sitesData({ canManage: false }) })} />);
    expect(screen.queryByRole('button', { name: 'Add client site' })).toBeNull();
  });
});

const licData = (over: Partial<OwnLicencesData> = {}): OwnLicencesData => ({
  canManage: true,
  today: '2026-11-11',
  entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd' }],
  sites: [{ value: 's1', label: 'Ambattur unit', state: 'IN-TN' }],
  licences: [{ id: 'l1', licenceNo: 'TN/OSH/CL/2026/2211', scope: 'Security guards', clientSiteId: 's1', site: 'Ambattur unit', states: ['IN-TN'], maxWorkers: 50, deployed: 50, validFrom: '2026-01-01', validTo: '2026-11-30', authority: 'Joint Commissioner', entity: 'Kaveri Foods Pvt Ltd' }],
  ...over,
});
const licLive = (over: Partial<LiveOwnLicences> = {}): LiveOwnLicences => ({ state: 'ready', onRetry: vi.fn(), data: licData(), onAdd: vi.fn(async () => undefined), ...over });

describe('CLB-07 own licences (live)', () => {
  it('shows use against the maximum; a renewal opens the add drawer for the same site, and needs the copy (negative)', async () => {
    const l = licLive();
    show(<OwnLicencesScreen licences={[]} today={new Date()} live={l} />);
    expect(screen.getByText('TN/OSH/CL/2026/2211')).toBeInTheDocument();
    expect(screen.getByText('50 of 50')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Start renewal' }));
    await ue.click(screen.getAllByRole('button', { name: 'Add licence' }).at(-1)!);
    expect(await screen.findByText('Attach a copy of the licence.')).toBeInTheDocument();
    expect(screen.queryByText('Choose the client site.')).toBeNull();
    expect(l.onAdd).not.toHaveBeenCalled();
  });

  it('negative: a viewer sees no add or renewal', () => {
    show(<OwnLicencesScreen licences={[]} today={new Date()} live={licLive({ data: licData({ canManage: false }) })} />);
    expect(screen.queryByRole('button', { name: 'Add licence' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start renewal' })).toBeNull();
  });
});

const packData = (over: Partial<ClientPacksData> = {}): ClientPacksData => ({
  canManage: true,
  today: '2026-11-11',
  sites: [{ value: 's1', label: 'Nilgiri Pharma Ltd · Ambattur unit' }],
  packs: [
    { id: 'p1', client: 'Nilgiri Pharma Ltd', site: 'Ambattur unit', clientSiteId: 's1', month: '2026-10', employees: 3, due: '2026-11-10', channel: 'Vendor portal', status: 'Overdue', uploadedOn: null, reference: null, version: 1, missing: ['ESI challan'], challans: true },
    { id: 'p2', client: 'Nilgiri Pharma Ltd', site: 'Ambattur unit', clientSiteId: 's1', month: '2026-09', employees: 3, due: '2026-10-10', channel: 'Vendor portal', status: 'Uploaded', uploadedOn: '2026-10-08', reference: 'NPL/1', version: 1, missing: [], challans: true },
  ],
  ...over,
});
const packLive = (over: Partial<LiveClientPacks> = {}): LiveClientPacks => ({
  state: 'ready',
  onRetry: vi.fn(),
  data: packData(),
  months: [{ value: '2026-10', label: 'Oct 2026' }, { value: '2026-09', label: 'Sep 2026' }],
  onMake: vi.fn(async () => undefined),
  onDownload: vi.fn(async () => undefined),
  onUpload: vi.fn(async () => undefined),
  onAcknowledge: vi.fn(async () => undefined),
  ...over,
});

describe('CLB-08 client packs (live)', () => {
  it('flags the overdue pack; download goes to the pack; acceptance needs the file (negative)', async () => {
    const l = packLive();
    show(<ClientPacksScreen packs={[]} live={l} />);
    expect(screen.getByText(/1 pack is overdue/)).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Download pack' })[0]!);
    await waitFor(() => expect(l.onDownload).toHaveBeenCalledWith('p1'));
    await ue.click(screen.getByRole('button', { name: 'Record acceptance' }));
    await ue.click(screen.getByRole('button', { name: 'Save acceptance' }));
    expect(await screen.findByText('Attach the client’s acknowledgement.')).toBeInTheDocument();
    expect(l.onAcknowledge).not.toHaveBeenCalled();
  });

  it('821: the challans are listed; a statute not filed yet is named (only on that pack)', () => {
    show(<ClientPacksScreen packs={[]} live={packLive()} />);
    expect(screen.getAllByText('PF and ESI challans')).toHaveLength(2);
    expect(screen.getAllByText('Not filed yet: ESI challan')).toHaveLength(1);
  });

  it('a remake of an existing month needs a reason (negative), then goes through', async () => {
    const l = packLive();
    show(<ClientPacksScreen packs={[]} live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Make pack' }));
    await ue.click(screen.getAllByRole('button', { name: 'Make pack' }).at(-1)!);
    expect(await screen.findByText('Say why a new version is needed.')).toBeInTheDocument();
    expect(l.onMake).not.toHaveBeenCalled();
    await ue.type(screen.getByLabelText(/Why a new version/), 'Attendance corrected');
    await ue.click(screen.getAllByRole('button', { name: 'Make pack' }).at(-1)!);
    await waitFor(() => expect(l.onMake).toHaveBeenCalledWith('s1', '2026-10', 'Attendance corrected'));
  });

  it('negative: the upload needs a day and reference; a viewer cannot record or make', async () => {
    const l = packLive();
    const { unmount } = show(<ClientPacksScreen packs={[]} live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Record upload' }));
    await ue.click(screen.getByRole('button', { name: 'Save upload' }));
    expect(await screen.findByText('Give the portal’s reference.')).toBeInTheDocument();
    expect(l.onUpload).not.toHaveBeenCalled();
    unmount();
    show(<ClientPacksScreen packs={[]} live={packLive({ data: packData({ canManage: false }) })} />);
    expect(screen.queryByRole('button', { name: 'Record upload' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make pack' })).toBeNull();
  });
});
