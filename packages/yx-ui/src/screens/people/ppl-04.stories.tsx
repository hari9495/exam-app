import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChangeActionSheet } from './changes';
import { d, TODAY } from './people-data';
import { ChangeReview } from '../history';
import { CHANGES, IMPACT } from '../history/data';
import { fails, never, ok, play, press } from './popup-play';

const meta: Meta = { title: 'Screens/People/PPL-04 · Change action', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Start: S = { name: 'HR · find a person, changes waiting', render: () => <ChangeActionSheet persona="hr" kind="Promotion" effective={d(2026, 10, 1)} today={TODAY} startOpen={false} /> };
export const Promotion: S = { name: 'HR · promotion with pay change', render: () => <ChangeActionSheet persona="hr" kind="Promotion" effective={d(2026, 10, 1)} today={TODAY} /> };
export const PromotionBoth: S = { name: 'HR · promotion when the company requires both a new designation and grade', render: () => <ChangeActionSheet persona="hr" kind="Promotion" effective={d(2026, 10, 1)} today={TODAY} promotionMustChange="both" /> };
export const Transfer: S = { name: 'HR · transfer with impact preview (PT state)', render: () => <ChangeActionSheet persona="hr" kind="Transfer" effective={d(2026, 10, 5)} today={TODAY} /> };
export const InterEntity: S = { name: 'HR · inter-entity transfer options', render: () => <ChangeActionSheet persona="hr" kind="Inter-entity transfer" effective={d(2026, 10, 5)} today={TODAY} /> };
export const Retro: S = { name: 'HR · correction into processed payroll', render: () => <ChangeActionSheet persona="hr" kind="Promotion" effective={d(2026, 8, 1)} today={TODAY} payrollProcessedTo={d(2026, 9, 30)} /> };
export const Manager: S = { name: 'Manager · promotion without salary grant', render: () => <ChangeActionSheet persona="mgr" kind="Promotion" effective={d(2026, 10, 1)} today={TODAY} /> };

// Review a change (People › Job changes): the live approval drawer with the impact first.
const review = (over: Partial<Parameters<typeof ChangeReview>[0]> = {}) => <ChangeReview row={CHANGES[3]} onPreview={async () => IMPACT} onApprove={ok} onReject={() => undefined} onClose={() => undefined} {...over} />;
export const Review: S = { name: 'Review · impact with a later change recalculated', render: () => review() };
export const ReviewWorking: S = { name: 'Review · Approve pressed before the impact shows', render: () => review({ onPreview: never }), play: play(press('Approve')) };
export const ReviewNoImpact: S = { name: 'Review · the impact could not be worked out', render: () => review({ onPreview: fails('The salary template for G3 is missing a component.') }), play: play(press('Approve')) };
export const ReviewFailed: S = { name: 'Review · the server refuses the approval', render: () => review({ onApprove: fails('You raised this change, so someone else must approve it.') }), play: play(press('Approve and recalculate')) };
export const ReviewSimple: S = { name: 'Review · manager change, nothing recalculated', render: () => review({ row: CHANGES[4], onPreview: async () => ({ ...IMPACT, effectiveDate: '2026-10-05', facts: [{ fact: 'Manager', from: 'Ramesh Gowda', to: 'Lakshmi Venkatesan' }], pay: [], rebased: [] }) }) };
