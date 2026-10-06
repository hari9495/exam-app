import type { Meta, StoryObj } from '@storybook/react-vite';
import { d } from './platform-data';
import {
  AiGovernanceScreen, ChatAppSettingsScreen, ChatAppView, DsarScreen, PartnersScreen, PoliciesPageScreen, RuleBuilderScreen, SAMPLE_RULES,
  type AiFeature, type DsarRow, type PartnerLink, type PolicyPoint,
} from './governance';

const meta: Meta = { title: 'Screens/Platform/Governance & rules', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

/* PLT-27 */
const DSAR: DsarRow[] = [
  { id: 'q1', ref: 'DSR-26-0031', type: 'Erasure', principal: 'Rahul Verma', relation: 'Ex-employee', channel: 'Public form', received: d(24), due: d(8, 9), assignee: 'Lakshmi Venkatesan', status: 'Collecting data' },
  { id: 'q2', ref: 'DSR-26-0030', type: 'Access', principal: 'Meera Krishnan', relation: 'Employee', channel: 'Me › My data', received: d(20), due: d(4, 9), assignee: 'Lakshmi Venkatesan', status: 'Response ready' },
  { id: 'q3', ref: 'DSR-26-0028', type: 'Grievance', principal: 'Ananya Kulkarni', relation: 'Candidate', channel: 'Candidate privacy centre', received: d(10), due: d(27), assignee: 'Farhan Sheikh', status: 'Collecting data' },
  { id: 'q4', ref: 'DSR-26-0025', type: 'Correction', principal: 'Ravi Shankar', relation: 'Employee', channel: 'Email to officer', received: d(2), due: d(2, 9), assignee: 'Farhan Sheikh', status: 'Closed' },
  { id: 'q5', ref: 'DSR-26-0032', type: 'Consent withdrawal', principal: 'Kavya Reddy', relation: 'Employee', channel: 'Me › My data', received: d(28), due: d(30), assignee: 'Lakshmi Venkatesan', status: 'Verifying identity' },
];
export const PLT27List: S = { name: 'PLT-27 · DSAR tracker', render: () => <DsarScreen view="list" rows={DSAR} /> };
export const PLT27Record: S = { name: 'PLT-27 · DSAR · erasure request (checklist, erasure log)', render: () => <DsarScreen view="record" rows={DSAR} /> };
export const PLT27Overdue: S = { name: 'PLT-27 · DSAR · overdue request', render: () => <DsarScreen view="record" rows={[DSAR[2]]} /> };
export const PLT27Empty: S = { name: 'PLT-27 · DSAR · empty', render: () => <DsarScreen view="list" rows={[]} /> };
export const PLT27Loading: S = { name: 'PLT-27 · DSAR · loading', render: () => <DsarScreen view="list" rows={DSAR} state="loading" /> };

/* PLT-28 */
const AI: AiFeature[] = [
  { key: 'ocr', name: 'Receipt reading', on: true, model: 'YukthiX OCR v4', prompt: 'p-2026.09.1', region: 'India', evalScore: 96, threshold: 95, lastEval: d(21), euClass: 'No', accept: 94, edit: 5, dismiss: 1 },
  { key: 'helpdesk', name: 'Helpdesk answers', on: true, model: 'Managed LLM · large', prompt: 'p-2026.08.4', region: 'India', evalScore: 95, threshold: 95, lastEval: d(18), euClass: 'No', accept: 77, edit: 9, dismiss: 14 },
  { key: 'review', name: 'Review summaries', on: false, model: 'Managed LLM · large', prompt: 'p-2026.07.2', region: 'India', evalScore: 98, threshold: 98, lastEval: d(2), euClass: 'Yes', accept: 0, edit: 0, dismiss: 0 },
  { key: 'attrition', name: 'Attrition risk bands', on: true, model: 'YukthiX risk v2', prompt: 'n/a', region: 'India', evalScore: 91, threshold: 95, lastEval: d(14), euClass: 'Depends', accept: 61, edit: 0, dismiss: 39 },
  { key: 'coach', name: 'Manager coach nudges', on: true, model: 'Managed LLM · small', prompt: 'p-2026.09.2', region: 'India', evalScore: 99, threshold: 98, lastEval: d(25), euClass: 'Depends', accept: 48, edit: 12, dismiss: 40 },
];
export const PLT28Dashboard: S = { name: 'PLT-28 · AI quality & governance', render: () => <AiGovernanceScreen features={AI} /> };
export const PLT28Eu: S = { name: 'PLT-28 · AI governance · EU company (high-risk off)', render: () => <AiGovernanceScreen features={AI} eu /> };
export const PLT28Card: S = { name: 'PLT-28 · AI governance · model card', render: () => <AiGovernanceScreen features={AI} cardKey="helpdesk" /> };

/* PLT-29 */
export const PLT29Settings: S = { name: 'PLT-29 · Chat app · connect & settings', render: () => <ChatAppSettingsScreen /> };
export const PLT29NotConnected: S = { name: 'PLT-29 · Chat app · not connected', render: () => <ChatAppSettingsScreen connected={false} /> };
export const PLT29Home: S = { name: 'PLT-29 · Chat app · app home (Slack)', render: () => <ChatAppView app="Slack" view="home" /> };
export const PLT29Approve: S = { name: 'PLT-29 · Chat app · approve / reject card (Teams)', render: () => <ChatAppView app="Teams" view="approval" /> };
export const PLT29Approved: S = { name: 'PLT-29 · Chat app · card after approval', render: () => <ChatAppView app="Slack" view="approved" /> };
export const PLT29Checkin: S = { name: 'PLT-29 · Chat app · check-in', render: () => <ChatAppView app="Slack" view="checkin" /> };
export const PLT29Balance: S = { name: 'PLT-29 · Chat app · leave balance', render: () => <ChatAppView app="Teams" view="balance" /> };
export const PLT29Sensitive: S = { name: 'PLT-29 · Chat app · sensitive → open in app', render: () => <ChatAppView app="Slack" view="sensitive" /> };
export const PLT29Unlinked: S = { name: 'PLT-29 · Chat app · account not linked', render: () => <ChatAppView app="Teams" view="unlinked" /> };

/* PLT-30 */
const LINKS: PartnerLink[] = [
  { id: 'pl1', firm: 'Iyer & Rao Associates', type: 'CA firm', ownership: 'Client-owned', relationship: 'Operates', users: 3, since: d(1, 3), status: 'Active' },
  { id: 'pl2', firm: 'Setu Implementation Partners', type: 'Implementation partner', ownership: 'Client-owned', relationship: 'Advises', users: 2, since: d(15, 1), status: 'Ended' },
  { id: 'pl3', firm: 'Deccan Payroll Services', type: 'Payroll bureau', ownership: 'Client-owned', relationship: 'Operates', users: 0, since: d(28), status: 'Pending' },
];
export const PLT30Linked: S = { name: 'PLT-30 · Partners · linked partners', render: () => <PartnersScreen view="linked" links={LINKS} /> };
export const PLT30Grant: S = { name: 'PLT-30 · Partners · grant editor & delegation switches', render: () => <PartnersScreen view="grant" links={LINKS} /> };
export const PLT30Log: S = { name: 'PLT-30 · Partners · access log', render: () => <PartnersScreen view="log" links={LINKS} /> };
export const PLT30End: S = { name: 'PLT-30 · Partners · end link', render: () => <PartnersScreen view="grant" links={LINKS} endOpen /> };
export const PLT30Transfer: S = { name: 'PLT-30 · Partners · ownership transfer', render: () => <PartnersScreen view="grant" links={[{ ...LINKS[0], ownership: 'Partner-owned' }]} transferOpen /> };
export const PLT30Directory: S = { name: 'PLT-30 · Partners · directory & link request', render: () => <PartnersScreen view="directory" links={LINKS} /> };
export const PLT30Empty: S = { name: 'PLT-30 · Partners · none linked', render: () => <PartnersScreen view="linked" links={[]} /> };

/* PLT-31 */
const POINTS: PolicyPoint[] = [
  { id: 'pp1', point: 'Casual leave entitlement', rule: '12 days a year; Mine sites 14 days', scopes: ['All entities', 'Hosur plant', 'Salem mine'], origin: 'Customised', changed: d(28), by: 'Farhan Sheikh', pending: true },
  { id: 'pp2', point: 'Earned leave accrual', rule: '1.25 days a month after 240 days worked', scopes: ['All entities'], origin: 'Starter', changed: d(1, 3), by: 'YukthiX starter' },
  { id: 'pp3', point: 'Carry-forward limit', rule: 'Up to 30 days; the rest is encashed in March', scopes: ['All entities'], origin: 'Customised', changed: d(12, 4), by: 'Lakshmi Venkatesan' },
  { id: 'pp4', point: 'Late marks', rule: '10 minutes grace, 3 a month; the 4th is a half day', scopes: ['Hosur plant'], origin: 'Customised', changed: d(4, 6), by: 'Farhan Sheikh' },
  { id: 'pp5', point: 'Overtime eligibility', rule: 'Workers in grades G1–G3; law sets 2× for factory workers', scopes: ['Hosur plant'], origin: 'Starter', changed: d(1, 3), by: 'YukthiX starter' },
  { id: 'pp6', point: 'Sandwich rule', rule: 'Weekends between leave days count as leave', scopes: ['Kaveri Foods Pvt Ltd (Tamil Nadu)'], origin: 'Starter', changed: d(1, 3), by: 'YukthiX starter' },
];
export const PLT31Policies: S = { name: 'PLT-31 · Policies page (Time & Leave)', render: () => <PoliciesPageScreen rows={POINTS} /> };
export const PLT31Loading: S = { name: 'PLT-31 · Policies page · loading', render: () => <PoliciesPageScreen rows={POINTS} state="loading" /> };
export const PLT31Empty: S = { name: 'PLT-31 · Policies page · empty', render: () => <PoliciesPageScreen module="Engage" rows={[]} /> };

/* PLT-32 */
export const PLT32Builder: S = { name: 'PLT-32 · Rule builder · conditions, summary, overlap warning', render: () => <RuleBuilderScreen /> };
export const PLT32NoWarnings: S = { name: 'PLT-32 · Rule builder · clean rule', render: () => <RuleBuilderScreen rules={SAMPLE_RULES.filter((r) => r.id !== 'r2')} /> };
export const PLT32LawFloor: S = { name: 'PLT-32 · Rule builder · legal floor warning', render: () => <RuleBuilderScreen lawFloor rules={[]} /> };
export const PLT32Formula: S = { name: 'PLT-32 · Rule builder · formula tab', render: () => <RuleBuilderScreen tab="formula" rules={[]} /> };
export const PLT32FormulaError: S = { name: 'PLT-32 · Rule builder · formula error', render: () => <RuleBuilderScreen tab="formula" formula='IF(location.site_type = "Mine", 14, SUMX(12)' rules={[]} /> };
export const PLT32Versions: S = { name: 'PLT-32 · Rule builder · version diff', render: () => <RuleBuilderScreen tab="versions" rules={[]} /> };
export const PLT32Submitted: S = { name: 'PLT-32 · Rule builder · submitted for approval', render: () => <RuleBuilderScreen submitted rules={[]} /> };
