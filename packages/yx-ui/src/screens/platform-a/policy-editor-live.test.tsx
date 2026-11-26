import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PolicyEditorScreen } from './setup-admin';
import type { LivePolicyEditor, PolicyTypeRow } from './policy-editor-live';
import { E2_TYPES, E2_TRY, e2Limits, e2Live, E2_MOVE, E2_NOTICES } from './approval-rules-fixtures';
import { LookupTableScreen } from '../platform-b/rules-screens';
import { withApprovalPolicies } from '../settings/time-settings-live';
import { SettingsPageScreen } from '../settings/settings-screens';
import { SETTINGS_GROUPS } from '../settings/settings-groups';

// Settings S-6 (answer 1330) and E2 parts 4-7: the approval rules editor (PLT-12 with PLT-32, PLT-57), the approval
// limits (PLT-34) and 2.4's policies list, live. Positive and negative paths.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (l: LivePolicyEditor) => render(<ToastProvider><PolicyEditorScreen live={l} /></ToastProvider>);
const req = E2_TYPES[0]!;

describe('Approval rules editor (live)', () => {
  it('shows the rules and the otherwise route; saves both as the next version', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(e2Live({ onSave }));
    expect(screen.getByText(/reminded after 24 hours/)).toBeInTheDocument();
    expect(screen.getByText('Rule 1 · Many openings')).toBeInTheDocument();
    expect(screen.getByText(/When Openings is greater than 3/)).toBeInTheDocument();
    expect(screen.getByText('Otherwise')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save as version 4' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('ats.requisition', { rules: req.rules, steps: req.steps }, 3));
    expect((await screen.findAllByText('Requisition approvals saved')).length).toBeGreaterThan(0);
  });

  it('adds a step in the drawer; a step needs a name and its people', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(e2Live({ onSave }));
    await ue.click(screen.getByRole('button', { name: 'Add step' }));
    const drawer = await screen.findByRole('dialog');
    await ue.click(within(drawer).getByRole('button', { name: 'Add step' }));
    expect(within(drawer).getByText(/Give the step a name/)).toBeInTheDocument();
    await ue.type(within(drawer).getByRole('textbox', { name: /Step name/ }), 'HR check');
    await ue.click(within(drawer).getByRole('button', { name: 'Add step' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Step 2 · HR check')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save as version 4' }));
    await waitFor(() => expect(onSave.mock.calls[0]![1].steps).toHaveLength(2));
  });

  it('no otherwise steps cannot be saved (keep the built-in ones instead); a server refusal is shown', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Set the approval limits for expenses first (Settings › Approval limits).'));
    show(e2Live({ onSave }));
    await ue.click(screen.getByRole('button', { name: 'Remove otherwise step 1' }));
    await ue.click(screen.getByRole('button', { name: 'Save as version 4' }));
    expect(screen.getByText(/Add at least one "otherwise" step/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Add step' }));
    const drawer = await screen.findByRole('dialog');
    await ue.type(within(drawer).getByRole('textbox', { name: /Step name/ }), 'Boss');
    await ue.click(within(drawer).getByRole('button', { name: 'Add step' }));
    await ue.click(screen.getByRole('button', { name: 'Save as version 4' }));
    expect(await screen.findByText(/Set the approval limits for expenses first/)).toBeInTheDocument();
  });

  it('PLT-32: opens a rule in the rule builder and back; a new rule needs a name and steps', async () => {
    show(e2Live());
    await ue.click(screen.getByRole('button', { name: 'Change rule Many openings' }));
    expect(screen.getByRole('textbox', { name: /Rule name/ })).toHaveValue('Many openings');
    await ue.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Rule 1 · Many openings')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add rule' }));
    await ue.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText(/Give the rule a name/)).toBeInTheDocument();
    expect(screen.getByText(/Add at least one step/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Rule 2')).toBeNull();
  });

  it('built-in types cannot change; add-on types show the built-in steps first; a type with no values has one route', async () => {
    const { unmount } = show(e2Live({ defaultType: 'payroll.run' }));
    expect(screen.getByText('Payroll run approvals are built in and cannot change')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save as version/ })).toBeNull();
    unmount();
    const second = show(e2Live({ defaultType: 'payroll.one_time' }));
    expect(screen.getByText('Built-in steps first')).toBeInTheDocument();
    second.unmount();
    show(e2Live({ defaultType: 'leave.cancel' }));
    expect(screen.getByText(/sends no values to test, so it has one route/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add rule' })).toBeNull();
  });

  it('Try it on sample values runs the draft; a refusal is shown', async () => {
    const onTry = vi.fn().mockResolvedValueOnce(E2_TRY).mockRejectedValueOnce(new Error('Enter a number for "Openings".'));
    show(e2Live({ onTry }));
    await ue.type(screen.getByRole('textbox', { name: 'Openings' }), '5');
    await ue.click(screen.getByRole('button', { name: 'Try it' }));
    await waitFor(() => expect(onTry).toHaveBeenCalledWith('ats.requisition', { values: { openings: 5 }, draft: { rules: req.rules, steps: req.steps } }));
    expect(await screen.findByText('Matches: Many openings.')).toBeInTheDocument();
    expect(screen.getByText('Always added')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Try it' }));
    expect(await screen.findByText(/Enter a number for "Openings"/)).toBeInTheDocument();
  });

  it('PLT-57: Try on a past request', async () => {
    const onTry = vi.fn().mockResolvedValue(E2_TRY);
    show(e2Live({ onTry }));
    await ue.click(screen.getByRole('button', { name: 'Try on a past request' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('button', { name: 'Run' })).toBeDisabled();
    await ue.click(within(drawer).getByRole('combobox', { name: /Past request/ }));
    await ue.click(await screen.findByRole('option', { name: /Requisition: QA Engineer/ }));
    await ue.click(within(drawer).getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(onTry).toHaveBeenCalledWith('ats.requisition', expect.objectContaining({ requestId: 'r1' })));
  });

  it('Part 7: notices of the hiring types; unknown merge fields are refused before saving', async () => {
    const save = vi.fn().mockResolvedValue({ events: E2_NOTICES });
    show(e2Live({ notices: { load: async () => ({ events: E2_NOTICES }), save, reset: vi.fn() } }));
    await ue.click(screen.getByRole('tab', { name: /Notices/ }));
    await ue.click(await screen.findByText('Reminder'));
    const drawer = await screen.findByRole('dialog');
    await ue.type(within(drawer).getByRole('textbox', { name: /Subject/ }), 'Still waiting: {{summary}');
    await ue.type(within(drawer).getByRole('textbox', { name: /Message/ }), 'Please look at {{title}');
    await ue.click(within(drawer).getByRole('button', { name: 'Save notice' }));
    expect(within(drawer).getByText(/with only \{title\}/)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await ue.clear(within(drawer).getByRole('textbox', { name: /Subject/ }));
    await ue.type(within(drawer).getByRole('textbox', { name: /Subject/ }), 'Still waiting: {{title}');
    await ue.click(within(drawer).getByRole('button', { name: 'Save notice' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('ats.requisition', 'reminder', { subject: 'Still waiting: {title}', body: 'Please look at {title}' }));
  });

  it('Hiring › Approvals: only requisitions and offers; the move lists differences and moves the matching type', async () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    show(e2Live({ only: ['ats.requisition', 'ats.offer'], move: { rows: E2_MOVE, onMove } }));
    expect(screen.getByText('Hiring approvals')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /differ/ })).toBeInTheDocument();
    expect(screen.getByText('Different people approve.')).toBeInTheDocument();
    await ue.click(screen.getByRole('combobox', { name: /Request type/ }));
    expect(screen.queryByRole('option', { name: /One-time pay/ })).toBeNull();
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'Move offers' }));
    await waitFor(() => expect(onMove).toHaveBeenCalled());
  });

  it('view only: no add, save or remove; no access says so', () => {
    const { unmount } = show(e2Live({ canEdit: false }));
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save as version/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add step' })).toBeNull();
    unmount();
    show(e2Live({ state: 'no-access' }));
    expect(screen.getByText(/You don't have access to approval policies/)).toBeInTheDocument();
  });
});

describe('Approval limits (PLT-34 live)', () => {
  it('saves a family\'s limits; view only has no save; a refusal is shown', async () => {
    const onSave = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Changing who approves this needs payroll.run.approve in every legal entity of the company.'));
    const { unmount } = render(<ToastProvider><LookupTableScreen live={e2Limits({ onSave })} /></ToastProvider>);
    const g1 = screen.getByRole('textbox', { name: 'Limit for G1 Associate' });
    await ue.type(g1, '10000');
    await ue.click(screen.getByRole('button', { name: 'Save expenses limits' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('expense', expect.arrayContaining([{ gradeId: 'gr-1', amount: '10000.00' }, { gradeId: 'gr-3', amount: '50000.00' }])));
    expect((await screen.findAllByText('Expenses limits saved')).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('radio', { name: 'Pay' }));
    expect(screen.getByText(/needs payroll.run.approve in every legal entity/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save pay limits' }));
    expect(await screen.findByText(/Changing who approves this needs/)).toBeInTheDocument();
    unmount();
    render(<LookupTableScreen live={e2Limits({ canEdit: false })} />);
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
  });
});

describe('2.4 Approvals page: the policies list', () => {
  it('each type with its steps, or its built-in steps in words on the company hours (answers 1764, 1765)', () => {
    const TYPES: PolicyTypeRow[] = [
      { key: 'leave.request', label: 'Leave', steps: [{ name: 'Manager', approver: 'manager', mode: 'any' }], approvers: 'Manager', version: 1, updatedBy: 'Lakshmi', updatedAt: '2026-11-12T10:00:00Z' },
      { key: 'expense.claim', label: 'Expense claim', steps: null, approvers: 'Manager; then the cost-centre owner above the set amount', version: 0, updatedBy: null, updatedAt: null },
    ];
    const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '2.4')!;
    const page = withApprovalPolicies({ ...design, sections: [] }, { remindHours: 24, escalateHours: 48, types: TYPES });
    render(<ToastProvider><SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.4" live={{ page, canEdit: false, lastChange: null, onSave: vi.fn() }} /></ToastProvider>);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Expense claim')).toBeInTheDocument();
    expect(within(table).getByText(/cost-centre owner above/)).toBeInTheDocument();
    expect(within(table).getAllByText('As built in').length).toBeGreaterThan(0);
    expect(within(table).getByText("48 hours a manager's step")).toBeInTheDocument();
    expect(within(table).queryByText('Built in')).toBeNull();
  });
});
