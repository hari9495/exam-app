import type { Meta, StoryObj } from '@storybook/react-vite';
import { AssetAcknowledgePhone, AssetRegister } from './assets';
import { ASSETS } from './people-data';
import { AddAssetDrawer } from './live/exits';
import { ENTITY_CHOICES, JOINER_PLACES } from './people-data';
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
const addAsset = (onAdd: Parameters<typeof AddAssetDrawer>[0]['onAdd'] = ok) => <AddAssetDrawer entities={ENTITY_CHOICES} locations={JOINER_PLACES.locations} onClose={() => undefined} onAdd={onAdd} />;
const fillAsset = [type(/^Kind/, 'Laptop'), type(/^Name/, 'Dell Latitude 5450'), type(/^Asset tag/, 'LT-0418'), type(/^Serial number/, '7QK2X93'), pick('Legal entity', 'Kaveri Foods Pvt Ltd (Tamil Nadu)'), pick('Location', 'Hosur plant'), type(/^Cost/, '84500')];
export const AddAsset: S = { name: 'Add asset · open', render: () => addAsset() };
export const AddAssetFilled: S = { name: 'Add asset · filled', render: () => addAsset(), play: play(...fillAsset) };
export const AddAssetMissing: S = { name: 'Add asset · nothing filled, Add asset pressed', render: () => addAsset(), play: play(type(/^Asset tag/, '-bad tag'), press('Add asset')) };
export const AddAssetFailed: S = { name: 'Add asset · the server refuses (tag already used)', render: () => addAsset(fails('Asset tag LT-0418 is already used by Dell Latitude 5440.')), play: play(...fillAsset, press('Add asset')) };
