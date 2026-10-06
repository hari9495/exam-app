import type { Meta, StoryObj } from '@storybook/react-vite';
import { IcConsoleScreen } from './posh';
import { AWARENESS_LOG, IC_MEMBERS, POSH_CASES } from './cases-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Compliance/CMP-09 · IC console', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { members: IC_MEMBERS, cases: POSH_CASES, awareness: AWARENESS_LOG, today: TODAY };

export const Committee: S = { name: 'Committee (valid)', render: () => <IcConsoleScreen {...base} /> };
export const NotValid: S = { name: 'Committee not valid (no external member)', render: () => <IcConsoleScreen {...base} members={IC_MEMBERS.filter((m) => m.role !== 'external')} /> };
export const Cases: S = { name: 'Complaints', render: () => <IcConsoleScreen {...base} tab="cases" /> };
export const AnnualReport: S = { name: 'Annual report builder', render: () => <IcConsoleScreen {...base} tab="report" /> };
export const Awareness: S = { name: 'Awareness log', render: () => <IcConsoleScreen {...base} tab="awareness" /> };
export const HrView: S = { name: 'HR (anonymised counts only)', render: () => <IcConsoleScreen {...base} persona="hr" /> };
export const NotMember: S = { name: 'Not an IC member (shows Not found)', render: () => <IcConsoleScreen {...base} persona="none" /> };
