import type { Meta, StoryObj } from '@storybook/react-vite';
import { VrsScheme } from './relations';
import { DecideDialog } from './live/special';

const meta: Meta = { title: 'Screens/People/PPL-40 · VRS scheme', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Applications: S = { name: 'HR · applications and approvals', render: () => <VrsScheme /> };
export const Setup: S = { name: 'HR · scheme set-up', render: () => <VrsScheme tab="setup" /> };
export const Apply: S = { name: 'Employee · apply with estimate', render: () => <VrsScheme persona="emp" /> };
export const NotEligible: S = { name: 'Employee · not eligible', render: () => <VrsScheme persona="emp" eligible={false} /> };
export const Permissions: S = { name: 'HR · government permission requests', render: () => <VrsScheme tab="permissions" /> };

// Founder 2 Nov 2026 (pay gaps, item 1): the government's order number with a grant, shown on the PAY-11 run.
const REQUEST = { id: 'ir1', legalEntityId: 'le-tn', kind: 'retrenchment' as const, workersAffected: 12, reasons: 'Packing line closed', appliedOn: '2026-09-01', authority: 'Labour Commissioner, Chennai', status: 'applied' as const, decidedOn: null, version: 1 };
const decideDialog = (initialOrderNumber = '', pressed = false) => <DecideDialog r={REQUEST} today="2026-09-29" onClose={() => undefined} onDecide={async () => undefined} initialOrderNumber={initialOrderNumber} pressed={pressed} />;
export const PermissionDecide: S = { name: 'HR · record the decision (granted, order number)', render: () => decideDialog('L-42011/12/2026-IR(M)') };
export const PermissionDecideBadOrder: S = { name: 'HR · record the decision · order number not valid', render: () => decideDialog('L-42011 <copy>', true) };
