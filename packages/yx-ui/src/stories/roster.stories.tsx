import '../components/roster.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { RosterGrid, type RosterLeave, type RosterPerson, type RosterValue } from '../components/roster';

const meta: Meta = { title: 'Time and activity/Roster', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const MON = new Date(2026, 9, 5); // Mon 05 Oct 2026
const PEOPLE: RosterPerson[] = [
  { id: 'r1', name: 'Arjun Kulkarni', role: 'Shift Lead' },
  { id: 'r2', name: 'Lakshmi Venkatesan', role: 'Warehouse Associate' },
  { id: 'r3', name: 'Imran Qureshi', role: 'Maintenance Technician' },
  { id: 'r4', name: 'Deepa Rao', role: 'Quality Inspector' },
  { id: 'r5', name: 'Joseph Mathew', role: 'Warehouse Associate' },
  { id: 'r6', name: 'Venkata Subrahmanya Lakshminarayana', role: 'Plant Supervisor, Hosur plant' },
];

// Draft with the three kinds of conflict:
// r1 night → morning (rest gap), r3 seven 8 h shifts (over 48 h), r4 rostered on approved casual leave.
const DRAFT: RosterValue = {
  r1: ['N', 'M', 'M', 'G', 'G', 'OFF', 'OFF'],
  r2: ['M', 'M', 'M', 'M', 'M', 'OFF', 'OFF'],
  r3: ['G', 'G', 'G', 'G', 'G', 'G', 'G'],
  r4: ['G', 'G', 'G', null, 'G', 'OFF', 'OFF'],
  r5: ['N', 'N', 'N', 'OFF', 'OFF', 'N', 'N'],
  r6: ['G', 'G', 'G', 'G', 'G', 'OFF', null],
};
const LEAVE: RosterLeave[] = [
  { personId: 'r4', date: new Date(2026, 9, 7), code: 'CL' },
  { personId: 'r4', date: new Date(2026, 9, 8), code: 'CL' },
];
const CLEAN: RosterValue = {
  r1: ['G', 'G', 'G', 'G', 'G', 'OFF', 'OFF'],
  r2: ['M', 'M', 'M', 'M', 'M', 'OFF', 'OFF'],
  r3: ['N', 'N', 'N', 'N', 'OFF', 'OFF', 'M'],
  r4: ['G', 'G', null, null, 'G', 'OFF', 'OFF'],
  r5: ['OFF', 'M', 'M', 'M', 'M', 'M', 'OFF'],
  r6: ['G', 'G', 'G', 'G', 'G', 'OFF', 'OFF'],
};
const FORTNIGHT: RosterValue = Object.fromEntries(Object.entries(DRAFT).map(([k, v]) => [k, [...v, ...(CLEAN[k] ?? [])]]));

const wrap = (el: ReactElement) => <div style={{ maxWidth: 1200 }}>{el}</div>;

export const DraftWithConflicts: S = {
  name: 'Draft with conflicts',
  render: () => wrap(<RosterGrid people={PEOPLE} start={MON} defaultValue={DRAFT} leave={LEAVE} />),
};
export const SelectionMenuOpen: S = {
  name: 'Cells selected, assign menu open',
  render: () =>
    wrap(
      <RosterGrid
        people={PEOPLE}
        start={MON}
        defaultValue={CLEAN}
        leave={LEAVE}
        defaultSelection={[
          ['r4', 2],
          ['r4', 3],
          ['r5', 2],
          ['r5', 3],
        ]}
        defaultMenuOpen
      />,
    ),
};
export const Fortnight: S = { render: () => wrap(<RosterGrid people={PEOPLE} start={MON} days={14} defaultValue={FORTNIGHT} leave={LEAVE} />) };
export const Empty: S = { name: 'Empty draft', render: () => wrap(<RosterGrid people={PEOPLE} start={MON} leave={LEAVE} />) };
export const PublishedManager: S = {
  name: 'Published (manager can still edit)',
  render: () => wrap(<RosterGrid people={PEOPLE} start={MON} defaultValue={CLEAN} leave={LEAVE} defaultStatus="published" />),
};
export const PublishedReadOnly: S = {
  name: 'Published, staff read-only view',
  render: () => wrap(<RosterGrid people={PEOPLE} start={MON} defaultValue={CLEAN} leave={LEAVE} defaultStatus="published" readOnly />),
};
export const CellFocus: S = {
  name: 'Cell keyboard focus',
  parameters: { pseudo: { focusVisible: ['.yx-roster__cell[tabindex="0"]'] } },
  render: () => wrap(<RosterGrid people={PEOPLE} start={MON} defaultValue={CLEAN} />),
};
export const Mobile: S = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <RosterGrid people={PEOPLE} start={MON} defaultValue={DRAFT} leave={LEAVE} />,
};
export const MobileReadOnly: S = {
  name: 'Mobile, staff read-only',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <RosterGrid people={PEOPLE.slice(0, 1)} start={MON} defaultValue={CLEAN} defaultStatus="published" readOnly />,
};
