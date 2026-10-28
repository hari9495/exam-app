import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { fails, never, ok, pick, play, press, pressFirst, see, type } from '../../_kit/story-play';
import { CoverageLiveScreen, PayGroupsScreen, PayImportsScreen, PaySetupScreen, PayslipLayoutLiveScreen, StatutoryRulesScreen, type PayGroupsScreenProps, type PayImportsScreenProps, type PaySetupScreenProps, type PayslipLayoutLiveProps } from './setup';
import { CompensationLiveScreen, ComponentLibraryLiveScreen, TemplatesLiveScreen, type CompensationLiveProps, type ComponentLibraryLiveProps, type TemplatesLiveProps } from './structures';
import {
  BREAKUP,
  BREAKUP_BELOW,
  COMPONENTS,
  COVERAGE,
  GO_LIVE_MISSING,
  GO_LIVE_READY,
  GROUP_MEMBERS,
  IMPORT_ERRORS,
  IMPORT_OK,
  IMPORT_ROWS,
  IN_FORCE,
  LEGAL_OPTIONS,
  PAYSLIP_LAYOUTS,
  PAY_CALENDAR,
  PAY_GROUPS,
  PEOPLE_HITS,
  REGISTRATIONS,
  RULE_SETS,
  SETUP_ENTITIES,
  SETUP_STATE,
  STAT_PROFILE,
  TEMPLATES,
  TODAY,
} from './fixtures-5ab';

// Payroll batch 5b on the live app: set-up, pay groups, payslip layout, statutory rules and coverage, imports, the
// component library, salary templates and compensation. The same components the pages render, with Kaveri Foods data.
const meta: Meta = { title: 'Screens/Pay/Live · Set-up and pay structures', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
// Steps that need a row or one of two same-named fields.
const editRow = (name: string) => async (s: ReturnType<typeof within>) => userEvent.click(within((await s.findByText(name)).closest('tr')!).getByRole('button', { name: /^Edit/ }));
const seeTable = (name: string) => async (s: ReturnType<typeof within>) => s.findByRole('table', { name });
const typeFirst = (name: RegExp, text: string) => async (s: ReturnType<typeof within>) => userEvent.type((await s.findAllByRole('textbox', { name }))[0]!, text);
const refused = fails('Someone changed this a moment ago. Reload to see their change.');

// ------------------------------------------------------------------ PAY-16 Payroll set-up
const setup = (over: Partial<PaySetupScreenProps> = {}) => <PaySetupScreen state="ready" entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} setup={SETUP_STATE} registrations={REGISTRATIONS} options={LEGAL_OPTIONS} onSaveRegistrations={ok} onSetOption={ok} onOpen={() => undefined} {...over} />;
export const Setup: S = { name: 'PAY-16 · Payroll set-up, TAN still awaited', render: () => setup() };
export const SetupReady: S = { name: 'PAY-16 · Payroll set-up, ready to run', render: () => setup({ setup: { ready: true, steps: SETUP_STATE.steps.map((x) => ({ key: x.key, done: true })) }, registrations: { ...REGISTRATIONS, completeness: { complete: true, missing: [] } } }) };
export const SetupNoEntity: S = { name: 'PAY-16 · Choose a legal entity', render: () => setup({ entityId: null, setup: null, registrations: null, options: null }) };
export const SetupOptionMissing: S = { name: 'PAY-16 · Save option pressed with nothing chosen', render: () => setup(), play: play(press('Save option')) };
export const SetupSaveFailed: S = { name: 'PAY-16 · Saving registrations refused', render: () => setup({ onSaveRegistrations: fails('The PF number KNBNG0045123000 is already used by another legal entity.') }), play: play(press('Save registrations')) };
export const SetupLoading: S = { name: 'PAY-16 · Loading', render: () => setup({ state: 'loading' }) };
export const SetupError: S = { name: 'PAY-16 · Could not load', render: () => setup({ state: 'error', onRetry: () => undefined }) };
export const SetupNoAccess: S = { name: 'PAY-16 · No access', render: () => setup({ state: 'no-access' }) };

// ------------------------------------------------------------------ Pay groups
const groups = (over: Partial<PayGroupsScreenProps> = {}) => <PayGroupsScreen state="ready" entities={SETUP_ENTITIES} groups={PAY_GROUPS} today={TODAY} onSave={ok} onMembers={async () => GROUP_MEMBERS} onAddMembers={ok} onSearch={async () => PEOPLE_HITS} onCalendar={async () => PAY_CALENDAR} {...over} />;
export const Groups: S = { name: 'Pay groups', render: () => groups() };
export const GroupsEmpty: S = { name: 'Pay groups · none yet', render: () => groups({ groups: [] }) };
export const GroupsLoading: S = { name: 'Pay groups · loading', render: () => groups({ state: 'loading', groups: null }) };
export const GroupsError: S = { name: 'Pay groups · could not load', render: () => groups({ state: 'error', groups: null, onRetry: () => undefined }) };
export const GroupAdd: S = { name: 'Add pay group · open', render: () => groups(), play: play(press(/^Add pay group/)) };
export const GroupAddMissing: S = { name: 'Add pay group · Save pressed with nothing filled', render: () => groups(), play: play(press(/^Add pay group/), press('Save')) };
export const GroupEditFailed: S = { name: 'Edit pay group · the server refuses', render: () => groups({ onSave: refused }), play: play(pressFirst('Edit'), press('Save')) };
export const GroupMembers: S = { name: 'Members and calendar', render: () => groups(), play: play(pressFirst('Members and calendar'), see('Kavitha Sundaram')) };
export const GroupMembersMissing: S = { name: 'Members · Add pressed with no one ticked', render: () => groups(), play: play(pressFirst('Members and calendar'), see('Kavitha Sundaram'), press(/^Add .*to this group/)) };

// ------------------------------------------------------------------ PAY-15 Payslip layout
const layout = (over: Partial<PayslipLayoutLiveProps> = {}) => <PayslipLayoutLiveScreen state="ready" entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} data={PAYSLIP_LAYOUTS} onSave={ok} onPreview={ok} onActivate={ok} {...over} />;
export const Layout: S = { name: 'PAY-15 · Payslip layout, a draft with Kannada', render: () => layout() };
export const LayoutUseTooEarly: S = { name: 'PAY-15 · Use this layout pressed before a preview', render: () => layout(), play: play(press('Use this layout')) };
export const LayoutPreviewed: S = { name: 'PAY-15 · Previewed, ready to use', render: () => layout({ data: { ...PAYSLIP_LAYOUTS, layouts: PAYSLIP_LAYOUTS.layouts.map((l) => (l.status === 'draft' ? { ...l, previewedAt: '2026-10-28T05:00:00Z' } : l)) } }) };
export const LayoutFirst: S = { name: 'PAY-15 · No layout yet', render: () => layout({ data: { mandatory: PAYSLIP_LAYOUTS.mandatory, layouts: [] } }) };
export const LayoutSaveFailed: S = { name: 'PAY-15 · Save draft refused', render: () => layout({ onSave: refused }), play: play(press('Save draft')) };
export const LayoutLoading: S = { name: 'PAY-15 · Loading', render: () => layout({ state: 'loading', data: null }) };
export const LayoutError: S = { name: 'PAY-15 · Could not load', render: () => layout({ state: 'error', data: null, onRetry: () => undefined }) };

// ------------------------------------------------------------------ Statutory rules and coverage (read only)
export const Rules: S = { name: 'Statutory rules in force', render: () => <StatutoryRulesScreen state="ready" entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} rules={RULE_SETS} /> };
export const RulesValues: S = { name: 'Statutory rules · source and values', render: () => <StatutoryRulesScreen state="ready" entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} rules={RULE_SETS} />, play: play(pressFirst('Source and values')) };
export const RulesEmpty: S = { name: 'Statutory rules · none published', render: () => <StatutoryRulesScreen state="ready" entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} rules={[]} /> };
export const RulesLoading: S = { name: 'Statutory rules · loading', render: () => <StatutoryRulesScreen state="loading" entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} rules={null} /> };
export const RulesError: S = { name: 'Statutory rules · could not load', render: () => <StatutoryRulesScreen state="error" onRetry={() => undefined} entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} rules={null} /> };
export const Coverage: S = { name: 'Statutory coverage', render: () => <CoverageLiveScreen state="ready" entities={SETUP_ENTITIES} rows={COVERAGE} /> };
export const CoverageEmpty: S = { name: 'Statutory coverage · not worked out yet', render: () => <CoverageLiveScreen state="ready" entities={SETUP_ENTITIES} rows={[]} /> };
export const CoverageLoading: S = { name: 'Statutory coverage · loading', render: () => <CoverageLiveScreen state="loading" entities={SETUP_ENTITIES} rows={null} /> };
export const CoverageError: S = { name: 'Statutory coverage · could not load', render: () => <CoverageLiveScreen state="error" onRetry={() => undefined} entities={SETUP_ENTITIES} rows={null} /> };

// ------------------------------------------------------------------ PAY-2.12 Imports
const imports = (over: Partial<PayImportsScreenProps> = {}) => <PayImportsScreen state="ready" entities={SETUP_ENTITIES} today={TODAY} onStage={async () => IMPORT_OK} onCommit={ok} onGoLive={async () => GO_LIVE_READY} {...over} />;
const paste = type(/^Rows/, IMPORT_ROWS);
export const Imports: S = { name: 'PAY-2.12 · Imports', render: () => imports() };
export const ImportsMissing: S = { name: 'PAY-2.12 · Check pressed with no rows', render: () => imports(), play: play(press(/^Check\b.*rows$/)) };
export const ImportsChecked: S = { name: 'PAY-2.12 · Rows checked, ready to commit', render: () => imports(), play: play(paste, press(/^Check 3 rows/)) };
export const ImportsRowErrors: S = { name: 'PAY-2.12 · A row has a problem, Commit pressed', render: () => imports({ onStage: async () => IMPORT_ERRORS }), play: play(paste, press(/^Check 3 rows/), press(/^Commit/)) };
export const ImportsStageFailed: S = { name: 'PAY-2.12 · Checking refused', render: () => imports({ onStage: fails('March 2026 is already imported for Kaveri Foods Pvt Ltd.') }), play: play(paste, press(/^Check 3 rows/)) };
export const ImportsGoLiveMissing: S = { name: 'PAY-2.12 · Go-live check, months still missing', render: () => imports({ onGoLive: async () => GO_LIVE_MISSING }), play: play(press(/^Check$/)) };
export const ImportsLoading: S = { name: 'PAY-2.12 · Loading', render: () => imports({ state: 'loading' }) };
export const ImportsNoAccess: S = { name: 'PAY-2.12 · No access', render: () => imports({ state: 'no-access' }) };

// ------------------------------------------------------------------ PAY-14 Component library
const library = (over: Partial<ComponentLibraryLiveProps> = {}) => <ComponentLibraryLiveScreen state="ready" rows={COMPONENTS} onSave={ok} onInstallStarter={async () => ({ componentsAdded: 0 })} {...over} />;
export const Library: S = { name: 'PAY-14 · Component library', render: () => library() };
export const LibraryEmpty: S = { name: 'PAY-14 · No components yet (add the starter set)', render: () => library({ rows: [] }) };
export const LibraryAdd: S = { name: 'Add component · open', render: () => library(), play: play(press('Add component')) };
export const LibraryAddMissing: S = { name: 'Add component · Save pressed with nothing filled', render: () => library(), play: play(press('Add component'), press('Save')) };
export const LibraryStatutory: S = { name: 'Edit a statutory component · only name and payslip display change', render: () => library(), play: play(editRow('Provident fund (employee)')) };
export const LibrarySaveFailed: S = { name: 'Edit component · the server refuses', render: () => library({ onSave: refused }), play: play(pressFirst(/^Edit/), press('Save')) };
export const LibraryLoading: S = { name: 'PAY-14 · Loading', render: () => library({ state: 'loading', rows: null }) };
export const LibraryError: S = { name: 'PAY-14 · Could not load', render: () => library({ state: 'error', rows: null, onRetry: () => undefined }) };

// ------------------------------------------------------------------ PAY-13 Salary templates
const templates = (over: Partial<TemplatesLiveProps> = {}) => (
  <TemplatesLiveScreen state="ready" entities={SETUP_ENTITIES} templates={TEMPLATES} components={COMPONENTS} today={TODAY} onCreate={ok} onCheck={async () => ({ ok: true, type: 'number' as const })} onValidate={async () => ({ sample: BREAKUP, codeWageFlag: false })} onSaveVersion={ok} {...over} />
);
export const Templates: S = { name: 'PAY-13 · Salary templates', render: () => templates() };
export const TemplatesCreateMissing: S = { name: 'PAY-13 · Create pressed with no name', render: () => templates(), play: play(press('Create')) };
export const TemplatesEmpty: S = { name: 'PAY-13 · No templates yet', render: () => templates({ templates: [] }) };
export const TemplateVersion: S = { name: 'New template version · open', render: () => templates(), play: play(pressFirst('New version')) };
export const TemplateVersionTooEarly: S = { name: 'New template version · Save pressed before a sample run', render: () => templates(), play: play(pressFirst('New version'), press('Save version')) };
export const TemplateVersionTested: S = { name: 'New template version · tested on the sample', render: () => templates(), play: play(pressFirst('New version'), press('Test on the sample'), seeTable('Salary breakup')) };
export const TemplateVersionFailed: S = { name: 'New template version · the server refuses', render: () => templates({ onSaveVersion: fails('A version already starts on 1 Apr 2026.') }), play: play(pressFirst('New version'), press('Test on the sample'), press('Save version')) };
export const TemplatesLoading: S = { name: 'PAY-13 · Loading', render: () => templates({ state: 'loading', templates: null }) };
export const TemplatesError: S = { name: 'PAY-13 · Could not load', render: () => templates({ state: 'error', templates: null, onRetry: () => undefined }) };

// ------------------------------------------------------------------ PAY-12 Compensation
const comp = (over: Partial<CompensationLiveProps> = {}) => (
  <CompensationLiveScreen
    onSearch={async () => PEOPLE_HITS}
    employee={{ id: 'e-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142' }}
    onEmployee={() => undefined}
    state="ready"
    current={IN_FORCE}
    templates={TEMPLATES}
    today={TODAY}
    onPreview={async () => BREAKUP}
    onSubmit={async () => ({ changeId: 'ch2', status: 'pending' })}
    onLetter={async () => ({ referenceNo: 'KF/REV/2026/0142' })}
    profile={STAT_PROFILE}
    onSaveProfile={ok}
    onSuggest={async () => [
      { templateVersionId: 'v2', template: 'Staff standard · version 2', monthlyGross: '58700.00', takeHomeBeforeTax: '56700.00', codeWageAddBack: '0.00' },
      { templateVersionId: 'v3', template: 'Hosur plant workers · version 1', problem: 'Only for Kaveri Foods Pvt Ltd (Tamil Nadu).' },
    ]}
    {...over}
  />
);
const fillComp = [pick(/^Template/, /Staff standard · version 2/), type(/^Annual CTC/, '726000')];
export const Comp: S = { name: 'PAY-12 · Compensation, salary in force', render: () => comp() };
export const CompPick: S = { name: 'PAY-12 · Choose a person', render: () => comp({ employee: null, current: null, profile: null }) };
export const CompNoSalary: S = { name: 'PAY-12 · No salary yet', render: () => comp({ current: null }) };
export const CompViewOnly: S = { name: 'PAY-12 · Someone who can see pay but not change it', render: () => comp({ onSubmit: undefined, onSuggest: undefined }) };
export const CompBreakup: S = { name: 'PAY-12 · Breakup worked out, the rules cited', render: () => comp(), play: play(...fillComp, press('Work out the breakup'), see('Send for approval')) };
export const CompBelowMinimum: S = { name: 'PAY-12 · Breakup below the minimum wage', render: () => comp({ onPreview: async () => BREAKUP_BELOW }), play: play(...fillComp, press('Work out the breakup'), see(/below the minimum/)) };
export const CompBreakupMissing: S = { name: 'PAY-12 · Work out pressed with no template', render: () => comp(), play: play(press('Work out the breakup')) };
export const CompSuggest: S = { name: 'PAY-12 · Suggest a split', render: () => comp(), play: play(type(/^Annual CTC/, '726000'), press('Suggest a split')) };
export const CompSendMissing: S = { name: 'PAY-12 · Send pressed with no reason', render: () => comp(), play: play(...fillComp, press('Work out the breakup'), press('Send for approval')) };
export const CompSendFailed: S = { name: 'PAY-12 · Sending refused', render: () => comp({ onSubmit: fails('A salary change for Arjun Kulkarni is already waiting for approval.') }), play: play(...fillComp, press('Work out the breakup'), typeFirst(/^Reason/, 'Annual review 2026'), press('Send for approval')) };
export const CompLetterMissing: S = { name: 'PAY-12 · Revision letter pressed with no signatory', render: () => comp(), play: play(press('Issue the revision letter')) };
export const CompProfileMissing: S = { name: 'PAY-12 · Statutory profile saved with no reason', render: () => comp(), play: play(press('Save statutory profile')) };
export const CompWorking: S = { name: 'PAY-12 · Working out the breakup', render: () => comp({ onPreview: never }), play: play(...fillComp, press('Work out the breakup')) };
export const CompLoading: S = { name: 'PAY-12 · Loading', render: () => comp({ state: 'loading', current: null }) };
export const CompError: S = { name: 'PAY-12 · Could not load', render: () => comp({ state: 'error', current: null, onRetry: () => undefined }) };
