import type { LiveSuppliers, SupplierRow } from './asset-suppliers';
import type { ContractRow, LiveContracts } from './asset-contracts';
import type { LicenceRow, LiveLicences } from './asset-licences';

// IT assets part 3 sample data (stories and tests): the IT and Admin supplier list (answer 2716).
export const SUPPLIERS: SupplierRow[] = [
  { id: 's1', name: 'Dell India Pvt Ltd', gstin: '29AABCD1234E1Z5', contacts: [{ name: 'Suresh Kumar', email: 'suresh.kumar@dell.example', phone: '+91 98450 12345' }, { name: 'Service desk', email: 'service@dell.example', phone: '1800 425 4026' }], notes: 'Laptops and their on-site service.', retired: false, assets: 42, version: 3 },
  { id: 's2', name: 'Redington Ltd', gstin: '33AABCR5678K1Z2', contacts: [{ name: 'Lakshmi Narayanan', email: 'lakshmi.n@redington.example', phone: null }], notes: null, retired: false, assets: 17, version: 1 },
  { id: 's3', name: 'Hosur Office Supplies', gstin: null, contacts: [], notes: 'Chairs and printers for the plant office.', retired: false, assets: 6, version: 1 },
  { id: 's4', name: 'Old Copier Co', gstin: null, contacts: [{ name: 'Rafiq', email: null, phone: '044 2345 6789' }], notes: null, retired: true, assets: 2, version: 2 },
];

export const liveSuppliers = (over: Partial<LiveSuppliers> = {}): LiveSuppliers => ({ state: 'ready', onRetry: () => {}, rows: SUPPLIERS, canManage: true, onSave: () => Promise.resolve({ id: 's9' }), ...over });

// Answer 2717: asset contracts on 26 Nov 2026 (the AMC is inside its notice window, answer 2714).
export const CONTRACTS_TODAY = '2026-11-26';
export const CONTRACTS: ContractRow[] = [
  { id: 'k1', kind: 'amc', number: 'AMC-2026-014', supplierId: 's1', supplier: 'Dell India Pvt Ltd', legalEntityId: 'e1', locationId: 'l1', place: 'Hosur plant', startsOn: '2026-01-01', months: 12, endsOn: '2026-12-31', noticeDays: 45, noticeOn: '2026-11-16', renewal: 'tacit', renewals: 0, supportHours: 'Mon to Sat, 9:00 to 18:00', value: '185000.00', assetCap: 50, assets: [{ id: 'a1', tag: 'LT-0418', name: 'Dell Latitude 5440', category: 'Laptop' }, { id: 'a2', tag: 'LT-0419', name: 'Dell Latitude 5440', category: 'Laptop' }], hiddenAssets: 1, status: 'active', canManage: true, version: 2 },
  { id: 'k2', kind: 'lease', number: 'RL/LEASE/88', supplierId: 's2', supplier: 'Redington Ltd', legalEntityId: null, locationId: null, place: null, startsOn: '2024-04-01', months: 12, endsOn: '2027-03-31', noticeDays: 30, noticeOn: '2027-03-01', renewal: 'tacit', renewals: 2, supportHours: '24 x 7', value: '640000.00', assetCap: null, assets: [{ id: 'a3', tag: 'PR-0007', name: 'HP LaserJet M404', category: 'Printer' }], hiddenAssets: 0, status: 'active', canManage: true, version: 4 },
  { id: 'k3', kind: 'support', number: 'SUP-2025-03', supplierId: 's3', supplier: 'Hosur Office Supplies', legalEntityId: 'e1', locationId: 'l1', place: 'Hosur plant', startsOn: '2025-06-01', months: 6, endsOn: '2025-11-30', noticeDays: 0, noticeOn: '2025-11-30', renewal: 'express', renewals: 0, supportHours: null, value: null, assetCap: 5, assets: [], hiddenAssets: 0, status: 'ended', canManage: true, version: 1 },
];

export const liveContracts = (over: Partial<LiveContracts> = {}): LiveContracts => ({
  state: 'ready',
  onRetry: () => {},
  today: CONTRACTS_TODAY,
  rows: CONTRACTS,
  money: true,
  canAdd: true,
  suppliers: [{ value: 's1', label: 'Dell India Pvt Ltd' }, { value: 's2', label: 'Redington Ltd' }],
  entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }],
  locations: [{ value: 'l1', label: 'Hosur plant', entityId: 'e1' }],
  assets: [{ value: 'a1', label: 'LT-0418 · Dell Latitude 5440' }, { value: 'a2', label: 'LT-0419 · Dell Latitude 5440' }, { value: 'a3', label: 'PR-0007 · HP LaserJet M404' }],
  onSave: () => Promise.resolve({ id: 'k9' }),
  onOpenAsset: () => {},
  ...over,
});

// Answer 2718: software licences on 26 Nov 2026 (one over quota, one with every seat in use, one expired).
export const LICENCES: LicenceRow[] = [
  { id: 'l1', software: 'Microsoft 365', softwareVersion: 'E3', supplierId: 's2', supplier: 'Redington Ltd', legalEntityId: null, locationId: null, place: null, seats: 3, used: 4, expiresOn: '2027-03-31', cost: '96000.00', allowOverQuota: true, holders: [{ seatId: 'q1', kind: 'person', name: 'Meera Iyer', tag: null, assetId: null, givenOn: '2026-04-01', leaving: false }, { seatId: 'q2', kind: 'person', name: 'Arjun Kulkarni', tag: null, assetId: null, givenOn: '2026-04-01', leaving: true }, { seatId: 'q3', kind: 'device', name: 'Dell Latitude 5440', tag: 'LT-0418', assetId: 'a1', givenOn: '2026-08-14', leaving: false }], hiddenSeats: 1, canManage: true, version: 3 },
  { id: 'l2', software: 'AutoCAD', softwareVersion: '2026', supplierId: 's1', supplier: 'Dell India Pvt Ltd', legalEntityId: 'e1', locationId: 'l1', place: 'Hosur plant', seats: 2, used: 2, expiresOn: '2026-12-15', cost: '310000.00', allowOverQuota: false, holders: [{ seatId: 'q4', kind: 'person', name: 'Kavya Reddy', tag: null, assetId: null, givenOn: '2026-01-10', leaving: false }, { seatId: 'q5', kind: 'device', name: 'Dell Latitude 5440', tag: 'LT-0419', assetId: 'a2', givenOn: '2026-01-10', leaving: false }], hiddenSeats: 0, canManage: true, version: 1 },
  { id: 'l3', software: 'Tally Prime', softwareVersion: null, supplierId: null, supplier: null, legalEntityId: 'e1', locationId: null, place: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', seats: 5, used: 1, expiresOn: null, cost: '54000.00', allowOverQuota: false, holders: [{ seatId: 'q6', kind: 'person', name: 'Meera Iyer', tag: null, assetId: null, givenOn: '2025-06-01', leaving: false }], hiddenSeats: 0, canManage: true, version: 1 },
  { id: 'l4', software: 'Adobe Acrobat Pro', softwareVersion: '2024', supplierId: 's2', supplier: 'Redington Ltd', legalEntityId: 'e1', locationId: 'l1', place: 'Hosur plant', seats: 10, used: 0, expiresOn: '2026-10-31', cost: null, allowOverQuota: false, holders: [], hiddenSeats: 0, canManage: true, version: 2 },
];

export const liveLicences = (over: Partial<LiveLicences> = {}): LiveLicences => ({
  state: 'ready',
  onRetry: () => {},
  today: CONTRACTS_TODAY,
  rows: LICENCES,
  money: true,
  canAdd: true,
  suppliers: [{ value: 's1', label: 'Dell India Pvt Ltd' }, { value: 's2', label: 'Redington Ltd' }],
  entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }],
  locations: [{ value: 'l1', label: 'Hosur plant', entityId: 'e1' }],
  people: [{ value: 'p1', label: 'Meera Iyer' }, { value: 'p3', label: 'Kavya Reddy' }],
  devices: [{ value: 'a1', label: 'LT-0418 · Dell Latitude 5440' }, { value: 'a2', label: 'LT-0419 · Dell Latitude 5440' }],
  onSave: () => Promise.resolve({ id: 'l9' }),
  onGiveSeat: () => Promise.resolve({ id: 'q9' }),
  onFreeSeat: () => Promise.resolve({ ok: true }),
  onOpenAsset: () => {},
  ...over,
});
