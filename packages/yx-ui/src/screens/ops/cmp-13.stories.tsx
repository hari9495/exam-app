import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConsultantTdsScreen } from './compliance';
import { play, press, pressFirst, see, tab, type } from '../_kit/story-play';

const meta: Meta = { title: 'Screens/Compliance/CMP-13 · Consultant TDS', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const REFUSED = 'The challans for this month are already deposited. Open the Statutory hub to see them.';

export const Returns: S = { name: 'Quarterly returns (Form 140)', render: () => <ConsultantTdsScreen /> };
export const ReturnOpen: S = { name: 'A return opened · wizard', render: () => <ConsultantTdsScreen />, play: play(pressFirst(/^Open Form 140 · Q2/)) };
export const Difference: S = { name: 'Return with a challan difference', render: () => <ConsultantTdsScreen />, play: play(pressFirst(/^Open Form 140 · Q3/)) };
export const MarkFiled: S = { name: 'Mark filed · type the phrase (sheet)', render: () => <ConsultantTdsScreen />, play: play(pressFirst(/^Open Form 140 · Q2/), type(/Token number/, 'TKN998877'), press('Mark return filed')) };
export const MarkFiledTooEarly: S = { name: 'Mark filed · pressed with no token', render: () => <ConsultantTdsScreen />, play: play(pressFirst(/^Open Form 140 · Q2/), press('Mark return filed')) };
export const Challans: S = { name: 'Challans for a month', render: () => <ConsultantTdsScreen tab="challans" /> };
export const ChallansTooEarly: S = { name: 'Challans · pressed with no month', render: () => <ConsultantTdsScreen tab="challans" />, play: play(press('Prepare challans')) };
export const Certificates: S = { name: 'Certificates from TRACES', render: () => <ConsultantTdsScreen tab="certificates" /> };
export const Refused: S = { name: 'Server refusal', render: () => <ConsultantTdsScreen refuse={REFUSED} />, play: play(pressFirst(/^Open Form 140 · Q3/), press('Reconcile again'), see(REFUSED)) };
export const ReadOnly: S = { name: 'Read only (returns only)', render: () => <ConsultantTdsScreen readOnly /> };
export const Empty: S = { name: 'Empty · no returns yet', render: () => <ConsultantTdsScreen empty /> };
export const Loading: S = { render: () => <ConsultantTdsScreen state="loading" /> };
export const Error: S = { render: () => <ConsultantTdsScreen state="error" /> };
export const NoAccess: S = { name: 'No access', render: () => <ConsultantTdsScreen state="no-access" /> };
export const ChallansTab: S = { name: 'Tabs · challans opened from returns', render: () => <ConsultantTdsScreen />, play: play(tab('Challans')) };
