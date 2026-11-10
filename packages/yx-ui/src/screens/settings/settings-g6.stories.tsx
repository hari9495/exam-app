// Settings map · Group 6 · Hiring & Assessments (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { StageTargetsSheet } from '../hiring/job-settings';
import { ScorecardTemplateSheet } from '../hiring/scorecard-template-sheet';
import { InvoiceSeriesSheet } from '../hiring/staffing-sheets';
import type { ScorecardTemplateView } from '../hiring/live/types';
import type { SettingsPageDef } from './settings-types';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Group 6 · Hiring & Assessments',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;

export const Overview: S = { name: 'Group 6 · Hiring & Assessments', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={6} /> };
export const OverviewLoading: S = { name: 'Group 6 · loading', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={6} state="loading" /> };

export const P6_1: S = { name: '6.1 Hiring', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.1" /> };
export const P6_1_ReadOnly: S = { name: '6.1 Hiring · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.1" readOnly /> };
// Drawn 13 Nov 2026 (Hiring walk, answer 476): opened by someone with no hiring key (the menu never offers it).
export const P6_1_NoAccess: S = { name: '6.1 Hiring · no access', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.1" readOnly state="no-access" /> };
// Founder answer 302: a pipeline template's Stage targets (days target and limit per stage), moved here from the job.
const OFFICE_STAGES = [
  { id: 's1', name: 'Applied', daysTarget: 3, limit: null },
  { id: 's2', name: 'Screening', daysTarget: 5, limit: null },
  { id: 's3', name: 'Assessment', daysTarget: null, limit: null },
  { id: 's4', name: 'Interview', daysTarget: 7, limit: 6 },
  { id: 's5', name: 'Offer', daysTarget: null, limit: null },
];
export const P6_1_StageTargets: S = {
  name: '6.1 Hiring · stage targets',
  render: () => (
    <>
      <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.1" />
      <StageTargetsSheet open onOpenChange={() => {}} pipelineName="Office staff" stages={OFFICE_STAGES} canEdit onSave={async () => {}} />
    </>
  ),
};
// Founder answer 345: scorecard templates are added, edited and archived from 6.1 (weights in whole per cent adding to 100).
const PLANT: ScorecardTemplateView = {
  id: 'sc1',
  name: 'Plant technician',
  scaleMax: 4,
  passBar: 2.5,
  inUse: false,
  items: [
    { id: 'i1', label: 'Machine safety', guidance: 'Follows lock-out and tag-out every time', weight: 50, competencyId: null },
    { id: 'i2', label: 'Food hygiene', guidance: null, weight: 30, competencyId: null },
    { id: 'i3', label: 'Teamwork', guidance: null, weight: 20, competencyId: null },
  ],
};
const LIBRARY = [{ value: 'c1', label: 'Problem solving' }, { value: 'c2', label: 'Communication' }];
const noop = async () => {};
const sheet = (template: ScorecardTemplateView | null, canEdit = true) => (
  <>
    <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.1" />
    <ScorecardTemplateSheet open onOpenChange={() => {}} template={template} competencies={LIBRARY} canEdit={canEdit} onSave={noop} onArchive={noop} />
  </>
);
export const P6_1_ScorecardEdit: S = { name: '6.1 Hiring · edit scorecard', render: () => sheet(PLANT) };
export const P6_1_ScorecardNew: S = { name: '6.1 Hiring · add scorecard', render: () => sheet(null) };
export const P6_1_ScorecardUsed: S = { name: '6.1 Hiring · used scorecard (saved as a copy)', render: () => sheet({ ...PLANT, inUse: true }) };
export const P6_1_ScorecardView: S = { name: '6.1 Hiring · scorecard, view only', render: () => sheet(PLANT, false) };
// Founder answer 348: the default recruiter must hold the recruiter key; one who no longer does reads as None, with a warning.
const g6 = SETTINGS_GROUPS.find((g) => g.id === 6)!;
const hiringPage = g6.pages.find((p) => p.id === '6.1')!;
const staleRecruiter: SettingsPageDef = {
  ...hiringPage,
  sections: hiringPage.sections.map((sec) => ({
    ...sec,
    settings: sec.settings.map((d) => (d.key === 'hire.default_recruiter' ? { ...d, value: 'None', starter: false, warning: 'Neha Joshi no longer holds the recruiter key or has left, so new requisitions start with no recruiter. Choose someone else or None.' } : d)),
  })),
};
const staleGroups = SETTINGS_GROUPS.map((g) => (g.id === 6 ? { ...g, pages: g.pages.map((p) => (p.id === '6.1' ? staleRecruiter : p)) } : g));
export const P6_1_StaleRecruiter: S = { name: '6.1 Hiring · default recruiter no longer qualifies', render: () => <SettingsPageScreen groups={staleGroups} pageId="6.1" highlightKey="hire.default_recruiter" /> };
// Offers answer 376: the named approver above the range who lost the offer-pay key stays named, with a warning.
const staleApprover: SettingsPageDef = {
  ...hiringPage,
  sections: hiringPage.sections.map((sec) => ({
    ...sec,
    settings: sec.settings.map((d) => (d.key === 'hire.band_approver' ? { ...d, options: [...(d.options ?? []), 'Meenakshi Sundaram (cannot approve)'], value: 'Meenakshi Sundaram (cannot approve)', starter: false, warning: 'Meenakshi Sundaram can no longer see offer pay or has left, so offers above the range go to the company admins instead. Choose someone else.' } : d)),
  })),
};
const staleApproverGroups = SETTINGS_GROUPS.map((g) => (g.id === 6 ? { ...g, pages: g.pages.map((p) => (p.id === '6.1' ? staleApprover : p)) } : g));
// Answer 473: an AI tool is on and the company has a New York City location while the NYC switch is off.
const nycHintPage: SettingsPageDef = {
  ...hiringPage,
  sections: hiringPage.sections.map((sec) => ({
    ...sec,
    settings: sec.settings.map((d) => (d.key === 'hire.bias_audit_nyc' ? { ...d, value: false, starter: false, warning: 'AI notes on past candidates is on and New York office is in New York City. If you use it for jobs there, turn this on: the law then needs a yearly bias audit and a notice to candidates.' } : d)),
  })),
};
const nycHintGroups = SETTINGS_GROUPS.map((g) => (g.id === 6 ? { ...g, pages: g.pages.map((p) => (p.id === '6.1' ? nycHintPage : p)) } : g));
export const P6_1_NycHint: S = { name: '6.1 Hiring · AI on with a New York City location', render: () => <SettingsPageScreen groups={nycHintGroups} pageId="6.1" highlightKey="hire.bias_audit_nyc" /> };
export const P6_1_StaleBandApprover: S = { name: '6.1 Hiring · approver above the range can no longer approve', render: () => <SettingsPageScreen groups={staleApproverGroups} pageId="6.1" highlightKey="hire.band_approver" /> };
export const P6_2: S = { name: '6.2 Staffing desk', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.2" /> };
export const P6_2_ReadOnly: S = { name: '6.2 Staffing desk · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.2" readOnly /> };
// Staffing slice 1: add an invoice series (one per GSTIN per financial year; the next number only goes up).
export const P6_2_InvoiceSeries: S = {
  name: '6.2 Staffing desk · add invoice series',
  render: () => (
    <>
      <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.2" />
      <InvoiceSeriesSheet open onOpenChange={() => {}} initial={null} entities={[{ id: 'e1', name: 'Kaveri Foods Pvt Ltd', gstins: ['29AABCK1234F1Z5', '33AABCK1234F1Z9'] }]} financialYear="2026-27" onSave={async () => {}} />
    </>
  ),
};
export const P6_3: S = { name: '6.3 Performance', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.3" /> };
export const P6_3_ReadOnly: S = { name: '6.3 Performance · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.3" readOnly /> };
export const P6_4: S = { name: '6.4 Learning', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.4" /> };
export const P6_4_ReadOnly: S = { name: '6.4 Learning · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.4" readOnly /> };
export const P6_5: S = { name: '6.5 Assessments', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.5" /> };
export const P6_5_ReadOnly: S = { name: '6.5 Assessments · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.5" readOnly /> };
