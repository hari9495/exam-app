import type { CountryPack, CountrySetup, TranslationList } from './types';

// Story and test data for the G1 screens, in the Kaveri Foods story world.

export const INDIA: CountryPack = {
  country: 'IN',
  name: 'India',
  version: '2026-v1',
  verify: true,
  currency: 'INR',
  fyStartMonth: 4,
  dataRegion: 'IN',
  normalWeekHours: '48',
  languages: ['en', 'hi', 'ta', 'te'],
  entityIds: [
    { key: 'pan', required: true },
    { key: 'tan', required: true },
  ],
  registrations: ['IN.PF', 'IN.ESI', 'IN.PT', 'IN.LWF'],
};

export const SETUP_DONE: CountrySetup = {
  id: 'cs-kfpl',
  country: 'IN',
  countryName: 'India',
  legalEntity: { id: 'le-kfpl', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL' },
  status: 'done',
  version: 2,
  finishedAt: '2026-10-10T09:00:00.000Z',
  open: 2,
  checklist: [
    { key: 'entity', label: 'Legal entity created', done: true, href: '/yx/settings/legal-entities' },
    { key: 'id:pan', label: 'PAN on file', done: true, href: '/yx/settings/legal-entities' },
    { key: 'id:tan', label: 'TAN on file', done: true, href: '/yx/settings/legal-entities' },
    { key: 'reg:IN.PF', label: 'PF registration decided', done: true, href: '/yx/payroll/setup' },
    { key: 'reg:IN.ESI', label: 'ESI registration decided', done: true, href: '/yx/payroll/setup' },
    { key: 'reg:IN.PT', label: 'PT registration decided', done: false, href: '/yx/payroll/setup' },
    { key: 'reg:IN.LWF', label: 'LWF registration decided', done: false, href: '/yx/payroll/setup' },
    { key: 'location', label: 'At least one location', done: true, href: '/yx/settings/locations' },
    { key: 'holidays', label: 'A holiday calendar', done: true, href: '/yx/time/setup' },
    { key: 'leave', label: 'A leave policy for its people', done: true, href: '/yx/time/setup' },
  ],
};

export const SETUP_NEW: CountrySetup = {
  id: 'cs-new',
  country: 'IN',
  countryName: 'India',
  legalEntity: null,
  status: 'in_progress',
  version: 1,
  finishedAt: null,
  open: 1,
  checklist: [{ key: 'entity', label: 'Create or choose the legal entity', done: false, href: '/yx/settings/countries' }],
};

export const TRANSLATIONS: TranslationList = {
  subjectType: 'leave_type',
  companyLanguage: 'en',
  languages: ['hi', 'ta', 'te'],
  items: [
    { id: 'lt-el', name: 'Earned leave', translations: { hi: 'अर्जित अवकाश', ta: 'ஈட்டிய விடுப்பு' } },
    { id: 'lt-sl', name: 'Sick leave', translations: {} },
  ],
};
