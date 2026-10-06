import type { Meta, StoryObj } from '@storybook/react-vite';
import { GeofenceEditorScreen } from './leave-admin';

const meta: Meta<typeof GeofenceEditorScreen> = { title: 'Screens/Time/TIM-31 · Locations and geofence editor', component: GeofenceEditorScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof GeofenceEditorScreen>;

export const Edit: S = { name: 'Geofence and IP ranges' };
export const Multi: S = { name: 'Multiple points', args: { view: 'multi' } };
export const Field: S = { name: 'Field mode', args: { view: 'field' } };
export const IpError: S = { name: 'Invalid IP range', args: { ipError: true } };
