import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckReportScreen, SpeakUpScreen } from './cases';
import { ANON_MESSAGES } from './helpdesk-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-06 · Speak-up filing', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const NamedGrievance: S = { name: 'Grievance · named, confidential', render: () => <SpeakUpScreen today={TODAY} /> };
export const Anonymous: S = { name: 'Whistleblower · anonymous', render: () => <SpeakUpScreen today={TODAY} defaultKind="whistleblower" defaultIdentity="anonymous" /> };
export const AnonymousOff: S = { name: 'Anonymous switched off by company', render: () => <SpeakUpScreen today={TODAY} anonymousAllowed={false} /> };
export const PoshRedirect: S = { name: 'Sexual harassment · goes to IC', render: () => <SpeakUpScreen today={TODAY} defaultKind="posh" /> };
export const FiledNamed: S = { name: 'Filed · named (GRC clock)', render: () => <SpeakUpScreen today={TODAY} submitted="named" /> };
export const FiledAnonymous: S = { name: 'Filed · access code shown once', render: () => <SpeakUpScreen today={TODAY} defaultKind="whistleblower" submitted="anonymous" /> };
export const Phone: S = { name: 'Speak up · phone', globals: PHONE, render: () => <SpeakUpScreen device="phone" today={TODAY} defaultIdentity="anonymous" /> };
export const PhoneCode: S = { name: 'Access code · phone', globals: PHONE, render: () => <SpeakUpScreen device="phone" today={TODAY} defaultKind="whistleblower" submitted="anonymous" /> };
export const CheckMyReport: S = { name: 'Check my report (no login)', render: () => <CheckReportScreen /> };
export const CheckWrongCode: S = { name: 'Check my report · wrong code', render: () => <CheckReportScreen state="wrong-code" /> };
export const CheckLocked: S = { name: 'Check my report · too many tries', render: () => <CheckReportScreen state="locked" /> };
export const CheckOpen: S = { name: 'Check my report · messages', render: () => <CheckReportScreen state="open" messages={ANON_MESSAGES} /> };
