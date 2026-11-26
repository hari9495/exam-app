// Settings map · Group 6 · Hiring & Assessments (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { StageTargetsSheet } from '../hiring/job-settings';
import { PipelineSheet, type EditablePipeline } from '../hiring/pipeline-sheet';
import { ScorecardTemplateSheet } from '../hiring/scorecard-template-sheet';
import { StageMessageSheet, type StageMessageView } from '../hiring/stage-message-sheet';
import { CertificateCard, type CertificateTemplateView } from './certificate-card';
import { InvoiceSeriesSheet } from '../hiring/staffing-sheets';
import type { ScorecardTemplateView } from '../hiring/live/types';
import type { SettingsPageDef } from './settings-types';
import { PerfStartersCard, RatingScaleSheet, ReviewTemplateSheet, SkillSheet, perfSetupPage } from './perf-setup-live';
import type { RatingScale, ReviewTemplate, Skill } from '../performance/live/types';
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
// Answer 2434 (retiring /v2): the email, SMS and WhatsApp templates recruiters send from the hiring screens.
const STAGES = [{ value: 's1', label: 'Applied' }, { value: 's4', label: 'Interview' }, { value: 's6', label: 'Offer' }];
const INVITE: StageMessageView = { channel: 'sms', id: 't1', name: 'Moving to interview', triggerStageId: 's4', triggerMode: 'prompt', body: 'Hi {{candidateName}}, we would like to move you forward to interview for {{jobTitle}}. - {{recruiterName}}', enabled: true, isDefault: false };
const STANDARD: StageMessageView = { channel: 'email', id: null, name: 'Application received', triggerStageId: 's1', triggerMode: 'manual', subject: 'Thanks for applying to {{jobTitle}}', body: 'Hi {{candidateName}}, thanks for applying to {{jobTitle}} at {{orgName}}. We will be in touch. {{recruiterName}}', enabled: true, isDefault: true };
const message = (template: StageMessageView | null, canEdit = true) => (
  <>
    <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.1" />
    <StageMessageSheet open onOpenChange={() => {}} template={template} stages={STAGES} canEdit={canEdit} onSave={noop} onDelete={noop} />
  </>
);
export const P6_1_MessageNew: S = { name: '6.1 Hiring · add message template', render: () => message(null) };
export const P6_1_MessageEdit: S = { name: '6.1 Hiring · edit message template', render: () => message(INVITE) };
export const P6_1_MessageStandard: S = { name: '6.1 Hiring · standard message (saved as your copy)', render: () => message(STANDARD) };
export const P6_1_MessageView: S = { name: '6.1 Hiring · message template, view only', render: () => message(INVITE, false) };
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
// Batch T2-C (2411): the live editors of 6.3, review templates, rating scales and the skills library (answer 2671), as
// lists on the drawn page; Add and Edit open their sheets. Competencies stay on the PRF-14 framework, linked.
const FIVE: RatingScale = {
  id: 's1', name: 'Five-point scale', min: 1, max: 5, step: 1, status: 'active', starter: true, inUse: true, version: 1,
  levels: ['Needs improvement', 'Partly meets', 'Meets', 'Exceeds', 'Outstanding'].map((label, i) => ({ value: i + 1, label, description: null })),
  bands: [{ fromScore: 1, toScore: 2.49, label: 'Below' }, { fromScore: 2.5, toScore: 3.49, label: 'Meets' }, { fromScore: 3.5, toScore: 5, label: 'Above' }],
};
const THREE: RatingScale = { ...FIVE, id: 's2', name: 'Three-point scale (plant)', max: 3, starter: false, inUse: false, levels: ['Below', 'Meets', 'Above'].map((label, i) => ({ value: i + 1, label, description: null })), bands: [{ fromScore: 1, toScore: 3, label: 'All' }] };
const ANNUAL: ReviewTemplate = {
  id: 't1', familyId: 'f1', templateVersion: 1, name: 'Annual review', kind: 'annual', scaleId: 's1', scoring: 'weighted', status: 'active', starter: true, activatedAt: '2026-04-01T09:00:00Z', problem: null, version: 1,
  sections: [
    { kind: 'goals', title: 'Goals', weight: 60, rated: true, whoAnswers: ['self', 'manager'], questions: [] },
    { kind: 'competencies', title: 'Competencies', weight: 40, rated: true, whoAnswers: ['self', 'manager', 'peer'], questions: [] },
  ],
};
const PROBATION: ReviewTemplate = { ...ANNUAL, id: 't2', familyId: 'f2', name: 'Probation review', kind: 'probation', status: 'draft', starter: false, activatedAt: null, problem: 'The weights of rated sections add up to 90, not 100.', sections: [{ ...ANNUAL.sections[0]!, weight: 50 }, { ...ANNUAL.sections[1]!, weight: 40 }] };
const SKILLS: Skill[] = [
  { id: 'k1', name: 'Quality', kind: 'domain', parentId: null, status: 'active', mergedIntoId: null, starter: true, competency: false },
  { id: 'k2', name: 'Root cause analysis', kind: 'skill', parentId: 'k1', status: 'active', mergedIntoId: null, starter: true, competency: true },
  { id: 'k3', name: 'Why-why analysis', kind: 'sub_skill', parentId: 'k2', status: 'active', mergedIntoId: null, starter: false, competency: false },
  { id: 'k4', name: 'RCA', kind: 'skill', parentId: 'k1', status: 'merged', mergedIntoId: 'k2', starter: false, competency: false },
] as Skill[];
const perfSetupGroups = (data: Parameters<typeof perfSetupPage>[1]) => SETTINGS_GROUPS.map((g) => (g.id === 6 ? { ...g, pages: g.pages.map((p) => (p.id === '6.3' ? perfSetupPage(p, data) : p)) } : g));
const ok = async () => ({});
const close = () => undefined;
export const P6_3_Setup: S = { name: '6.3 Performance · templates, scales and skills', render: () => <SettingsPageScreen groups={perfSetupGroups({ templates: [ANNUAL, PROBATION], scales: [FIVE, THREE], skills: SKILLS })} pageId="6.3" highlightKey="perf.review_templates" /> };
export const P6_3_Starters: S = { name: '6.3 Performance · new company, use the starters', render: () => <div className="yx-auth__page"><PerfStartersCard onUseStarters={ok} /></div> };
const templateSheet = (template: ReviewTemplate | null, hasDraft = false) => <ReviewTemplateSheet template={template} scales={[FIVE, THREE]} hasDraft={hasDraft} onClose={close} onSave={ok} onActivate={ok} onNewVersion={ok} onRetire={ok} />;
export const P6_3_TemplateNew: S = { name: '6.3 Performance · add a review template', render: () => templateSheet(null) };
export const P6_3_TemplateDraft: S = { name: '6.3 Performance · draft template not ready', render: () => templateSheet(PROBATION) };
export const P6_3_TemplateActive: S = { name: '6.3 Performance · active template (new version)', render: () => templateSheet(ANNUAL) };
export const P6_3_TemplateHasDraft: S = { name: '6.3 Performance · active template with a draft', render: () => templateSheet(ANNUAL, true) };
export const P6_3_ScaleEdit: S = { name: '6.3 Performance · edit a rating scale', render: () => <RatingScaleSheet scale={THREE} onClose={close} onSave={ok} onRetire={ok} /> };
export const P6_3_ScaleInUse: S = { name: '6.3 Performance · rating scale in use', render: () => <RatingScaleSheet scale={FIVE} onClose={close} onSave={ok} onRetire={ok} /> };
export const P6_3_ScaleNew: S = { name: '6.3 Performance · add a rating scale', render: () => <RatingScaleSheet scale={null} onClose={close} onSave={ok} onRetire={ok} /> };
export const P6_3_SkillNew: S = { name: '6.3 Performance · add a skill', render: () => <SkillSheet skill={null} skills={SKILLS} onClose={close} onAdd={ok} onMerge={ok} onRetire={ok} /> };
export const P6_3_SkillMerge: S = { name: '6.3 Performance · merge or retire a skill', render: () => <SkillSheet skill={SKILLS[2]!} skills={SKILLS} onClose={close} onAdd={ok} onMerge={ok} onRetire={ok} /> };
export const P6_3_SkillMerged: S = { name: '6.3 Performance · merged skill', render: () => <SkillSheet skill={SKILLS[3]!} skills={SKILLS} onClose={close} onAdd={ok} onMerge={ok} onRetire={ok} /> };
export const P6_4: S = { name: '6.4 Learning', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.4" /> };
export const P6_4_ReadOnly: S = { name: '6.4 Learning · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.4" readOnly /> };
export const P6_5: S = { name: '6.5 Assessments', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.5" /> };
export const P6_5_ReadOnly: S = { name: '6.5 Assessments · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.5" readOnly /> };
// Answer 2424 (retiring /v2): the pass certificate section on 6.5 Assessments, and its edit sheet.
const CERT: CertificateTemplateView = { title: 'Certificate of Achievement', bodyText: 'This is to certify that {{candidateName}} has successfully passed {{examTitle}} at {{orgName}}, achieving a score of {{scorePercent}}% on {{date}}.', signatoryName: 'Meenakshi Sundaram', enabled: true, isDefault: false };
const cert = (template: CertificateTemplateView, canEdit = true, defaultOpen = false) => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.5" live={{ page: SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.5')!, canEdit, lastChange: null, state: 'ready', onSave: noop, extra: <CertificateCard template={template} canEdit={canEdit} onSave={noop} defaultOpen={defaultOpen} /> }} />;
export const P6_5_Certificate: S = { name: '6.5 Assessments · pass certificate', render: () => cert(CERT) };
export const P6_5_CertificateStandard: S = { name: '6.5 Assessments · pass certificate, standard wording', render: () => cert({ ...CERT, signatoryName: null, isDefault: true }) };
export const P6_5_CertificateEdit: S = { name: '6.5 Assessments · edit pass certificate', render: () => cert(CERT, true, true) };
export const P6_5_CertificateView: S = { name: '6.5 Assessments · pass certificate, view only', render: () => cert({ ...CERT, enabled: false }, false) };
const OFFICE: EditablePipeline = {
  id: 'p2',
  name: 'Office staff',
  isDefault: false,
  stages: [
    { id: 'a', name: 'Applied', category: 'active', position: 0, statuses: [{ id: 'a1', name: 'New', position: 0 }] },
    { id: 'b', name: 'Interview', category: 'active', position: 1, statuses: [{ id: 'b1', name: 'Scheduled', position: 0 }, { id: 'b2', name: 'Done', position: 1 }], rules: [{ id: 'r1', type: 'feedback', minCount: 2, minAvgRating: 3 }] },
    { id: 'c', name: 'Offer', category: 'offer', position: 2, statuses: [], rules: [{ id: 'r2', type: 'checklist', items: [{ id: 'i1', label: 'References checked' }] }] },
  ],
};
const pipelineSheet = (pipeline: EditablePipeline | null, canEdit = true) => (
  <PipelineSheet open onOpenChange={() => {}} pipeline={pipeline} tests={[{ value: 'e1', label: 'Plant safety test' }]} canEdit={canEdit} onCreate={async () => {}} onDeletePipeline={async () => {}} onAddStage={async () => {}} onSaveStage={async () => {}} onMoveStage={async () => {}} onRemoveStage={async () => {}} />
);
export const P6_1_PipelineEdit: S = { name: '6.1 Hiring · edit pipeline (stages, statuses, entry rules)', render: () => pipelineSheet(OFFICE) };
export const P6_1_PipelineNew: S = { name: '6.1 Hiring · add pipeline', render: () => pipelineSheet(null) };
export const P6_1_PipelineView: S = { name: '6.1 Hiring · pipeline, view only', render: () => pipelineSheet(OFFICE, false) };
