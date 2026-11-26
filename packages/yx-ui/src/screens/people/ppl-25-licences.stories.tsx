import type { Meta, StoryObj } from '@storybook/react-vite';
import { AssetLicencesScreen } from './asset-licences';
import { AssetPageScreen } from './asset-page';
import { ASSET_PAGE } from './asset-page-samples';
import { CONTRACTS_TODAY, LICENCES } from './it-asset-samples';
import { play, press } from './popup-play';

// IT assets part 4 (answer 2718): software licences. The list shows one over quota (red) and one with every seat in use
// (amber); a licence opens in a drawer with its seats, where asset managers give and free seats; the asset page's
// Licences tab lists the seats on a device.
const meta: Meta = { title: 'Screens/People/PPL-25 · Software licences', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const list = (over: Partial<Parameters<typeof AssetLicencesScreen>[0]> = {}) => <AssetLicencesScreen rows={LICENCES} today={CONTRACTS_TODAY} {...over} />;
export const List: S = { name: 'Licences · asset manager (one over quota, one full)', render: () => list() };
export const NoMoney: S = { name: 'Licences · view only, no cost (answer 2711)', render: () => list({ money: false, canAdd: false, rows: LICENCES.map((l) => ({ ...l, cost: undefined, canManage: false })) }) };
export const Expired: S = { name: 'Licences · expired', render: () => list({ show: 'expired' }) };
export const Empty: S = { name: 'Licences · none yet', render: () => list({ rows: [] }) };
export const View: S = { name: 'Licence · over quota, a leaver and a device seat', render: () => list({ open: 'l1' }) };
export const ViewFull: S = { name: 'Licence · every seat in use', render: () => list({ open: 'l2' }) };
export const ViewNoSeats: S = { name: 'Licence · no seats in use, expired', render: () => list({ open: 'l4' }) };
export const FreeSeat: S = { name: 'Licence · Free seat pressed', render: () => list({ open: 'l3' }), play: play(press('Free seat')) };
export const Give: S = { name: 'Give a seat · open', render: () => list({ giving: 'l3' }) };
export const GiveMissing: S = { name: 'Give a seat · nobody chosen, Give pressed', render: () => list({ giving: 'l3' }), play: play(press('Give seat')) };
export const GiveFull: S = { name: 'Give a seat · all in use, over quota not allowed, Give pressed', render: () => list({ giving: 'l2' }), play: play(press('Give seat')) };
export const GiveOver: S = { name: 'Give a seat · all in use, over quota allowed', render: () => list({ giving: 'l1' }) };
export const Add: S = { name: 'Add licence · open', render: () => list({ editing: 'new' }) };
export const AddMissing: S = { name: 'Add licence · nothing filled, Add pressed', render: () => list({ editing: 'new' }), play: play(press('Add licence')) };
export const Edit: S = { name: 'Edit licence · over quota allowed', render: () => list({ editing: 'l1' }) };
export const AssetPageLicences: S = { name: 'Asset page · licences', render: () => <AssetPageScreen data={ASSET_PAGE} tab="licences" /> };
export const AssetPageNoLicences: S = { name: 'Asset page · licences, none', render: () => <AssetPageScreen data={{ ...ASSET_PAGE, licences: [] }} tab="licences" /> };
