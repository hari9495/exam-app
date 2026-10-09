import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReverificationCycles } from './relations';
import { REVERIFY, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-42 · Re-verification cycles', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'HR · rules, due list and outcomes', render: () => <ReverificationCycles rows={REVERIFY} today={TODAY} /> };
export const Empty: S = { name: '· empty', render: () => <ReverificationCycles rows={[]} today={TODAY} /> };
