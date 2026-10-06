import type { Meta, StoryObj } from '@storybook/react-vite';
import { OwnLicencesScreen } from './contract';
import { OWN_LICENCES } from './contract-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Contract labour/CLB-07 · Own licences', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'Licences · renewal due', render: () => <OwnLicencesScreen licences={OWN_LICENCES} today={TODAY} /> };
export const Blocked: S = { name: '51st deployment blocked', render: () => <OwnLicencesScreen licences={OWN_LICENCES} today={TODAY} blocked /> };
export const Empty: S = { render: () => <OwnLicencesScreen licences={[]} today={TODAY} /> };
