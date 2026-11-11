import type { LiveTenantWizard } from './tenant-wizard-live';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { d } from './platform-data';
import {
  PolicyEditorScreen, RolesAccessScreen, SetupHubScreen, TenantWizardScreen, type ImportPreviewRow, type ModuleCard, type RoleRow,
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
// C-5 (answer 1053): the console's New company is the PLT-09 wizard with the console's steps.
const WIZ: LiveTenantWizard = {
  products: [{ code: 'hrms', name: 'YukthiX HR', unit: 'employee', inr: 99 }, { code: 'service_desk', name: 'YukthiX Service Desk', unit: 'agent', inr: 999 }],
  onCreate: () => new Promise((r) => setTimeout(() => r({ id: 'c9' }), 500)),
  onCancel: () => {},
  onOpenCompany: () => {},
};
const FILLED = { name: 'Tunga Textiles', slug: 'tunga-textiles', leName: 'Tunga Textiles Pvt Ltd', pan: 'AAECT1234F', gstin: '29AAECT1234F1Z5', adminName: 'Meena Pillai', adminEmail: 'meena@tunga.test', products: ['hrms'] };
export const PLT09ConsoleCompany: S = { name: 'PLT-09 · New company (console) · company details', render: () => <TenantWizardScreen live={WIZ} /> };
export const PLT09ConsoleEntity: S = { name: 'PLT-09 · New company (console) · legal entity', render: () => <TenantWizardScreen live={{ ...WIZ, defaultStep: 'entity', defaults: { ...FILLED, pan: 'AAECT1234', gstin: '' } }} /> };
export const PLT09ConsoleAdmin: S = { name: 'PLT-09 · New company (console) · first System Admin', render: () => <TenantWizardScreen live={{ ...WIZ, defaultStep: 'admin', defaults: FILLED }} /> };
export const PLT09ConsoleProducts: S = { name: 'PLT-09 · New company (console) · plan and products', render: () => <TenantWizardScreen live={{ ...WIZ, defaultStep: 'products', defaults: FILLED }} /> };
export const PLT09ConsoleCreated: S = { name: 'PLT-09 · New company (console) · created, the set-up hub next', render: () => <TenantWizardScreen live={{ ...WIZ, created: { id: 'c9', name: 'Tunga Textiles', adminEmail: 'meena@tunga.test' } }} /> };
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

