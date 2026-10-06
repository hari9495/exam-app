import type { Meta, StoryObj } from '@storybook/react-vite';
import { UnionRegister } from './relations';
import { UNIONS } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-39 · Union register', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'HR · unions and recognition', render: () => <UnionRegister rows={UNIONS} /> };
export const Record: S = { name: 'Union record (office bearers)', render: () => <UnionRegister rows={UNIONS} defaultOpenId="u1" /> };
export const Empty: S = { name: '· empty', render: () => <UnionRegister rows={[]} /> };
