import type { Meta, StoryObj } from '@storybook/react-vite';
import { BudgetBars, ConsentBadges, CtcBreakupTable, EInvoiceBanner, ExEmployeeBanner, IdentityStrip, PipelineFacts, PostingStrip, RecordingPlaceholder, SlotGrid, StatusLine, SummaryTiles } from './hiring-kit';
import { ctcBreakup, findSlots } from './hiring-logic';
import { D, ID_POINTS, PANEL, POSTINGS } from './hiring-data';
import { TODAY } from '../_kit/data';
import { DEFAULT_RULES } from './hiring-pipeline';

const meta: Meta = { title: 'Screens/Hiring/Kit · Hiring and projects building blocks' };
export default meta;
type S = StoryObj;

export const Tiles: S = {
  name: 'SummaryTiles',
  render: () => <SummaryTiles label="Example" tiles={[{ label: 'Approved positions', value: 26 }, { label: 'Over 60 days', value: '₹9,52,000', sub: '38% of outstanding', tone: 'warning' }, { label: 'Utilisation', value: '76%', sub: 'target 75%', tone: 'success' }]} />,
};
export const Pipeline: S = { name: 'PipelineFacts', render: () => <PipelineFacts scores={[{ label: 'Test', value: '82', tone: 'success' }, { label: 'AI (advisory)', value: '74', tone: 'ai' }]} next="Panel 2 on 1 Oct, 11:00 am" flags={['Ex-employee']} /> };
export const Consent: S = { name: 'ConsentBadges', render: () => <ConsentBadges email="opted-in" whatsapp="opted-out" /> };
export const ExEmployee: S = { name: 'ExEmployeeBanner · recruiter and HM', render: () => <div style={{ display: 'grid', gap: 16 }}><ExEmployeeBanner viewer="recruiter" info={{ exitDate: D(2024, 3, 31), exitType: 'Resignation', rehireEligible: false }} /><ExEmployeeBanner viewer="hm" info={{ exitDate: D(2024, 3, 31), exitType: 'Resignation', rehireEligible: false }} /></div> };
export const Identity: S = { name: 'IdentityStrip', render: () => <IdentityStrip points={ID_POINTS} onReverify={() => {}} onReview={() => {}} /> };
export const Postings: S = { name: 'PostingStrip', render: () => <PostingStrip postings={POSTINGS} onAction={() => {}} /> };
export const EInvoice: S = { name: 'EInvoiceBanner · warning', render: () => <EInvoiceBanner invoiceDate={D(2026, 9, 2)} today={TODAY} invoiceNo="KF/TN/26-27/0184" /> };
export const Ctc: S = { name: 'CtcBreakupTable', render: () => <div style={{ maxWidth: 520 }}><CtcBreakupTable lines={ctcBreakup(16_00_000, { variable: 1_50_000, joiningBonus: 1_00_000 })} /></div> };
export const Recording: S = { name: 'RecordingPlaceholder', render: () => <div style={{ maxWidth: 420 }}><RecordingPlaceholder label="Answer 1" state="Answer 1 · 2:14 · stored in-region (India)" /></div> };
export const Slots: S = { name: 'SlotGrid', render: () => <SlotGrid panel={PANEL} from={DEFAULT_RULES.dayStart} to={DEFAULT_RULES.dayEnd} slots={findSlots(PANEL, DEFAULT_RULES)} chosen={null} onChoose={() => {}} /> };
export const Budget: S = { name: 'BudgetBars', render: () => <div style={{ maxWidth: 560 }}><BudgetBars rows={[{ label: 'Hours', used: 2_710, budget: 3_200 }, { label: 'Cost', used: 31_40_000, budget: 38_00_000, money: true }, { label: 'Fee billed', used: 0, budget: 1, money: true, hidden: true }]} /></div> };
export const Status: S = { name: 'StatusLine', render: () => <div style={{ display: 'grid', gap: 8 }}><StatusLine ok>Ready to publish</StatusLine><StatusLine ok={false}>Pay range missing</StatusLine></div> };
