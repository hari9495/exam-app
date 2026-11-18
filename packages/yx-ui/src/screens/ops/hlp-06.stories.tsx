import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckReportScreen, SpeakUpScreen } from './cases';
import { ANON_MESSAGES } from './helpdesk-data';
import { TODAY } from '../_kit/data';
import { SpeakUpSetupScreen, type LiveSpeakUp, type LiveSpeakUpSetup } from './helpdesk-speakup-live';
import { REPORTER_VIEW, SU_FORM, liveCheck, liveSetup, liveSpeakUp } from './helpdesk-speakup-live-samples';

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

// States only the real records have (Helpdesk design wiring, HLP-06 live), drawn in the same layout as the stories
// above: the company's topics and "it is about a case officer", nobody chosen yet, POSH with no committee or past its
// window, pressed too early, and the set-up of who receives reports (the System Admin's page).
const su = (over: Partial<LiveSpeakUp> = {}) => <SpeakUpScreen live={liveSpeakUp(over)} />;
const setup = (over: Partial<LiveSpeakUpSetup> = {}) => <SpeakUpSetupScreen live={liveSetup(over)} />;
export const TopicAndAbout: S = { name: 'Topic and “is it about someone on the case team?”', render: () => su({ start: { kind: 'whistleblower', identity: 'anonymous' } }) };
export const NotSetUp: S = { name: 'Nobody receives reports yet', render: () => su({ form: { ...SU_FORM, ready: { grievance: false, whistleblower: false, posh: false } } }) };
export const PoshNoIc: S = { name: 'Sexual harassment · no Internal Committee yet', render: () => su({ form: { ...SU_FORM, ready: { ...SU_FORM.ready, posh: false } }, start: { kind: 'posh' } }) };
export const PoshLate: S = { name: 'Sexual harassment · complaint form, past the filing window', render: () => su({ start: { kind: 'posh', poshForm: true, happenedOn: '2026-06-10' } }) };
export const TooEarly: S = { name: 'File report pressed with nothing written', render: () => su({ start: { tooEarly: true } }) };
export const FormLoading: S = { name: 'Loading', render: () => su({ state: 'loading', form: null }) };
export const FormError: S = { name: 'Error', render: () => su({ state: 'error', form: null }) };
export const NoAccess: S = { name: 'No access (acting for someone else)', render: () => su({ state: 'no-access' }) };
export const CheckEmpty: S = { name: 'Check my report · no messages yet', render: () => <CheckReportScreen live={liveCheck({ start: { view: { ...REPORTER_VIEW, status: 'received', messages: [] } } })} /> };
export const Setup: S = { name: 'Set-up · who receives reports', render: () => setup() };
export const SetupUnfinished: S = { name: 'Set-up · Internal Committee and Escalation still empty', render: () => { const b = liveSetup(); return <SpeakUpSetupScreen live={{ ...b, data: { ...b.data!, members: b.data!.members.filter((m) => m.team === 'ethics') } }} />; } };
export const SetupAddIc: S = { name: 'Set-up · add to the Internal Committee', render: () => setup({ start: { adding: 'ic' } }) };
export const SetupTooEarly: S = { name: 'Set-up · Add pressed with nobody chosen', render: () => setup({ start: { adding: 'ethics', tooEarly: true } }) };
export const SetupNoAccess: S = { name: 'Set-up · no access (HR without the key)', render: () => setup({ state: 'no-access' }) };
// Answer 2591: the committee list asks whether a member is a woman and when the term ends, and warns what is wrong.
export const SetupIcNotComplete: S = { name: 'Set-up · Internal Committee not complete', render: () => { const b = liveSetup(); return <SpeakUpSetupScreen live={{ ...b, data: { ...b.data!, members: b.data!.members.map((m) => (m.team === 'ic' && m.role === 'presiding' ? { ...m, woman: null, termEndsOn: null } : m)) } }} />; } };
