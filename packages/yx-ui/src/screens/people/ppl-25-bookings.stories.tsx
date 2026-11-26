import type { Meta, StoryObj } from '@storybook/react-vite';
import { AssetBookingsScreen, MyAssetBookingsScreen } from './asset-bookings';
import { AssetPageScreen } from './asset-page';
import { ASSET_PAGE } from './asset-page-samples';
import { CONTRACTS_TODAY, IT_BOOKINGS, MY_BOOKINGS } from './it-asset-samples';
import { choose, date, play, press } from './popup-play';

// IT assets part 5 (answer 2715): asset booking. Me › Asset bookings (my bookings, Book an asset with the "free between"
// search and repeats, Cancel); People › Asset bookings for IT (approve or decline, hand over, take back, cancel, an
// overdue one in red; a person picked is their loan report); the asset page's Bookings tab with the Bookable switch.
const meta: Meta = { title: 'Screens/People/PPL-25 · Asset bookings', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const mine = (over: Partial<Parameters<typeof MyAssetBookingsScreen>[0]> = {}) => <MyAssetBookingsScreen rows={MY_BOOKINGS} today={CONTRACTS_TODAY} {...over} />;
const it = (over: Partial<Parameters<typeof AssetBookingsScreen>[0]> = {}) => <AssetBookingsScreen rows={IT_BOOKINGS} today={CONTRACTS_TODAY} {...over} />;

export const Mine: S = { name: 'My bookings · to come and with me', render: () => mine() };
export const MinePast: S = { name: 'My bookings · past (returned, declined)', render: () => mine({ show: 'past' }) };
export const MineEmpty: S = { name: 'My bookings · none yet', render: () => mine({ rows: [] }) };
export const MineCancel: S = { name: 'My bookings · Cancel a repeat pressed', render: () => mine(), play: play(press('Cancel booking')) };
export const Book: S = { name: 'Book an asset · open', render: () => mine({ booking: true }) };
export const BookApproval: S = { name: 'Book an asset · the company asks IT to approve', render: () => mine({ booking: true, approval: true }) };
export const BookMissing: S = { name: 'Book an asset · no dates, Find pressed', render: () => mine({ booking: true }), play: play(press('Find free assets')) };
export const BookFree: S = { name: 'Book an asset · free between (found)', render: () => mine({ booking: true }), play: play(date('First day', '01 Dec 2026'), date('Last day', '03 Dec 2026'), press('Find free assets')) };
export const BookWeekly: S = { name: 'Book an asset · every week', render: () => mine({ booking: true }), play: play(choose('Every week')) };
export const BookTooLong: S = { name: 'Book an asset · longer than the company allows', render: () => mine({ booking: true }), play: play(date('First day', '01 Dec 2026'), date('Last day', '20 Dec 2026'), press('Find free assets')) };
export const BookNothing: S = { name: 'Book an asset · nothing free', render: () => mine({ booking: true, found: { rows: [], categories: [], locations: [] } }), play: play(date('First day', '01 Dec 2026'), date('Last day', '01 Dec 2026'), press('Find free assets')) };
export const It: S = { name: 'IT bookings · waiting for approval', render: () => it() };
export const ItBooked: S = { name: 'IT bookings · booked (one to hand over today)', render: () => it({ show: 'coming' }) };
export const ItOut: S = { name: 'IT bookings · handed over, one overdue', render: () => it({ show: 'out' }) };
export const ItLoan: S = { name: 'IT bookings · loan report of one person', render: () => it({ person: 'p1' }) };
export const ItEmpty: S = { name: 'IT bookings · none', render: () => it({ rows: [] }) };
export const ItDecline: S = { name: 'IT bookings · Decline (reason needed)', render: () => it({ acting: { kind: 'decline', id: 'k1' } }) };
export const ItHandOver: S = { name: 'IT bookings · Hand over', render: () => it({ acting: { kind: 'hand', id: 'k2' } }) };
export const ItTakeBack: S = { name: 'IT bookings · Take back', render: () => it({ acting: { kind: 'back', id: 'k3' } }) };
export const ItCancel: S = { name: 'IT bookings · Cancel (reason needed)', render: () => it({ acting: { kind: 'cancel', id: 'k4' } }) };
export const AssetPageBookings: S = { name: 'Asset page · bookings, asset manager (not bookable while assigned)', render: () => <AssetPageScreen data={ASSET_PAGE} tab="bookings" /> };
export const AssetPageBookable: S = { name: 'Asset page · bookings, bookable', render: () => <AssetPageScreen data={{ ...ASSET_PAGE, asset: { ...ASSET_PAGE.asset, status: 'in_stock', bookable: true } }} tab="bookings" /> };
export const AssetPageBookingsView: S = { name: 'Asset page · bookings, view only', render: () => <AssetPageScreen data={{ ...ASSET_PAGE, canManage: false }} tab="bookings" /> };
export const AssetPageNoBookings: S = { name: 'Asset page · bookings, none', render: () => <AssetPageScreen data={{ ...ASSET_PAGE, bookings: [] }} tab="bookings" /> };
