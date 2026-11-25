import type { Meta, StoryObj } from '@storybook/react-vite';
import { CountryPacksScreen } from './country-packs';

const meta: Meta<typeof CountryPacksScreen> = { title: 'Screens/Pay/PAY-51 · Country packs', component: CountryPacksScreen, render: (args) => <CountryPacksScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof CountryPacksScreen>;

export const Off: S = { name: 'UAE · not switched on' };
export const SwitchOn: S = { name: 'UAE · switch on (dialog)', args: { dialog: 'switch-on' } };
export const UaeOn: S = { name: 'UAE · provision and WPS file', args: { variant: 'uae' } };
export const UaeWps: S = { name: 'UAE · record WPS ids (drawer)', args: { variant: 'uae', dialog: 'wps' } };
export const UsOn: S = { name: 'US · 1099-NEC and W-9', args: { variant: 'us' } };
export const UsW9: S = { name: 'US · record a W-9 (drawer)', args: { variant: 'us', dialog: 'w9' } };
export const India: S = { name: 'India entity · nothing to switch on', args: { variant: 'india' } };
export const Empty: S = { name: 'Empty · no entity chosen', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access' } };
