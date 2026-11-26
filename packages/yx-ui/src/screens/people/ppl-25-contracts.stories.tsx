import type { Meta, StoryObj } from '@storybook/react-vite';
import { AssetContractsScreen } from './asset-contracts';
import { AssetPageScreen } from './asset-page';
import { ASSET_PAGE } from './asset-page-samples';
import { CONTRACTS, CONTRACTS_TODAY } from './it-asset-samples';
import { play, press, type } from './popup-play';

// IT assets part 3 (answer 2717): asset contracts, opened in a drawer with their assets; the asset page's Contracts tab.
// Answer 2714: a contract inside its notice window says "Give notice by".
const meta: Meta = { title: 'Screens/People/PPL-25 · Asset contracts', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const list = (over: Partial<Parameters<typeof AssetContractsScreen>[0]> = {}) => <AssetContractsScreen rows={CONTRACTS} today={CONTRACTS_TODAY} {...over} />;
export const List: S = { name: 'Contracts · asset manager (one in its notice window)', render: () => list() };
export const NoMoney: S = { name: 'Contracts · view only, no value (answer 2711)', render: () => list({ money: false, canAdd: false, rows: CONTRACTS.map((k) => ({ ...k, value: undefined, canManage: false })) }) };
export const Ended: S = { name: 'Contracts · ended', render: () => list({ show: 'ended' }) };
export const Empty: S = { name: 'Contracts · none yet', render: () => list({ rows: [] }) };
export const View: S = { name: 'Contract · its assets (one at a place you do not look after)', render: () => list({ open: 'k1' }) };
export const ViewCompanyWide: S = { name: 'Contract · company-wide, renewed twice', render: () => list({ open: 'k2' }) };
export const Add: S = { name: 'Add contract · open', render: () => list({ editing: 'new' }) };
export const AddMissing: S = { name: 'Add contract · nothing filled, Add pressed', render: () => list({ editing: 'new' }), play: play(press('Add contract')) };
export const Edit: S = { name: 'Edit contract · express renewal, cap', render: () => list({ editing: 'k1' }) };
export const EditNumber: S = { name: 'Edit contract · number changed', render: () => list({ editing: 'k1' }), play: play(type(/^Contract number/, '-B')) };
export const AssetPageContracts: S = { name: 'Asset page · contracts', render: () => <AssetPageScreen data={ASSET_PAGE} tab="contracts" /> };
export const AssetPageNoContracts: S = { name: 'Asset page · contracts, none', render: () => <AssetPageScreen data={{ ...ASSET_PAGE, contracts: [] }} tab="contracts" /> };
