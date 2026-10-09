import type { Meta, StoryObj } from '@storybook/react-vite';
import { ComplianceDashboardScreen } from './learn-admin';
import { COMPLIANCE } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-08 · Compliance dashboard', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'L&D · department × mandatory course', render: () => <ComplianceDashboardScreen data={COMPLIANCE} /> };
export const Hr: S = { name: 'HR view', render: () => <ComplianceDashboardScreen persona="hr" data={COMPLIANCE} /> };
export const NoneOverdue: S = { name: 'No one overdue', render: () => <ComplianceDashboardScreen data={{ ...COMPLIANCE, overdue: [] }} /> };
export const Loading: S = { render: () => <ComplianceDashboardScreen data={COMPLIANCE} state="loading" /> };
export const Failed: S = { name: 'Error', render: () => <ComplianceDashboardScreen data={COMPLIANCE} state="error" /> };
