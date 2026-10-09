import type { Meta, StoryObj } from '@storybook/react-vite';
import { OfferRecordScreen } from './hiring-offers';
import { D, OFFER_ACTIVITY, OFFER_CONDITIONS } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-29 · Offer conditions tab', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const rec = { candidate: 'Joseph George', job: 'Senior QA Engineer', ctc: 20_50_000, today: TODAY, activity: OFFER_ACTIVITY, defaultTab: 'conditions' as const, status: 'Sent' as const };

export const OnTrack: S = { name: 'Open conditions · on track', render: () => <OfferRecordScreen {...rec} conditions={OFFER_CONDITIONS.map((c) => (c.id === 'oc2' ? { ...c, due: D(2026, 10, 12) } : c))} lapseDate={D(2026, 10, 20)} /> };
export const Reminder: S = { name: 'Overdue condition · lapse reminder', render: () => <OfferRecordScreen {...rec} conditions={OFFER_CONDITIONS} lapseDate={D(2026, 10, 1)} /> };
export const Lapsed: S = { name: 'Lapsed · pre-boarding unwound', render: () => <OfferRecordScreen {...rec} status="Lapsed" conditions={OFFER_CONDITIONS} lapseDate={D(2026, 9, 27)} /> };
export const AllMet: S = { name: 'All met or waived', render: () => <OfferRecordScreen {...rec} conditions={OFFER_CONDITIONS.map((c) => ({ ...c, status: c.status === 'open' ? ('met' as const) : c.status }))} lapseDate={D(2026, 10, 20)} /> };
