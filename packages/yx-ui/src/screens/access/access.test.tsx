import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RolesAccessScreen, type RolesAccessScreenProps } from './roles-access';
import { ProfileScreen, type ProfileScreenProps } from './profile';
import { ProfileRequestsScreen } from './profile-requests';
import { AccessLogScreen } from './access-log';
import { ACCESS_LOG, EFFECTIVE, GRANTS, PROFILE_MANAGER, PROFILE_SELF, REQUESTS, ROLES, SCOPES, TEMPLATES, TODAY_ISO, USERS } from './data';

// Radix dialogs and popovers toggle pointer-events while they open; the check is for real users, not here.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn().mockResolvedValue(undefined);
const coded = (code: string, message: string) => Object.assign(new Error(message), { code });

function roles(over: Partial<RolesAccessScreenProps> = {}) {
  const props: RolesAccessScreenProps = {
    state: 'ready',
    users: USERS,
    roles: ROLES,
    templates: TEMPLATES,
    grants: GRANTS,
    scopes: SCOPES,
    meId: 'u-other',
    today: TODAY_ISO,
    loadEffective: vi.fn().mockResolvedValue(EFFECTIVE),
    onGrant: ok(),
    onApprove: ok(),
    onReject: ok(),
    onRevoke: ok(),
    onFromTemplate: ok(),
    ...over,
  };
  render(<RolesAccessScreen {...props} />);
  return props;
}
const pick = async (label: string, option: string) => {
  await ue.click(screen.getByRole('combobox', { name: label }));
  await ue.click(await screen.findByRole('option', { name: option }));
};

describe('Roles & access (P02 §4.2–4.3, §4.6)', () => {
  it("shows a person's grants and what they can do today", async () => {
    const p = roles();
    expect((await screen.findAllByText('42 people')).length).toBe(2);
    expect(p.loadEffective).toHaveBeenCalledWith('u-anitha');
    expect(screen.getByText('Location: Hosur plant')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Revoke' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox'), 'Moved to Chennai');
    await ue.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(p.onRevoke).toHaveBeenCalledWith('g-1', 'Moved to Chennai');
  });

  it('a second admin approves (green); the one who asked never sees Approve (YX-SEC-11)', async () => {
    const p = roles();
    await ue.click(screen.getByRole('radio', { name: /Waiting/ }));
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(p.onApprove).toHaveBeenCalledWith('g-2');
  });

  it('the admin who asked is told another admin decides', async () => {
    roles({ meId: 'u-admin' });
    await ue.click(screen.getByRole('radio', { name: /Waiting/ }));
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getAllByText('You asked: another admin decides').length).toBeGreaterThan(0);
  });

  it('a risk warning (YX-SEC-18) must be confirmed before the grant is sent again', async () => {
    const onGrant = vi.fn().mockRejectedValueOnce(coded('RISK_CONFIRMATION_REQUIRED', 'Opens Confidential data of 120 people, more than the limit of 25.')).mockResolvedValueOnce(undefined);
    roles({ onGrant });
    await ue.click(screen.getByRole('button', { name: 'Give access' }));
    const dialog = await screen.findByRole('dialog');
    await pick('Role', 'Payroll Admin (Confidential)');
    await pick('Over', 'Whole company');
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Quarter close');
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    expect(await within(dialog).findByText(/120 people/)).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Give access anyway' }));
    await waitFor(() => expect(onGrant).toHaveBeenCalledTimes(2));
    expect(onGrant.mock.calls[0][0]).toMatchObject({ userId: 'u-anitha', permissionProfileId: 'r-pay', scopeType: 'tenant', reason: 'Quarter close' });
    expect(onGrant.mock.calls[0][0].confirmRisk).toBeUndefined();
    expect(onGrant.mock.calls[1][0]).toMatchObject({ confirmRisk: true });
  });
});

function profile(over: Partial<ProfileScreenProps> = {}) {
  const props: ProfileScreenProps = {
    state: 'ready',
    profile: PROFILE_SELF,
    states: [{ code: 'IN-KA', name: 'Karnataka' }],
    requests: REQUESTS.filter((r) => r.employeeId === 'p-divya'),
    onSavePersonal: ok(),
    onReveal: vi.fn().mockResolvedValue('BQRPR4821K'),
    onRequestChange: ok(),
    onCancelRequest: ok(),
    ...over,
  };
  render(<ProfileScreen {...props} />);
  return props;
}

describe('Profile by sensitivity class (P02 §4.4–4.5)', () => {
  it('a manager sees neither Personal nor identity details, and no pay', () => {
    profile({ profile: PROFILE_MANAGER, requests: [] });
    expect(screen.getByText('Personal details are for the person and HR with personal-data access.')).toBeInTheDocument();
    expect(screen.getByText('Identity and bank details are for the person and payroll.')).toBeInTheDocument();
    expect(screen.getByText('Pay is visible only with pay access.')).toBeInTheDocument();
    expect(screen.queryByText('divya.r.home@mail.test')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Show full/ })).toBeNull();
  });

  it('identifiers are masked; Show asks for the full value; Aadhaar has no Show without its grant (YX-SEC-08)', async () => {
    const p = profile();
    expect(screen.getByText('•••• 821K')).toBeInTheDocument();
    expect(screen.getByText('•••• 0248')).toBeInTheDocument();
    const shows = screen.getAllByRole('button', { name: /^Show full/ });
    expect(shows).toHaveLength(3); // PAN, UAN, salary account; never Aadhaar here
    await ue.click(shows[0]);
    expect(p.onReveal).toHaveBeenCalledWith('pan');
    expect(await screen.findByText('BQRPR4821K')).toBeInTheDocument();
  });

  it('a PAN change is checked before it is sent, then goes to approval', async () => {
    const p = profile();
    await ue.click(screen.getByRole('button', { name: 'Request a change' }));
    const dialog = await screen.findByRole('dialog');
    await pick('What changes', 'PAN');
    const pan = within(dialog).getAllByRole('textbox')[0];
    await ue.type(pan, 'abc123');
    await ue.tab();
    expect(within(dialog).getByText('Enter a PAN like ABCPE1234F')).toBeInTheDocument();
    await ue.clear(pan);
    await ue.type(pan, 'bqrpr4822k');
    await ue.type(within(dialog).getAllByRole('textbox')[1], 'Typo on file');
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    expect(p.onRequestChange).toHaveBeenCalledWith({ kind: 'pan', value: { pan: 'BQRPR4822K' }, reason: 'Typo on file' });
  });

  it('a change already waiting can be withdrawn with a reason', async () => {
    const p = profile();
    await ue.click(screen.getByRole('button', { name: 'Withdraw' }));
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox'), 'Wrong account');
    await ue.click(within(dialog).getByRole('button', { name: 'Withdraw' }));
    expect(p.onCancelRequest).toHaveBeenCalledWith('pr-1', 'Wrong account');
  });
});

describe('Identity and bank changes queue (P02 §4.5, YX-EMP-02)', () => {
  it('a duplicate value needs a reason to approve anyway', async () => {
    const onApprove = vi.fn().mockRejectedValueOnce(coded('DUPLICATE_IDENTIFIER', 'Arjun Kulkarni (KF-0142) already has this Reimbursement bank account.')).mockResolvedValueOnce(undefined);
    render(<ProfileRequestsScreen state="ready" rows={REQUESTS} canDecide onApprove={onApprove} onReject={ok()} onOpenProfile={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await within(dialog).findByText(/already has this/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Approve anyway' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox'), 'Joint account, checked');
    await ue.click(within(dialog).getByRole('button', { name: 'Approve anyway' }));
    expect(onApprove).toHaveBeenLastCalledWith('pr-1', 'Joint account, checked');
  });

  it('a change you raised shows Profile, never Approve', () => {
    render(<ProfileRequestsScreen state="ready" rows={[{ ...REQUESTS[0], mine: true }]} canDecide onApprove={ok()} onReject={ok()} onOpenProfile={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
  });
});

describe('Who accessed my data (P02 §7)', () => {
  it('lists the looks, or says the company turned the view off', () => {
    const { unmount } = render(<AccessLogScreen state="ready" log={ACCESS_LOG} />);
    expect(screen.getAllByText('Suresh Pillai').length).toBeGreaterThan(0);
    unmount();
    render(<AccessLogScreen state="ready" log={{ enabled: false, entries: [] }} />);
    expect(screen.getByText('Your company has turned this view off')).toBeInTheDocument();
  });
});

describe('masked values', () => {
  it('keep "•••• 1234" together so a narrow cell never splits the dots from the digits', async () => {
    const { shown } = await import('./access-kit');
    expect(shown({ holderName: 'Divya Raghunathan', ifsc: 'UTIB0000456', account: '•••• 1234' })).toBe('Divya Raghunathan · UTIB0000456 · •••• 1234');
  });
});
