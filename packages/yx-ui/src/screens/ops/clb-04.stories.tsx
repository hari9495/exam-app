import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClraRegistersScreen } from './contract';

const meta: Meta = { title: 'Screens/Contract labour/CLB-04 · CLRA registers & returns', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Registers: S = { render: () => <ClraRegistersScreen /> };
export const Returns: S = { name: 'Annual return', render: () => <ClraRegistersScreen tab="returns" /> };
export const Loading: S = { render: () => <ClraRegistersScreen loading /> };
