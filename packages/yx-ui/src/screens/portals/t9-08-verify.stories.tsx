import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, never, play, press } from '../_kit/story-play';
import { clear, type } from '../people/popup-play';
import type { VerifyResult } from '../pay/live/types';
import { VerifyPageScreen } from './t9-workforce';
import { KAVERI_ACCENT, TENANT, VERIFY_DOCS } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-08 · Public verify page', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { tenant: TENANT, accent: KAVERI_ACCENT, docs: VERIFY_DOCS };

export const Current: S = { name: 'Current document', render: () => <VerifyPageScreen {...base} code="KF-VRF-8Q2M-41TZ" /> };
export const Superseded: S = { render: () => <VerifyPageScreen {...base} code="KF-VRF-3N7P-90KD" /> };
export const NotFound: S = { name: 'Not found (or withdrawn)', render: () => <VerifyPageScreen {...base} code="KF-VRF-7H1C-22WX" /> };
export const EnterCode: S = { name: 'Enter a code', render: () => <VerifyPageScreen {...base} code="" /> };
export const Phone: S = { name: 'Current · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <VerifyPageScreen {...base} code="KF-VRF-8Q2M-41TZ" /> };

// ------------------------------------------------------------------ Live: /yx/verify/[code] renders this screen; the server checks the code
const answer = (status: VerifyResult['status']) => async (): Promise<VerifyResult> => ({ company: 'Kaveri Foods Pvt Ltd', kind: 'Payslip', name: 'Arjun Kulkarni', issuedOn: '2026-11-03', status });
const live = (onCheck: (c: string) => Promise<VerifyResult>, code = 'KFQ7M2PX9A') => <VerifyPageScreen tenant="YukthiX" docs={[]} code={code} live={{ onCheck }} />;
export const LiveCurrent: S = { name: 'Live · current (opened from the QR code)', render: () => live(answer('current')) };
export const LiveSuperseded: S = { name: 'Live · superseded', render: () => live(answer('superseded')) };
export const LiveNotFound: S = { name: 'Live · not found', render: () => live(fails('No document has this code. Check the code, or ask the person for a fresh copy.')) };
export const LiveChecking: S = { name: 'Live · checking', render: () => live(never) };
export const LiveEnterCode: S = { name: 'Live · enter a code', render: () => live(answer('current'), '') };
export const LiveTooShort: S = { name: 'Live · Verify pressed with a short code', render: () => live(answer('current'), ''), play: play(clear(/Verification code/), type(/Verification code/, 'KFQ7'), press('Verify')) };
