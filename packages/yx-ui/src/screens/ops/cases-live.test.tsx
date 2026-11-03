import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CaseListScreen, CaseWorkspaceScreen, EthicsDeskScreen, MyCasesScreen } from './cases';
import { ethicsCase, icReport, liveCaseList, liveEthics, liveMyCases, liveWorkspace, poshCase, reporterCase, respondentCase } from './cases-live-samples';

// HLP-07 My cases, HLP-08 Cases and HLP-09 Ethics desk, live (the designed screens with records in the server's shapes).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('HLP-07 My cases (live)', () => {
  it('lists my cases with my role and the next date; a row opens the case', async () => {
    const onOpen = vi.fn();
    show(<MyCasesScreen live={liveMyCases({ onOpen })} />);
    expect(screen.getByText('You are asked to reply by 4 Oct 2026.')).toBeInTheDocument();
    expect(screen.getByText('Committee decision, 12 Oct 2026')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Reply' }));
    expect(onOpen).toHaveBeenCalledWith('c2');
  });

  it('the reporter sees stage, dates and messages only; a message too early says why, then sends', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    show(<MyCasesScreen live={liveMyCases({ openId: 'c1', detail: reporterCase(), onSendMessage })} />);
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('Committee decision')).toBeInTheDocument();
    expect(within(d).getByText(/The inquiry itself stays with the case team/)).toBeInTheDocument();
    expect(within(d).queryByText(/Notice/)).not.toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Send message' }));
    expect(await within(d).findByText('Write the message first.')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /Message to the case team/ }), 'Any news?');
    await ue.click(within(d).getByRole('button', { name: 'Send message' }));
    expect(onSendMessage).toHaveBeenCalledWith('c1', 'Any news?');
    expect((await screen.findAllByText('Message sent')).length).toBeGreaterThan(0);
  });

  it('the respondent sees the notice, the reply date and its source; Send reply too early says why, then sends', async () => {
    const onReply = vi.fn().mockResolvedValue(undefined);
    show(<MyCasesScreen live={liveMyCases({ openId: 'c2', detail: respondentCase(), onReply })} />);
    expect(screen.getByText('4 Oct 2026 (POSH rules 2013, rule 7(4): 10 days)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy of the complaint.pdf/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send reply' }));
    expect((await screen.findAllByText('Write your reply first (at least a few words).')).length).toBeGreaterThan(0);
    expect(onReply).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Your reply/ }), 'I deny the remarks.');
    await ue.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(onReply).toHaveBeenCalledWith('c2', { text: 'I deny the remarks.', fileIds: [] });
    expect((await screen.findAllByText('Reply sent')).length).toBeGreaterThan(0);
  });

  it('asking for more time needs a reason; asked once, the button goes', async () => {
    const onAskMoreTime = vi.fn().mockResolvedValue(undefined);
    const { unmount } = show(<MyCasesScreen live={liveMyCases({ openId: 'c2', detail: respondentCase(), onAskMoreTime })} />);
    await ue.click(screen.getByRole('button', { name: 'Ask for more time' }));
    const d = screen.getByRole('dialog', { name: 'Ask for more time to reply' });
    await ue.click(within(d).getByRole('button', { name: 'Ask for more time' }));
    expect(await within(d).findByText('Say why you need more time.')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox'), 'Travelling until 5 Oct.');
    await ue.click(within(d).getByRole('button', { name: 'Ask for more time' }));
    expect(onAskMoreTime).toHaveBeenCalledWith('c2', 'Travelling until 5 Oct.');
    unmount();
    show(<MyCasesScreen live={liveMyCases({ openId: 'c2', detail: respondentCase({ notice: { ...respondentCase().notice, askedMoreTime: true } }) })} />);
    expect(screen.queryByRole('button', { name: 'Ask for more time' })).not.toBeInTheDocument();
  });

  it('no access while acting for someone else', () => {
    show(<MyCasesScreen live={liveMyCases({ state: 'no-access' })} />);
    expect(screen.getByText(/closed while you act for someone else/)).toBeInTheDocument();
  });
});

describe('HLP-08 Cases (live)', () => {
  it('the list shows anonymous and withheld reporters and overdue dates; a row opens the case', async () => {
    const onOpen = vi.fn();
    show(<CaseListScreen live={liveCaseList({ onOpen })} />);
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    await ue.click(screen.getByText('A manager: shift changed without notice'));
    expect(onOpen).toHaveBeenCalledWith('k4');
  });

  it('the second officer approves with the version', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    show(<CaseWorkspaceScreen live={liveWorkspace({ onApprove, start: { tab: 'decision' } })} />);
    await ue.click(screen.getByRole('button', { name: 'Approve outcome' }));
    expect(onApprove).toHaveBeenCalledWith('k2', 7);
    expect((await screen.findAllByText('Outcome approved')).length).toBeGreaterThan(0);
  });

  it('the officer who proposed cannot approve', () => {
    const c = ethicsCase();
    show(<CaseWorkspaceScreen live={liveWorkspace({ detail: ethicsCase({ outcome: { ...c.outcome!, proposedByMe: true } }), start: { tab: 'decision' } })} />);
    expect(screen.getByText('You proposed this outcome, so another officer approves it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve outcome' })).not.toBeInTheDocument();
  });

  it('propose: blocked before the reply (says why), too early (each field), then sent', async () => {
    const onPropose = vi.fn().mockResolvedValue(undefined);
    const c = ethicsCase();
    const none = { ...c.outcome!, status: 'none' as const };
    const { unmount } = show(<CaseWorkspaceScreen live={liveWorkspace({ onPropose, detail: ethicsCase({ outcome: none, canDecide: { ok: false, reason: 'Wait for the reply or 22 Sep 2026.' } }), start: { dialog: 'propose' } })} />);
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Propose outcome' }));
    expect((await screen.findAllByText('Wait for the reply or 22 Sep 2026.')).length).toBeGreaterThan(1);
    expect(onPropose).not.toHaveBeenCalled();
    unmount();
    show(<CaseWorkspaceScreen live={liveWorkspace({ onPropose, detail: ethicsCase({ outcome: none }), start: { dialog: 'propose' } })} />);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Propose outcome' }));
    expect(await within(d).findByText('Choose the finding.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('radio', { name: 'Not proved' }));
    await ue.type(within(d).getByRole('textbox', { name: /Action/ }), 'No action');
    await ue.type(within(d).getByRole('textbox', { name: /Reasons/ }), 'The register shows every gift was declared.');
    await ue.type(within(d).getByRole('textbox', { name: /What the reporter is told/ }), 'We looked into it.');
    await ue.click(within(d).getByRole('button', { name: 'Propose outcome' }));
    expect(onPropose).toHaveBeenCalledWith('k2', { finding: 'not-proved', action: 'No action', reasons: 'The register shows every gift was declared.', reporterSummary: 'We looked into it.', version: 7 });
  });

  it('IC report: the presiding officer can sign only with a majority', async () => {
    const onSign = vi.fn().mockResolvedValue(undefined);
    const { unmount } = show(<CaseWorkspaceScreen live={liveWorkspace({ onSign, detail: poshCase({ canDecide: { ok: true, reason: null }, icReport: icReport(1) }), start: { tab: 'decision' } })} />);
    expect(screen.getByText("Members' views · 1 of 3 agree")).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Sign the report' }));
    expect((await screen.findAllByText(/More than half of the members must agree before you sign. 1 of 3 agree now./)).length).toBeGreaterThan(0);
    expect(onSign).not.toHaveBeenCalled();
    unmount();
    show(<CaseWorkspaceScreen live={liveWorkspace({ onSign, detail: poshCase({ canDecide: { ok: true, reason: null }, icReport: icReport(2) }), start: { tab: 'decision' } })} />);
    await ue.click(screen.getByRole('button', { name: 'Sign the report' }));
    await ue.click(within(screen.getByRole('dialog', { name: 'Sign the Internal Committee report?' })).getByRole('button', { name: 'Sign the report' }));
    expect(onSign).toHaveBeenCalledWith('k3', 7);
  });

  it('IC report: "I don\'t agree" needs a note', async () => {
    const onVote = vi.fn().mockResolvedValue(undefined);
    show(<CaseWorkspaceScreen live={liveWorkspace({ onVote, detail: poshCase({ canDecide: { ok: true, reason: null }, icReport: icReport(0) }), start: { tab: 'decision' } })} />);
    await ue.click(screen.getByRole('button', { name: 'Record my view' }));
    expect((await screen.findAllByText('Choose whether you agree.')).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('radio', { name: "I don't agree" }));
    await ue.click(screen.getByRole('button', { name: 'Record my view' }));
    expect((await screen.findAllByText('Say why you don’t agree; it stays with the report.')).length).toBeGreaterThan(0);
    expect(onVote).not.toHaveBeenCalled();
  });

  it('delaying the notice needs a reason and a review date', async () => {
    const onDelayNotice = vi.fn();
    const c = ethicsCase();
    show(<CaseWorkspaceScreen live={liveWorkspace({ onDelayNotice, detail: ethicsCase({ notice: { ...c.notice!, status: 'not-sent', sentOn: null, replyBy: null, replies: [] } }), start: { tab: 'notice', dialog: 'delay' } })} />);
    const d = screen.getByRole('dialog', { name: 'Delay the notice' });
    await ue.click(within(d).getByRole('button', { name: 'Delay notice' }));
    expect(await within(d).findByText('Write why the notice waits. It goes on the case record.')).toBeInTheDocument();
    expect(onDelayNotice).not.toHaveBeenCalled();
  });

  it('send notice: choose the respondent and what is alleged; ticked papers are shared', async () => {
    const onSendNotice = vi.fn().mockResolvedValue(undefined);
    const c = ethicsCase();
    show(<CaseWorkspaceScreen live={liveWorkspace({ onSendNotice, detail: ethicsCase({ respondent: null, notice: { ...c.notice!, status: 'not-sent', sentOn: null, replyBy: null, replies: [] } }), start: { tab: 'notice', dialog: 'notice' } })} />);
    const d = screen.getByRole('dialog', { name: 'Send the notice and the papers' });
    await ue.click(within(d).getByRole('button', { name: 'Send notice' }));
    expect(await within(d).findByText('Choose who the notice goes to.')).toBeInTheDocument();
    expect(onSendNotice).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('combobox', { name: /Respondent/ }));
    await ue.click(await screen.findByRole('option', { name: /Ravi Shankar/ }));
    await ue.click(within(d).getByRole('checkbox', { name: /Vendor email 14 Aug.pdf/ }));
    await ue.click(within(d).getByRole('button', { name: 'Send notice' }));
    expect(onSendNotice).toHaveBeenCalledWith('k2', { allegations: c.report.summary, fileIds: ['e2'], respondentUserId: 'p-ravi' });
  });

  it('a delayed notice shows who delayed it and why', () => {
    const c = ethicsCase();
    show(<CaseWorkspaceScreen live={liveWorkspace({ detail: ethicsCase({ notice: { ...c.notice!, status: 'delayed', sentOn: null, replyBy: null, replies: [], delay: { reason: 'Safety of the reporter.', reviewOn: '2026-10-06', by: 'Rekha Iyengar', at: '2026-09-25' } } }), start: { tab: 'notice' } })} />);
    expect(screen.getByText(/Rekha Iyengar delayed the notice on 25 Sep 2026: “Safety of the reporter.” Look at it again by 6 Oct 2026./)).toBeInTheDocument();
  });

  it('interim relief is recorded as a case action that gives HR a task', async () => {
    const onRelief = vi.fn().mockResolvedValue({ taskRef: 'POSH-0007-R1' });
    show(<CaseWorkspaceScreen live={liveWorkspace({ onRelief, detail: poshCase(), start: { tab: 'relief', dialog: 'relief' } })} />);
    const d = screen.getByRole('dialog', { name: 'Record interim relief' });
    await ue.click(within(d).getByRole('button', { name: 'Record and give HR a task' }));
    expect(await within(d).findByText('Choose the relief.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('radio', { name: 'Stop reporting' }));
    await ue.type(within(d).getByRole('textbox'), 'Report to Kavya N., as asked on 23 Sep.');
    await ue.click(within(d).getByRole('button', { name: 'Record and give HR a task' }));
    expect(await within(d).findByText('Choose who in HR carries it out.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('combobox', { name: /Who in HR/ }));
    await ue.click(await screen.findByRole('option', { name: /Lakshmi Venkatesan/ }));
    await ue.click(within(d).getByRole('button', { name: 'Record and give HR a task' }));
    expect(onRelief).toHaveBeenCalledWith('k3', { action: 'reporting', note: 'Report to Kavya N., as asked on 23 Sep.', assigneeUserId: 'p-lakshmi' });
    expect((await screen.findAllByText('Interim relief recorded')).length).toBeGreaterThan(0);
  });

  it('a conflict of interest needs an override reason, then the second try sends it', async () => {
    const onAddMember = vi.fn().mockRejectedValueOnce(Object.assign(new Error('Ravi Shankar is in the respondent’s manager chain.'), { code: 'CASE_CONFLICT' })).mockResolvedValueOnce(undefined);
    show(<CaseWorkspaceScreen live={liveWorkspace({ onAddMember, start: { dialog: 'add' } })} />);
    const d = screen.getByRole('dialog', { name: 'Add a case member' });
    await ue.click(within(d).getByRole('button', { name: 'Add member' }));
    expect(await within(d).findByText('Choose the person.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('combobox', { name: /Person/ }));
    await ue.click(await screen.findByRole('option', { name: /Ravi Shankar/ }));
    await ue.click(within(d).getByRole('button', { name: 'Add member' }));
    expect(await within(d).findByText('Conflict of interest')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Add with the override' }));
    expect(await within(d).findByText('Write why the override is needed.')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /override/ }), 'Only Tamil-speaking investigator at Hosur.');
    await ue.click(within(d).getByRole('button', { name: 'Add with the override' }));
    expect(onAddMember).toHaveBeenLastCalledWith('k2', { personId: 'p-ravi', role: 'investigator', overrideReason: 'Only Tamil-speaking investigator at Hosur.' });
  });

  it('evidence shows the fingerprint, the virus check and the access log; a recused member is marked', () => {
    const { unmount } = show(<CaseWorkspaceScreen live={liveWorkspace({ start: { tab: 'evidence' } })} />);
    expect(screen.getAllByText(/^9f2c4a71e0b3/).length).toBeGreaterThan(0);
    expect(screen.getByText('Being checked for viruses')).toBeInTheDocument();
    expect(screen.getByText(/Read the report/)).toBeInTheDocument();
    unmount();
    show(<CaseWorkspaceScreen live={liveWorkspace({ detail: poshCase() })} />);
    expect(screen.getByText('Stepped aside 22 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText(/Remarks of a sexual nature to me/)).toBeInTheDocument();
  });

  it('not a member shows Not found; no key shows no access', () => {
    const { unmount } = show(<CaseWorkspaceScreen live={liveWorkspace({ state: 'not-found', detail: null })} />);
    expect(screen.getByText('Not found')).toBeInTheDocument();
    unmount();
    show(<CaseWorkspaceScreen live={liveWorkspace({ state: 'no-access', detail: null })} />);
    expect(screen.getByText("You don't have access to cases")).toBeInTheDocument();
  });
});

describe('HLP-09 Ethics desk (live)', () => {
  it('a report about a case officer sits with the chair and offers no routing; routing needs a reason', async () => {
    const onRoute = vi.fn().mockResolvedValue(undefined);
    show(<EthicsDeskScreen live={liveEthics({ onRoute })} />);
    expect(screen.getByText('About a case officer · with the chair')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Route to chair' })).toHaveLength(2);
    await ue.click(screen.getAllByRole('button', { name: 'Route to chair' })[0]!);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Route to chair' }));
    expect(await within(d).findByText('Write why the chair should see this report.')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox'), 'A senior manager approved it.');
    await ue.click(within(d).getByRole('button', { name: 'Route to chair' }));
    expect(onRoute).toHaveBeenCalledWith('w1', 'A senior manager approved it.');
    expect((await screen.findAllByText('WB-0012 routed to the chair')).length).toBeGreaterThan(0);
  });

  it('no access without the ethics officer role', () => {
    show(<EthicsDeskScreen live={liveEthics({ state: 'no-access' })} />);
    expect(screen.getByText("You don't have access to the ethics desk")).toBeInTheDocument();
  });
});
