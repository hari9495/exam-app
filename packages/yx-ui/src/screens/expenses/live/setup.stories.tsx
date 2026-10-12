import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExpenseSetupScreen, type ExpenseSetupScreenProps } from './setup';
import type { ExpenseCategory, PolicyRule } from './types';

// Settings › Expenses, wired (batch E1). In the affordance guard set ('screens-expenses-live').
const meta: Meta = { title: 'Screens/Expenses/Live · Expense set-up', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const cat = (code: string, name: string, o: Partial<ExpenseCategory> = {}): ExpenseCategory => ({ id: `c-${code}`, code, name, kind: 'spend', receiptAbove: '500', gstEligible: true, itcBlockedReason: null, taxable: 'never', ledgerCode: '6100', active: true, version: 1, ...o });
const rule = (o: Partial<PolicyRule>): PolicyRule => ({ categoryCode: 'lodging', tierId: null, perLine: null, perDay: null, perTrip: null, perMonth: null, overLimit: 'justify_and_approve', ...o });
const BASE: ExpenseSetupScreenProps = {
  state: 'ready',
  check: { ready: false, problems: [{ key: 'no_ledger_code', text: '2 categories have no ledger code, so their journal lines cannot be posted.', count: 2 }] },
  categories: [cat('lodging', 'Hotel and lodging'), cat('meals', 'Meals', { itcBlockedReason: 'food_beverages', ledgerCode: null }), cat('air', 'Air travel'), cat('mileage', 'Mileage (own vehicle)', { kind: 'mileage', receiptAbove: null, gstEligible: false, ledgerCode: null })],
  tiers: [
    { id: 't1', name: 'Tier 1', rank: 1, country: 'IN', cities: ['Mumbai', 'Delhi', 'Bengaluru'], active: true, version: 1 },
    { id: 't2', name: 'Tier 2', rank: 2, country: 'IN', cities: ['Jaipur', 'Kochi'], active: true, version: 1 },
    { id: 't3', name: 'Tier 3', rank: 3, country: 'IN', cities: [], active: true, version: 1 },
  ],
  policies: {
    policies: [{ id: 'p1', name: 'Standard', appliesIf: null, priority: 1000, validFrom: '2026-04-01', validTo: null, status: 'active', version: 1, rules: [rule({ tierId: 't1', perLine: '5000.00' }), rule({ tierId: 't2', perLine: '3500.00' }), rule({ tierId: 't3', perLine: '2500.00' }), rule({ categoryCode: 'meals', perDay: '800.00' }), rule({ categoryCode: 'air' }), rule({ categoryCode: 'mileage' })] }],
    fields: [{ key: 'grade_id', label: 'Grade', type: 'choice', options: [{ value: 'g1', label: 'G1' }, { value: 'g5', label: 'G5' }] }],
    today: '2026-10-12',
  },
  rates: { mileage: [{ id: 'm1', vehicle: 'car', ratePerKm: '17.00', currency: 'INR', monthlyKmCap: null, validFrom: '2026-04-01', validTo: null }], perDiem: [{ id: 'd1', tierId: 't1', country: null, ratePerDay: '1200.00', currency: 'INR', partialDayRule: 'half_after_hours', validFrom: '2026-04-01', validTo: null }] },
  gst: [{ id: 'g1', legalEntityId: 'e1', state: '29', gstin: '29AAPFU0939F1ZT', validFrom: '2026-04-01', validTo: null }],
  entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd' }],
  onUseStarters: ok,
  onSaveCategory: ok,
  onSaveTier: ok,
  onSavePolicy: ok,
  onAddMileage: ok,
  onAddPerDiem: ok,
  onAddGst: ok,
  onEndGst: ok,
};

export const Limits: S = { name: 'Limits matrix (in force)', render: () => <ExpenseSetupScreen {...BASE} /> };
export const Starters: S = { name: 'New company · starters', render: () => <ExpenseSetupScreen {...BASE} categories={[]} /> };
export const WithExchangeRates: S = { name: 'With the exchange-rate table (E5)', render: () => <ExpenseSetupScreen {...BASE} payCurrency="INR" fxRates={[{ id: 'x1', source: 'company', base: 'AED', quote: 'INR', rateDate: '2026-10-01', rate: '22.75000000' }]} onAddFxRate={ok} /> };
