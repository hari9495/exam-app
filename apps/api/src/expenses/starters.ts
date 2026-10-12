// YukthiX expense starters (M05-BUILD-DESIGN §6.2; D17 pattern: copied into the company, labelled, never overwritten).
// Example values in our own words that a company replaces; not taken from any vendor. The blocked-credit keys name the
// kinds of spend the CGST Act blocks input credit for (P07 India pack, verify flag until the compliance owner signs).

export interface StarterCategory {
  key: string;
  code: string;
  name: string;
  kind: 'spend' | 'mileage' | 'per_diem' | 'company_paid_only';
  receiptAbove: string | null;
  gstEligible: boolean;
  itcBlockedReason: string | null;
  taxable: 'never' | 'always' | 'above_limit';
}

export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  { key: 'cat_air', code: 'air', name: 'Air travel', kind: 'spend', receiptAbove: '500', gstEligible: true, itcBlockedReason: null, taxable: 'never' },
  { key: 'cat_rail', code: 'rail', name: 'Rail travel', kind: 'spend', receiptAbove: '500', gstEligible: true, itcBlockedReason: null, taxable: 'never' },
  { key: 'cat_local', code: 'local_conveyance', name: 'Cab and local travel', kind: 'spend', receiptAbove: '500', gstEligible: true, itcBlockedReason: 'rent_a_cab', taxable: 'never' },
  { key: 'cat_lodging', code: 'lodging', name: 'Hotel and lodging', kind: 'spend', receiptAbove: '500', gstEligible: true, itcBlockedReason: null, taxable: 'never' },
  { key: 'cat_meals', code: 'meals', name: 'Meals', kind: 'spend', receiptAbove: '500', gstEligible: true, itcBlockedReason: 'food_beverages', taxable: 'never' },
  { key: 'cat_mileage', code: 'mileage', name: 'Mileage (own vehicle)', kind: 'mileage', receiptAbove: null, gstEligible: false, itcBlockedReason: null, taxable: 'never' },
  { key: 'cat_per_diem', code: 'per_diem', name: 'Per diem', kind: 'per_diem', receiptAbove: null, gstEligible: false, itcBlockedReason: null, taxable: 'above_limit' },
  { key: 'cat_phone', code: 'phone_internet', name: 'Phone and internet', kind: 'spend', receiptAbove: '500', gstEligible: true, itcBlockedReason: null, taxable: 'never' },
  { key: 'cat_client', code: 'client_entertainment', name: 'Client entertainment', kind: 'spend', receiptAbove: null, gstEligible: true, itcBlockedReason: 'food_beverages', taxable: 'never' },
  { key: 'cat_visa', code: 'visa_fees', name: 'Visa and fees', kind: 'spend', receiptAbove: '500', gstEligible: false, itcBlockedReason: null, taxable: 'never' },
  { key: 'cat_other', code: 'other', name: 'Other', kind: 'spend', receiptAbove: '500', gstEligible: false, itcBlockedReason: null, taxable: 'never' },
];

export interface StarterTier {
  key: string;
  name: string;
  rank: number;
  country: string | null;
  cities: string[];
}

/** Tier 3 has no list: every other Indian city. International: any city outside India. */
export const STARTER_TIERS: readonly StarterTier[] = [
  { key: 'tier_1', name: 'Tier 1', rank: 1, country: 'IN', cities: ['Mumbai', 'Delhi', 'New Delhi', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad'] },
  { key: 'tier_2', name: 'Tier 2', rank: 2, country: 'IN', cities: ['Jaipur', 'Lucknow', 'Kochi', 'Coimbatore', 'Indore', 'Nagpur', 'Chandigarh', 'Bhubaneswar', 'Visakhapatnam', 'Surat', 'Mysuru', 'Thiruvananthapuram'] },
  { key: 'tier_3', name: 'Tier 3', rank: 3, country: 'IN', cities: [] },
  { key: 'tier_intl', name: 'International', rank: 9, country: null, cities: [] },
];

/** One company-wide starter policy; a company copies it and narrows the copies to grade bands with "Applies to". */
type Cell = { perLine?: string; perDay?: string; perMonth?: string; block?: boolean };
export const STARTER_POLICY = {
  key: 'policy_standard',
  name: 'Standard',
  // category code → tier starter key (or '*' for any tier) → limits
  cells: {
    air: { '*': {} },
    rail: { '*': {} },
    local_conveyance: { tier_1: { perDay: '1500' }, tier_2: { perDay: '1000' }, tier_3: { perDay: '800' }, tier_intl: { perDay: '3000' } },
    lodging: { tier_1: { perLine: '5000' }, tier_2: { perLine: '3500' }, tier_3: { perLine: '2500' }, tier_intl: { perLine: '15000' } },
    meals: { tier_1: { perDay: '1000' }, tier_2: { perDay: '800' }, tier_3: { perDay: '600' }, tier_intl: { perDay: '2500' } },
    mileage: { '*': {} },
    per_diem: { '*': {} },
    phone_internet: { '*': { perMonth: '1500' } },
    client_entertainment: { '*': { perLine: '5000', block: true } },
    visa_fees: { '*': {} },
    other: { '*': { perLine: '2000' } },
  } as Record<string, Record<string, Cell>>,
};

export const STARTER_MILEAGE = [
  { vehicle: 'car', ratePerKm: '17' },
  { vehicle: 'two_wheeler', ratePerKm: '7' },
] as const;

export const STARTER_PER_DIEM = [
  { tier: 'tier_1', ratePerDay: '1200' },
  { tier: 'tier_2', ratePerDay: '1000' },
  { tier: 'tier_3', ratePerDay: '800' },
] as const;
export const STARTER_MEALS_DEDUCTION = { breakfast: 0.2, lunch: 0.3, dinner: 0.3 };
