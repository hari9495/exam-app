import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClaimComposerScreen } from './expenses';
import { MUMBAI_LINES } from './expenses-data';
import type { ExpenseLine } from './expenses-data';

const meta: Meta = { title: 'Screens/Expenses/EXP-02 · Claim composer', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

const fxLine: ExpenseLine = { id: 'fx', date: new Date(2026, 10, 12), category: 'Hotel', merchant: 'Creek Side Hotel, Dubai', city: 'Dubai', tier: 'International', amount: 27552, receipt: true, ocr: true, mode: 'Personal', kind: 'fx', fx: { currency: 'AED', amount: 1200, rate: 22.96, source: 'RBI reference rate', rateDate: new Date(2026, 10, 12), entered: 23.88 } };
const fieldLine: ExpenseLine = { id: 'fd', date: new Date(2026, 8, 28), category: 'Mileage', merchant: 'Field visits: 6 outlets, Jayanagar beat', city: 'Bengaluru', tier: 'Tier 1', amount: 714, receipt: false, mode: 'Personal', kind: 'field-draft', km: 42, rate: 17 };
const blocked: ExpenseLine = { id: 'hb', date: new Date(2026, 8, 20), category: 'Client entertainment', merchant: 'Spice Route', city: 'Bengaluru', tier: 'Tier 1', amount: 5600, receipt: true, mode: 'Personal', limit: 3000, hardBlock: true };
const dup: ExpenseLine = { id: 'dp', date: new Date(2026, 8, 15), category: 'Local cab', merchant: 'CityRide', city: 'Mumbai', tier: 'Tier 1', amount: 640, receipt: true, mode: 'Personal', limit: 1500, duplicateOf: 'EXP-1036 (Sana Nizami)' };

export const Draft: S = { name: 'Draft · policy flags, per diem, mileage', render: () => <ClaimComposerScreen title="Mumbai distributor meet" lines={MUMBAI_LINES} advance={10000} trip="TRP-0211" /> };
export const Gst: S = { name: 'GST capture on', render: () => <ClaimComposerScreen title="Mumbai distributor meet" lines={MUMBAI_LINES.slice(0, 2)} advance={0} gstOn /> };
export const ForeignCurrency: S = { name: 'Foreign currency · rate variance flag', render: () => <ClaimComposerScreen title="Dubai trade show" lines={[fxLine]} advance={0} /> };
export const FieldDraft: S = { name: 'Field-visit distance to confirm', render: () => <ClaimComposerScreen title="Beat visits, 28 Sep" lines={[fieldLine]} advance={0} /> };
export const Blocked: S = { name: 'Hard block and duplicate', render: () => <ClaimComposerScreen title="September client meetings" lines={[blocked, dup]} advance={0} /> };
export const Empty: S = { name: 'Empty claim', render: () => <ClaimComposerScreen title="New claim" lines={[]} advance={0} /> };
export const Submitted: S = { render: () => <ClaimComposerScreen title="Mumbai distributor meet" lines={MUMBAI_LINES} advance={10000} submitted /> };
export const PhoneCamera: S = { name: 'Receipt capture · phone', globals: PHONE, render: () => <ClaimComposerScreen device="phone" title="New claim" lines={[]} advance={0} camera="ready" /> };
export const PhoneReading: S = { name: 'Reading receipt · phone', globals: PHONE, render: () => <ClaimComposerScreen device="phone" title="New claim" lines={MUMBAI_LINES.slice(0, 1)} advance={0} camera="processing" /> };
export const PhoneDenied: S = { name: 'Camera off · phone', globals: PHONE, render: () => <ClaimComposerScreen device="phone" title="New claim" lines={[]} advance={0} camera="denied" /> };
export const Phone: S = { name: 'Claim · phone (you will receive)', globals: PHONE, render: () => <ClaimComposerScreen device="phone" title="Mumbai distributor meet" lines={MUMBAI_LINES} advance={10000} /> };
