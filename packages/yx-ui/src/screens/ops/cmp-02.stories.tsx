import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatutorySetupScreen } from './compliance';
import { REGISTRATIONS, REGISTRATIONS_TN } from './compliance-data';

const meta: Meta = { title: 'Screens/Compliance/CMP-02 · Statutory set-up', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Complete: S = { name: 'Registrations complete', render: () => <StatutorySetupScreen entity="Kaveri Foods Pvt Ltd" registrations={REGISTRATIONS} /> };
export const Incomplete: S = { name: 'Missing deductor details', render: () => <StatutorySetupScreen entity="Kaveri Foods Pvt Ltd (Tamil Nadu)" registrations={REGISTRATIONS_TN} /> };
export const SwitchOnCheck: S = { name: 'Switch on statute · completeness check', render: () => <StatutorySetupScreen entity="Kaveri Foods Pvt Ltd (Tamil Nadu)" registrations={REGISTRATIONS_TN} switchOnOpen /> };
export const LegalOptions: S = { name: 'Legal options', render: () => <StatutorySetupScreen entity="Kaveri Foods Pvt Ltd" registrations={REGISTRATIONS} tab="options" /> };
export const FilingMode: S = { name: 'Filing mode', render: () => <StatutorySetupScreen entity="Kaveri Foods Pvt Ltd" registrations={REGISTRATIONS} tab="filing" /> };
