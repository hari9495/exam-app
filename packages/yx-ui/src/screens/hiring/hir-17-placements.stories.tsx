import type { Meta, StoryObj } from '@storybook/react-vite';
import { BenchBoardScreen, PlacementRecordScreen, PlacementsScreen } from './hiring-staffing';
import { PLACEMENTS } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-17 · Placements and bench board', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'Placements list with margin', render: () => <PlacementsScreen rows={PLACEMENTS} /> };
export const Record: S = { name: 'Placement record · ending soon', render: () => <PlacementRecordScreen placement={PLACEMENTS[1]} today={TODAY} /> };
export const Extend: S = { name: 'Extend (dated change)', render: () => <PlacementRecordScreen placement={PLACEMENTS[1]} today={TODAY} action="extend" /> };
export const EndEarly: S = { name: 'End early · confirmation', render: () => <PlacementRecordScreen placement={PLACEMENTS[0]} today={TODAY} action="end" /> };
export const VendorSupplied: S = { name: 'Vendor-supplied placement', render: () => <PlacementRecordScreen placement={PLACEMENTS[3]} today={TODAY} /> };
export const Bench: S = { name: 'Bench board · policy days', render: () => <BenchBoardScreen rows={PLACEMENTS} today={TODAY} /> };
export const BenchEmpty: S = { name: 'Bench · empty', render: () => <BenchBoardScreen rows={[]} today={TODAY} /> };
export const Loading: S = { name: 'Loading', render: () => <PlacementsScreen rows={[]} state="loading" /> };
