import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { dateLabel } from '../org/org-kit';
import { RolesAccessScreen, type RolesAccessScreenProps } from './roles-access';
import { CancelDialog, ChangeDialog, PERSONAL_REQUIRED_DEFAULT, PersonalDialog } from './profile';
import { ProfileRequestsScreen } from './profile-requests';
import { ACCESS_REQUESTS, EFFECTIVE, GRANTS, PROFILE_SELF, REQUESTS, ROLES, SCOPES, TEMPLATES, TODAY_ISO, USERS } from './data';

// Radix dialogs and popovers toggle pointer-events while they open; the check is for real users, not here.
const ue = userEvent.setup({ pointerEventsCheck: 0, delay: null }); // no pause per keystroke: form-filling tests ran past 5 s when the suite runs in parallel
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
    onSystemAdmin: ok(),
    ...over,
  };
  render(
    <ToastProvider>
      <RolesAccessScreen {...props} />
    </ToastProvider>,
  );
  return props;
}
const pick = async (label: string, option: string) => {
  await ue.click(screen.getByRole('combobox', { name: label }));
  await ue.click(await screen.findByRole('option', { name: option }));
};

describe('Roles & access (P02 §4.2–4.3, §4.6)', () => {
  // Answer 946: requests from "You don't have access" pages.
  it('requests: approve gives the asker a role until a last day within the longest access', async () => {
    const onApproveRequest = ok();
    roles({ requests: ACCESS_REQUESTS, maxDays: 30, onApproveRequest, onRefuseRequest: ok(), initialView: 'requests' });
    expect(screen.getByRole('radio', { name: 'Requests (1)' })).toBeChecked();
    const row = screen.getByText('I cover for Suresh during the October run while he is on leave.').closest('tr') as HTMLElement;
    await ue.click(within(row).getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Give Anitha Rao access' });
    expect(within(dialog).queryByRole('combobox', { name: 'Person' })).toBeNull();
    await ue.click(within(dialog).getByRole('button', { name: /Give access|Send for approval/ }));
    expect(within(dialog).getByText('Choose the role.')).toBeInTheDocument(); // never a disabled button
    expect(onApproveRequest).not.toHaveBeenCalled();
    await pick('Role', ROLES[0]!.confidential ? `${ROLES[0]!.name} (Confidential)` : ROLES[0]!.name);
    await pick('Over', 'Whole company');
    await ue.click(within(dialog).getByRole('button', { name: /Give access|Send for approval/ }));
    await waitFor(() => expect(onApproveRequest).toHaveBeenCalledWith('ar-1', expect.objectContaining({ userId: 'u-anitha', permissionProfileId: ROLES[0]!.id, scopeType: 'tenant', validFrom: TODAY_ISO, validTo: '2026-10-12', reason: 'Access request: I cover for Suresh during the October run while he is on leave.' })));
    expect(await within(screen.getByRole('region', { name: 'Notifications' })).findByText('Access given.')).toBeInTheDocument();
  });

  it('requests: refusing needs a reason; one’s own request is decided by another admin; decided ones have no buttons', async () => {
    const onRefuseRequest = ok();
    roles({ meId: 'u-anitha', requests: ACCESS_REQUESTS, onApproveRequest: ok(), onRefuseRequest, initialView: 'requests' });
    const own = screen.getByText('I cover for Suresh during the October run while he is on leave.').closest('tr') as HTMLElement;
    expect(within(own).getByText('Yours: another admin decides')).toBeInTheDocument();
    expect(within(own).queryByRole('button', { name: 'Approve' })).toBeNull();
    const done = screen.getByText('I want to see who is lined up for my role.').closest('tr') as HTMLElement;
    expect(within(done).queryByRole('button')).toBeNull();
    expect(within(done).getByText('Succession plans stay with HR leadership.')).toBeInTheDocument();
  });

  it('requests: refuse asks why first', async () => {
    const onRefuseRequest = ok();
    roles({ requests: ACCESS_REQUESTS, onApproveRequest: ok(), onRefuseRequest, initialView: 'requests' });
    const row = screen.getByText('I cover for Suresh during the October run while he is on leave.').closest('tr') as HTMLElement;
    await ue.click(within(row).getByRole('button', { name: 'Refuse' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Refuse' }));
    expect(within(dialog).getByText('Say why: they read it.')).toBeInTheDocument();
    expect(onRefuseRequest).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Payroll runs stay with payroll.');
    await ue.click(within(dialog).getByRole('button', { name: 'Refuse' }));
    await waitFor(() => expect(onRefuseRequest).toHaveBeenCalledWith('ar-1', 'Payroll runs stay with payroll.'));
  });

  it('a revoked grant shows when it ended', async () => {
    const mine = GRANTS.find((g) => g.userId === 'u-anitha')!;
    roles({ grants: [{ ...mine, status: 'revoked', revokedAt: '2026-10-14T09:30:00Z' }] });
    expect(await screen.findByText(`${dateLabel(mine.validFrom)} to 14 Oct 2026`)).toBeInTheDocument();
  });

  it('a new role from a template says it was created', async () => {
    const p = roles();
    await ue.click(screen.getByRole('radio', { name: 'Roles' }));
    await ue.click(screen.getByRole('button', { name: 'New role from a template' }));
    await pick('Template', 'HR Executive');
    const name = screen.getByRole('textbox', { name: /Role name/ });
    await ue.clear(name);
    await ue.type(name, 'Chennai HR');
    await ue.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(p.onFromTemplate).toHaveBeenCalledWith('hr_executive', 'Chennai HR'));
    expect(await within(screen.getByRole('region', { name: 'Notifications' })).findByText('Role "Chennai HR" created.')).toBeInTheDocument(); // a toast, not a page-wide bar
  });

  it('roles list: permissions are worded like Held by, so the two counts never read as one', async () => {
    roles();
    await ue.click(screen.getByRole('radio', { name: 'Roles' }));
    const hr = screen.getByText('HR Admin').closest('tr') as HTMLElement;
    expect(within(hr).getByText('3 permissions')).toBeInTheDocument();
    expect(within(hr).getByText('1 person')).toBeInTheDocument();
  });

  it('what they can do today: each count sits beside its label, the no-team note heads the card', async () => {
    roles();
    const salary = (await screen.findByText('See salary')).closest('.yx-dl__row') as HTMLElement;
    expect(within(salary).getByText('0 people')).toBeInTheDocument(); // label and count in one row of the shared DescriptionList
    const note = screen.getByText('No employee record, so no team of their own.');
    expect(note.compareDocumentPosition(salary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // about the card, not the last row
  });

  it("shows a person's grants and what they can do today", async () => {
    const p = roles();
    expect((await screen.findAllByText('42 people')).length).toBe(2);
    expect(p.loadEffective).toHaveBeenCalledWith('u-anitha');
    expect(screen.getByText('Location: Hosur plant')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(within(dialog).getByText('Enter a reason.')).toBeInTheDocument();
    expect(p.onRevoke).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox'), 'Moved to Chennai');
    await ue.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(p.onRevoke).toHaveBeenCalledWith('g-1', 'Moved to Chennai');
  });

  it('makes a person a System Admin with a reason, and shows who the System Admins are', async () => {
    const p = roles();
    expect(screen.getByText('System Admins now: Ramesh Iyer.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Make System Admin' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make Anitha Rao a System Admin?' });
    await ue.click(within(dialog).getByRole('button', { name: 'Make System Admin' }));
    expect(within(dialog).getByText('Enter a reason.')).toBeInTheDocument();
    expect(p.onSystemAdmin).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Runs HR and access');
    await ue.click(within(dialog).getByRole('button', { name: 'Make System Admin' }));
    expect(p.onSystemAdmin).toHaveBeenCalledWith('u-anitha', true, 'Runs HR and access');
  });

  it('a System Admin carries the badge; removing the last one shows the refusal in plain words', async () => {
    const onSystemAdmin = vi.fn().mockRejectedValue(coded('LAST_SYSTEM_ADMIN', 'This is the only System Admin. Make someone else a System Admin first.'));
    roles({ onSystemAdmin });
    await pick('Person', 'Ramesh Iyer · admin@demo-org.test · System Admin');
    expect(screen.getByText('System Admin', { selector: '.yx-badge, [class*="badge"]' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Remove System Admin' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove Ramesh Iyer as System Admin?' });
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Leaving');
    await ue.click(within(dialog).getByRole('button', { name: 'Remove System Admin' }));
    expect(await within(dialog).findByText(/only System Admin/)).toBeInTheDocument();
    expect(onSystemAdmin).toHaveBeenCalledWith('u-ramesh', false, 'Leaving');
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

  it('795: only a role nobody holds can be deleted; a reason is required; then it is gone with a toast', async () => {
    const onDeleteRole = ok();
    const unused = { id: 'r-recep', name: 'Reception', permissions: ['visitors.desk.manage'], confidential: false, companyWideOnly: [], grants: 0, assignedUsers: 0 };
    roles({ roles: [...ROLES, unused], onDeleteRole, initialView: 'roles' });
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
    expect(within(screen.getByRole('row', { name: /HR Admin/ })).queryByRole('button', { name: 'Delete' })).toBeNull();
    await ue.click(within(screen.getByRole('row', { name: /Reception/ })).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await ue.click(within(dialog).getByRole('button', { name: 'Delete role' }));
    expect(within(dialog).getByText('Enter a reason.')).toBeInTheDocument();
    expect(onDeleteRole).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Walk-through role, not used');
    await ue.click(within(dialog).getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(onDeleteRole).toHaveBeenCalledWith('r-recep', 'Walk-through role, not used'));
    expect((await screen.findAllByText('Role "Reception" deleted.')).length).toBeGreaterThan(0);
  });

  it('795: without the delete action no Delete button shows', () => {
    roles({ roles: [...ROLES, { id: 'r-x', name: 'Unused', permissions: [], confidential: false, companyWideOnly: [], grants: 0, assignedUsers: 0 }], initialView: 'roles' });
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('Give access is never disabled: pressed early it names each missing field and sends nothing', async () => {
    const onGrant = vi.fn();
    roles({ onGrant });
    await ue.click(screen.getByRole('button', { name: 'Give access' }));
    const dialog = await screen.findByRole('dialog');
    const send = within(dialog).getByRole('button', { name: 'Give access' });
    expect(send).toBeEnabled();
    await ue.click(send);
    for (const t of ['Choose the role.', 'Choose over whom.', 'Say why: it is kept on the record.']) expect(within(dialog).getByText(t)).toBeInTheDocument();
    expect(onGrant).not.toHaveBeenCalled();
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
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval anyway' })); // still waits for a second admin: Payroll Admin is Confidential
    await waitFor(() => expect(onGrant).toHaveBeenCalledTimes(2));
    expect(onGrant.mock.calls[0][0]).toMatchObject({ userId: 'u-anitha', permissionProfileId: 'r-pay', scopeType: 'tenant', reason: 'Quarter close' });
    expect(onGrant.mock.calls[0][0].confirmRisk).toBeUndefined();
    expect(onGrant.mock.calls[1][0]).toMatchObject({ confirmRisk: true });
  });
});

describe('Profile dialogs (P02 §4.4–4.5; the person record PPL-03 opens them)', () => {
  it('saving personal details sends the edited details', async () => {
    const onSave = ok();
    render(<PersonalDialog initial={PROFILE_SELF.personal!} states={[{ code: 'IN-KA', name: 'Karnataka' }]} required={PERSONAL_REQUIRED_DEFAULT} onSave={onSave} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    const phone = within(dialog).getByRole('textbox', { name: /Personal phone/ });
    await ue.clear(phone);
    await ue.type(phone, '+91 98450 22233');
    await ue.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ personalPhone: '+91 98450 22233', city: 'Bengaluru' });
  });

  it('required personal details are marked; Save names each missing one, focuses the first and sends nothing', async () => {
    const onSave = ok();
    const blank = { ...PROFILE_SELF.personal!, dateOfBirth: null, gender: null, personalPhone: null, city: '  ' };
    render(<PersonalDialog initial={blank} states={[{ code: 'IN-KA', name: 'Karnataka' }]} required={PERSONAL_REQUIRED_DEFAULT} onSave={onSave} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('Required')).toHaveLength(PERSONAL_REQUIRED_DEFAULT.length);
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();
    await ue.click(save);
    for (const m of ['Choose the date of birth.', 'Choose the gender.', 'Enter the personal phone.', 'Enter the city.']) expect(within(dialog).getByText(m)).toBeInTheDocument();
    expect(within(dialog).queryByText('Enter the address.')).toBeNull();
    await waitFor(() => expect(document.activeElement?.closest('.yx-field')?.textContent).toMatch(/Date of birth/));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a wrong email, a non-mobile phone and a birth date under 14 years are refused in the form', async () => {
    const onSave = ok();
    const year = new Date().getFullYear() - 10;
    render(<PersonalDialog initial={{ ...PROFILE_SELF.personal!, personalEmail: 'divya.home', personalPhone: '+91 12345 67890', dateOfBirth: `${year}-01-01` }} states={[{ code: 'IN-KA', name: 'Karnataka' }]} onSave={onSave} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Enter a personal email like name@example.com.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a 10-digit mobile number starting with 6, 7, 8 or 9.')).toBeInTheDocument();
    expect(within(dialog).getByText('The person must be at least 14 years old.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    // Nothing is required here (the company list is empty): empty email and phone are fine; the age still is not.
    for (const name of [/Personal email/, /Personal phone/]) await ue.clear(within(dialog).getByRole('textbox', { name }));
    await ue.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).queryByText('Enter a personal email like name@example.com.')).toBeNull();
    expect(within(dialog).queryByText(/starting with 6, 7, 8 or 9/)).toBeNull();
    expect(within(dialog).getByText('The person must be at least 14 years old.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a PAN change is checked before it is sent, then goes to approval', async () => {
    const onRequest = ok();
    render(<ChangeDialog pending={[]} onRequest={onRequest} onClose={vi.fn()} />);
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
    expect(onRequest).toHaveBeenCalledWith({ kind: 'pan', value: { pan: 'BQRPR4822K' }, reason: 'Typo on file' });
  });

  it('a change already waiting can be withdrawn with a reason', async () => {
    const onCancel = ok();
    render(<CancelDialog request={REQUESTS.find((r) => r.id === 'pr-1')!} onCancel={onCancel} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox'), 'Wrong account');
    await ue.click(within(dialog).getByRole('button', { name: 'Withdraw' }));
    expect(onCancel).toHaveBeenCalledWith('pr-1', 'Wrong account');
  });
});

describe('Identity and bank changes queue (P02 §4.5, YX-EMP-02)', () => {
  it('a duplicate value needs a reason to approve anyway', async () => {
    const onApprove = vi.fn().mockRejectedValueOnce(coded('DUPLICATE_IDENTIFIER', 'Arjun Kulkarni (KF-0142) already has this Reimbursement bank account.')).mockResolvedValueOnce(undefined);
    render(<ProfileRequestsScreen state="ready" rows={REQUESTS} canDecide onApprove={onApprove} onReject={ok()} onOpenProfile={vi.fn()} onProof={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await within(dialog).findByText(/already has this/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Approve anyway' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox'), 'Joint account, checked');
    await ue.click(within(dialog).getByRole('button', { name: 'Approve anyway' }));
    expect(onApprove).toHaveBeenLastCalledWith('pr-1', 'Joint account, checked');
  });

  it('PPL-32: the approver opens the proof and sees the effective date; no proof says so', async () => {
    const onProof = vi.fn(async () => {});
    const { unmount } = render(<ProfileRequestsScreen state="ready" rows={[{ ...REQUESTS[0], reason: null, proofDocumentId: 'd1', effectiveOn: '2026-10-01' }]} canDecide onApprove={ok()} onReject={ok()} onOpenProfile={vi.fn()} onProof={onProof} />);
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/Reason given/)).toBeNull();
    expect(within(dialog).getByText(/Effective from/)).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Open the proof' }));
    expect(onProof).toHaveBeenCalledWith('d1');
    unmount();
    render(<ProfileRequestsScreen state="ready" rows={REQUESTS} canDecide onApprove={ok()} onReject={ok()} onOpenProfile={vi.fn()} onProof={onProof} />);
    await ue.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('No proof attached.')).toBeInTheDocument();
  });

  it('a change you raised shows Profile, never Approve', () => {
    render(<ProfileRequestsScreen state="ready" rows={[{ ...REQUESTS[0], mine: true }]} canDecide onApprove={ok()} onReject={ok()} onOpenProfile={vi.fn()} onProof={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
  });
});

describe('masked values', () => {
  it('keep "•••• 1234" together so a narrow cell never splits the dots from the digits', async () => {
    const { shown } = await import('./access-kit');
    expect(shown({ holderName: 'Divya Raghunathan', ifsc: 'UTIB0000456', account: '•••• 1234' })).toBe('Divya Raghunathan · UTIB0000456 · •••• 1234');
  });
});
