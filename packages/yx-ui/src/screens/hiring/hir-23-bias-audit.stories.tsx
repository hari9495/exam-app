import type { Meta, StoryObj } from '@storybook/react-vite';
import { BiasAuditScreen } from './hiring-offers';
import { AUDIT_RACE, AUDIT_SEX, D } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-23 · Bias audit record', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const base = { feature: 'AI interview scoring', sex: AUDIT_SEX, race: AUDIT_RACE, today: TODAY };

export const Valid: S = { name: 'Audit valid', render: () => <BiasAuditScreen {...base} nycOn lastAudit={D(2026, 3, 12)} auditor="Hudson Fairness Auditors LLC" summaryUrl="kaverifoods.in/ai-audit-2026" /> };
export const Overdue: S = { name: 'Overdue · feature blocked for NYC jobs', render: () => <BiasAuditScreen {...base} nycOn lastAudit={D(2025, 8, 20)} auditor="Hudson Fairness Auditors LLC" summaryUrl="kaverifoods.in/ai-audit-2025" /> };
export const RecordAudit: S = { name: 'Record new audit', render: () => <BiasAuditScreen {...base} nycOn lastAudit={null} auditor={null} summaryUrl={null} recordOpen /> };
export const NotApplicable: S = { name: 'Not applicable · NYC setting off', render: () => <BiasAuditScreen {...base} nycOn={false} lastAudit={null} auditor={null} summaryUrl={null} /> };
