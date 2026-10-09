import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AlumniScreen, AssetsScreen, ClearanceScreen, ExitCaseScreen, MyDocumentsScreen, ResignationScreen } from './exits';
import { ProbationScreen } from '../../workforce/probation';
import type { AssetRow, ExitWorkspace, Handoff, MyClearanceItem, MyResignation } from './types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Me › Resign (PPL-18)', () => {
  const data: MyResignation = { today: '2026-10-09', notice: { period: '30d', label: '30 days', standardLwd: '2026-11-08', onProbation: false }, reasons: ['better_opportunity', 'family'], current: null, last: null };
  it('shows the notice and the last day before sending; Resign waits for a reason and own words', async () => {
    const onResign = vi.fn(async () => ({}));
    render(<ResignationScreen state="ready" data={data} onResign={onResign} onWithdraw={vi.fn()} interviewHref="/i" />);
    expect(screen.getByText('30 days')).toBeInTheDocument();
    expect(screen.getByText('8 Nov 2026')).toBeInTheDocument();
    const resign = screen.getByRole('button', { name: 'Resign' });
    expect(resign).toBeDisabled();
    await ue.click(screen.getByRole('combobox', { name: 'Main reason' }));
    await ue.click(screen.getByRole('option', { name: 'Family reasons' }));
    await ue.type(screen.getByRole('textbox', { name: /In your own words/ }), 'Moving home');
    await ue.click(resign);
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send resignation' }));
    expect(onResign).toHaveBeenCalledWith({ reasonCode: 'family', reasonText: 'Moving home', requestedLwd: null });
  });

  it('a hold shows only the neutral message', () => {
    const current = { id: 'k', employeeId: 'e', exitType: 'resignation' as const, typeLabel: 'Resignation', initiatedBy: 'employee' as const, reasonCode: 'family', reasonText: 'x', submittedOn: '2026-10-01', requestedLwd: null, noticePeriod: '30d', noticeLabel: '30 days', standardLwd: '2026-10-31', approvedLwd: '2026-10-31', lastDay: '2026-10-31', noticeArrangement: null, status: 'accepted' as const, pendingChange: null, lettersHeld: true, version: 2, interview: 'sent' as const };
    render(<ResignationScreen state="ready" data={{ ...data, current }} onResign={vi.fn()} onWithdraw={vi.fn()} interviewHref="/i" />);
    expect(screen.getByText('Your relieving letter is on hold')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Answer it' })).toHaveAttribute('href', '/i');
  });
});

describe('Exit workspace (PPL-19 / PPL-20)', () => {
  const base: ExitWorkspace = {
    id: 'k', employeeId: 'e', exitType: 'resignation', typeLabel: 'Resignation', initiatedBy: 'employee', reasonCode: null, reasonText: 'Closer to home', submittedOn: '2026-10-01', requestedLwd: null, noticePeriod: '30d', noticeLabel: '30 days', standardLwd: '2026-10-31', approvedLwd: '2026-10-31', lastDay: '2026-10-31', noticeArrangement: null, status: 'accepted', pendingChange: null, lettersHeld: false, version: 3,
    name: 'Ravi', employeeCode: 'E1', journeyId: null, interview: 'sent', hr: null, can: { manage: false, confidential: false, interview: false },
    clearance: [{ id: 'c1', department: 'finance', title: 'Advances settled', owner: 'Lakshmi', status: 'open', note: null, recoveryAmount: null, recoveryReason: null, signedOffAt: null, version: 1 }],
  };
  const props = { state: 'ready' as const, today: '2026-10-09', onBack: vi.fn(), onNotice: vi.fn(), onHrFacts: vi.fn(), onSignOff: vi.fn(), onInterview: vi.fn(), onInterviewNotes: vi.fn(), checklistHref: () => '#' };
  it('a manager sees no HR-only card and cannot sign off or change the day', () => {
    render(<ExitCaseScreen {...props} data={base} />);
    expect(screen.queryByText('HR only')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change last day' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign off' })).toBeNull();
  });

  it('HR records a recovery only with an amount and what it is for', async () => {
    const onSignOff = vi.fn(async () => ({}));
    render(<ExitCaseScreen {...props} onSignOff={onSignOff} data={{ ...base, can: { manage: true, confidential: true, interview: true } }} />);
    await ue.click(screen.getByRole('button', { name: 'Sign off' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('checkbox', { name: /recovery/ }));
    expect(within(dialog).getByRole('button', { name: 'Sign off' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Amount/ }), '15000');
    await ue.type(within(dialog).getByRole('textbox', { name: /For/ }), 'Phone not returned');
    await ue.click(within(dialog).getByRole('button', { name: 'Sign off' }));
    expect(onSignOff).toHaveBeenCalledWith(base.clearance[0], { action: 'clear', note: null, recoveryAmount: '15000', recoveryReason: 'Phone not returned' });
  });

  it('waiving needs a note', async () => {
    const rows: MyClearanceItem[] = [{ ...base.clearance[0], exitCaseId: 'k', person: 'Ravi', lastDay: '2026-10-31' }];
    render(<ClearanceScreen state="ready" rows={rows} onSignOff={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Sign off' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('radio', { name: 'Waive' }));
    expect(within(dialog).getByRole('button', { name: 'Waive' })).toBeDisabled();
  });
});

describe('Assets (PPL-25)', () => {
  const row: AssetRow = { id: 'a', category: 'Laptop', name: 'ThinkPad', tag: 'LT-1', serial: null, legalEntityId: null, locationId: null, purchasedOn: null, cost: '62000.00', status: 'assigned', version: 1, canManage: true, holder: { assignmentId: 'x', employeeId: 'e', name: 'Ravi', issuedOn: '2026-10-01', acknowledged: false } };
  it('taking back as "not returned" says it becomes a recovery', async () => {
    render(<AssetsScreen state="ready" rows={[row]} canAdd today="2026-10-09" entities={[]} locations={[]} people={[]} onAdd={vi.fn()} onIssue={vi.fn()} onReturn={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Take back' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('radio', { name: 'Not returned' }));
    expect(within(dialog).getByText(/for a recovery/)).toBeInTheDocument();
  });
});

describe('Probation review (PPL-17, LIFE-3.01)', () => {
  it('the direct manager reviews: extending sends the months', async () => {
    const onReview = vi.fn(async () => undefined);
    const r = { employeeId: 'e', name: 'Arun', employeeCode: 'E4', startOn: '2026-08-10', originalEndOn: '2027-02-09', plannedEndOn: '2027-02-09', extendedMonths: 0, reviewDueOn: '2027-01-25', escalatedOn: null, confirmedFrom: null, pendingConfirmationId: null, stage: 'running' as const, maxTotalMonths: 12, canReview: true };
    render(<ProbationScreen state="ready" rows={[r]} today="2026-10-09" canManage={false} onConfirm={vi.fn()} onExtend={vi.fn()} onOpenHistory={vi.fn()} changesHref="#" onReview={onReview} />);
    await ue.click(screen.getByRole('button', { name: 'Review' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('radio', { name: 'Extend' }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Comments/ }), 'More time on the line');
    await ue.click(within(dialog).getByRole('button', { name: 'Extend probation' }));
    expect(onReview).toHaveBeenCalledWith('e', { outcome: 'extend', months: 3, comments: 'More time on the line', rating: null });
  });
});

describe('After the last day (6d)', () => {
  const ws: ExitWorkspace = {
    id: 'k', employeeId: 'e', exitType: 'end_of_contract', typeLabel: 'End of contract', initiatedBy: 'company', reasonCode: null, reasonText: 'Ends', submittedOn: '2026-10-01', requestedLwd: null, noticePeriod: '0d', noticeLabel: 'No notice', standardLwd: '2026-10-30', approvedLwd: '2026-10-30', lastDay: '2026-10-30', noticeArrangement: null, status: 'exited', pendingChange: null, lettersHeld: false, version: 4,
    name: 'Ravi', employeeCode: 'E1', journeyId: null, interview: null, hr: null, can: { manage: true, confidential: false, interview: false }, clearance: [],
  };
  const handoff: Handoff = { current: { revision: 2, cause: 'exited', lwd: '2026-10-30', wagesDueBy: '2026-11-03', noticePeriod: '0d', noticeServedDays: 0, recoveries: [{ source: 'asset', title: 'Return ThinkPad', amount: '50000.00', reason: 'Not returned yet', status: 'open' }], holds: { letters: false }, frozenAt: '2026-10-31T00:00:00Z' }, earlier: [], settledOutside: null, canSettle: true };
  const props = { state: 'ready' as const, today: '2026-11-02', onBack: vi.fn(), onNotice: vi.fn(), onHrFacts: vi.fn(), onSignOff: vi.fn(), onInterview: vi.fn(), onInterviewNotes: vi.fn(), checklistHref: () => '#' };
  it('a failed step can be retried; the hand-off shows the due date and closes as settled outside', async () => {
    const onRetryStep = vi.fn(async () => ({}));
    const onSettledOutside = vi.fn(async () => ({}));
    render(<ExitCaseScreen {...props} data={ws} steps={[{ handler: 'letters.experience', label: 'Experience letter', timing: 't0', status: 'failed', attempts: 3, lastError: 'There is no active experience template yet.', doneAt: null }]} onRetryStep={onRetryStep} onStepDone={vi.fn()} handoff={handoff} onSettledOutside={onSettledOutside} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryStep).toHaveBeenCalled();
    expect(screen.getByText('3 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText(/Possible recovery/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Settled outside YukthiX' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Close the exit' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox', { name: /How/ }), 'Bank transfer');
    await ue.click(within(dialog).getByRole('button', { name: 'Close the exit' }));
    expect(onSettledOutside).toHaveBeenCalledWith({ settledOn: '2026-11-02', reason: 'Bank transfer' });
  });

  it('alumni see their letters; my documents asks for a file before uploading', async () => {
    const onDownload = vi.fn(async () => ({}));
    const letter = { id: 'l', title: 'Relieving letter: Ravi', letterType: 'relieving', personId: 'p', referenceNo: 'KF/REL/2026/000001', verifyCode: null, status: 'issued' as const, renderError: null, issuedAt: null, personSigns: false, acceptedAt: null, signature: null, supersededById: null };
    const { unmount } = render(<AlumniScreen data={{ company: 'Kaveri Foods', name: 'Ravi', lastDay: '2026-10-30', accessUntil: '2033-10-30', letters: [letter] }} onDownload={onDownload} onSignOut={vi.fn()} />);
    expect(screen.getByText(/until 30 Oct 2033/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalledWith(letter);
    unmount();
    render(<MyDocumentsScreen state="ready" data={{ documents: [{ id: 'd', personId: 'p', typeKey: 'pan_card', typeName: 'PAN card', sensitivity: 'confidential', status: 'requested', expiresOn: null, rejectReason: null, file: null, version: 1 }] }} onDownload={vi.fn()} onUpload={vi.fn()} onCertificate={vi.fn()} lettersHref="#" />);
    await ue.click(screen.getByRole('button', { name: 'Upload' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Upload' })).toBeDisabled();
  });
});
