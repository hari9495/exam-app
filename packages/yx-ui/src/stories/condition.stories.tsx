import '../components/condition.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ConditionBuilder, emptyRule } from '../components/condition';
import { Button } from '../components/button';
import { validateRule, type Rule, type RuleSchema } from '../lib/rules';
import { Section } from './story-kit';

const meta: Meta = {
  title: 'Builders/Condition builder',
  parameters: { layout: 'padded' },
  // Shared sample data, not stories.
  excludeStories: /^[A-Z_]+$/,
};
export default meta;
type S = StoryObj;

export const LEAVE_SCHEMA: RuleSchema = {
  triggers: [
    { value: 'leave.submitted', label: 'Leave request is submitted', phrase: 'a leave request is submitted' },
    { value: 'leave.cancelled', label: 'Leave request is cancelled', phrase: 'a leave request is cancelled' },
    { value: 'expense.submitted', label: 'Expense claim is submitted', phrase: 'an expense claim is submitted' },
    { value: 'employee.joined', label: 'Employee joins', phrase: 'an employee joins' },
  ],
  fields: [
    {
      key: 'leave_type',
      label: 'Leave type',
      type: 'choice',
      options: [
        { value: 'CL', label: 'Casual leave' },
        { value: 'SL', label: 'Sick leave' },
        { value: 'EL', label: 'Earned leave' },
        { value: 'ML', label: 'Maternity leave' },
        { value: 'LOP', label: 'Leave without pay' },
      ],
    },
    { key: 'days', label: 'Days', type: 'number' },
    { key: 'start_date', label: 'Start date', type: 'date' },
    { key: 'amount', label: 'Claim amount', type: 'money' },
    {
      key: 'location',
      label: 'Work location',
      type: 'choice',
      options: [
        { value: 'BLR', label: 'Bengaluru' },
        { value: 'CHN', label: 'Chennai' },
        { value: 'HSR', label: 'Hosur plant' },
      ],
    },
    { key: 'grade', label: 'Grade', type: 'choice', options: ['G3', 'G4', 'G5', 'G6'].map((g) => ({ value: g, label: g })) },
    { key: 'reason', label: 'Reason', type: 'text' },
    { key: 'probation_status', label: 'Probation status', type: 'text' },
  ],
  recipients: [
    { value: 'manager', label: 'Reporting manager' },
    { value: 'skip_manager', label: "Manager's manager" },
    { value: 'hrbp', label: 'HR Business Partner' },
    { value: 'finance', label: 'Finance team' },
    { value: 'employee', label: 'The employee' },
    { value: 'p_lakshmi', label: 'Lakshmi Venkatesan' },
  ],
};

export const SIMPLE_RULE: Rule = {
  trigger: 'leave.submitted',
  conditions: {
    id: 'g0',
    join: 'and',
    items: [
      { id: 'c1', field: 'leave_type', operator: 'is', value: 'CL' },
      { id: 'c2', field: 'days', operator: 'gt', value: 3 },
    ],
  },
  actions: [{ id: 'a1', type: 'approval', target: 'hrbp' }],
};

const OR_RULE: Rule = {
  trigger: 'leave.submitted',
  conditions: {
    id: 'g0',
    join: 'or',
    items: [
      { id: 'c1', field: 'leave_type', operator: 'one_of', value: ['EL', 'LOP'] },
      { id: 'c2', field: 'days', operator: 'between', value: [5, 15] },
      { id: 'c3', field: 'start_date', operator: 'lt', value: new Date(2026, 9, 5) },
    ],
  },
  actions: [
    { id: 'a1', type: 'notify', target: 'skip_manager' },
    { id: 'a2', type: 'approval', target: 'manager' },
  ],
};

const NESTED_RULE: Rule = {
  trigger: 'expense.submitted',
  conditions: {
    id: 'g0',
    join: 'and',
    items: [
      { id: 'c1', field: 'amount', operator: 'gt', value: 25000 },
      {
        id: 'g1',
        join: 'or',
        items: [
          { id: 'c2', field: 'location', operator: 'is', value: 'HSR' },
          { id: 'c3', field: 'grade', operator: 'one_of', value: ['G3', 'G4'] },
        ],
      },
    ],
  },
  actions: [
    { id: 'a1', type: 'approval', target: 'finance' },
    { id: 'a2', type: 'set_field', field: 'probation_status', text: 'Under review' },
  ],
};

const INVALID_RULE: Rule = {
  trigger: null,
  conditions: {
    id: 'g0',
    join: 'and',
    items: [
      { id: 'c1', field: 'leave_type', operator: 'is', value: 'CL' },
      { id: 'c2', field: 'days', operator: 'between', value: [10, 3] },
      { id: 'c3', field: null, operator: null, value: null },
      { id: 'g1', join: 'or', items: [] },
    ],
  },
  actions: [
    { id: 'a1', type: 'approval', target: null },
    { id: 'a2', type: 'block', text: '' },
  ],
};

function Live({ initial, showErrors = false, withSave = false }: { initial: Rule; showErrors?: boolean; withSave?: boolean }) {
  const [rule, setRule] = useState(initial);
  const [tried, setTried] = useState(showErrors);
  const errorCount = Object.keys(validateRule(rule, LEAVE_SCHEMA)).length;
  return (
    <div style={{ maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ConditionBuilder schema={LEAVE_SCHEMA} value={rule} onChange={setRule} showErrors={tried} />
      {withSave && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--yx-color-text-secondary)' }} aria-live="polite">
            {tried && errorCount ? `${errorCount} ${errorCount === 1 ? 'problem' : 'problems'} to fix` : ''}
          </span>
          <Button>Cancel</Button>
          <Button variant="primary" onClick={() => setTried(true)}>
            Save rule
          </Button>
        </div>
      )}
    </div>
  );
}

export const Simple: S = { name: 'Simple rule', render: () => <Live initial={SIMPLE_RULE} withSave /> };
export const AndOrGroup: S = { name: 'Any of (OR), one-of, between and date', render: () => <Live initial={OR_RULE} /> };
export const Nested: S = { name: 'Nested group', render: () => <Live initial={NESTED_RULE} /> };
export const ValidationErrors: S = { name: 'Validation errors on each row', render: () => <Live initial={INVALID_RULE} showErrors withSave /> };
export const NewRule: S = { name: 'New rule (empty)', render: () => <Live initial={emptyRule()} withSave /> };
export const SummaryReadOnly: S = {
  name: 'Summary, read-only',
  render: () => (
    <div style={{ maxWidth: 720 }}>
      <Section title="Simple">
        <ConditionBuilder schema={LEAVE_SCHEMA} value={SIMPLE_RULE} readOnly />
      </Section>
      <Section title="Any of, between, date">
        <ConditionBuilder schema={LEAVE_SCHEMA} value={OR_RULE} readOnly />
      </Section>
      <Section title="Nested group, several actions">
        <ConditionBuilder schema={LEAVE_SCHEMA} value={NESTED_RULE} readOnly />
      </Section>
    </div>
  ),
};
export const ConditionsOnly: S = {
  name: 'Conditions only (as used by a branch step)',
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <ConditionBuilder schema={LEAVE_SCHEMA} defaultValue={SIMPLE_RULE} parts={['if']} />
    </div>
  ),
};
export const FocusedField: S = {
  name: 'Focus on a control',
  parameters: { pseudo: { focusVisible: ['.yx-rule__row .yx-select'] } },
  render: () => <Live initial={SIMPLE_RULE} />,
};
export const Mobile: S = {
  name: 'Mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <Live initial={NESTED_RULE} withSave />,
};
