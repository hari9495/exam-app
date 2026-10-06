import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AutomationDetailScreen,
  AutomationsScreen,
  ImpactPreviewDrawer,
  LookupTableScreen,
  LookupTablesScreen,
  NoticeOfChangePanel,
  ValidationRuleDrawer,
  ValidationRulesScreen,
  WhyPanelDrawer,
  WhyPanelSheet,
  type Automation,
  type AutomationRun,
  type LookupRow,
  type LookupTable,
  type ValidationRule,
  type WhyExplanation,
} from './rules-screens';
import { IMPACT_ROWS, OT_IMPACT_ROWS, PEOPLE_SCHEMA, PLANT_RULE, SAMPLE_EMPLOYEES, d } from './platform-b-data';
import type { Rule } from '../../lib/rules';

const meta: Meta = { title: 'Screens/Platform/PLT-33…37, 44 · Rules', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

/* ---- PLT-33 Impact preview ---- */
const impactBase = {
  ruleName: 'Casual leave entitlement',
  version: 'v4',
  subject: 'Casual leave, plant sites · v4',
  valueLabel: 'Casual leave days',
  rows: IMPACT_ROWS,
  inScope: 248,
  automationRuns: 0,
  employees: SAMPLE_EMPLOYEES,
  rule: PLANT_RULE,
  schema: PEOPLE_SCHEMA,
  canDownload: true,
  ranAt: '29 Sep 2026, 9:40 am',
};
export const Plt33Author: S = { name: 'PLT-33 · Impact preview (author, live data)', render: () => <ImpactPreviewDrawer {...impactBase} persona="author" /> };
export const Plt33OneEmployee: S = {
  name: 'PLT-33 · Impact preview · test on one employee',
  render: () => (
    <ImpactPreviewDrawer
      {...impactBase}
      persona="author"
      oneResult={{ employee: 'Murugan Selvam (KF-0142)', before: '12 days', after: '14 days', reason: 'Location Hosur plant has Site type = Plant; rule "Plant sites" gives 14 days.' }}
    />
  ),
};
export const Plt33Money: S = {
  name: 'PLT-33 · Impact preview · money, law applied, validation failures (approver)',
  render: () => (
    <ImpactPreviewDrawer
      {...impactBase}
      ruleName="Overtime rate"
      subject="Overtime multiplier · v2"
      valueLabel="Overtime rate"
      rows={OT_IMPACT_ROWS}
      persona="approver"
      highRisk
      defaultMode="sandbox"
      automationRuns={37}
      failures={[
        { record: 'KF-0231', message: 'Shift has no overtime rule for Sundays; the value would be blank.' },
        { record: 'KF-0017', message: 'Grade G6 is outside this rule’s scope but has overtime hours logged.' },
      ]}
      canDownload={false}
    />
  ),
};
export const Plt33Loading: S = { name: 'PLT-33 · Impact preview · running', render: () => <ImpactPreviewDrawer {...impactBase} persona="author" state="loading" /> };
export const Plt33Error: S = { name: 'PLT-33 · Impact preview · error', render: () => <ImpactPreviewDrawer {...impactBase} persona="author" state="error" /> };
export const Plt33Empty: S = { name: 'PLT-33 · Impact preview · nobody affected', render: () => <ImpactPreviewDrawer {...impactBase} persona="author" rows={[]} /> };

/* ---- PLT-34 Lookup tables ---- */
const TABLES: LookupTable[] = [
  { id: 't1', name: 'Per diem by city tier', keyLabel: 'City tier', valueLabel: 'Per diem (₹)', rows: 3, usedBy: ['Travel per diem', 'Outstation allowance'], updated: d(9, 28), owner: 'Suresh Pillai' },
  { id: 't2', name: 'Mileage rate by grade', keyLabel: 'Grade', valueLabel: 'Rate per km (₹)', rows: 4, usedBy: ['Mileage claim eligibility'], updated: d(4, 1), owner: 'Suresh Pillai' },
  { id: 't3', name: 'Shift allowance by site', keyLabel: 'Site', valueLabel: 'Allowance a shift (₹)', rows: 3, usedBy: ['Night shift allowance'], updated: d(7, 15), owner: 'Lakshmi Venkatesan' },
  { id: 't4', name: 'Fuel card limit by vehicle', keyLabel: 'Vehicle type', valueLabel: 'Monthly limit (₹)', rows: 2, usedBy: [], updated: d(8, 2), owner: 'Meera Iyengar' },
];
const TIER_ROWS: LookupRow[] = [
  { id: 'r1', key: 'Tier 1 (metro)', value: '₹2,000', validFrom: d(4, 1), validTo: d(9, 30) },
  { id: 'r2', key: 'Tier 2', value: '₹1,400', validFrom: d(4, 1), validTo: d(9, 30) },
  { id: 'r3', key: 'Tier 3', value: '₹900', validFrom: d(4, 1), validTo: d(9, 30) },
  { id: 'r4', key: 'Tier 1 (metro)', value: '₹2,200', validFrom: d(10, 1), validTo: null },
  { id: 'r5', key: 'Tier 2', value: '₹1,500', validFrom: d(10, 1), validTo: null },
  { id: 'r6', key: 'Tier 3', value: '₹1,000', validFrom: d(10, 1), validTo: null },
];
export const Plt34List: S = { name: 'PLT-34 · Lookup tables', render: () => <LookupTablesScreen tables={TABLES} /> };
export const Plt34Empty: S = { name: 'PLT-34 · Lookup tables · empty', render: () => <LookupTablesScreen tables={[]} /> };
export const Plt34Filtered: S = { name: 'PLT-34 · Lookup tables · filtered to nothing', render: () => <LookupTablesScreen tables={[]} filtered /> };
export const Plt34Loading: S = { name: 'PLT-34 · Lookup tables · loading', render: () => <LookupTablesScreen tables={TABLES} state="loading" /> };
export const Plt34Error: S = { name: 'PLT-34 · Lookup tables · error', render: () => <LookupTablesScreen tables={TABLES} state="error" /> };
export const Plt34Record: S = { name: 'PLT-34 · Lookup table · effective-dated rows', render: () => <LookupTableScreen table={TABLES[0]} rows={TIER_ROWS} /> };
export const Plt34UsedBy: S = { name: 'PLT-34 · Lookup table · used by rules', render: () => <LookupTableScreen table={TABLES[0]} rows={TIER_ROWS} defaultTab="used" /> };
export const Plt34Import: S = { name: 'PLT-34 · Lookup table · Excel import with errors', render: () => <LookupTableScreen table={TABLES[0]} rows={TIER_ROWS} importOpen importErrors={[{ row: 4, message: 'Tier 4 is not a city tier. Use Tier 1, Tier 2 or Tier 3.' }, { row: 7, message: 'Per diem is blank. Enter an amount in rupees.' }]} /> };

/* ---- PLT-35 Automations ---- */
const AUTOS: Automation[] = [
  { id: 'a1', name: 'Remind manager 30 days before probation ends', trigger: 'Probation end date is 30 days away', status: 'Active', runs30: 14, failures: 0, owner: 'Lakshmi Venkatesan', lastRun: d(9, 28) },
  { id: 'a2', name: 'Chase expiring driving licences', trigger: 'Document expires in 30 days', status: 'Failing', runs30: 22, failures: 3, owner: 'Lakshmi Venkatesan', lastRun: d(9, 29) },
  { id: 'a3', name: 'Low leave balance alert', trigger: 'Leave balance changes', status: 'Active', runs30: 37, failures: 0, owner: 'Karthik Subramanian', lastRun: d(9, 29) },
  { id: 'a4', name: 'New joiner IT request', trigger: 'Employee joins', status: 'Paused', runs30: 6, failures: 0, owner: 'Rahul Menon', lastRun: d(9, 12) },
  { id: 'a5', name: 'Uniform size check for plant joiners', trigger: 'Employee joins', status: 'Draft', runs30: 0, failures: 0, owner: 'Lakshmi Venkatesan', lastRun: null },
];
const RUNS: AutomationRun[] = [
  { id: 'r1', at: d(9, 29, 9, 5), record: 'KF-0142', result: 'Done', detail: 'Task created for Karthik Subramanian', attempts: 1 },
  { id: 'r2', at: d(9, 29, 8, 40), record: 'KF-0199', result: 'Failed', detail: 'Notify: the manager has no work email. Add one in the profile.', attempts: 3 },
  { id: 'r3', at: d(9, 28, 17, 2), record: 'KF-0088', result: 'Loop stopped', detail: 'The update would start this automation again on the same record. Stopped after one pass.', attempts: 1 },
  { id: 'r4', at: d(9, 28, 11, 30), record: 'KF-0231', result: 'Skipped', detail: 'Conditions not met: licence already renewed', attempts: 1 },
];
const LICENCE_RULE: Rule = {
  trigger: 'document.expiring',
  conditions: { id: 'g', join: 'and', items: [{ id: 'c1', field: 'department', operator: 'is', value: 'Operations' }] },
  actions: [
    { id: 'x1', type: 'notify', target: 'employee' },
    { id: 'x2', type: 'notify', target: 'manager' },
  ],
};
export const Plt35List: S = { name: 'PLT-35 · Automations · usage vs limit', render: () => <AutomationsScreen items={AUTOS} used={1720} limit={2000} /> };
export const Plt35Empty: S = { name: 'PLT-35 · Automations · empty', render: () => <AutomationsScreen items={[]} used={0} limit={2000} /> };
export const Plt35Loading: S = { name: 'PLT-35 · Automations · loading', render: () => <AutomationsScreen items={AUTOS} used={0} limit={2000} state="loading" /> };
export const Plt35Error: S = { name: 'PLT-35 · Automations · error', render: () => <AutomationsScreen items={AUTOS} used={0} limit={2000} state="error" /> };
const dry = { events: 84, wouldRun: 22, wouldSkip: 62, samples: ['KF-0142 Murugan Selvam: licence expires 20 Oct 2026, would notify him and Karthik Subramanian', 'KF-0199 Kavitha Ramesh: licence expires 25 Oct 2026, would notify her and Karthik Subramanian'] };
export const Plt35Detail: S = { name: 'PLT-35 · Automation · trigger, conditions, actions, dry run', render: () => <AutomationDetailScreen automation={AUTOS[1]} schema={PEOPLE_SCHEMA} rule={LICENCE_RULE} dryRun={dry} runs={RUNS} /> };
export const Plt35NoDryRun: S = { name: 'PLT-35 · Automation · activate blocked until dry run', render: () => <AutomationDetailScreen automation={AUTOS[4]} schema={PEOPLE_SCHEMA} rule={LICENCE_RULE} dryRun={null} runs={[]} /> };
export const Plt35Log: S = { name: 'PLT-35 · Automation · run log', render: () => <AutomationDetailScreen automation={AUTOS[1]} schema={PEOPLE_SCHEMA} rule={LICENCE_RULE} dryRun={dry} runs={RUNS} defaultTab="runs" /> };
export const Plt35Failures: S = { name: 'PLT-35 · Automation · failure queue (retry / skip)', render: () => <AutomationDetailScreen automation={AUTOS[1]} schema={PEOPLE_SCHEMA} rule={LICENCE_RULE} dryRun={dry} runs={RUNS} defaultTab="failures" /> };
export const Plt35ReadOnly: S = { name: 'PLT-35 · Automation · viewer (read-only)', render: () => <AutomationDetailScreen automation={AUTOS[0]} schema={PEOPLE_SCHEMA} rule={LICENCE_RULE} dryRun={dry} runs={RUNS} readOnly /> };

/* ---- PLT-36 Validation rules ---- */
const VRULES: ValidationRule[] = [
  { id: 'v1', recordType: 'Employee', name: 'Joining date not a Sunday', condition: 'Joining date is a Sunday', message: 'Choose a weekday for the joining date.', mode: 'Block', status: 'Active', invalidExisting: 3 },
  { id: 'v2', recordType: 'Employee', name: 'Uniform size for plant staff', condition: 'Department is Operations and Uniform size is empty', message: 'Enter the uniform size; the plant issues uniforms on day 1.', mode: 'Warn', status: 'Active', invalidExisting: 11 },
  { id: 'v3', recordType: 'Expense claim', name: 'Receipt for claims over ₹500', condition: 'Amount is greater than ₹500 and no receipt', message: 'Attach a receipt for claims over ₹500.', mode: 'Block', status: 'Draft', invalidExisting: 0 },
  { id: 'v4', recordType: 'Leave request', name: 'Reason for leave over 5 days', condition: 'Days is greater than 5 and Reason is empty', message: 'Add a reason for leave longer than 5 days.', mode: 'Warn', status: 'Off', invalidExisting: 0 },
];
const SUNDAY: Rule = { trigger: null, conditions: { id: 'g', join: 'and', items: [{ id: 'c', field: 'joining_date', operator: 'is', value: new Date(2026, 9, 4) }] }, actions: [] };
export const Plt36List: S = { name: 'PLT-36 · Validation rules by record type', render: () => <ValidationRulesScreen rules={VRULES} /> };
export const Plt36Empty: S = { name: 'PLT-36 · Validation rules · empty', render: () => <ValidationRulesScreen rules={[]} /> };
export const Plt36Loading: S = { name: 'PLT-36 · Validation rules · loading', render: () => <ValidationRulesScreen rules={[]} state="loading" /> };
export const Plt36Error: S = { name: 'PLT-36 · Validation rules · error', render: () => <ValidationRulesScreen rules={[]} state="error" /> };
export const Plt36Record: S = {
  name: 'PLT-36 · Validation rule · existing invalid records listed',
  render: () => (
    <ValidationRuleDrawer
      rule={VRULES[0]}
      schema={PEOPLE_SCHEMA}
      condition={SUNDAY}
      invalid={[
        { id: 'KF-0203', name: 'Harish Rao', value: 'Joined Sun 6 Sep 2026' },
        { id: 'KF-0211', name: 'Lavanya Shetty', value: 'Joined Sun 13 Sep 2026' },
        { id: 'KF-0219', name: 'Naveen Pillai', value: 'Joined Sun 20 Sep 2026' },
      ]}
    />
  ),
};
export const Plt36Clean: S = { name: 'PLT-36 · Validation rule · warn, no invalid records', render: () => <ValidationRuleDrawer rule={VRULES[3]} schema={PEOPLE_SCHEMA} condition={SUNDAY} invalid={[]} /> };

/* ---- PLT-37 Why panel ---- */
const WHY_LEAVE: WhyExplanation = {
  result: 'Casual leave: 14 days',
  subject: 'Murugan Selvam · Hosur plant',
  steps: [
    { kind: 'rule', text: 'Casual leave is 12 days for everyone (YukthiX starter rule).' },
    { kind: 'rule', text: 'Your location, Hosur plant, is a Plant site, so the “Plant sites” rule gives 14 days.' },
  ],
  ruleName: 'Casual leave entitlement',
  ruleVersion: 'v4',
  effective: d(10, 1),
  policyLink: 'Leave policy v6, section 3',
};
const WHY_OT: WhyExplanation = {
  result: 'Overtime rate: 2× your ordinary wage',
  subject: 'Kavitha Ramesh · Hosur plant',
  steps: [
    { kind: 'rule', text: 'Company rule “Overtime rate” gives 1.5× for hours over 9 a day.' },
    { kind: 'legal', text: 'You are a factory worker. The law sets overtime at twice the ordinary wage, so 2× applies.' },
  ],
  ruleName: 'Overtime rate',
  ruleVersion: 'v2',
  effective: d(10, 1),
};
const WHY_TIER: WhyExplanation = {
  result: 'Per diem: ₹2,200 a day',
  subject: 'Priya Natarajan · trip to Mumbai',
  steps: [
    { kind: 'lookup', text: 'Mumbai is a Tier 1 city. The “Per diem by city tier” table gives ₹2,200 from 1 Oct 2026.' },
    { kind: 'rule', text: 'Grade G4 gets the full table amount under the travel policy.' },
  ],
  ruleName: 'Travel per diem',
  ruleVersion: 'v3',
  effective: d(10, 1),
  policyLink: 'Travel and expense policy v4',
};
export const Plt37Employee: S = { name: 'PLT-37 · Why panel · employee, company policy', render: () => <WhyPanelDrawer why={WHY_LEAVE} persona="employee" /> };
export const Plt37Legal: S = { name: 'PLT-37 · Why panel · legal adjustment', render: () => <WhyPanelDrawer why={WHY_OT} persona="employee" /> };
export const Plt37Manager: S = { name: 'PLT-37 · Why panel · manager viewing a team member', render: () => <WhyPanelDrawer why={WHY_TIER} persona="manager" /> };
export const Plt37Phone: S = { ...phone, name: 'PLT-37 · Why panel · phone', render: () => <WhyPanelSheet why={WHY_LEAVE} /> };
export const Plt37PhoneLegal: S = { ...phone, name: 'PLT-37 · Why panel · phone, legal adjustment', render: () => <WhyPanelSheet why={WHY_OT} /> };

/* ---- PLT-44 Notice of change ---- */
const noc = { ruleName: 'Hosur plant shift timings', version: 'v4', noticeRequired: true, workersAffected: 312, union: 'Kaveri Foods Workers’ Union', policyVersion: 'Shift policy v4', material: true };
export const Plt44Required: S = { name: 'PLT-44 · Notice of change · required, not issued', render: () => <NoticeOfChangePanel {...noc} noticeIssued={null} effective={d(11, 1)} /> };
export const Plt44TooEarly: S = { name: 'PLT-44 · Notice of change · effective date too early', render: () => <NoticeOfChangePanel {...noc} noticeIssued={d(10, 20)} effective={d(11, 1)} /> };
export const Plt44Waiting: S = { name: 'PLT-44 · Notice of change · issued, waiting period', render: () => <NoticeOfChangePanel {...noc} noticeIssued={d(9, 25)} effective={d(10, 20)} /> };
export const Plt44Exception: S = { name: 'PLT-44 · Notice of change · settlement recorded', render: () => <NoticeOfChangePanel {...noc} noticeIssued={null} effective={d(10, 5)} exceptionRef="Settlement KF/IR/2026/07 dated 18 Sep 2026" /> };
export const Plt44NotNeeded: S = { name: 'PLT-44 · Notice not needed · policy link missing', render: () => <NoticeOfChangePanel {...noc} noticeRequired={false} policyVersion={undefined} noticeIssued={null} effective={d(10, 1)} material={false} /> };
