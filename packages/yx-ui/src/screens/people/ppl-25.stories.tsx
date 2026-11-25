import type { Meta, StoryObj } from '@storybook/react-vite';
import { AssetAcknowledgePhone, AssetRegister } from './assets';
import { AssetPageScreen } from './asset-page';
import { ASSET_PAGE } from './asset-page-samples';
import { ASSETS } from './people-data';
import { AddAssetDrawer } from './live/exits';
import { ASSET_CATEGORY_CHOICES, ENTITY_CHOICES, JOINER_PLACES } from './people-data';
import { fails, ok, pick, play, press, type } from './popup-play';

const meta: Meta = { title: 'Screens/People/PPL-25 · Asset register', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Register: S = { name: 'Admin · register', render: () => <AssetRegister rows={ASSETS} /> };
export const Issue: S = { name: 'Issue dialog', render: () => <AssetRegister rows={ASSETS} dialog="issue" /> };
export const Return: S = { name: 'Return dialog with recovery', render: () => <AssetRegister rows={ASSETS} dialog="return" /> };
export const Empty: S = { name: '· empty', render: () => <AssetRegister rows={[]} /> };
export const Acknowledge: S = { name: 'Employee · acknowledge (phone)', ...phone, render: () => <AssetAcknowledgePhone /> };
export const Acknowledged: S = { name: 'Employee · acknowledged (phone)', ...phone, render: () => <AssetAcknowledgePhone acknowledged /> };

// Add asset (People › Assets): the live drawer with sample data.
const addAsset = (onAdd: Parameters<typeof AddAssetDrawer>[0]['onAdd'] = ok) => <AddAssetDrawer categories={ASSET_CATEGORY_CHOICES} entities={ENTITY_CHOICES} locations={JOINER_PLACES.locations} onClose={() => undefined} onAdd={onAdd} />;
const fillAsset = [pick('Category', 'Laptop'), type(/^Name/, 'Dell Latitude 5450'), type(/^Asset tag/, 'LT-0418'), type(/^Serial number/, '7QK2X93'), pick('Legal entity', 'Kaveri Foods Pvt Ltd (Tamil Nadu)'), pick('Location', 'Hosur plant'), type(/^Cost/, '84500')];
export const AddAsset: S = { name: 'Add asset · open', render: () => addAsset() };
export const AddAssetFilled: S = { name: 'Add asset · filled', render: () => addAsset(), play: play(...fillAsset) };
export const AddAssetMissing: S = { name: 'Add asset · nothing filled, Add asset pressed', render: () => addAsset(), play: play(type(/^Asset tag/, '-bad tag'), press('Add asset')) };
export const AddAssetFailed: S = { name: 'Add asset · the server refuses (tag already used)', render: () => addAsset(fails('Asset tag LT-0418 is already used by Dell Latitude 5440.')), play: play(...fillAsset, press('Add asset')) };

// The asset page (IT assets plan, 26 Nov 2026): opened from the register's tag; Details and History; asset managers edit.
export const AssetPage: S = { name: 'Asset page · details', render: () => <AssetPageScreen data={ASSET_PAGE} /> };
export const AssetPageHistory: S = { name: 'Asset page · history', render: () => <AssetPageScreen data={ASSET_PAGE} tab="history" /> };
export const AssetPageEdit: S = { name: 'Asset page · edit details', render: () => <AssetPageScreen data={ASSET_PAGE} editing /> };
export const AssetPageReadOnly: S = { name: 'Asset page · view only (no asset.manage)', render: () => <AssetPageScreen data={{ ...ASSET_PAGE, canManage: false }} /> };
// Answer 2711: an IT desk agent with asset.view only sees no money (the API sends no cost).
export const AssetPageNoMoney: S = { name: 'Asset page · view only, no money (answer 2711)', render: () => <AssetPageScreen data={{ ...ASSET_PAGE, canManage: false, money: false, asset: { ...ASSET_PAGE.asset, cost: undefined } }} /> };
export const AssetPageInStock: S = { name: 'Asset page · in stock, warranty ended', render: () => <AssetPageScreen data={{ ...ASSET_PAGE, holder: null, asset: { ...ASSET_PAGE.asset, status: 'in_stock', purchasedOn: '2023-03-01', warrantyMonths: 24, warrantyEndsOn: '2025-03-01' } }} /> };
