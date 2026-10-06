import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AgentActionsLogScreen,
  CopilotActionChat,
  CopilotActionPhone,
  CopilotActionWeb,
  EntityDataRegionScreen,
  EorConnectorSetup,
  RegionMoveScreen,
  type AgentAction,
  type CopilotAction,
  type EntityRegion,
} from './region-agent-screens';
import { d } from './platform-b-data';
import { entityHeadcount } from '../_kit/data';

const meta: Meta = { title: 'Screens/Platform/PLT-45…49 · Regions, copilot & EOR', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

/* ---- PLT-45 ---- */
const ENTS: EntityRegion[] = [
  { id: 'kf-ka', name: 'Kaveri Foods Pvt Ltd', country: 'India', region: 'IN', employees: entityHeadcount('kf-ka') },
  { id: 'kf-tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', country: 'India', region: 'IN', employees: entityHeadcount('kf-tn') },
  { id: 'kf-ae', name: 'Kaveri Foods FZE (Dubai)', country: 'United Arab Emirates', region: 'IN', employees: 18, moving: 'ME-AE' },
  { id: 'kf-sa', name: 'Kaveri Foods Arabia LLC', country: 'Saudi Arabia', region: null, employees: 0 },
];
export const Plt45: S = { name: 'PLT-45 · Entity data region · read-only after set', render: () => <EntityDataRegionScreen entities={ENTS.slice(0, 2)} selected="kf-ka" /> };
export const Plt45Multi: S = { name: 'PLT-45 · Entity data region · multi-region, move scheduled', render: () => <EntityDataRegionScreen entities={[...ENTS.slice(0, 3), { id: 'kf-sg', name: 'Kaveri Foods Pte Ltd (Singapore)', country: 'Singapore', region: 'SG', employees: 9 }]} selected="kf-ae" /> };
export const Plt45Choose: S = { name: 'PLT-45 · Entity data region · new entity, choosing', render: () => <EntityDataRegionScreen entities={[ENTS[0], { ...ENTS[2], region: null, moving: undefined, id: 'new', name: 'Kaveri Foods FZE (new)' }]} selected="new" choosing /> };
export const Plt45NoRegion: S = { name: 'PLT-45 · Entity data region · country region not live', render: () => <EntityDataRegionScreen entities={[ENTS[0], ENTS[3]]} selected="kf-sa" choosing /> };

/* ---- PLT-46 ---- */
export const Plt46Request: S = { name: 'PLT-46 · Region move · request with impact and notice', render: () => <RegionMoveScreen stage="draft" /> };
export const Plt46Blocked: S = { name: 'PLT-46 · Region move · out of in-country region blocked', render: () => <RegionMoveScreen stage="draft" from="ME-AE" to="IN" /> };
export const Plt46Copying: S = { name: 'PLT-46 · Region move · copying (status)', render: () => <RegionMoveScreen stage="copying" /> };
export const Plt46Done: S = { name: 'PLT-46 · Region move · done, certificate', render: () => <RegionMoveScreen stage="source-deleted" /> };
export const Plt46Refused: S = { name: 'PLT-46 · Region move · refused', render: () => <RegionMoveScreen stage="refused" from="ME-AE" to="EU" /> };

/* ---- PLT-47 ---- */
const LEAVE_ACTION: CopilotAction = {
  title: 'Apply casual leave for Divya Raghunathan',
  changes: [
    { field: 'Dates', value: 'Thu 8 Oct 2026 – Fri 9 Oct 2026 (2 days)' },
    { field: 'Leave type', value: 'Casual leave' },
    { field: 'Balance after', value: '6 of 14 days', masked: true },
    { field: 'Approver', value: 'Karthik Subramanian' },
  ],
  dataUsed: ['Your leave balance', 'Holiday calendar, Chennai office', 'Leave policy v6'],
};
export const Plt47Web: S = { name: 'PLT-47 · Copilot action card · web', render: () => <CopilotActionWeb action={LEAVE_ACTION} /> };
export const Plt47Confirmed: S = { name: 'PLT-47 · Copilot action card · confirmed', render: () => <CopilotActionWeb action={{ ...LEAVE_ACTION, confirmed: true }} /> };
export const Plt47Phone: S = { ...phone, name: 'PLT-47 · Copilot action card · phone', render: () => <CopilotActionPhone action={LEAVE_ACTION} /> };
export const Plt47Chat: S = { name: 'PLT-47 · Copilot action card · Teams chat', render: () => <CopilotActionChat channel="chat" ask="Apply 2 days casual leave on 8 and 9 Oct" action={LEAVE_ACTION} /> };
export const Plt47WhatsApp: S = { name: 'PLT-47 · Copilot action card · WhatsApp, balance masked', render: () => <CopilotActionChat channel="whatsapp" ask="Leave 8 and 9 Oct please" action={LEAVE_ACTION} /> };
export const Plt47Manager: S = {
  name: 'PLT-47 · Copilot · manager asks to approve (sent to app)',
  render: () => <CopilotActionChat channel="chat" ask="Approve Priya's leave" action={{ ...LEAVE_ACTION, notAllowed: 'Assistants can’t approve or reject requests. Open the approvals inbox to decide on Priya Natarajan’s leave.' }} />,
};
export const Plt47NoCredits: S = { name: 'PLT-47 · Copilot · no AI credits left', render: () => <CopilotActionChat channel="chat" ask="Apply 2 days casual leave on 8 and 9 Oct" action={{ ...LEAVE_ACTION, noCredits: true }} /> };

/* ---- PLT-48 ---- */
const ACTIONS: AgentAction[] = [
  { id: 'a1', at: d(9, 29, 9, 12), person: 'Divya Raghunathan', feature: 'Employee copilot v3.2', channel: 'Teams', action: 'Prepared leave request LR-2317, 2 days casual', confirmation: 'Confirmed', result: 'Done', undoable: true },
  { id: 'a2', at: d(9, 29, 8, 50), person: 'Karthik Subramanian', feature: 'Manager copilot v2.0', channel: 'Web', action: 'Asked to approve LR-2301; sent to approvals inbox', confirmation: 'Sent to app', result: 'Not run', undoable: false },
  { id: 'a3', at: d(9, 28, 17, 30), person: 'Lakshmi Venkatesan', feature: 'Do mode v1.0', channel: 'Web', action: 'Plan: 12 transfer requests to Chakan from 1 Nov 2026', confirmation: 'Plan approved', result: 'Done', undoable: true },
  { id: 'a4', at: d(9, 28, 12, 4), person: 'Murugan Selvam', feature: 'Employee copilot v3.2', channel: 'WhatsApp', action: 'Prepared expense claim EX-0912, ₹1,240', confirmation: 'Cancelled', result: 'Not run', undoable: false },
  { id: 'a5', at: d(9, 27, 15, 20), person: 'Suresh Pillai', feature: 'Do mode v1.0', channel: 'Web', action: 'Plan step “Update cost centre” failed validation and stopped', confirmation: 'Plan approved', result: 'Failed', undoable: false },
];
export const Plt48: S = { name: 'PLT-48 · Agent actions log · System Admin (undo)', render: () => <AgentActionsLogScreen rows={ACTIONS} /> };
export const Plt48Aud: S = { name: 'PLT-48 · Agent actions log · auditor, read-only', render: () => <AgentActionsLogScreen rows={ACTIONS} persona="Aud" /> };
export const Plt48Empty: S = { name: 'PLT-48 · Agent actions log · empty', render: () => <AgentActionsLogScreen rows={[]} /> };
export const Plt48Loading: S = { name: 'PLT-48 · Agent actions log · loading', render: () => <AgentActionsLogScreen rows={[]} state="loading" /> };
export const Plt48Error: S = { name: 'PLT-48 · Agent actions log · error', render: () => <AgentActionsLogScreen rows={[]} state="error" /> };

/* ---- PLT-49 ---- */
export const Plt49Provider: S = { name: 'PLT-49 · EOR connector · provider', render: () => <EorConnectorSetup /> };
export const Plt49Sync: S = { name: 'PLT-49 · EOR connector · worker sync (minimised fields)', render: () => <EorConnectorSetup defaultStep="sync" /> };
export const Plt49Invoices: S = { name: 'PLT-49 · EOR connector · payslips and invoices', render: () => <EorConnectorSetup defaultStep="results" /> };
export const Plt49Connected: S = { name: 'PLT-49 · EOR connector · connected health', render: () => <EorConnectorSetup connected /> };
