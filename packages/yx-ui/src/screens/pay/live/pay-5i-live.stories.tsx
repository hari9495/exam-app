import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActuarialScreen, CountryPacksScreen, EquityScreen, EwaAdminScreen, MyEquityScreen, MyEwaScreen, MyIncentivesScreen, SpecialPayScreen } from './special';
import { ENTITIES } from './fixtures-ops';
import type { EquityOverview, GrantView, SpecialPosting } from './types-5i';

// Batch 5i screens with sample data (the affordance guard opens these in light and dark).
const ok = async () => ({}) as never;
const meta: Meta = { title: 'Screens/Pay/Live 5i', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const nameOf = (id: string) => ({ p1: 'Lakshmi Devi', p2: 'Ravi Kumar' })[id] ?? 'Someone';
const search = async () => [{ id: 'p1', name: 'Lakshmi Devi', employeeCode: 'GW-014' }];

const POSTINGS: SpecialPosting[] = [
  { id: 'sp1', kind: 'piece', month: '2026-10', sourceRef: 'piece:e1:2026-10', lines: [{ employeeId: 'p1', componentCode: 'piece_pay', amount: '14250.00', label: 'Piece-rate pay for 24 days in 2026-10.' }, { employeeId: 'p2', componentCode: 'min_wage_topup', amount: '610.00', label: 'Top-up to the minimum wage.' }], total: '14860.00', status: 'pending', madeByMe: true, createdAt: '2026-10-12T05:00:00.000Z' },
  { id: 'sp2', kind: 'union', month: '2026-10', sourceRef: 'union:e1:2026-10', lines: [{ employeeId: 'p1', componentCode: 'union_dues', amount: '50.00', label: 'Garment Workers Union dues.' }], total: '50.00', status: 'approved', madeByMe: false, createdAt: '2026-10-10T05:00:00.000Z' },
];
const special = {
  state: 'ready' as const,
  entities: ENTITIES,
  entityId: 'e1',
  onEntity: () => undefined,
  month: '2026-10',
  onMonth: () => undefined,
  locations: [{ id: 'l1', name: 'Peenya unit' }],
  nameOf,
  onSearch: search,
  postings: POSTINGS,
  cards: [{ id: 'c1', operationCode: 'STITCH', name: 'Stitch a shirt', unit: 'piece', rate: '2.5000', validFrom: '2026-04-01', validTo: null }],
  plans: [{ id: 'pl1', name: 'South sales 2026-27', kind: 'sales' as const, metric: 'sales value', targetAmount: '20000.00', tiers: [{ from: 0, multiplier: 1 }, { from: 100, multiplier: 1.5 }], capPercent: '200', clawbackDays: 90, status: 'active' }],
  unions: { unions: [{ id: 'u1', name: 'Garment Workers Union', registrationNo: 'KA-123', members: 212 }], authorisations: [], settlements: [{ id: 's1', unionId: 'u1', title: '2026 wage settlement', effectiveFrom: '2026-04-01', signedOn: '2026-09-20', rates: [{ category: 'skilled', monthlyIncrease: '1500' }, { category: 'unskilled', monthlyIncrease: '1200' }] }] },
  oncallRules: [{ id: 'r1', name: 'Maintenance on-call', standbyAmount: '500.00', calloutMinHours: '3', calloutRate: '200.00', multiplier: '1.5' }],
  onAddCard: ok,
  onSaveOutput: ok,
  onImportOutputs: ok,
  onAddPlan: ok,
  onSaveResult: ok,
  onAddPool: async () => ({ id: 'tp1' }),
  onAddRule: ok,
  onAddSlot: ok,
  onAddUnion: ok,
  onAuthorise: ok,
  onLayoff: ok,
  onVrs: ok,
  onPost: ok,
};

export const SpecialPay: S = { name: 'PAY-31 · Special pay', render: () => <SpecialPayScreen {...special} /> };

export const MyIncentives: S = {
  name: 'PAY-33 · My incentive statement',
  render: () => <MyIncentivesScreen data={{ results: [{ id: 'r1', plan: 'South sales 2026-27', month: '2026-09', quota: '100000.00', actual: '120000.00', amount: '26000.00', sentToPayroll: true, workings: { attainment: '120.00' } }], clawbacks: [{ id: 'k1', month: '2026-10', amount: '2000.00', reason: 'Order 4471 cancelled within 90 days' }] }} />,
};

export const EwaAdmin: S = {
  name: 'PAY-27 · EWA admin',
  render: () => (
    <EwaAdminScreen
      state="ready"
      entities={ENTITIES}
      entityId="e1"
      onEntity={() => undefined}
      month="2026-10"
      onMonth={() => undefined}
      nameOf={nameOf}
      policies={[{ id: 'ep1', validFrom: '2026-10-01', enabled: true, percentAvailable: '50', minAmount: '500.00', maxAmount: '20000.00', drawsPerMonth: 3, blackoutDays: 3, fee: '49.00', feePayer: 'employee' }]}
      draws={[{ id: 'd1', employeeId: 'p1', month: '2026-10', available: '6000.00', amount: '5000.00', fee: '49.00', feePayer: 'employee', status: 'requested', paidRef: null, failureReason: null, createdAt: '2026-10-12T05:00:00.000Z' }]}
      onPolicy={ok}
      onPaid={ok}
      onFailed={ok}
    />
  ),
};

export const MyEwa: S = {
  name: 'PAY-26 · Earned wage access',
  render: () => <MyEwaScreen data={{ open: true, reasons: [], policy: { minAmount: '500.00', maxAmount: '20000.00', fee: '49.00', feePayer: 'employee', drawsPerMonth: 3 }, quote: { expectedNet: '30000.00', payableDays: '12.00', monthDays: 30, drawn: '0.00', deductionsDue: '0.00', earned: '12000.00', available: '6000' }, draws: [] }} onDraw={ok} />,
};

const GRANT: GrantView = {
  id: 'g1',
  planId: 'pl1',
  employeeId: 'p1',
  grantedOn: '2024-10-01',
  units: 800,
  exercisePrice: '100.0000',
  status: 'active',
  vested: 400,
  unvested: 400,
  lapsed: 0,
  exercised: 100,
  exercisable: 300,
  events: [
    { id: 'v1', vestOn: '2025-10-01', units: 200, kind: 'time', milestone: null, state: 'vested' },
    { id: 'v2', vestOn: '2026-10-01', units: 200, kind: 'time', milestone: null, state: 'vested' },
    { id: 'v3', vestOn: '2024-10-01', units: 400, kind: 'milestone', milestone: 'Series B closes', state: 'scheduled' },
  ],
  exercises: [{ id: 'x1', exercisedOn: '2026-10-05', units: 100, pricePayable: '10000.00', fmv: '250.0000', perquisite: '15000.00', status: 'approved', paymentRef: null }],
  plan: { name: 'ESOP 2024', kind: 'ESOP', exitWindowDays: 90 },
};
const EQUITY: EquityOverview = { plans: [{ id: 'pl1', name: 'ESOP 2024', kind: 'ESOP', poolUnits: 1000, granted: 800, available: 200, exitWindowDays: 90, status: 'active' }], valuations: [{ id: 'va1', valuedOn: '2026-09-01', fmv: '250.0000', basis: 'merchant_banker' }], grants: [GRANT] };

export const Equity: S = { name: 'Equity', render: () => <EquityScreen state="ready" entities={ENTITIES} entityId="e1" onEntity={() => undefined} nameOf={nameOf} onSearch={search} data={EQUITY} onPlan={ok} onValuation={ok} onGrant={ok} onConfirm={ok} onPaid={ok} onCapTable={ok} /> };

export const MyEquity: S = { name: 'My equity', render: () => <MyEquityScreen data={[GRANT]} onExercise={ok} /> };

export const Actuarial: S = {
  name: 'PAY-38 · Actuarial census and valuation',
  render: () => (
    <ActuarialScreen
      state="ready"
      entities={ENTITIES}
      entityId="e1"
      onEntity={() => undefined}
      can={{ census: true, journal: true }}
      data={{
        censuses: [{ id: 'ce1', asOf: '2026-03-31', standard: 'IND_AS_19', rows: 212, fileId: 'f1', createdAt: '2026-04-02T05:00:00.000Z' }],
        valuations: [{ id: 'av1', valuedOn: '2026-03-31', standard: 'IND_AS_19', kind: 'gratuity', opening: '0.00', closing: '1250000.00', delta: '1250000.00', journal: [{ account: 'Gratuity expense (actuarial)', debit: '1250000.00' }, { account: 'Provision for gratuity', credit: '1250000.00' }], status: 'recorded', madeByMe: false }],
      }}
      onCensus={ok}
      onDownload={ok}
      onRecord={ok}
      onPost={ok}
    />
  ),
};

const packs = { state: 'ready' as const, entities: ENTITIES, entityId: 'e1', onEntity: () => undefined, year: 2026, onYear: () => undefined, onSwitchOn: ok, onEosb: async () => ({ total: '4200.00', rows: [] }), onNecFile: ok, onNecCopy: ok, onW9: ok, onSearch: search, onWpsIds: ok, runs: [{ id: 'run1', label: 'Payroll · October 2026' }], onWpsFile: ok, nec: null };

export const CountryPackUae: S = {
  name: 'Country pack · UAE',
  render: () => <CountryPacksScreen {...packs} status={{ country: 'AE', needed: true, switchedOn: true, manifest: { version: '2026-v1', currency: 'AED', requires: ['AE.WPS', 'AE.EOSG'], settings: [{ key: 'establishmentId', label: 'Employer establishment id (13 digits)', pattern: '^\\d{13}$' }, { key: 'agentRoutingCode', label: 'WPS agent routing code (9 digits)', pattern: '^\\d{9}$' }] }, missing: [], settings: { establishmentId: '1234567890123', agentRoutingCode: '987654321' } }} />,
};

export const CountryPackUs: S = {
  name: 'Country pack · US',
  render: () => (
    <CountryPacksScreen
      {...packs}
      status={{ country: 'US', needed: true, switchedOn: true, manifest: { version: '2026-v1', currency: 'USD', requires: ['US.1099'], settings: [{ key: 'ein', label: 'Payer EIN (9 digits)', pattern: '^\\d{9}$' }] }, missing: [], settings: { ein: '123456789' } }}
      nec={{ year: 2026, threshold: '2000', rows: [{ consultantId: 'k1', name: 'Jordan Lee', paid: '5400.00', due: true, w9: false, tin: null }, { consultantId: 'k2', name: 'Sam Rivera', paid: '1200.00', due: false, w9: true, tin: '•••••4321' }] }}
    />
  ),
};
