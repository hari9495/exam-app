import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayrollSetupScreen } from './comp-setup';

// render: the design guard reads JSX, so the live pages' PayrollSetupScreen counts as designed.
const meta: Meta<typeof PayrollSetupScreen> = { title: 'Screens/Pay/PAY-16 · Payroll set-up wizard', component: PayrollSetupScreen, render: (a) => <PayrollSetupScreen {...a} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PayrollSetupScreen>;

export const Registrations: S = { name: 'Registrations · completeness check failing' };
export const RegistrationsComplete: S = { name: 'Registrations complete', args: { incomplete: false } };
export const PayGroup: S = { name: 'Pay group and cut-off', args: { step: 'group', incomplete: false } };
export const Opening: S = { name: 'Opening balances · as-paid import', args: { step: 'opening', incomplete: false, imported: true } };
export const Review: S = { name: 'Review', args: { step: 'review', incomplete: false, imported: true } };

// Founder decision 3 (29 Oct 2026): Go-live is a step of the set-up wizard, after Opening balances.
export const GoLiveCompare: S = { name: 'Go-live · parallel run compared, differences to sign off', args: { step: 'golive', incomplete: false, imported: true, golive: 'compare' } };
export const GoLiveSignOffDialog: S = { name: 'Go-live · sign off with differences (dialog open)', args: { step: 'golive', incomplete: false, imported: true, golive: 'compare', decide: 'signed_off' } };
export const GoLiveWaiveDialog: S = { name: 'Go-live · waive the parallel run (dialog open)', args: { step: 'golive', incomplete: false, imported: true, golive: 'compare', decide: 'waived' } };
export const GoLiveSignedOff: S = { name: 'Go-live · signed off, ready', args: { step: 'golive', incomplete: false, imported: true, golive: 'signed-off' } };
export const GoLiveWaived: S = { name: 'Go-live · waived', args: { step: 'golive', incomplete: false, imported: true, golive: 'waived' } };
export const GoLiveEmpty: S = { name: 'Go-live · no comparison yet', args: { step: 'golive', incomplete: false, imported: true, golive: 'empty' } };
export const LegalOptions: S = { name: 'Registrations · legal options', args: { incomplete: false, options: true } };
export const PayGroups: S = { name: 'Pay groups · list', args: { step: 'group', incomplete: false, groups: 'list' } };
export const PayGroupAdd: S = { name: 'Pay groups · add a group (drawer open)', args: { step: 'group', incomplete: false, groups: 'add' } };
export const PayGroupMembers: S = { name: 'Pay groups · members and calendar', args: { step: 'group', incomplete: false, groups: 'members' } };
export const OpeningChecked: S = { name: 'Opening balances · rows checked, ready to commit', args: { step: 'opening', incomplete: false, opening: 'checked' } };
export const OpeningRowErrors: S = { name: 'Opening balances · a row has a problem', args: { step: 'opening', incomplete: false, opening: 'row-errors' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access' } };
