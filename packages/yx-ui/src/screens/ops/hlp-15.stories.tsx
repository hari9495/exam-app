import type { Meta, StoryObj } from '@storybook/react-vite';
import { choose, fails, pick, play, press, type } from '../_kit/story-play';
import { CatalogScreen, type CatalogScreenProps } from '../desk/catalog';
import { CATALOGUE, JOINER_GUIDE, LAPTOP_PAGE, PICKS } from '../desk/esm-data';
import { OpsDesk } from './ops-kit';

// Helpdesk HLP-15 · Service catalogue (the founder, 12 Nov 2026: draw the live stand-ins, then they are the live page).
// The service catalogue for requesters (/yx/desk/catalog): items each person may order with their form, a cart sent once
// (one request per desk, each item with its own approval and tasks), order guides that pick items from a few answers.
const meta: Meta = { title: 'Screens/Helpdesk/HLP-15 · Service catalogue', component: CatalogScreen, parameters: { layout: 'fullscreen' }, decorators: [(Story) => <OpsDesk area="helpdesk" active="Service catalogue"><Story /></OpsDesk>] };
export default meta;
type S = StoryObj;
const picks = async () => PICKS;

// ------------------------------------------------------------------ Service catalogue (SD-2.03 / SD-2.04)
const catalog = (over: Partial<CatalogScreenProps> = {}) => (
  <CatalogScreen state="ready" catalogue={CATALOGUE} onOpenItem={async () => LAPTOP_PAGE} onOpenGuide={async () => JOINER_GUIDE} onResolveGuide={async () => [{ id: 'i1', name: 'New laptop', shortText: null, cost: 85000 }]} onCheckout={async () => ({ requests: [{ ticketId: 't-1020', number: 'IT-1020' }] })} onPick={picks} onOpenRequest={() => undefined} {...over} />
);
export const Catalog: S = { name: 'Items and a guide', render: () => catalog() };
export const CatalogItem: S = { name: 'An item open', render: () => catalog(), play: play(press('Open New laptop')) };
export const CatalogItemMissing: S = { name: 'Add to cart pressed with a required answer missing', render: () => catalog(), play: play(press('Open New laptop'), press('Add to cart')) };
export const CatalogItemFailed: S = { name: 'The item could not be opened', render: () => catalog({ onOpenItem: fails('This item was retired a moment ago.') }), play: play(press('Open New laptop')) };
const toCart = [press('Open New laptop'), pick(/^Model/, /Standard/), press('Add to cart')];
export const CatalogSent: S = { name: 'Request sent (toast with Follow)', render: () => catalog(), play: play(...toCart, press('Send request')) };
export const CatalogForOtherMissing: S = { name: 'Send request for someone else with nobody chosen', render: () => catalog(), play: play(...toCart, choose('For someone else'), press('Send request')) };
// Answer 1802: an item that asks for a device asks who it is for first (the device list is then theirs).
const DEVICE_PAGE = { ...LAPTOP_PAGE, name: 'Laptop repair', form: { sections: [{ id: 's', columns: 1 as const, fields: [{ key: 'device', type: 'asset' as const, label: 'Which device?' }, { key: 'what', type: 'textarea' as const, label: 'What is wrong?' }] }], rules: [] } };
export const CatalogDeviceForWhom: S = { name: 'An item with a device field asks who it is for first', render: () => catalog({ onOpenItem: async () => DEVICE_PAGE }), play: play(press('Open New laptop'), choose('For someone else')) };
export const CatalogEmpty: S = { name: 'Nothing to order', render: () => catalog({ catalogue: { items: [], guides: [] } }) };
export const CatalogLoading: S = { name: 'Loading', render: () => catalog({ state: 'loading' }) };
export const CatalogError: S = { name: 'Could not load', render: () => catalog({ state: 'error', onRetry: () => undefined }) };
