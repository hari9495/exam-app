import type { Meta, StoryObj } from '@storybook/react-vite';
import { IntegrationsDirectoryScreen } from './t9-public';
import { INTEGRATIONS } from './t9-pub-data';

const meta: Meta = { title: 'Screens/Portals/T9-24 · Integrations directory', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const All: S = { name: 'All integrations', render: () => <IntegrationsDirectoryScreen items={INTEGRATIONS} /> };
export const Category: S = { name: 'Filtered by category', render: () => <IntegrationsDirectoryScreen items={INTEGRATIONS} defaultCategory="Banking" /> };
export const NoResults: S = { name: 'Filtered to nothing', render: () => <IntegrationsDirectoryScreen items={INTEGRATIONS} defaultQuery="fleet telematics" /> };
export const Phone: S = { name: 'All · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <IntegrationsDirectoryScreen items={INTEGRATIONS} /> };
