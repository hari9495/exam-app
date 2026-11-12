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
    expect(screen.getByText(/Add, deactivate and give roles to staff/)).toBeTruthy();
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

describe('Add staff and Deactivate (answer 1164)', () => {
  const full = (over: Partial<Parameters<typeof StaffRolesScreen>[0]> = {}) =>
    render(
      <ToastProvider>
        <StaffRolesScreen state="ready" roles={STAFF_ROLE_DEFS} staff={STAFF} onSave={vi.fn()} onInvite={vi.fn().mockResolvedValue(undefined)} onDeactivate={vi.fn().mockResolvedValue(undefined)} {...over} />
      </ToastProvider>,
    );

  it('adds a member of staff with a name, a work email and a reason', async () => {
    const onInvite = vi.fn().mockResolvedValue(undefined);
    full({ onInvite });
    await ue.click(screen.getByRole('button', { name: 'Add staff' }));
    const drawer = screen.getByRole('dialog');
    await ue.type(within(drawer).getByRole('textbox', { name: /Name/ }), 'Priya Nair');
    await ue.type(within(drawer).getByRole('textbox', { name: /Work email/ }), 'priya.nair@yukthix.com');
    await ue.type(within(drawer).getByRole('textbox', { name: /Reason/ }), 'Joins support');
    await ue.click(within(drawer).getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => expect(onInvite).toHaveBeenCalledWith({ email: 'priya.nair@yukthix.com', name: 'Priya Nair', reason: 'Joins support' }));
  });

  it('negative: a bad email and no reason are refused with the reasons', async () => {
    const onInvite = vi.fn();
    full({ onInvite, defaultInvite: true });
    const drawer = screen.getByRole('dialog');
    await ue.type(within(drawer).getByRole('textbox', { name: /Work email/ }), 'priya');
    await ue.click(within(drawer).getByRole('button', { name: 'Send invitation' }));
    expect(within(drawer).getAllByText(/Give their work email/).length).toBeGreaterThan(0);
    expect(within(drawer).getAllByText(/Give their name/).length).toBeGreaterThan(0);
    expect(onInvite).not.toHaveBeenCalled();
  });

  it('deactivates another member of staff with a reason', async () => {
    const onDeactivate = vi.fn().mockResolvedValue(undefined);
    full({ onDeactivate });
    await ue.click(screen.getByRole('button', { name: /More actions for Farah Siddiqui/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox'), 'Left YukthiX');
    await ue.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(onDeactivate).toHaveBeenCalledWith('st3', 'Left YukthiX'));
  });

  it('negative: no Deactivate for yourself, the last Security lead or someone already inactive', async () => {
    full({ staff: STAFF.map((s) => (s.id === 'st2' ? { ...s, lastLead: true } : s)) });
    expect(screen.queryByRole('button', { name: /More actions for Anand Iyer/ })).toBeNull();
    for (const name of ['Kavitha Menon', 'Meera Pillai']) {
      await ue.click(screen.getByRole('button', { name: new RegExp(`More actions for ${name}`) }));
      expect(await screen.findByRole('menuitem', { name: 'Change roles' })).toBeTruthy();
      expect(screen.queryByRole('menuitem', { name: 'Deactivate' })).toBeNull();
      await ue.keyboard('{Escape}');
    }
  });
});

describe('Reactivate and Send the invitation again (answers 1171, 1173)', () => {
  const full = (over: Partial<Parameters<typeof StaffRolesScreen>[0]> = {}) =>
    render(
      <ToastProvider>
        <StaffRolesScreen state="ready" roles={STAFF_ROLE_DEFS} staff={STAFF} onSave={vi.fn()} onReactivate={vi.fn().mockResolvedValue(undefined)} onResend={vi.fn().mockResolvedValue(undefined)} {...over} />
      </ToastProvider>,
    );
  const menu = async (name: string) => {
    await ue.click(screen.getByRole('button', { name: new RegExp(`More actions for ${name}`) }));
    await screen.findByRole('menuitem', { name: 'Change roles' });
  };

  it('reactivates a deactivated member of staff with a reason, saying they keep their roles', async () => {
    const onReactivate = vi.fn().mockResolvedValue(undefined);
    full({ onReactivate });
    await menu('Meera Pillai');
    await ue.click(screen.getByRole('menuitem', { name: 'Reactivate' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/come back with the roles they held/)).toBeTruthy();
    await ue.type(within(dialog).getByRole('textbox'), 'Back from leave');
    await ue.click(within(dialog).getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(onReactivate).toHaveBeenCalledWith('st5', 'Back from leave'));
  });

  it('sends the invitation again to someone who never signed in', async () => {
    const onResend = vi.fn().mockResolvedValue(undefined);
    full({ onResend });
    expect(screen.getByText('Invited')).toBeTruthy();
    await menu('Priya Nair');
    await ue.click(screen.getByRole('menuitem', { name: 'Send the invitation again' }));
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox'), 'Link expired');
    await ue.click(within(dialog).getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(onResend).toHaveBeenCalledWith('st6', 'Link expired'));
  });

  it('negative: no Reactivate for active people, no resend for people who signed in or are deactivated', async () => {
    full();
    await menu('Farah Siddiqui');
    expect(screen.queryByRole('menuitem', { name: 'Reactivate' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Send the invitation again' })).toBeNull();
    await ue.keyboard('{Escape}');
    await menu('Meera Pillai');
    expect(screen.queryByRole('menuitem', { name: 'Send the invitation again' })).toBeNull();
  });
});
