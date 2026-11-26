import type { Meta, StoryObj } from '@storybook/react-vite';
import { PolicyEditorScreen } from './setup-admin';
import { RuleBuilderScreen } from './governance';
import { TestPreviewDrawer } from '../platform-b/studio-screens';
import { LookupTableScreen } from '../platform-b/rules-screens';
import { E2_GRADES, E2_GROUPS, E2_MOVE, E2_PEOPLE, E2_TYPES, e2Limits, e2Live } from './approval-rules-fixtures';
import { kindsFor } from './approval-steps';

// E2 approval rules editor (answers 2644-2650, 2785-2789): the drawn PLT-12 editor, PLT-32 rule builder, PLT-57 "Try it"
// and PLT-34 lookup table, in their live states. Pages: Settings › Approval policies, Settings › Approval limits and
// Hiring › Approvals (requisitions and offers only, answer 2650).
const meta: Meta = { title: 'Screens/Platform/E2 · Approval rules editor', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const req = E2_TYPES[0]!;
const fields = (req.fields ?? []).map((f) => ({ ...f }));
const choices = { people: E2_PEOPLE, groups: E2_GROUPS, grades: E2_GRADES };
const none = () => {};

export const RulesPerType: S = { name: 'PLT-12 · Rules and otherwise route (requisition)', render: () => <PolicyEditorScreen live={e2Live()} /> };
export const AddOnPayType: S = { name: 'PLT-12 · Add-on steps after the built-in ones (one-time pay)', render: () => <PolicyEditorScreen live={e2Live({ defaultType: 'payroll.one_time' })} /> };
export const BuiltIn: S = { name: 'PLT-12 · Built in, cannot change (payroll run)', render: () => <PolicyEditorScreen live={e2Live({ defaultType: 'payroll.run' })} /> };
export const OneRoute: S = { name: 'PLT-12 · A type with no values has one route', render: () => <PolicyEditorScreen live={e2Live({ defaultType: 'leave.cancel' })} /> };
export const ViewOnly: S = { name: 'PLT-12 · View only', render: () => <PolicyEditorScreen live={e2Live({ canEdit: false })} /> };
export const HiringApprovals: S = { name: 'PLT-12 · Hiring › Approvals with the move from the old routes', render: () => <PolicyEditorScreen live={e2Live({ only: ['ats.requisition', 'ats.offer'], move: { rows: E2_MOVE, onMove: async () => {} } })} /> };
export const Loading: S = { name: 'PLT-12 · Loading', render: () => <PolicyEditorScreen live={e2Live({ state: 'loading', types: [] })} /> };
export const Failed: S = { name: 'PLT-12 · Could not load', render: () => <PolicyEditorScreen live={e2Live({ state: 'error' })} /> };

export const RuleBuilder: S = {
  name: 'PLT-32 · Rule builder · one approval rule',
  render: () => <RuleBuilderScreen live={{ typeLabel: req.label, rule: req.rules![0]!, position: 1, fields, kinds: kindsFor(req), choices, canEdit: true, onDone: none, onCancel: none }} />,
};
export const NewRule: S = { name: 'PLT-32 · Rule builder · new rule', render: () => <RuleBuilderScreen live={{ typeLabel: req.label, rule: null, position: 2, fields, kinds: kindsFor(req), choices, canEdit: true, onDone: none, onCancel: none }} /> };

export const TryOnSample: S = { name: 'PLT-57 · Try it · sample values', render: () => <TestPreviewDrawer live={{ row: req, draft: null, onTry: e2Live().onTry!, pastRequests: e2Live().pastRequests, onClose: none }} /> };
export const TryOnPast: S = { name: 'PLT-57 · Try it · a past request', render: () => <TestPreviewDrawer live={{ row: req, draft: null, onTry: e2Live().onTry!, pastRequests: e2Live().pastRequests, mode: 'past', onClose: none }} /> };

export const Limits: S = { name: 'PLT-34 · Approval limits by grade', render: () => <LookupTableScreen live={e2Limits()} /> };
export const LimitsViewOnly: S = { name: 'PLT-34 · Approval limits · view only', render: () => <LookupTableScreen live={e2Limits({ canEdit: false })} /> };
