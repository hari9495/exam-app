// Story and test data in the YukthiX story world (review/RULES.md "Data facts"): Kaveri Foods, fictional
// identifiers, documentation IP ranges. TODAY is 29 Sep 2026.
import type { CompanyRules, LegalEntity, MasterLists, OrgLocation, PayRange, StateOption } from './types';

export const TODAY_ISO = '2026-09-29';

export const STATES: StateOption[] = [
  { code: 'IN-KA', name: 'Karnataka' },
  { code: 'IN-TN', name: 'Tamil Nadu' },
  { code: 'IN-MH', name: 'Maharashtra' },
];

export const ENTITIES: LegalEntity[] = [
  {
    id: 'le-kfpl',
    name: 'Kaveri Foods Pvt Ltd',
    shortName: 'KFPL',
    country: 'IN',
    currency: 'INR',
    fyStartMonth: 4,
    registeredAddress: { lines: ['14 Residency Road'], city: 'Bengaluru', state: 'IN-KA', postalCode: '560025', country: 'IN' },
    dataRegion: 'IN',
    isDefault: true,
    archivedAt: null,
    statutory: { pan: true, tan: true, gstin: true, cin: true },
  },
  {
    id: 'le-tn',
    name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)',
    shortName: 'KFPL-TN',
    country: 'IN',
    currency: 'INR',
    fyStartMonth: 4,
    registeredAddress: { lines: ['22 SIPCOT Industrial Complex'], city: 'Hosur', state: 'IN-TN', postalCode: '635126', country: 'IN' },
    dataRegion: 'IN',
    isDefault: false,
    archivedAt: null,
    statutory: { pan: true, tan: true, gstin: true, cin: false },
  },
  {
    id: 'le-old',
    name: 'Kaveri Agro Traders LLP',
    shortName: 'KAT',
    country: 'IN',
    currency: 'INR',
    fyStartMonth: 4,
    registeredAddress: null,
    dataRegion: 'IN',
    isDefault: false,
    archivedAt: '2026-03-31T18:30:00Z',
    statutory: { pan: false, tan: false, gstin: false, cin: false },
  },
];

export const RULES: CompanyRules = {
  employeeCodeScope: { value: 'legal_entity', source: 'default' },
  defaultOwnership: { value: 'shared', source: 'company' },
};

const loc = (id: string, legalEntityId: string, name: string, code: string, city: string, state: string, postalCode: string, line: string, geofence: OrgLocation['geofence'], ipRanges: string[], archivedAt: string | null = null): OrgLocation => ({
  id,
  legalEntityId,
  name,
  code,
  address: { lines: [line], city, state, postalCode, country: 'IN' },
  state,
  timezone: 'Asia/Kolkata',
  minWageZone: null,
  geofence,
  ipRanges,
  archivedAt,
});

export const LOCATIONS: OrgLocation[] = [
  loc('loc-blr', 'le-kfpl', 'Bengaluru head office', 'BLR-HO', 'Bengaluru', 'IN-KA', '560025', '14 Residency Road', { lat: 12.9716, lng: 77.5946, radiusM: 150 }, ['203.0.113.0/24']),
  loc('loc-maa', 'le-tn', 'Chennai office', 'MAA-OFF', 'Chennai', 'IN-TN', '600032', '5 Guindy Industrial Estate', { lat: 13.0067, lng: 80.2206, radiusM: 150 }, ['198.51.100.16/28']),
  loc('loc-hsr', 'le-tn', 'Hosur plant', 'HSR-PLT', 'Hosur', 'IN-TN', '635126', '22 SIPCOT Industrial Complex', { lat: 12.7409, lng: 77.8253, radiusM: 300 }, ['10.20.0.0/16']),
  loc('loc-mys', 'le-kfpl', 'Mysuru depot', 'MYS-DEP', 'Mysuru', 'IN-KA', '570001', '3 Sayyaji Rao Road', null, [], '2026-06-30T18:30:00Z'),
];

export const MASTERS: MasterLists = {
  departments: [
    { id: 'd-ops', name: 'Operations', code: 'OPS', parentId: null, isDivision: true, ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
    { id: 'd-qa', name: 'Quality', code: 'QA', parentId: 'd-ops', isDivision: false, ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
    { id: 'd-prod', name: 'Production', code: 'PROD', parentId: 'd-ops', isDivision: false, ownerLegalEntityId: 'le-tn', appliesToEntities: [], archivedAt: null },
    { id: 'd-eng', name: 'Engineering', code: 'ENG', parentId: null, isDivision: false, ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
    { id: 'd-fin', name: 'Finance', code: 'FIN', parentId: null, isDivision: false, ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
    { id: 'd-ppl', name: 'People', code: 'PPL', parentId: null, isDivision: false, ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
    { id: 'd-sales', name: 'Sales', code: 'SALES', parentId: null, isDivision: true, ownerLegalEntityId: null, appliesToEntities: ['le-kfpl'], archivedAt: null },
  ],
  designations: [
    { id: 'g-ps', name: 'Production Supervisor', code: 'PROD-SUP', jobFamily: 'Operations', ownerLegalEntityId: 'le-tn', appliesToEntities: [], archivedAt: null },
    { id: 'g-sqa', name: 'Senior QA Engineer', code: 'SR-QA-ENG', jobFamily: 'Quality', ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
    { id: 'g-hrbp', name: 'HR Business Partner', code: 'HRBP', jobFamily: 'People', ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
  ],
  grades: [
    { id: 'gr-w1', name: 'W1 · Plant worker', code: 'W1', rank: 1, ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
    { id: 'gr-g3', name: 'G3 · Senior executive', code: 'G3', rank: 5, ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
    { id: 'gr-m1', name: 'M1 · Manager', code: 'M1', rank: 6, ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
  ],
  'employment-types': [
    { id: 't-perm', name: 'Permanent', code: 'PERM', category: 'permanent', ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
    { id: 't-ftc', name: 'Fixed-term (plant)', code: 'FTC-PLANT', category: 'fixed_term', ownerLegalEntityId: 'le-tn', appliesToEntities: [], archivedAt: null },
    { id: 't-appr', name: 'Graduate apprentice', code: 'APPR', category: 'apprentice', ownerLegalEntityId: null, appliesToEntities: [], archivedAt: null },
  ],
  'cost-centres': [
    { id: 'c-eng', name: 'Engineering Bengaluru', code: 'CC-BLR-ENG', legalEntityId: 'le-kfpl', parentId: null, archivedAt: null },
    { id: 'c-prd', name: 'Hosur production', code: 'CC-HSR-PRD', legalEntityId: 'le-tn', parentId: null, archivedAt: null },
    { id: 'c-qa', name: 'Hosur quality', code: 'CC-HSR-QA', legalEntityId: 'le-tn', parentId: 'c-prd', archivedAt: null },
  ],
};

export const PAY_RANGES: PayRange[] = [
  { id: 'pr-1', gradeId: 'gr-m1', legalEntityId: 'le-kfpl', currency: 'INR', min: '1000000', mid: '1400000', max: '1800000', validFrom: '2026-04-01', validTo: '2026-10-31' },
  { id: 'pr-2', gradeId: 'gr-m1', legalEntityId: 'le-kfpl', currency: 'INR', min: '1100000', mid: '1500000', max: '1900000', validFrom: '2026-11-01', validTo: null },
];
