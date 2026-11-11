import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { StaffRolesScreen, rolesInput, type StaffRow } from './staff';
import { STAFF, STAFF_ROLE_DEFS } from './data';

// Staff roles (answers 1058, 1086): who holds what; a Security lead changes another's roles. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (staff: StaffRow[] = STAFF, onSave = vi.fn().mockResolvedValue(undefined), defaultOpenId?: string) =>
  render(
    <ToastProvider>
      <StaffRolesScreen state="ready" roles={STAFF_ROLE_DEFS} staff={staff} onSave={onSave} defaultOpenId={defaultOpenId} />
    </ToastProvider>,
  );

describe('StaffRolesScreen', () => {
  it('lists each member of staff with their roles and what each role holds', () => {
    wrap();
    expect(screen.getByText('Anand Iyer (you)')).toBeTruthy();
    expect(screen.getAllByText('Rules editor').length).toBeGreaterThan(0);
    expect(screen.getByText('No role: no console keys')).toBeTruthy();
    expect(screen.getByText(/Give and take staff roles/)).toBeTruthy();
  });

  it('changes another member of staff\'s roles with a reason', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    wrap(STAFF, onSave, 'st3');
    const drawer = screen.getByRole('dialog');
    await ue.click(within(drawer).getByRole('checkbox', { name: /Finance/ }));
    await ue.type(within(drawer).getByRole('textbox', { name: /Reason/ }), 'Covers the price change');
    await ue.click(within(drawer).getByRole('button', { name: 'Save roles' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('st3', ['rules_editor', 'finance'], 'Covers the price change'));
  });

  it('negative: no reason, nothing saved; the last Security lead keeps the role', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    wrap(STAFF.map((s) => (s.id === 'st2' ? { ...s, lastLead: true } : s)), onSave, 'st2');
    const drawer = screen.getByRole('dialog');
    await ue.click(within(drawer).getByRole('checkbox', { name: /Security lead/ }));
    await ue.click(within(drawer).getByRole('button', { name: 'Save roles' }));
    expect(within(drawer).getAllByText(/The last Security lead keeps the role/).length).toBeGreaterThan(0);
    expect(within(drawer).getAllByText(/Say why/).length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('negative: nobody changes their own roles (no action on your own row)', () => {
    expect(rolesInput(STAFF[0]!, ['security_lead'], 'ok reason').errors).toEqual([]);
    wrap();
    expect(screen.queryByRole('button', { name: /More actions for Anand Iyer/ })).toBeNull();
    expect(screen.getByRole('button', { name: /More actions for Kavitha Menon/ })).toBeTruthy();
  });
});
