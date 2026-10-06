import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { operatorsFor, summariseRule, validateRule, type Rule, type RuleSchema } from '../lib/rules';
import { ConditionBuilder } from './condition';
import { RichTextEditor } from './editor';
import { FormField } from './field';
import { BuilderCanvas, VersionCompare, diffFlows, outlineFlow, type Flow, type FlowVersion } from './builder';

// ProseMirror measures ranges when it scrolls the selection into view; jsdom has no layout.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON() {} } as DOMRect;
  Range.prototype.getBoundingClientRect ??= () => rect;
  Range.prototype.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  document.elementFromPoint ??= () => null;
});

const SCHEMA: RuleSchema = {
  triggers: [
    { value: 'leave.submitted', label: 'Leave request is submitted', phrase: 'a leave request is submitted' },
    { value: 'expense.submitted', label: 'Expense claim is submitted', phrase: 'an expense claim is submitted' },
  ],
  fields: [
    { key: 'leave_type', label: 'Leave type', type: 'choice', options: [{ value: 'CL', label: 'Casual leave' }, { value: 'SL', label: 'Sick leave' }, { value: 'EL', label: 'Earned leave' }] },
    { key: 'days', label: 'Days', type: 'number' },
    { key: 'amount', label: 'Amount', type: 'money' },
    { key: 'start', label: 'Start date', type: 'date' },
    { key: 'reason', label: 'Reason', type: 'text' },
  ],
  recipients: [
    { value: 'manager', label: 'Reporting manager' },
    { value: 'hrbp', label: 'HR Business Partner' },
  ],
};

const RULE: Rule = {
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

describe('rules', () => {
  it('writes the plain-English summary', () => {
    expect(summariseRule(RULE, SCHEMA)).toBe(
      'When a leave request is submitted, if Leave type is Casual leave and Days is greater than 3, then require approval from HR Business Partner.',
    );
  });

  it('summarises OR groups, one-of, between and money', () => {
    const rule: Rule = {
      trigger: 'expense.submitted',
      conditions: {
        id: 'g0',
        join: 'and',
        items: [
          { id: 'c1', field: 'amount', operator: 'between', value: [10000, 50000] },
          { id: 'g1', join: 'or', items: [{ id: 'c2', field: 'leave_type', operator: 'one_of', value: ['CL', 'SL'] }, { id: 'c3', field: 'reason', operator: 'empty', value: null }] },
        ],
      },
      actions: [{ id: 'a1', type: 'notify', target: 'manager' }, { id: 'a2', type: 'block', text: 'Attach a bill' }],
    };
    expect(summariseRule(rule, SCHEMA)).toBe(
      'When an expense claim is submitted, if Amount is between ₹10,000 and ₹50,000 and (Leave type is one of Casual leave or Sick leave or Reason is empty), then notify Reporting manager and block it with the message "Attach a bill".',
    );
  });

  it('offers operators by field type', () => {
    expect(operatorsFor('text')).toEqual(['is', 'is_not', 'contains', 'empty']);
    expect(operatorsFor('money')).toContain('between');
    expect(operatorsFor('choice')).toContain('one_of');
    expect(operatorsFor('choice')).not.toContain('gt');
  });

  it('validates each row with what to do', () => {
    const errs = validateRule(
      {
        trigger: null,
        conditions: {
          id: 'g0',
          join: 'and',
          items: [
            { id: 'c1', field: null, operator: null, value: null },
            { id: 'c2', field: 'days', operator: 'gt', value: null },
            { id: 'c3', field: 'amount', operator: 'between', value: [500, 100] },
            { id: 'g1', join: 'or', items: [] },
          ],
        },
        actions: [{ id: 'a1', type: 'approval', target: null }],
      },
      SCHEMA,
    );
    expect(errs).toEqual({
      trigger: 'Choose when this rule runs',
      'c1.field': 'Choose a field',
      'c2.value': 'Enter a value',
      'c3.value': 'Enter a first value smaller than the second',
      g1: 'Add a condition to this group or remove the group',
      'a1.target': 'Choose who approves',
    });
    expect(validateRule(RULE, SCHEMA)).toEqual({});
    expect(validateRule({ ...RULE, actions: [] }, SCHEMA)).toEqual({ actions: 'Add at least one action' });
  });
});

describe('ConditionBuilder', () => {
  it('shows per-row errors and updates the summary as you edit', async () => {
    const u = userEvent.setup();
    function Host() {
      const [rule, setRule] = useState<Rule>({ ...RULE, conditions: { ...RULE.conditions, items: [...RULE.conditions.items, { id: 'c9', field: null, operator: null, value: null }] } });
      return <ConditionBuilder schema={SCHEMA} value={rule} onChange={setRule} showErrors />;
    }
    render(<Host />);
    const row = screen.getByRole('group', { name: 'Condition 3' });
    expect(within(row).getByText('Choose a field')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Remove condition 3' }));
    expect(screen.queryByText('Choose a field')).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Any (or)' }));
    expect(screen.getByRole('button', { name: 'Any (or)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Leave type is Casual leave or Days is greater than 3/)).toBeInTheDocument();
  });

  it('adds a nested group and a condition', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<ConditionBuilder schema={SCHEMA} defaultValue={RULE} onChange={onChange} />);
    await u.click(screen.getByRole('button', { name: 'Add group' }));
    expect(screen.getByRole('group', { name: 'Condition group' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Group condition 1' })).toBeInTheDocument();
    const last = onChange.mock.calls.at(-1)![0] as Rule;
    expect(last.conditions.items).toHaveLength(3);
  });

  it('read-only shows only the sentence', () => {
    render(<ConditionBuilder schema={SCHEMA} value={RULE} readOnly />);
    expect(screen.getByText(/then require approval from HR Business Partner\./)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('RichTextEditor', () => {
  it('inserts a merge field from the menu', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FormField label="Offer letter body">
        <RichTextEditor defaultValue="<p>Dear </p>" onChange={onChange} />
      </FormField>,
    );
    const box = await screen.findByRole('textbox', { name: 'Offer letter body' });
    expect(box).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Insert field' }));
    await u.click(await screen.findByRole('menuitem', { name: /Employee name/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('{{employee.name}}')));
    expect(box.querySelector('.yx-editor__merge')?.textContent).toBe('{{employee.name}}');
  });

  it('toggles bold with aria-pressed', async () => {
    const u = userEvent.setup();
    render(<RichTextEditor aria-label="Message" defaultValue="<p>Hello</p>" />);
    const bold = await screen.findByRole('button', { name: 'Bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    await u.click(bold);
    await waitFor(() => expect(bold).toHaveAttribute('aria-pressed', 'true'));
  });

  it('marks the content invalid and hides the toolbar when read-only', async () => {
    const { rerender } = render(
      <FormField label="Body" error="Enter the letter body">
        <RichTextEditor defaultValue="" />
      </FormField>,
    );
    const box = await screen.findByRole('textbox', { name: 'Body' });
    await waitFor(() => expect(box).toHaveAttribute('aria-invalid', 'true'));
    expect(box.getAttribute('aria-describedby')).toMatch(/error/);
    rerender(
      <FormField label="Body">
        <RichTextEditor defaultValue="" readOnly />
      </FormField>,
    );
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ canvas */

const FLOW: Flow = {
  nodes: [
    { id: 't1', kind: 'trigger', title: 'Leave submitted', x: 40, y: 40, config: { trigger: 'leave.submitted' } },
    { id: 'm1', kind: 'approval', title: 'Manager approval', x: 40, y: 224, config: { approver: 'manager' } },
    { id: 'n1', kind: 'notify', title: 'Notify employee', x: 40, y: 408, config: { recipient: 'manager' } },
  ],
  edges: [
    { id: 'e1', from: 't1', to: 'm1', port: 'next' },
    { id: 'e2', from: 'm1', to: 'n1', port: 'next' },
  ],
};
const node = (id: string) => document.getElementById(`node-${id}`)!.closest('.yx-node') as HTMLElement;

describe('BuilderCanvas', () => {
  it('adds a block after the selected step when you click it in the palette', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<BuilderCanvas name="Leave approval" schema={SCHEMA} defaultValue={{ nodes: [FLOW.nodes[0]], edges: [] }} defaultSelectedId="t1" onChange={onChange} />);
    await u.click(screen.getByRole('button', { name: 'Add wait' }));
    const flow = onChange.mock.calls.at(-1)![0] as Flow;
    expect(flow.nodes).toHaveLength(2);
    expect(flow.nodes[1].kind).toBe('wait');
    expect(flow.edges).toEqual([expect.objectContaining({ from: 't1', to: flow.nodes[1].id, port: 'next' })]);
    // the new step is selected and its properties are open
    expect(screen.getByRole('complementary', { name: 'Wait' })).toBeInTheDocument();
    // a wait without a timeout is marked on the node
    expect(within(node(flow.nodes[1].id)).getByText('Set a timeout for this wait')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Script, available in Wave 6/ })).toBeDisabled();
  });

  it('connects an existing step from the "+" menu and clears the node error', async () => {
    const u = userEvent.setup();
    render(<BuilderCanvas name="Leave approval" schema={SCHEMA} defaultValue={{ nodes: FLOW.nodes.slice(0, 2), edges: [] }} />);
    expect(node('m1')).toHaveAttribute('data-status', 'error');
    expect(within(node('m1')).getByText('Connect a step to this one')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Add or connect next step after Leave submitted' }));
    await u.click(await screen.findByRole('menuitem', { name: 'Manager approval' }));
    expect(node('m1')).toHaveAttribute('data-status', 'valid');
    expect(document.querySelector('[data-edge="t1->m1"]')).not.toBeNull();
    expect(screen.getByText('Next: Manager approval.')).toBeInTheDocument();
  });

  it('adds a new step from the "+" menu on a branch output', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    const flow: Flow = {
      nodes: [FLOW.nodes[0], { id: 'b1', kind: 'condition', title: 'Over 3 days?', x: 40, y: 224, config: { rule: RULE } }],
      edges: [{ id: 'e1', from: 't1', to: 'b1', port: 'next' }],
    };
    render(<BuilderCanvas name="Leave approval" schema={SCHEMA} defaultValue={flow} onChange={onChange} />);
    expect(within(node('b1')).getByText(/Leave type is Casual leave and Days is greater than 3/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Add or connect next step for No after Over 3 days?' }));
    await u.click(await screen.findByRole('menuitem', { name: 'Send notification' }));
    const last = onChange.mock.calls.at(-1)![0] as Flow;
    expect(last.edges.at(-1)).toEqual(expect.objectContaining({ from: 'b1', port: 'no' }));
  });

  it('deletes a step and its connectors after confirming', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<BuilderCanvas name="Leave approval" schema={SCHEMA} defaultValue={FLOW} onChange={onChange} />);
    await u.click(document.getElementById('node-m1')!);
    await u.click(screen.getByRole('button', { name: 'Delete step' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Its 2 connections are removed too/)).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Delete step' }));
    await waitFor(() => expect(document.getElementById('node-m1')).toBeNull());
    const last = onChange.mock.calls.at(-1)![0] as Flow;
    expect(last.edges).toEqual([]);
    expect(document.querySelectorAll('.yx-builder__edge')).toHaveLength(0);
  });

  it('refuses to publish with problems and lists them in the test panel', async () => {
    const u = userEvent.setup();
    const onPublish = vi.fn();
    const bad: Flow = { ...FLOW, nodes: FLOW.nodes.map((n) => (n.id === 'm1' ? { ...n, config: {} } : n)) };
    render(<BuilderCanvas name="Leave approval" schema={SCHEMA} defaultValue={bad} onPublish={onPublish} />);
    expect(within(node('m1')).getByText('Choose who approves')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).not.toHaveBeenCalled();
    const panel = screen.getByRole('region', { name: 'Test run' });
    expect(within(panel).getByText('Fix this problem before you publish')).toBeInTheDocument();
    await u.click(within(panel).getByRole('link', { name: 'Manager approval' }));
    expect(document.getElementById('node-m1')).toHaveAttribute('aria-pressed', 'true');
  });

  it('runs a test and highlights the node for a step result', async () => {
    const u = userEvent.setup();
    const onTestRun = vi.fn(async () => [
      { nodeId: 't1', status: 'passed' as const, reason: 'Leave request LR-2291 submitted' },
      { nodeId: 'm1', status: 'failed' as const, reason: 'Reporting manager is not set for this employee' },
    ]);
    render(
      <BuilderCanvas
        name="Leave approval"
        schema={SCHEMA}
        defaultValue={FLOW}
        samples={[{ value: 'LR-2291', label: 'LR-2291 · Priya Raghavan, 5 days casual leave' }]}
        defaultSample="LR-2291"
        onTestRun={onTestRun}
      />,
    );
    await u.click(screen.getByRole('button', { name: 'Test run' }));
    await u.click(screen.getByRole('button', { name: 'Run test' }));
    expect(await screen.findByText('1 passed · 0 skipped · 1 failed')).toBeInTheDocument();
    expect(onTestRun).toHaveBeenCalledWith('LR-2291', FLOW);
    const step = screen.getByText('Reporting manager is not set for this employee').closest('li')!;
    await u.click(step);
    expect(node('m1')).toHaveAttribute('data-highlighted', 'true');
  });
});

describe('VersionCompare', () => {
  const v6: FlowVersion = { id: 'v6', number: 6, status: 'archived', date: new Date(2026, 7, 2), author: 'Lakshmi Venkatesan', flow: FLOW };
  const v7Flow: Flow = {
    nodes: [
      FLOW.nodes[0],
      { ...FLOW.nodes[1], x: 400, config: { approver: 'hrbp' } },
      { id: 'h1', kind: 'approval', title: 'HR approval', x: 40, y: 600, config: { approver: 'hrbp' } },
    ],
    edges: [FLOW.edges[0], { id: 'e3', from: 'm1', to: 'h1', port: 'next' }],
  };
  const v7: FlowVersion = { id: 'v7', number: 7, status: 'published', date: new Date(2026, 8, 28), author: 'Lakshmi Venkatesan', flow: v7Flow };

  it('diffs nodes and connections, ignoring moves', () => {
    const d = diffFlows(FLOW, v7Flow);
    expect(d.added.map((n) => n.id)).toEqual(['h1']);
    expect(d.removed.map((n) => n.id)).toEqual(['n1']);
    expect(d.changed).toEqual([expect.objectContaining({ what: ['settings'] })]);
    expect(d.connectionsAdded.map((e) => e.id)).toEqual(['e3']);
    expect(d.connectionsRemoved.map((e) => e.id)).toEqual(['e2']);
  });

  it('shows labelled changes and rolls back after confirming', async () => {
    const u = userEvent.setup();
    const onRollback = vi.fn();
    render(<VersionCompare versions={[v6, v7]} schema={SCHEMA} onRollback={onRollback} />);
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByText('Removed')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(screen.getByText(/Before: Reporting manager · After: HR Business Partner/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Roll back to v6' }));
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getByRole('button', { name: 'Roll back to v6' }));
    expect(onRollback).toHaveBeenCalledWith(v6);
  });
});

describe('BuilderCanvas read-only phone view', () => {
  const BRANCH: Flow = {
    nodes: [
      { id: 't1', kind: 'trigger', title: 'Leave submitted', x: 0, y: 0, config: { trigger: 'leave.submitted' } },
      { id: 'b1', kind: 'condition', title: 'More than 3 days?', x: 0, y: 0, config: { rule: { trigger: null, conditions: { id: 'g', join: 'and', items: [{ id: 'c', field: 'days', operator: 'gt', value: 3 }] }, actions: [] } } },
      { id: 'm1', kind: 'approval', title: 'Manager approval', x: 0, y: 0, config: { approver: 'manager' } },
      { id: 'n1', kind: 'notify', title: 'Notify employee', x: 0, y: 0, config: { recipient: 'manager' } },
      { id: 'w1', kind: 'wait', title: 'Loose wait', x: 0, y: 0, config: { waitDays: 1, timeoutDays: null } },
    ],
    edges: [
      { id: 'e1', from: 't1', to: 'b1', port: 'next' },
      { id: 'e2', from: 'b1', to: 'm1', port: 'yes' },
      { id: 'e3', from: 'b1', to: 'n1', port: 'no' },
      { id: 'e4', from: 'm1', to: 'n1', port: 'next' },
    ],
  };

  it('orders steps from the trigger, nests branches and lists merges and loose steps', () => {
    const { items, unconnected } = outlineFlow(BRANCH);
    expect(items.map((i) => ('node' in i ? i.node.id : 'branch' in i ? i.branch.id : 'ref'))).toEqual(['t1', 'b1']);
    const br = items[1] as Extract<(typeof items)[number], { branch: unknown }>;
    expect(br.yes.map((i) => ('node' in i ? i.node.id : 'ref' in i ? `ref:${i.ref.id}` : '?'))).toEqual(['m1', 'n1']);
    expect(br.no.map((i) => ('ref' in i ? `ref:${i.ref.id}` : '?'))).toEqual(['ref:n1']);
    expect(unconnected.map((n) => n.id)).toEqual(['w1']);
  });

  it('shows cards read-only, opens a step in a sheet and shows the last test run', async () => {
    const u = userEvent.setup();
    render(
      <BuilderCanvas
        layout="read"
        name="Leave approval"
        version="v8"
        schema={SCHEMA}
        defaultValue={BRANCH}
        defaultTestResults={[{ nodeId: 't1', status: 'passed', reason: 'LR-2291 submitted' }]}
      />,
    );
    expect(screen.getByText('Edit this workflow on a computer')).toBeInTheDocument();
    expect(screen.getByText('v8')).toBeInTheDocument();
    expect(screen.getByText('If yes')).toBeInTheDocument();
    expect(screen.getByText('If no')).toBeInTheDocument();
    expect(screen.getByText('Set a timeout for this wait')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Blocks' })).not.toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: /Manager approval/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Manager approval' });
    expect(within(sheet).getByText('Notify employee')).toBeInTheDocument();
    expect(within(sheet).queryByRole('textbox')).not.toBeInTheDocument();
    await u.keyboard('{Escape}');

    await u.click(screen.getByRole('button', { name: 'Test run' }));
    const test = await screen.findByRole('dialog', { name: 'Last test run' });
    expect(within(test).getByText('LR-2291 submitted')).toBeInTheDocument();
  });
});
