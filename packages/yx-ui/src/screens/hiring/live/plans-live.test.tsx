import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalRoutesScreen } from './routes';

// Recruitment batch AT2 (M10-BUILD-DESIGN §5). The headcount plan board is the designed HIR-01 screen (hir-01-live.test.tsx).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});

describe('Hiring approvals (AT2)', () => {
  it('a named-people step needs people before it can be saved while approval is on', async () => {
    const onSave = vi.fn(ok);
    render(<ApprovalRoutesScreen state="ready" requisition={{ enabled: true, steps: [] }} offer={null} people={[{ value: 'u1', label: 'Priya' }]} groups={[]} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Add a step' }));
    await ue.type(screen.getByRole('textbox', { name: /Step 1/ }), 'Head');
    expect(screen.getByRole('button', { name: 'Save requisition approval' })).toBeDisabled();
    await ue.click(screen.getByRole('combobox', { name: 'People for step 1' }));
    await ue.click(screen.getByRole('option', { name: 'Priya' }));
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'Save requisition approval' }));
    expect(onSave).toHaveBeenCalledWith('requisition', { enabled: true, steps: [{ name: 'Head', approverType: 'users', approverUserIds: ['u1'], managerLevel: null, groupId: null }] });
  });
});
