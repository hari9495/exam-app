import type { Meta, StoryObj } from '@storybook/react-vite';
import { AccidentWorkspaceScreen, ReportAccidentScreen } from './cases-more';
import { ACCIDENT, ACCIDENT_MEMBERS } from './cases-data';
import { TODAY } from '../_kit/data';
import { MyCasesScreen } from './cases';
import { liveMyCases } from './cases-live-samples';
import { ACC_MY_DETAIL, ACC_MY_ROW, ACC_ESI_UNKNOWN, ACC_FORM, ACC_MANAGER, ACC_NON_ESI, liveAccident, liveReport } from './accident-live-samples';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-12 · Accident case workspace', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const nonEsi = { ...ACCIDENT, id: 'ACC-0003', occurredAt: new Date(2026, 7, 11, 11, 10), person: { ...ACCIDENT.person, name: 'Naveen Hegde', role: 'Shift supervisor', monthlyWage: 42000, esiCovered: false }, daysUnable: 40 };
const contractWorker = { ...ACCIDENT, id: 'ACC-0005', person: { ...ACCIDENT.person, name: 'Murugan P.', kind: 'Contract worker', role: 'Housekeeping', contractor: 'Sri Lakshmi Facility Services' } };

export const EsiCovered: S = { name: 'ESI covered · ESIC report due', render: () => <AccidentWorkspaceScreen record={ACCIDENT} members={ACCIDENT_MEMBERS} today={TODAY} reportable /> };
export const Statutory: S = {
  name: 'Non-ESI · EC claim overdue with interest',
  render: () => <AccidentWorkspaceScreen record={nonEsi} members={ACCIDENT_MEMBERS} today={TODAY} reportable ec={{ kind: 'permanent-partial', factor: 197.06, disablementPct: 20, dueOn: new Date(2026, 8, 10) }} />,
};
export const Submitted: S = { name: 'ESIC report submitted', render: () => <AccidentWorkspaceScreen record={ACCIDENT} members={ACCIDENT_MEMBERS} today={TODAY} esicSubmitted /> };
export const ContractWorker: S = { name: 'Contract worker · contractor not filed', render: () => <AccidentWorkspaceScreen record={contractWorker} members={ACCIDENT_MEMBERS} today={TODAY} contractorNotFiled /> };
export const ManagerView: S = { name: 'Manager view (leave dates only)', render: () => <AccidentWorkspaceScreen record={ACCIDENT} members={ACCIDENT_MEMBERS} today={TODAY} view="manager" /> };
export const NonMember: S = { name: 'Not a case member (shows Not found)', render: () => <AccidentWorkspaceScreen record={ACCIDENT} members={ACCIDENT_MEMBERS} today={TODAY} view="non-member" /> };
export const ReportDesk: S = { name: 'Report an accident', render: () => <ReportAccidentScreen device="desk" today={TODAY} /> };
export const ReportPhone: S = { name: 'Report an accident · phone', globals: PHONE, render: () => <ReportAccidentScreen device="phone" today={TODAY} /> };

// States only the real records have, drawn in the same look (the live screens with sample records).
export const EsiNotRecorded: S = { name: 'ESI cover not recorded yet', render: () => <AccidentWorkspaceScreen live={liveAccident({ detail: ACC_ESI_UNKNOWN, start: { tab: 'statutory' } })} /> };
export const CaseDetails: S = { name: 'Case details (ESI cover, hospital, HR handler)', render: () => <AccidentWorkspaceScreen live={liveAccident({ start: { dialog: 'facts' } })} /> };
export const MarkFiled: S = { name: 'Mark submitted (date filed)', render: () => <AccidentWorkspaceScreen live={liveAccident({ start: { tab: 'statutory', dialog: 'filed' } })} /> };
export const EsicDetails: S = {
  name: 'ESIC details to print',
  render: () => <AccidentWorkspaceScreen live={liveAccident({ start: { tab: 'statutory', dialog: 'form', form: { title: 'ESIC accident report: details to enter on the ESIC portal', fields: [{ label: 'Employer', value: 'Kaveri Foods' }, { label: 'Insured person', value: 'Sathish Kumar' }, { label: 'Insurance number (IP)', value: '3110012345' }, { label: 'Date and time', value: '2026-11-01 10:30 am' }, { label: 'Place', value: 'Packing line 2, Hosur plant' }] } } })} />,
};
export const WorkOutCompensation: S = { name: 'Work out compensation (not ESI covered)', render: () => <AccidentWorkspaceScreen live={liveAccident({ detail: { ...ACC_NON_ESI, ec: null, clocks: [] }, start: { tab: 'statutory', dialog: 'ec' } })} /> };
export const MedicalRecords: S = { name: 'Medical records (append-only, fingerprinted)', render: () => <AccidentWorkspaceScreen live={liveAccident({ start: { tab: 'medical' } })} /> };
export const ManagerNoDates: S = { name: 'Manager view · no leave dates yet', render: () => <AccidentWorkspaceScreen live={liveAccident({ detail: { ...ACC_MANAGER, leaveFrom: null, leaveTo: null, leaveStatus: null } })} /> };
export const NoSafetyTeam: S = { name: 'Report · no safety team yet', render: () => <ReportAccidentScreen device="desk" live={liveReport({ form: { ...ACC_FORM, ready: false } })} /> };
export const ReportTooEarly: S = { name: 'Report · pressed too early', render: () => <ReportAccidentScreen device="desk" live={liveReport({ start: { tooEarly: true } })} /> };
export const ManagerLeavePending: S = { name: 'Manager view · injury leave waiting for approval in Time', render: () => <AccidentWorkspaceScreen live={liveAccident({ detail: { ...ACC_MANAGER, leaveStatus: 'pending' } })} /> };
export const ReporterStatus: S = { name: 'My cases · the reporter sees the status only', render: () => <MyCasesScreen live={liveMyCases({ cases: [ACC_MY_ROW], openId: 'acc-1', detail: ACC_MY_DETAIL })} /> };
