import type { Meta, StoryObj } from '@storybook/react-vite';
import { CampusKitScreen, CoordinatorPortalScreen } from '../delivery';

const meta: Meta<typeof CampusKitScreen> = { title: 'Screens/Proctoring/PRC-29 · Campus drive kit', component: CampusKitScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof CampusKitScreen>;

export const Registrants: S = { name: 'Registrants with dedupe' };
export const RegistrationForm: S = { name: 'Registration form settings', args: { tab: 'form' } };
export const Institutions: S = { name: 'Institution master', args: { tab: 'institutions' } };
export const AdmitCards: S = { name: 'Admit cards', args: { tab: 'admit' } };
export const CollegeReport: S = { name: 'College-wise report', args: { tab: 'report' } };
export const Coordinator: S = { name: 'College coordinator portal', render: () => <CoordinatorPortalScreen /> };
export const CoordinatorNoResults: S = { name: 'College coordinator, results not shared', render: () => <CoordinatorPortalScreen visibility="None" /> };
