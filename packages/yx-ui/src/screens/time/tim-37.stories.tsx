import type { Meta, StoryObj } from '@storybook/react-vite';
import { IndustrialActionScreen } from './requests';

const meta: Meta<typeof IndustrialActionScreen> = { title: 'Screens/Time/TIM-37 · Industrial-action event', component: IndustrialActionScreen, render: (args) => <IndustrialActionScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof IndustrialActionScreen>;

export const Form: S = { name: 'Record event' };
export const Legal: S = { name: 'Record event · legal picked', args: { legality: 'legal' } };
export const Record: S = { name: 'Event record · lay-off', args: { view: 'record', legality: 'legal' } };
export const RecordUndetermined: S = { name: 'Event record · legality not set', args: { view: 'record' } };
// Founder decision 7b (29 Oct 2026): past strikes and lockouts, the page's landing view (no phone stories in this group).
export const List: S = { name: 'Past events · list', args: { view: 'list' } };
export const ListEmpty: S = { name: 'Past events · none yet', args: { view: 'list', listState: 'empty' } };
export const ListLoading: S = { name: 'Past events · loading', args: { view: 'list', listState: 'loading' } };
