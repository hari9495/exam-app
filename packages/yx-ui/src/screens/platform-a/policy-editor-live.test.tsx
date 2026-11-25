import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PolicyEditorScreen } from './setup-admin';
import type { LivePolicyEditor, PolicyTypeRow } from './policy-editor-live';
import { withApprovalPolicies } from '../settings/time-settings-live';
import { SettingsPageScreen } from '../settings/settings-screens';
import { SETTINGS_GROUPS } from '../settings/settings-groups';

// Settings S-6, 2.4 Approvals (answer 1330): the approval policy editor (PLT-12) and 2.4's policies list, live.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const TYPES: PolicyTypeRow[] = [
  { key: 'leave.request', label: 'Leave', steps: [{ name: 'Manager', approver: 'manager', mode: 'any' }], approvers: 'Manager', version: 1, updatedBy: 'Lakshmi', updatedAt: '2026-11-12T10:00:00Z' },
  { key: 'expense.claim', label: 'Expense claim', steps: null, approvers: 'Manager; then the cost-centre owner above the set amount', version: 0, updatedBy: null, updatedAt: null },
];
const live = (o: Partial<LivePolicyEditor> = {}): LivePolicyEditor => ({ state: 'ready', onRetry: () => {}, types: TYPES, remindHours: 24, escalateHours: 48, canEdit: true, onSave: vi.fn().mockResolvedValue(undefined), onReset: vi.fn().mockResolvedValue(undefined), ...o });
const show = (l: LivePolicyEditor) => render(<ToastProvider><PolicyEditorScreen live={l} /></ToastProvider>);

describe('Approval policy editor (live)', () => {
  it('shows the type steps and the company hours; adds HR as step 2 and saves a new version', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(live({ onSave }));
    expect(screen.getByText(/reminded after 24 hours/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Step 1/ })).toHaveValue('Manager');
    await ue.click(screen.getByRole('button', { name: 'Add step' }));
    await ue.click(screen.getAllByRole('radio', { name: 'All' })[1]!);
    await ue.click(screen.getByRole('button', { name: 'Save as version 2' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('leave.request', [{ name: 'Manager', approver: 'manager', mode: 'any' }, { name: 'HR', approver: 'hr', mode: 'all' }], 1));
  });

  it('a step needs a name; no steps cannot be saved (keep the built-in ones instead)', async () => {
    const onSave = vi.fn();
    show(live({ onSave }));
    await ue.clear(screen.getByRole('textbox', { name: /Step 1/ }));
    await ue.click(screen.getByRole('button', { name: 'Save as version 2' }));
    expect(screen.getByText(/Give the step a name/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Remove step 1' }));
    await ue.click(screen.getByRole('button', { name: 'Save as version 2' }));
    expect(screen.getByText(/Add at least one step/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('back to the built-in steps', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    show(live({ onReset }));
    await ue.click(screen.getByRole('button', { name: 'Use the built-in steps' }));
    await waitFor(() => expect(onReset).toHaveBeenCalledWith('leave.request', 1));
  });

  it('view only: no add, save or remove', () => {
    show(live({ canEdit: false }));
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save as version/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add step' })).toBeNull();
  });

  it('no access says so', () => {
    show(live({ state: 'no-access' }));
    expect(screen.getByText(/You don't have access to approval policies/)).toBeInTheDocument();
  });
});

describe('2.4 Approvals page: the policies list', () => {
  it('each type with its steps, or its built-in steps in words on the company hours (answers 1764, 1765)', () => {
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
