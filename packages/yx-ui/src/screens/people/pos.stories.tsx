import type { Meta, StoryObj } from '@storybook/react-vite';
import { MassUpdateDrawer, PositionRecordScreen, PositionsScreen, PositionsSwitchOnScreen, SEAT_LIST, SEAT_OPTIONS, SEAT_RECORD, SEAT_ROWS, SWITCH_ON, SeatChangeDrawer, seatValues } from './positions';

const meta: Meta = { title: 'Screens/People/POS-01…04 · Positions', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const today = new Date(2026, 10, 25);
const noop = async () => undefined;
const values = async (id: string) => seatValues(SEAT_ROWS.find((r) => r.id === id)!);
const list = { onRetry: () => undefined, options: SEAT_OPTIONS, today, onOpen: () => undefined, onSwitchOn: () => undefined, valuesOf: values, onSend: noop };
const hrefs = { person: (id: string) => `#person-${id}`, seat: (id: string) => `#seat-${id}` };

/* POS-01 */
export const Pos01List: S = { name: 'POS-01 · Positions list', render: () => <PositionsScreen state="ready" data={SEAT_LIST} {...list} /> };
export const Pos01Off: S = { name: 'POS-01 · Positions off (switch-on offered)', render: () => <PositionsScreen state="ready" data={{ ...SEAT_LIST, enabled: false, rows: [] }} {...list} /> };
export const Pos01ReadOnly: S = { name: 'POS-01 · Read only (org structure viewer, no money)', render: () => <PositionsScreen state="ready" data={{ ...SEAT_LIST, canManage: false, rows: SEAT_ROWS.map(({ entrySalary: _e, budget: _b, ...r }) => r) }} {...list} /> };
export const Pos01Loading: S = { name: 'POS-01 · Loading', render: () => <PositionsScreen state="loading" data={null} {...list} /> };
export const Pos01Error: S = { name: 'POS-01 · Error', render: () => <PositionsScreen state="error" data={null} {...list} /> };
/* POS-02 */
export const Pos02Record: S = { name: 'POS-02 · Position record', render: () => <PositionRecordScreen state="ready" data={SEAT_RECORD} options={SEAT_OPTIONS} today={today} onRetry={() => undefined} onBack={() => undefined} hrefs={hrefs} onSend={noop} onWithdraw={noop} /> };
export const Pos02Waiting: S = {
  name: 'POS-02 · Change waiting for approval',
  render: () => <PositionRecordScreen state="ready" data={{ ...SEAT_RECORD, changes: [{ ...SEAT_RECORD.changes[0], status: 'submitted' }] }} options={SEAT_OPTIONS} today={today} onRetry={() => undefined} onBack={() => undefined} hrefs={hrefs} onSend={noop} onWithdraw={noop} />,
};
/* POS-03 */
const sw = { onRetry: () => undefined, onBack: () => undefined, onSend: noop, onApprove: noop, onDecline: noop };
export const Pos03Plan: S = { name: 'POS-03 · Switch on: the plan to send', render: () => <PositionsSwitchOnScreen state="ready" data={SWITCH_ON} {...sw} /> };
export const Pos03Approve: S = { name: 'POS-03 · Switch on: another HR person approves', render: () => <PositionsSwitchOnScreen state="ready" data={{ ...SWITCH_ON, plan: { batchId: 'b1', effectiveOn: '2026-11-25', reason: 'We plan by seats from this year on', mine: false, sentAt: '2026-11-25T09:00:00Z' } }} {...sw} /> };
export const Pos03Done: S = { name: 'POS-03 · Switched on, one person left out', render: () => <PositionsSwitchOnScreen state="ready" data={{ ...SWITCH_ON, enabled: true, result: { seats: 3, linked: 9, failed: [{ employeeId: 'e9', name: 'Kiran Das', reason: 'The effective date is before the employee joined.' }] } }} {...sw} /> };
/* POS-04 */
const seat = { id: 'p2', code: 'POS-00002', title: 'Cashier', legalEntityId: 'kfpl', values: seatValues(SEAT_ROWS[1]) };
export const Pos04New: S = { name: 'POS-04 · New seat', render: () => <SeatChangeDrawer open kind="create" options={SEAT_OPTIONS} today={today} onSend={noop} onClose={() => undefined} /> };
export const Pos04Change: S = { name: 'POS-04 · Change a seat', render: () => <SeatChangeDrawer open kind="change" seat={seat} options={SEAT_OPTIONS} today={today} onSend={noop} onClose={() => undefined} /> };
export const Pos04Eliminate: S = { name: 'POS-04 · Eliminate a seat', render: () => <SeatChangeDrawer open kind="eliminate" seat={seat} options={SEAT_OPTIONS} today={today} onSend={noop} onClose={() => undefined} /> };
export const Pos04Mass: S = { name: 'POS-04 · Mass update with preview', render: () => <MassUpdateDrawer open seats={SEAT_ROWS.slice(1, 3).map((r) => ({ ...r, values: seatValues(r) }))} options={SEAT_OPTIONS} today={today} onSend={noop} onClose={() => undefined} /> };
