import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, ok, play, press, pressFirst, tick, type } from '../_kit/story-play';
import { RequestTracker } from '../desk/catalog';
import { MyDocumentsCard } from '../desk/esm2';
import { DOCUMENTS, MY_REQUEST } from '../desk/esm-data';
import { PageHeader } from '../../components/shell';
import { OpsDesk } from './ops-kit';

// Helpdesk HLP-19 · My request (the founder, 12 Nov 2026: draw the live stand-ins, then they are the live page).
// A requester's request (/yx/desk/help/[id], beside the ticket): the stage tracker with the approval route and cancel,
// and the documents to read and sign with a one-time code.
const meta: Meta = { title: 'Screens/Helpdesk/HLP-19 · My request', component: RequestTracker, subcomponents: { MyDocumentsCard }, parameters: { layout: 'fullscreen' }, decorators: [(Story) => <OpsDesk area="helpdesk" active="Help centre"><div className="yx-auth__page"><PageHeader title="My request" /><Story /></div></OpsDesk>] };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ My request (help centre) and the ticket's request panel
export const Tracker: S = { name: 'Tracker with the approval route', render: () => <RequestTracker request={MY_REQUEST} onCancel={ok} timeZone="Asia/Kolkata" /> };
export const TrackerCancel: S = { name: 'Cancel, asks why', render: () => <RequestTracker request={MY_REQUEST} onCancel={ok} timeZone="Asia/Kolkata" />, play: play(pressFirst('Cancel this')) };
export const TrackerCancelFailed: S = { name: 'Cancel refused', render: () => <RequestTracker request={MY_REQUEST} onCancel={fails('The laptop is already being imaged; ask IT to stop it.')} timeZone="Asia/Kolkata" />, play: play(pressFirst('Cancel this'), type(/Why/, 'Got a laptop from the spare pool'), press(/^Cancel/)) };
export const TrackerReadOnly: S = { name: 'Cannot cancel any more', render: () => <RequestTracker request={{ ...MY_REQUEST, items: MY_REQUEST.items.map((i) => ({ ...i, canCancel: false, stage: 'fulfilment' as const })) }} timeZone="Asia/Kolkata" /> };

const docs = (over: Partial<Parameters<typeof MyDocumentsCard>[0]> = {}) => <MyDocumentsCard documents={DOCUMENTS} onSendCode={async () => ({ to: 'ar****@kaverifoods.test', minutes: 5 })} onSign={ok} onDecline={ok} {...over} />;
export const Documents: S = { name: 'Documents to sign', render: () => docs() };
export const DocumentsSign: S = { name: 'Read and sign, open', render: () => docs(), play: play(press('Read and sign')) };
export const DocumentsSignMissing: S = { name: 'Send me a code pressed with nothing filled', render: () => docs(), play: play(press('Read and sign'), press('Send me a code')) };
export const DocumentsCodeFailed: S = { name: 'The code could not be sent', render: () => docs({ onSendCode: fails('Your work email bounced; ask HR to check it.') }), play: play(press('Read and sign'), type(/Type your full name/, 'Arjun Kulkarni'), tick(/I have read this document/), press('Send me a code')) };
export const DocumentsNone: S = { name: 'No documents', render: () => docs({ documents: [] }) };
