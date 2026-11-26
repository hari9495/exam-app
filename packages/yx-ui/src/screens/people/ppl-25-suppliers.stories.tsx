import type { Meta, StoryObj } from '@storybook/react-vite';
import { AssetSuppliersScreen } from './asset-suppliers';
import { SUPPLIERS } from './it-asset-samples';
import { play, press, type } from './popup-play';

// IT assets part 3 (answer 2716): the IT and Admin supplier list, separate from staffing vendors and contractors.
const meta: Meta = { title: 'Screens/People/PPL-25 · Asset suppliers', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'Suppliers · asset manager', render: () => <AssetSuppliersScreen rows={SUPPLIERS} /> };
export const ReadOnly: S = { name: 'Suppliers · view only (asset.view)', render: () => <AssetSuppliersScreen rows={SUPPLIERS} canManage={false} /> };
export const Retired: S = { name: 'Suppliers · retired', render: () => <AssetSuppliersScreen rows={SUPPLIERS} show="retired" /> };
export const Empty: S = { name: 'Suppliers · none yet', render: () => <AssetSuppliersScreen rows={[]} /> };
export const Add: S = { name: 'Add supplier · open', render: () => <AssetSuppliersScreen rows={SUPPLIERS} open="new" /> };
export const AddFilled: S = {
  name: 'Add supplier · filled',
  render: () => <AssetSuppliersScreen rows={SUPPLIERS} open="new" />,
  play: play(type(/^Name/, 'Ingram Micro India'), type(/^GSTIN/, '27AABCI1234F1Z9'), type(/^Contact name/, 'Neha Joshi'), type(/^Email/, 'neha.joshi@ingram.example'), type(/^Phone/, '+91 99200 55555')),
};
export const AddWrong: S = {
  name: 'Add supplier · bad GSTIN and email, Add pressed',
  render: () => <AssetSuppliersScreen rows={SUPPLIERS} open="new" />,
  play: play(type(/^GSTIN/, '27AABCI'), type(/^Contact name/, 'N'), type(/^Email/, 'neha@'), press('Add supplier')),
};
export const Edit: S = { name: 'Edit supplier · two contacts, status', render: () => <AssetSuppliersScreen rows={SUPPLIERS} open="s1" /> };
