import type { Meta, StoryObj } from '@storybook/react-vite';
import { PolicyLibraryScreen } from './helpdesk';
import { POLICIES } from './helpdesk-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-10 · Policy library + acknowledgement', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const allDone = POLICIES.map((p) => ({ ...p, myStatus: 'Acknowledged' as const, acknowledgedOn: p.effective }));

export const ToAcknowledge: S = { name: 'To acknowledge', render: () => <PolicyLibraryScreen policies={POLICIES} today={TODAY} /> };
export const ClickAck: S = { name: 'Acknowledge by click', render: () => <PolicyLibraryScreen policies={POLICIES} today={TODAY} openId="POL-04" /> };
export const OtpAck: S = { name: 'Critical policy · one-time code', render: () => <PolicyLibraryScreen policies={POLICIES} today={TODAY} openId="POL-01" otpSent /> };
export const QuizAck: S = { name: 'Quiz · one wrong answer', render: () => <PolicyLibraryScreen policies={POLICIES} today={TODAY} openId="POL-02" quizAnswers={{ q1: '1 month', q2: 'Only the Internal Committee members on the case' }} /> };
export const Acknowledged: S = { render: () => <PolicyLibraryScreen policies={POLICIES} today={TODAY} openId="POL-03" /> };
export const UpToDate: S = { name: 'Empty (nothing to acknowledge)', render: () => <PolicyLibraryScreen policies={allDone} today={TODAY} /> };
export const Loading: S = { render: () => <PolicyLibraryScreen policies={POLICIES} today={TODAY} state="loading" /> };
export const Error: S = { render: () => <PolicyLibraryScreen policies={POLICIES} today={TODAY} state="error" /> };
export const Phone: S = { name: 'Policies · phone', globals: PHONE, render: () => <PolicyLibraryScreen device="phone" policies={POLICIES} today={TODAY} /> };
export const PhoneOtp: S = { name: 'One-time code · phone', globals: PHONE, render: () => <PolicyLibraryScreen device="phone" policies={POLICIES} today={TODAY} openId="POL-01" otpSent /> };
