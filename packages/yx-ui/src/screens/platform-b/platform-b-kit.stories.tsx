import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentPlanCard, CodeEditor, ImpactPreview } from './platform-b-kit';
import { RegionMap } from './region-agent-screens';
import { IMPACT_ROWS, OT_IMPACT_ROWS, TRANSFER_PLAN } from './platform-b-data';

const meta: Meta = { title: 'Screens/Platform/Kit (platform b)', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

export const Impact: S = { name: 'ImpactPreview · live', render: () => <ImpactPreview subject="Casual leave, plant sites · v4" mode="live" rows={IMPACT_ROWS} valueLabel="Casual leave days" inScope={248} canDownload /> };
export const ImpactMoney: S = { name: 'ImpactPreview · money and law applied', render: () => <ImpactPreview subject="Overtime rate · v2" mode="sandbox" rows={OT_IMPACT_ROWS} valueLabel="Overtime rate" automationRuns={4} failures={[{ record: 'KF-0231', message: 'No Sunday overtime rule.' }]} /> };
export const ImpactLoading: S = { name: 'ImpactPreview · loading', render: () => <ImpactPreview subject="x" mode="live" rows={[]} valueLabel="x" state="loading" /> };
export const ImpactError: S = { name: 'ImpactPreview · error', render: () => <ImpactPreview subject="x" mode="live" rows={[]} valueLabel="x" state="error" /> };
export const Code: S = { name: 'CodeEditor · with problems', render: () => <CodeEditor label="Script" value={"const a = 1;\nconst key = 'sk_live_x';\nexport default a;"} problems={[{ line: 2, message: 'Secret pattern found. Use the vault.', severity: 'error' }]} /> };
export const CodeReadOnly: S = { name: 'CodeEditor · read-only', render: () => <CodeEditor label="Script (v1, published)" value={'export default () => ({ ok: true });'} readOnly /> };
export const Plan: S = { name: 'AgentPlanCard · plan', render: () => <AgentPlanCard request="Move 12 people to Chakan from 1 Nov" steps={TRANSFER_PLAN.map((s) => ({ ...s, state: undefined }))} phase="plan" actingAs="as Lakshmi Venkatesan" /> };
export const PlanProgress: S = { name: 'AgentPlanCard · progress', render: () => <AgentPlanCard request="Move 12 people to Chakan from 1 Nov" steps={TRANSFER_PLAN} phase="progress" actingAs="as Lakshmi Venkatesan" /> };
export const Map: S = { name: 'RegionMap · move route', render: () => <RegionMap current={['IN']} target="ME-AE" /> };
