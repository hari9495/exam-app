import type { Meta, StoryObj } from '@storybook/react-vite';
import { CapacityBoardScreen } from './projects';
import { CAPACITY, CAPACITY_WEEKS, UTILISATION } from './projects-data';

const meta: Meta = { title: 'Screens/Projects/PRJ-03 · Capacity and utilisation board', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const base = { weeks: CAPACITY_WEEKS, people: CAPACITY, utilisationRows: UTILISATION, target: 75 };

export const Hr: S = { name: 'HR · heatmap and utilisation vs target', render: () => <CapacityBoardScreen {...base} persona="hr" /> };
export const Pm: S = { name: 'PM · team of 7', render: () => <CapacityBoardScreen {...base} persona="pm" /> };
export const Suppressed: S = { name: 'PM · small team suppressed', render: () => <CapacityBoardScreen {...base} people={CAPACITY.slice(0, 3)} utilisationRows={UTILISATION.slice(0, 3)} teamSize={3} persona="pm" /> };
export const Loading: S = { name: 'Loading', render: () => <CapacityBoardScreen {...base} persona="hr" loading /> };
