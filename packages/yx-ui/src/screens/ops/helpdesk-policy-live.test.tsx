import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PolicyAdminScreen, PolicyLibraryScreen } from './helpdesk';
import { PENDING, WAITING, adminPolicy, liveAdmin, liveLibrary, myPolicy } from './helpdesk-policy-live-samples';

// HLP-10 Policy library + acknowledgement and HLP-11 Policy admin, live (the designed screens with real records).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('HLP-10 Policy library (live)', () => {
  it('lists what to acknowledge with due dates and the overdue banner; a title opens the policy', async () => {
    const onOpen = vi.fn();
    show(<PolicyLibraryScreen live={liveLibrary({ onOpen })} />);
    expect(screen.getByText('3 to acknowledge')).toBeInTheDocument();
    expect(screen.getByText(/One policy is overdue. Your manager gets a reminder after 7 days./)).toBeInTheDocument();
    expect(screen.queryByText('Leave policy 2026')).not.toBeInTheDocument();
    expect(screen.getByText(/v4 · Conduct · due 29 Oct 2026 · needs a one-time code/)).toBeInTheDocument();
    await ue.click(screen.getByRole('link', { name: 'Travel and expenses' }));
    expect(onOpen).toHaveBeenCalledWith('p4');
  });

  it('the reader shows what changed, the text and the files; Acknowledge too early says why and focuses the tick', async () => {
    const onAcknowledge = vi.fn().mockResolvedValue(undefined);
    show(<PolicyLibraryScreen live={liveLibrary({ openId: 'p4', policy: myPolicy('p4'), onAcknowledge })} />);
    expect(screen.getByText('Hotel caps by city tier.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gifts register.pdf/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByText('Tick that you have read and understood the policy.')).toBeInTheDocument();
    expect(onAcknowledge).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('checkbox', { name: /I have read and understood the Travel and expenses \(v5\)/ }));
    await ue.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(onAcknowledge).toHaveBeenCalledWith('p4', { versionId: 'v-p4-5', read: true });
    expect(await screen.findByText('Travel and expenses acknowledged')).toBeInTheDocument();
  });

  it('typed name (company setting) is required and sent', async () => {
    const onAcknowledge = vi.fn().mockResolvedValue(undefined);
    show(<PolicyLibraryScreen live={liveLibrary({ openId: 'p4', policy: myPolicy('p4', { typedName: true }), onAcknowledge })} />);
    await ue.click(screen.getByRole('checkbox'));
    await ue.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByText('Type your name as on your record: Divya Raghunathan.')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Type your full name/ }), 'Divya Raghunathan');
    await ue.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(onAcknowledge).toHaveBeenCalledWith('p4', { versionId: 'v-p4-5', read: true, typedName: 'Divya Raghunathan' });
  });

  it('one-time code: send it, then the code is required', async () => {
    const onSendCode = vi.fn().mockResolvedValue({ to: 'di•••@kaverifoods.in', minutes: 5 });
    const onAcknowledge = vi.fn().mockResolvedValue(undefined);
    show(<PolicyLibraryScreen live={liveLibrary({ openId: 'p1', policy: myPolicy('p1'), onSendCode, onAcknowledge })} />);
    await ue.click(screen.getByRole('checkbox'));
    await ue.click(screen.getByRole('button', { name: 'Send code to acknowledge' }));
    expect(onSendCode).toHaveBeenCalledWith('p1', 'v-p1-4');
    expect(await screen.findByText('Sent by email to di•••@kaverifoods.in. It expires in 5 minutes.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByText('Enter the 6-digit code from the email.')).toBeInTheDocument();
  });

  it('a newer version refused by the server stays on the page with a way to read it', async () => {
    const onAcknowledge = vi.fn().mockRejectedValue(Object.assign(new Error('A newer version (v6) was published. Read it, then acknowledge.'), { code: 'POLICY_NEWER_VERSION' }));
    show(<PolicyLibraryScreen live={liveLibrary({ openId: 'p4', policy: myPolicy('p4'), onAcknowledge })} />);
    await ue.click(screen.getByRole('checkbox'));
    await ue.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByText('A newer version was published')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read the new version' })).toBeInTheDocument();
  });

  it('acknowledged shows the record; nothing to acknowledge is an empty state; no access on 403', () => {
    const { unmount } = show(<PolicyLibraryScreen live={liveLibrary({ openId: 'p3', policy: myPolicy('p3') })} />);
    expect(screen.getByText(/You acknowledged v2 on 6 Jan 2026 by confirmation/)).toBeInTheDocument();
    unmount();
    const r2 = show(<PolicyLibraryScreen live={liveLibrary({ policies: [] })} />);
    expect(screen.getByText('Nothing to acknowledge.')).toBeInTheDocument();
    r2.unmount();
    show(<PolicyLibraryScreen live={liveLibrary({ state: 'no-access' })} />);
    expect(screen.getByText(/closed while you act for someone else/)).toBeInTheDocument();
  });
});

describe('HLP-11 Policy admin (live)', () => {
  it('the list of policies opens one; New policy pressed too early says what is missing', async () => {
    const onOpen = vi.fn();
    const onCreate = vi.fn().mockResolvedValue({ id: 'p9', code: 'POL-09' });
    show(<PolicyAdminScreen live={liveAdmin({ policyId: null, onOpen, onCreate })} />);
    expect(screen.getByText('171 of 248 (69%)')).toBeInTheDocument();
    expect(screen.getByText('v5: Waiting to be published')).toBeInTheDocument();
    await ue.click(screen.getByText('POL-02 · Prevention of sexual harassment (POSH)'));
    expect(onOpen).toHaveBeenCalledWith('p2');
    await ue.click(screen.getByRole('button', { name: 'New policy' }));
    await ue.click(screen.getByRole('button', { name: 'Make the policy' }));
    expect(await screen.findByText('Give the policy a title (3 letters or more).')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Title/ }), 'Code of conduct');
    await ue.type(screen.getByRole('textbox', { name: /Kind of policy/ }), 'Conduct');
    await ue.click(screen.getByRole('button', { name: 'Make the policy' }));
    expect(onCreate).toHaveBeenCalledWith({ title: 'Code of conduct', category: 'Conduct', method: 'click' });
    expect(await screen.findByText('POL-09 made')).toBeInTheDocument();
  });

  it('the header facts and the department drill-down to the pending people', async () => {
    const onDeptFilter = vi.fn();
    show(<PolicyAdminScreen live={liveAdmin({ onDeptFilter })} />);
    expect(screen.getByText('69%')).toBeInTheDocument();
    expect(screen.getByText('248 people')).toBeInTheDocument();
    await ue.click(screen.getByRole('cell', { name: 'Operations' }));
    expect(onDeptFilter).toHaveBeenCalledWith('d-ops');
    expect(await screen.findByText('Ravi Shankar')).toBeInTheDocument();
    expect(screen.getByText('Manager told')).toBeInTheDocument();
  });

  it('Send reminder says how many were reminded (toast)', async () => {
    const onRemind = vi.fn().mockResolvedValue({ sent: 2, skipped: 1 });
    show(<PolicyAdminScreen live={liveAdmin({ onRemind })} />);
    await ue.click(screen.getByRole('button', { name: 'Send reminder' }));
    expect(onRemind).toHaveBeenCalledWith('p1', undefined);
    expect(await screen.findByText('Reminder sent to 2 people')).toBeInTheDocument();
    expect(screen.getByText('1 already got one today.')).toBeInTheDocument();
  });

  it('the writer of a waiting version cannot publish it; another publisher can (design dialog, toast)', async () => {
    const r = show(<PolicyAdminScreen live={liveAdmin({ policy: adminPolicy({ open: { ...WAITING, writtenByMe: true } }) })} />);
    expect(screen.getByText('You wrote v5, so another publisher publishes it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish version' })).not.toBeInTheDocument();
    r.unmount();
    const onPublish = vi.fn().mockResolvedValue({ notified: 248 });
    show(<PolicyAdminScreen live={liveAdmin({ policy: adminPolicy({ open: WAITING }), onPublish })} />);
    expect(screen.getByText('v5 by Lakshmi Venkatesan is waiting for you to publish it.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Publish version' }));
    expect(await screen.findByText('Publish Code of conduct v5?')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Publish version' }).at(-1)!);
    expect(onPublish).toHaveBeenCalledWith('p1', 4);
    expect(await screen.findByText('Code of conduct v5 published')).toBeInTheDocument();
  });

  it('send back needs a note', async () => {
    const onSendBack = vi.fn().mockResolvedValue(undefined);
    show(<PolicyAdminScreen live={liveAdmin({ policy: adminPolicy({ open: WAITING }), onSendBack, start: { dialog: 'send-back' } })} />);
    await ue.click(screen.getByRole('button', { name: 'Send back' }));
    expect(await screen.findByText('Say what to change (3 letters or more).')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /What to change/ }), 'Name the limit.');
    await ue.click(screen.getByRole('button', { name: 'Send back' }));
    expect(onSendBack).toHaveBeenCalledWith('p1', 4, 'Name the limit.');
  });

  it('writing v2+: "what changed" is required before sending; saving then sends with the saved version', async () => {
    const onSaveDraft = vi.fn().mockResolvedValue({ version: 7 });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    show(<PolicyAdminScreen live={liveAdmin({ onSaveDraft, onSubmit, start: { tab: 'write' } })} />);
    await ue.click(screen.getByRole('button', { name: 'Send to be published' }));
    expect(await screen.findByText('Say what changed (3 letters or more). People see it at the top of the policy.')).toBeInTheDocument();
    expect(onSaveDraft).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /What changed/ }), 'Gifts limit named.');
    await ue.click(screen.getByRole('button', { name: 'Send to be published' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('p1', 7));
    expect(onSaveDraft.mock.calls[0][1]).toMatchObject({ changeSummary: 'Gifts limit named.', reack: true });
    expect(await screen.findByText('v5 sent to be published')).toBeInTheDocument();
  });

  it('read-only for a publisher without policy.manage; no access on 403', () => {
    const r = show(<PolicyAdminScreen live={liveAdmin({ canManage: false, start: { tab: 'audience' } })} />);
    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Kaveri Foods Pvt Ltd').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Save audience and method' })).not.toBeInTheDocument();
    r.unmount();
    show(<PolicyAdminScreen live={liveAdmin({ state: 'no-access' })} />);
    expect(screen.getByText(/write, publish and track company policies/)).toBeInTheDocument();
    expect(PENDING).toHaveLength(3);
  });
});
