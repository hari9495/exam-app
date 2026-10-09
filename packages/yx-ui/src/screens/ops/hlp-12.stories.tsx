import type { Meta, StoryObj } from '@storybook/react-vite';
import { AccidentWorkspaceScreen, ReportAccidentScreen } from './cases-more';
import { ACCIDENT, ACCIDENT_MEMBERS } from './cases-data';
import { TODAY } from '../_kit/data';

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
