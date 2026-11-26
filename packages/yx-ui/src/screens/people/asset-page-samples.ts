import type { AssetPageData, LiveAssetPage } from './asset-page';

// The asset page's sample data (stories and tests).
export const ASSET_PAGE: AssetPageData = {
  today: '2026-11-26',
  canManage: true,
  asset: {
    id: 'a1',
    category: 'Laptop',
    name: 'Dell Latitude 5440',
    tag: 'LT-0418',
    serial: '7QK2X93',
    maker: 'Dell',
    model: 'Latitude 5440 (i5, 16 GB)',
    status: 'assigned',
    legalEntityId: 'e1',
    locationId: 'l1',
    legalEntity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)',
    location: 'Hosur plant',
    purchasedOn: '2025-08-14',
    cost: '84500.00',
    netBookValue: '48340.33',
    depreciation: 'Straight line over 3 years',
    invoiceNumber: 'DL/25-26/1187',
    warrantyMonths: 36,
    warrantyEndsOn: '2028-08-14',
    supplierId: 's1',
    supplier: 'Dell India Pvt Ltd',
    version: 4,
  },
  holder: { name: 'Arjun Nair', issuedOn: '2026-09-02', acknowledged: true },
  history: [
    { id: 'h5', at: '2026-09-02T11:20:00.000Z', who: 'Arjun Nair', what: 'confirmed they received it' },
    { id: 'h4', at: '2026-09-02', who: 'Prakash Rao', what: 'issued it to Arjun Nair (New)' },
    { id: 'h3', at: '2026-08-30', who: 'Prakash Rao', what: 'took it back from Meera Iyer (Good)' },
    { id: 'h2', at: '2025-08-20', who: 'Prakash Rao', what: 'issued it to Meera Iyer (New)' },
    { id: 'h1', at: '2025-08-14T09:05:00.000Z', who: 'Prakash Rao', what: 'added the asset' },
  ],
  // Answer 2717: one AMC covers it.
  contracts: [{ id: 'k1', kind: 'amc', number: 'AMC-2026-014', supplier: 'Dell India Pvt Ltd', endsOn: '2026-12-31', renewal: 'tacit', status: 'active' }],
  // Answer 2722: three tickets about it; this viewer is an agent of the IT desk that holds two.
  tickets: {
    count: 3,
    rows: [
      { id: 't2', number: 'IT-1042', subject: 'Battery drains in two hours', state: 'open', raisedAt: '2026-11-18T06:40:00.000Z' },
      { id: 't1', number: 'IT-0977', subject: 'Screen flickers after waking up', state: 'resolved', raisedAt: '2026-10-02T04:15:00.000Z' },
    ],
  },
};

export const liveAssetPage = (over: Partial<LiveAssetPage> = {}): LiveAssetPage => ({ state: 'ready', onRetry: () => {}, data: ASSET_PAGE, onBack: () => {}, onSave: () => Promise.resolve({ id: 'a1' }), ...over });
