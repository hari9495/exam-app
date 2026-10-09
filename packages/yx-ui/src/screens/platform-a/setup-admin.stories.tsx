import type { Meta, StoryObj } from '@storybook/react-vite';
import { at, d } from './platform-data';
import {
  NotificationSettingsScreen, PolicyEditorScreen, RolesAccessScreen, SetupHubScreen, TenantWizardScreen, type DeliveryRow, type ImportPreviewRow, type ModuleCard, type RoleRow,
} from './setup-admin';

const meta: Meta = { title: 'Screens/Platform/Set-up & administration', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const MODULES: ModuleCard[] = [
  { id: 'org', name: 'Organisation', owner: 'Lakshmi Venkatesan', signedOff: '22 Sep 2026', checks: [{ id: 'o1', label: 'Legal entities and statutory IDs', blocking: true, done: true }, { id: 'o2', label: 'Locations with geofence', blocking: true, done: true }, { id: 'o3', label: 'Departments (manufacturing starter)', blocking: false, done: true, starter: true }] },
  { id: 'people', name: 'People', owner: 'Lakshmi Venkatesan', checks: [{ id: 'p1', label: 'Import 248 employees', blocking: true, done: true }, { id: 'p2', label: 'Managers assigned for all', blocking: true, done: true }, { id: 'p3', label: 'Letter templates reviewed', blocking: false, done: false, starter: true }] },
  { id: 'time', name: 'Time & Leave', owner: 'Farhan Sheikh', checks: [{ id: 't1', label: 'Leave year and opening balances', blocking: true, done: true }, { id: 't2', label: 'Holiday calendar for Hosur plant', blocking: true, done: false }, { id: 't3', label: 'Leave types (starter)', blocking: false, done: false, starter: true }, { id: 't4', label: 'Shifts and rosters', blocking: true, done: true }] },
  { id: 'pay', name: 'Payroll', owner: 'Suresh Pillai', checks: [{ id: 'y1', label: 'Salary structures', blocking: true, done: true }, { id: 'y2', label: 'Bank details for 12 employees', blocking: true, done: false }, { id: 'y3', label: 'Parallel run for August', blocking: false, done: true }] },
  { id: 'stat', name: 'Statutory', owner: 'Suresh Pillai', checks: [{ id: 's1', label: 'PF and ESI registrations', blocking: true, done: true }, { id: 's2', label: 'PT and LWF states', blocking: true, done: true }] },
  { id: 'hire', name: 'Hiring', owner: 'Neha Joshi', checks: [{ id: 'h1', label: 'Hiring stages (starter)', blocking: false, done: false, starter: true }, { id: 'h2', label: 'Careers site published', blocking: false, done: false }] },
];
const READY = MODULES.map((m) => ({ ...m, checks: m.checks.map((c) => ({ ...c, done: c.blocking ? true : c.done })) }));

/* PLT-08 */
export const PLT08Hub: S = { name: 'PLT-08 · Set-up hub · in progress', render: () => <SetupHubScreen modules={MODULES} /> };
export const PLT08Module: S = { name: 'PLT-08 · Set-up hub · module checks open', render: () => <SetupHubScreen modules={MODULES} openModule="time" /> };
export const PLT08Ready: S = { name: 'PLT-08 · Set-up hub · ready for go-live', render: () => <SetupHubScreen modules={READY} /> };

/* PLT-09 */
const PREVIEW: ImportPreviewRow[] = [
  { row: 2, code: 'KF-0001', name: 'Divya Raghunathan', department: 'Quality', result: 'Create' },
  { row: 3, code: 'KF-0002', name: 'Karthik Subramanian', department: 'Quality', result: 'Create' },
  { row: 4, code: 'KF-0231', name: 'Arjun Mehta', department: 'Quality', result: 'Warning', message: 'Manager joins after this employee; check the reporting date.' },
  { row: 5, code: 'KF-0412', name: 'Ravi Shankar', department: 'Plant Ops', result: 'Error', message: 'Department “Plant Ops” doesn’t exist. Use Operations or add it first.' },
  { row: 6, code: 'KF-0002', name: 'Sanjay Gupta', department: 'Engineering', result: 'Error', message: 'Code KF-0002 is already used on row 3. Give each person a unique code.' },
];
export const PLT09Company: S = { name: 'PLT-09 · Tenant wizard · company details', render: () => <TenantWizardScreen /> };
export const PLT09EntityError: S = { name: 'PLT-09 · Tenant wizard · entity PAN error', render: () => <TenantWizardScreen current="entities" errorStep="entities" /> };
export const PLT09Locations: S = { name: 'PLT-09 · Tenant wizard · locations', render: () => <TenantWizardScreen current="locations" /> };
export const PLT09Import: S = { name: 'PLT-09 · Tenant wizard · import validation preview', render: () => <TenantWizardScreen current="import" preview={PREVIEW} /> };
export const PLT09Review: S = { name: 'PLT-09 · Tenant wizard · review', render: () => <TenantWizardScreen current="review" preview={PREVIEW.filter((p) => p.result !== 'Error')} /> };

/* PLT-11 */
const ROLES: RoleRow[] = [
  { id: 'r1', name: 'Employee', kind: 'Template', scope: 'Self', holders: 248, updated: d(1, 3) },
  { id: 'r2', name: 'Line manager', kind: 'Template', scope: 'Reports', holders: 31, updated: d(1, 3) },
  { id: 'r3', name: 'HR Admin · Tamil Nadu', kind: 'Custom', scope: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', holders: 3, updated: d(22) },
  { id: 'r4', name: 'Payroll Admin', kind: 'Template', scope: 'All entities', holders: 2, updated: d(12, 4) },
  { id: 'r5', name: 'Auditor', kind: 'Template', scope: 'As granted, time-boxed', holders: 1, updated: d(1, 3) },
];
export const PLT11List: S = { name: 'PLT-11 · Roles & access · role list', render: () => <RolesAccessScreen roles={ROLES} view="list" /> };
export const PLT11Role: S = { name: 'PLT-11 · Roles & access · role permissions', render: () => <RolesAccessScreen roles={ROLES} view="role" granted={['employee.view', 'employee.edit', 'leave.approve', 'request.raise_on_behalf']} /> };
export const PLT11Fields: S = { name: 'PLT-11 · Roles & access · field-class matrix', render: () => <RolesAccessScreen roles={ROLES} view="role" tab="fields" granted={['employee.view']} /> };
export const PLT11Risk: S = { name: 'PLT-11 · Roles & access · risk check conflicts', render: () => <RolesAccessScreen roles={ROLES} view="role" tab="risk" granted={['payroll.run.prepare', 'payroll.run.approve', 'employee.bank.edit']} /> };
export const PLT11Holders: S = { name: 'PLT-11 · Roles & access · who has this role', render: () => <RolesAccessScreen roles={ROLES} view="role" tab="holders" /> };
export const PLT11User: S = { name: 'PLT-11 · Roles & access · user access & effective preview', render: () => <RolesAccessScreen roles={ROLES} view="user" /> };

/* PLT-12 */
export const PLT12Editor: S = { name: 'PLT-12 · Approval policy editor', render: () => <PolicyEditorScreen /> };
export const PLT12Simulated: S = { name: 'PLT-12 · Approval policy editor · simulate result', render: () => <PolicyEditorScreen simulated /> };
export const PLT12SaveBlocked: S = { name: 'PLT-12 · Approval policy editor · save needs simulate', render: () => <PolicyEditorScreen saveTried /> };

/* PLT-13 */
const LOG: DeliveryRow[] = [
  { id: 'l1', at: at(29, 9, 12), template: 'Leave applied', channel: 'Push', to: 'Karthik Subramanian', status: 'Delivered', detail: 'Opened 9:14 am' },
  { id: 'l2', at: at(29, 7, 5), template: 'Payslip ready', channel: 'Email', to: 'divya.r@kaverifoods.in', status: 'Delivered', detail: 'Password-protected PDF' },
  { id: 'l3', at: at(29, 7, 5), template: 'Payslip ready', channel: 'SMS', to: '+91 98••• ••210', status: 'Failed', detail: 'Number not reachable. Check the mobile number in the profile.' },
  { id: 'l4', at: at(28, 18, 30), template: 'Leave approved', channel: 'WhatsApp', to: '+91 97••• ••455', status: 'Retrying', detail: 'Provider busy · next try 9:50 am' },
];
export const PLT13Templates: S = { name: 'PLT-13 · Notification settings · template editor', render: () => <NotificationSettingsScreen deliveries={LOG} /> };
export const PLT13TestSent: S = { name: 'PLT-13 · Notification settings · test sent', render: () => <NotificationSettingsScreen deliveries={LOG} testSent /> };
export const PLT13Channels: S = { name: 'PLT-13 · Notification settings · channels', render: () => <NotificationSettingsScreen tab="channels" deliveries={LOG} /> };
export const PLT13Log: S = { name: 'PLT-13 · Notification settings · delivery log', render: () => <NotificationSettingsScreen tab="log" deliveries={LOG} /> };
export const PLT13Usage: S = { name: 'PLT-13 · Notification settings · usage', render: () => <NotificationSettingsScreen tab="usage" deliveries={LOG} /> };
