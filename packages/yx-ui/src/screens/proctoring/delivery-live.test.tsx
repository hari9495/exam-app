import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CampusKitScreen, CoordinatorPortalScreen, InvitationsScreen } from './delivery';
import { CandidatePortalHomeScreen, ResultReuseScreen } from './candidate';
import { LIVE_INVITATIONS, MY_TESTS, liveCampus, liveCoordinator, liveInvitations, livePortal, liveReuse } from './delivery-live-samples';

// AS-3 (answers 2001, 2013): the designed invitations page, the candidate's tests and the result-reuse choice, live.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('PRC-07 invitations and drives (live)', () => {
  it('lists every invitation with its state and the jobs using the test; the drives tab shows counts', async () => {
    wrap(<InvitationsScreen live={liveInvitations()} />);
    const table = screen.getByRole('table', { name: 'Invitations' });
    expect(within(table).getByText('Mohammed Faiz')).toBeInTheDocument();
    expect(within(table).getAllByText('Senior Backend Developer (Chennai)').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('tab', { name: /Drives/ }));
    expect(screen.getByText('Campus TN 2026')).toBeInTheDocument();
    expect(screen.getByText('412')).toBeInTheDocument();
  });

  it('re-invites a missed candidate once, with a reason of at least 10 characters', async () => {
    const onReinvite = vi.fn().mockResolvedValue(undefined);
    wrap(<InvitationsScreen live={liveInvitations({ onReinvite })} />);
    await ue.click(screen.getByText('Mohammed Faiz'));
    await ue.click(screen.getByRole('button', { name: 'Re-invite once, with reason' }));
    await ue.type(screen.getByRole('textbox', { name: /Why re-invite/ }), 'too short');
    await ue.click(screen.getByRole('button', { name: 'Re-invite' }));
    expect(screen.getByText('Give a reason of at least 10 characters.')).toBeInTheDocument();
    expect(onReinvite).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Why re-invite/ }), ' indeed: power cut');
    await ue.click(screen.getByRole('button', { name: 'Re-invite' }));
    expect(onReinvite).toHaveBeenCalledWith('i5', 'too short indeed: power cut');
    expect((await screen.findAllByText('Re-invited: a new link and window were sent')).length).toBeGreaterThan(0);
  });

  it('negative: a missed candidate already re-invited cannot be re-invited again; a server refusal is shown', async () => {
    const onResend = vi.fn().mockResolvedValue({ done: 0, failed: [{ id: 'i1', reason: 'This invitation was revoked' }] });
    const { unmount } = wrap(<InvitationsScreen live={liveInvitations({ onResend })} />);
    await ue.click(screen.getByText('Priya Sharma'));
    expect(screen.queryByRole('button', { name: 'Re-invite once, with reason' })).toBeNull();
    expect(screen.getByText(/Already re-invited once/)).toBeInTheDocument();
    unmount();
    wrap(<InvitationsScreen live={liveInvitations({ invitations: LIVE_INVITATIONS.slice(0, 1), onResend })} />);
    await ue.click(within(screen.getByRole('table', { name: 'Invitations' })).getByText('Arjun Nair'));
    await ue.click(screen.getByRole('button', { name: 'Send reminder' }));
    expect(await screen.findByText('This invitation was revoked')).toBeInTheDocument();
  });

  it('invites the picked candidates to the chosen test; negative: nothing is sent without a test and a candidate', async () => {
    const onInvite = vi.fn().mockResolvedValue({ created: 1, skipped: 1 });
    wrap(<InvitationsScreen live={liveInvitations({ onInvite })} />);
    await ue.click(screen.getAllByRole('button', { name: 'Invite candidates' })[0]!);
    await ue.click(screen.getByRole('button', { name: 'Send invitations' }));
    expect(screen.getByText('Choose a test.')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one candidate.')).toBeInTheDocument();
    expect(onInvite).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: 'Test' }));
    await ue.click(screen.getByRole('option', { name: 'Campus aptitude 2026' }));
    await ue.click(screen.getByRole('combobox', { name: 'Candidates' }));
    await ue.click(screen.getByRole('option', { name: /Anita Das/ }));
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'Send 1 invitation' }));
    expect(onInvite).toHaveBeenCalledWith('e2', ['c1']);
    expect((await screen.findAllByText('1 invited; 1 already had an open invitation')).length).toBeGreaterThan(0);
  });

  it('bulk: reminders only to those not started; revoke asks first', async () => {
    const onResend = vi.fn().mockResolvedValue({ done: 1, failed: [] });
    const onRevoke = vi.fn().mockResolvedValue({ done: 1, failed: [] });
    wrap(<InvitationsScreen live={liveInvitations({ invitations: LIVE_INVITATIONS.slice(0, 3), onResend, onRevoke })} />);
    await ue.click(screen.getByRole('checkbox', { name: /Select all/i }));
    await ue.click(screen.getByRole('button', { name: 'Send reminder to 1' }));
    expect(onResend).toHaveBeenCalledWith(['i1']);
    await ue.click(screen.getByRole('checkbox', { name: /Select all/i }));
    await ue.click(screen.getByRole('button', { name: 'Revoke 1' }));
    expect(onRevoke).not.toHaveBeenCalled();
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    expect(onRevoke).toHaveBeenCalledWith(['i1']);
  });

  it('negative: could not load shows a retry', async () => {
    const onRetry = vi.fn();
    wrap(<InvitationsScreen live={liveInvitations({ state: 'error', onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('PRC-21 my tests (live)', () => {
  it('shows the company and candidate, the open test with its extra time, and opens another of their tests', async () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    const onStart = vi.fn();
    wrap(<CandidatePortalHomeScreen live={livePortal({ onOpen, onStart })} />);
    expect(screen.getByText('75 minutes, plus 25 % extra time approved = 94 minutes')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Start the test' }));
    expect(onStart).toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Open this test' }));
    expect(onOpen).toHaveBeenCalledWith('i9');
    expect(screen.getByText('Result under review')).toBeInTheDocument();
    expect(screen.getByText(/without a start/)).toBeInTheDocument();
  });

  it('offers the earlier result only when the server does; negative: no tests, or a failed open, say so', async () => {
    const onReuse = vi.fn();
    const { unmount } = wrap(<CandidatePortalHomeScreen live={livePortal({ reuseOffer: true, onReuse })} />);
    await ue.click(screen.getByRole('button', { name: 'Use my earlier result' }));
    expect(onReuse).toHaveBeenCalled();
    unmount();
    const r2 = wrap(<CandidatePortalHomeScreen live={livePortal({ onOpen: vi.fn().mockRejectedValue(new Error('This test is closed')) })} />);
    expect(screen.queryByRole('button', { name: 'Use my earlier result' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Open this test' }));
    expect(await screen.findByText('This test is closed')).toBeInTheDocument();
    r2.unmount();
    wrap(<CandidatePortalHomeScreen live={livePortal({ tests: [] })} />);
    expect(screen.getByText('No tests for you right now.')).toBeInTheDocument();
    expect(screen.getByText(/When Kaveri Foods invites you/)).toBeInTheDocument();
  });

  it('a submitted test links to its result, not to a start', async () => {
    const onResult = vi.fn();
    wrap(<CandidatePortalHomeScreen live={livePortal({ tests: [{ ...MY_TESTS[0]!, status: 'completed' }], onResult })} />);
    expect(screen.queryByRole('button', { name: 'Start the test' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'See your result' }));
    expect(onResult).toHaveBeenCalled();
  });
});

describe('PRC-32 using an earlier result (live)', () => {
  it('uses the earlier result only after the candidate agrees', async () => {
    const onUse = vi.fn().mockResolvedValue(undefined);
    wrap(<ResultReuseScreen live={liveReuse({ onUse })} />);
    expect(screen.getByText('12 Dec 2026 (6 months)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use my result' })).toBeDisabled();
    await ue.click(screen.getByRole('checkbox', { name: /I agree that Kaveri Foods may use/ }));
    await ue.click(screen.getByRole('button', { name: 'Use my result' }));
    expect(onUse).toHaveBeenCalledWith('a1');
  });

  it('choosing to take the test again goes to the test; negative: nothing to reuse offers only the test', async () => {
    const onTakeTest = vi.fn();
    const { unmount } = wrap(<ResultReuseScreen live={liveReuse({ onTakeTest })} />);
    await ue.click(screen.getByRole('radio', { name: /Take the test again/ }));
    await ue.click(screen.getByRole('button', { name: 'Go to the test' }));
    expect(onTakeTest).toHaveBeenCalled();
    unmount();
    wrap(<ResultReuseScreen live={liveReuse({ offer: null })} />);
    expect(screen.getByText('No earlier result can be used')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('an invitation using the earlier result can withdraw the choice; a refusal is shown', async () => {
    const onWithdraw = vi.fn().mockRejectedValue(new Error('You have started this test'));
    wrap(<ResultReuseScreen live={liveReuse({ offer: null, reused: { takenAt: '2026-06-12T09:00:00.000Z' }, onWithdraw })} />);
    expect(screen.getByText('You are using your earlier result')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Take the test instead' }));
    expect(onWithdraw).toHaveBeenCalled();
    expect(await screen.findByText('You have started this test')).toBeInTheDocument();
  });
});

describe('PRC-07 bulk and new drive (live, answers 2211, 2214)', () => {
  it('a bulk reminder names how many were refused and why', async () => {
    const onResend = vi.fn().mockResolvedValue({ done: 1, failed: [{ id: 'i8', reason: 'This invitation was revoked' }] });
    wrap(<InvitationsScreen live={liveInvitations({ invitations: [LIVE_INVITATIONS[0]!, LIVE_INVITATIONS[7]!], onResend })} />);
    await ue.click(screen.getByRole('checkbox', { name: /Select all/i }));
    await ue.click(screen.getByRole('button', { name: 'Send reminder to 2' }));
    expect(onResend).toHaveBeenCalledWith(['i1', 'i8']);
    expect((await screen.findAllByText('Reminder sent to 1; 1 refused (This invitation was revoked)')).length).toBeGreaterThan(0);
  });

  it('creates a drive and opens it; negative: a drive needs a name, and the button is absent without the right', async () => {
    const onNewDrive = vi.fn().mockResolvedValue('d9');
    const onOpenDrive = vi.fn();
    const { unmount } = wrap(<InvitationsScreen live={liveInvitations({ onNewDrive, onOpenDrive })} />);
    await ue.click(screen.getByRole('button', { name: 'New drive' }));
    await ue.click(screen.getByRole('button', { name: 'Create drive' }));
    expect(screen.getByText('Name the drive.')).toBeInTheDocument();
    expect(onNewDrive).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Drive name/ }), 'Campus TN 2026');
    await ue.click(screen.getByRole('button', { name: 'Create drive' }));
    expect(onNewDrive).toHaveBeenCalledWith('Campus TN 2026');
    expect(onOpenDrive).toHaveBeenCalledWith('d9');
    unmount();
    wrap(<InvitationsScreen live={liveInvitations({ onNewDrive: undefined })} />);
    expect(screen.queryByRole('button', { name: 'New drive' })).toBeNull();
  });
});

describe('PRC-29 campus kit (live)', () => {
  it('shows registrants with their eligibility and duplicates, and merges a duplicate after asking', async () => {
    const onMerge = vi.fn().mockResolvedValue(undefined);
    wrap(<CampusKitScreen live={liveCampus({ onMerge })} />);
    expect(screen.getByText(/1 possible duplicate/)).toBeInTheDocument();
    expect(screen.getByText('Not eligible: CGPA below 6.5')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Admit cards/ })).toBeNull();
    await ue.click(screen.getByText('Lakshmi I'));
    await ue.click(screen.getByRole('button', { name: 'Merge into Lakshmi Iyer' }));
    expect(onMerge).not.toHaveBeenCalled();
    await ue.click(within(screen.getByRole('dialog', { name: /Merge into/ })).getByRole('button', { name: 'Merge' }));
    expect(onMerge).toHaveBeenCalledWith('r144', 'r143');
  });

  it('negative: a refused merge is shown; "Not a duplicate" clears the flag', async () => {
    const onNotDuplicate = vi.fn().mockRejectedValue(new Error('No possible duplicate to clear'));
    wrap(<CampusKitScreen live={liveCampus({ onNotDuplicate })} />);
    await ue.click(screen.getByText('Lakshmi I'));
    await ue.click(screen.getByRole('button', { name: 'Not a duplicate' }));
    expect(onNotDuplicate).toHaveBeenCalledWith('r144');
    expect(await screen.findByText('No possible duplicate to clear')).toBeInTheDocument();
  });

  it('saves the form; negative: a rule on a field that is not required cannot be saved', async () => {
    const onSaveSettings = vi.fn().mockResolvedValue(undefined);
    wrap(<CampusKitScreen live={liveCampus({ onSaveSettings })} tab="form" />);
    await ue.click(within(screen.getByRole('radiogroup', { name: 'CGPA / %' })).getByRole('radio', { name: 'Optional' }));
    expect(screen.getByText('Minimum CGPA is a rule, so CGPA must be required.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save the form' })).toBeDisabled();
    await ue.click(within(screen.getByRole('radiogroup', { name: 'CGPA / %' })).getByRole('radio', { name: 'Required' }));
    await ue.click(screen.getByRole('button', { name: 'Save the form' }));
    expect(onSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ minCgpa: 6.5, branches: ['CSE', 'IT', 'ECE'] }));
  });

  it('a drive that is not a campus drive offers to turn the form on', async () => {
    const onSaveSettings = vi.fn().mockResolvedValue(undefined);
    wrap(<CampusKitScreen live={liveCampus({ settings: null, onSaveSettings })} tab="form" />);
    await ue.click(screen.getByRole('button', { name: 'Use the campus form' }));
    await ue.click(screen.getByRole('button', { name: 'Save the form' }));
    expect(onSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ branches: [], minCgpa: null }));
  });

  it('adds an institution; negative: name and code are asked for; a coordinator link goes only where there is an email', async () => {
    const onSaveInstitution = vi.fn().mockResolvedValue(undefined);
    const onSendCoordinatorLink = vi.fn().mockResolvedValue('latha@cit.example.in');
    wrap(<CampusKitScreen live={liveCampus({ onSaveInstitution, onSendCoordinatorLink })} tab="institutions" />);
    await ue.click(screen.getByRole('button', { name: 'Add institution' }));
    await ue.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Name the institution.')).toBeInTheDocument();
    expect(onSaveInstitution).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Institution name/ }), 'Vaigai College');
    await ue.type(screen.getByRole('textbox', { name: /^Code/ }), 'VCE-31');
    await ue.click(screen.getByRole('button', { name: 'Add' }));
    expect(onSaveInstitution).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Vaigai College', code: 'VCE-31', resultsVisibility: 'aggregate' }));
    await ue.click(screen.getByText('Kongu Valley Engineering College'));
    expect(screen.queryByRole('button', { name: 'Send coordinator link' })).toBeNull();
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByText('Coromandel Institute of Technology'));
    await ue.click(screen.getByRole('button', { name: 'Send coordinator link' }));
    expect(onSendCoordinatorLink).toHaveBeenCalledWith('n1');
  });
});

describe('PRC-29 college coordinator (live)', () => {
  it('shows their college only, with counts, and no results before the drive closes', () => {
    wrap(<CoordinatorPortalScreen live={liveCoordinator()} />);
    expect(screen.getByRole('heading', { name: /Coromandel Institute of Technology/ })).toBeInTheDocument();
    expect(screen.getByText(/after the drive closes/)).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Result/ })).toBeNull();
  });

  it('each student’s result only when the company shares it and the drive closed; negative: an expired link says so', () => {
    const { unmount } = wrap(<CoordinatorPortalScreen live={liveCoordinator({}, { visibility: 'per_candidate', resultsShown: true, counts: { registered: 2, eligible: 1, invited: 1, attended: 1, passed: 1 }, registrants: [{ name: 'Arjun Nair', rollNumber: '21CS140', registration: 'Eligible', test: 'Attended', result: 'Passed' }] })} />);
    expect(screen.getByRole('columnheader', { name: /^Result/ })).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    unmount();
    wrap(<CoordinatorPortalScreen live={{ state: 'expired', view: null, onCopyLink: () => Promise.resolve() }} />);
    expect(screen.getByText('This link has expired or was replaced.')).toBeInTheDocument();
  });
});
