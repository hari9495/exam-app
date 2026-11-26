import type { LiveSuppliers, SupplierRow } from './asset-suppliers';

// IT assets part 3 sample data (stories and tests): the IT and Admin supplier list (answer 2716).
export const SUPPLIERS: SupplierRow[] = [
  { id: 's1', name: 'Dell India Pvt Ltd', gstin: '29AABCD1234E1Z5', contacts: [{ name: 'Suresh Kumar', email: 'suresh.kumar@dell.example', phone: '+91 98450 12345' }, { name: 'Service desk', email: 'service@dell.example', phone: '1800 425 4026' }], notes: 'Laptops and their on-site service.', retired: false, assets: 42, version: 3 },
  { id: 's2', name: 'Redington Ltd', gstin: '33AABCR5678K1Z2', contacts: [{ name: 'Lakshmi Narayanan', email: 'lakshmi.n@redington.example', phone: null }], notes: null, retired: false, assets: 17, version: 1 },
  { id: 's3', name: 'Hosur Office Supplies', gstin: null, contacts: [], notes: 'Chairs and printers for the plant office.', retired: false, assets: 6, version: 1 },
  { id: 's4', name: 'Old Copier Co', gstin: null, contacts: [{ name: 'Rafiq', email: null, phone: '044 2345 6789' }], notes: null, retired: true, assets: 2, version: 2 },
];

export const liveSuppliers = (over: Partial<LiveSuppliers> = {}): LiveSuppliers => ({ state: 'ready', onRetry: () => {}, rows: SUPPLIERS, canManage: true, onSave: () => Promise.resolve({ id: 's9' }), ...over });
