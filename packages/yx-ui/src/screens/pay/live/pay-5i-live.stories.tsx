import type { Meta, StoryObj } from '@storybook/react-vite';
import { EwaAdminScreen, MyEwaScreen, MyIncentivesScreen } from './special';
import { ENTITIES } from './fixtures-ops';

// Batch 5i screens with sample data (the affordance guard opens these in light and dark).
const ok = async () => ({}) as never;
const meta: Meta = { title: 'Screens/Pay/Live 5i', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const nameOf = (id: string) => ({ p1: 'Lakshmi Devi', p2: 'Ravi Kumar' })[id] ?? 'Someone';
const search = async () => [{ id: 'p1', name: 'Lakshmi Devi', employeeCode: 'GW-014' }];

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
