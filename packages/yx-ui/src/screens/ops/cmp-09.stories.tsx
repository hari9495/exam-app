import type { Meta, StoryObj } from '@storybook/react-vite';
import { IcConsoleScreen } from './posh';
import { AWARENESS_LOG, IC_MEMBERS, POSH_CASES } from './cases-data';
import { TODAY } from '../_kit/data';
import { IC_NO_EXTERNAL, IC_TWO_COMMITTEES, IC_WRONG, liveIcConsole } from './posh-live-samples';

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
// Batch F item 13: the console a committee member opens, from the company's records.
export const MemberConsole: S = { name: 'Committee member · committee and complaints', render: () => <IcConsoleScreen today={TODAY} live={liveIcConsole()} /> };
export const MemberNoExternal: S = { name: 'Committee member · no external member', render: () => <IcConsoleScreen today={TODAY} live={liveIcConsole({ members: IC_NO_EXTERNAL })} /> };
export const MemberLoading: S = { name: 'Committee member · loading', render: () => <IcConsoleScreen today={TODAY} live={liveIcConsole({ state: 'loading', members: [], cases: [] })} /> };
export const MemberRulesBroken: S = { name: 'Committee member · presiding not a woman, a term over, details missing', render: () => <IcConsoleScreen today={TODAY} live={liveIcConsole({ members: IC_WRONG })} /> };
export const MemberTwoCommittees: S = { name: 'Committee member · company and workplace committees', render: () => <IcConsoleScreen today={TODAY} live={liveIcConsole({ members: IC_TWO_COMMITTEES })} /> };
// Answer 2593: the annual report and the awareness log from the committee's own records.
export const MemberAnnualReport: S = { name: 'Committee member · annual report (presiding)', render: () => <IcConsoleScreen today={TODAY} live={liveIcConsole({ start: { tab: 'report' } })} /> };
// Answer 2621: the annual report as a PDF (the design's Preview report).
export const MemberReportPdf: S = { name: 'Committee member · annual report with Download PDF (2621)', render: () => <IcConsoleScreen today={TODAY} live={liveIcConsole({ onPdf: () => new Promise((r) => setTimeout(r, 400)), start: { tab: 'report' } })} /> };
export const MemberReportReview: S = { name: 'Committee member · mark the report reviewed', render: () => <IcConsoleScreen today={TODAY} live={liveIcConsole({ start: { tab: 'report', dialog: 'review' } })} /> };
export const MemberReportNotPresiding: S = { name: 'Committee member · annual report (not presiding)', render: () => <IcConsoleScreen today={TODAY} live={liveIcConsole({ reports: liveIcConsole().reports!.map((r) => ({ ...r, presiding: false, stage: 'employer' as const, actionTaken: '1 transfer' })), start: { tab: 'report' } })} /> };
export const MemberAwareness: S = { name: 'Committee member · awareness log', render: () => <IcConsoleScreen today={TODAY} live={liveIcConsole({ start: { tab: 'awareness' } })} /> };
export const MemberLogSession: S = { name: 'Committee member · log a session', render: () => <IcConsoleScreen today={TODAY} live={liveIcConsole({ start: { tab: 'awareness', dialog: 'log' } })} /> };
