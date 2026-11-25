import type { Meta, StoryObj } from '@storybook/react-vite';
import { FnfCalculator } from '../../people/exits';
import { DETAIL, FILINGS, FNF, HUB, MY_PAYSLIPS, PEOPLE, PREVIOUS, RETURNS, RUN } from './fixtures-5j';

// Batch 5j wired payroll screens with sample data (the affordance guard opens these in light and dark).
const ok = async () => ({}) as never;
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';
const meta: Meta = { title: 'Screens/Pay/Live 5j', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
export const Fnf: S = {
  name: 'PPL-22 · Full and final',
  render: () => (
    <FnfCalculator
      today={new Date(2026, 9, 19)}
      live={{ state: 'ready', onRetry: () => undefined, settlements: FNF, nameOf, can: { manage: true, waiveNotice: true, prepare: true }, onOpenRun: () => undefined, onRecalculate: ok, onSubmit: ok, onHold: ok, onAdd: ok, onWaiveNotice: ok, onSecondRun: async () => ({ runId: 'r10' }) }}
    />
  ),
};
