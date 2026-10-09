import type { Meta, StoryObj } from '@storybook/react-vite';
import { IndustrialActionScreen } from './requests';

const meta: Meta<typeof IndustrialActionScreen> = { title: 'Screens/Time/TIM-37 · Industrial-action event', component: IndustrialActionScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof IndustrialActionScreen>;

export const Form: S = { name: 'Record event' };
export const Legal: S = { name: 'Record event · legal picked', args: { legality: 'legal' } };
export const Record: S = { name: 'Event record · lay-off', args: { view: 'record', legality: 'legal' } };
export const RecordUndetermined: S = { name: 'Event record · legality not set', args: { view: 'record' } };
