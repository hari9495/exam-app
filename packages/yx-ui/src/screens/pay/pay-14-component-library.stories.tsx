import type { Meta, StoryObj } from '@storybook/react-vite';
import { ComponentLibraryScreen } from './comp-setup';

const meta: Meta<typeof ComponentLibraryScreen> = { title: 'Screens/Pay/PAY-14 · Component library', component: ComponentLibraryScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ComponentLibraryScreen>;

export const List: S = { name: 'Grouped by type · flag columns' };
export const Edit: S = { name: 'Edit component flags', args: { editId: 'c6' } };
export const Statutory: S = { name: 'Statutory component · locked', args: { editId: 'c8' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
