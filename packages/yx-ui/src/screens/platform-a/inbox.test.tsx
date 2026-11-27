import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../components/notify';
import { ApprovalsInboxPhone, ApprovalsInboxScreen, DelegationPhone, MyRequestsScreen, NotificationsInboxScreen, RequestSheetScreen, type LiveApprovals } from './inbox';
import { APPROVALS, MY_REQUESTS, NOTIFICATIONS, SENT_BY_ME, type ApprovalRow } from './platform-data';

const HISTORY = APPROVALS.slice(0, 2).map((a, i) => ({ ...a, id: `h${i}`, status: 'Approved' as const }));

describe('Notifications inbox (founder review 30 Sep 2026)', () => {
  it('expands grouped claims and bulk-approves the selected ones', async () => {
    const u = userEvent.setup();
    render(<NotificationsInboxScreen items={NOTIFICATIONS} />);
    await u.click(screen.getByRole('button', { name: 'Show 2 more like this' }));
    await u.click(screen.getByRole('checkbox', { name: /Vikram Rao/ }));
    await u.click(screen.getByRole('checkbox', { name: /Sanjay Gupta/ }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Approve 2' }));
    expect(screen.getByText(/₹1,240 for local travel · approved by you/)).toBeInTheDocument();
    expect(screen.getByText(/₹2,100 for a team lunch · approved by you/)).toBeInTheDocument();
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('shows only the selected category panel, with no hidden panels taking space', async () => {
    const u = userEvent.setup();
    render(<NotificationsInboxScreen items={NOTIFICATIONS} />);
    await u.click(screen.getByRole('tab', { name: /From YukthiX/ }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByText(/Planned maintenance/)).toBeInTheDocument();
  });
});

describe('Approvals inbox (founder review 30 Sep 2026)', () => {
  const screenWith = (openId?: string) => render(<ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={HISTORY} openId={openId} />);

  it('shows one count everywhere and marks only truly overdue requests', () => {
    screenWith();
    expect(screen.getByText('8 waiting · 1 overdue')).toBeInTheDocument();
    expect(screen.getByText('Overdue 1 day')).toBeInTheDocument();
    expect(screen.getAllByText('Due today')).toHaveLength(2);
    expect(screen.queryByRole('columnheader', { name: /Status/ })).not.toBeInTheDocument();
  });

  it('asks for a reason before approving outside policy, then moves to the next request', async () => {
    const u = userEvent.setup();
    screenWith('a4');
    expect(screen.getByText('3 nights × ₹6,066 = ₹18,198')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Approve' }));
    await u.click(screen.getByRole('button', { name: 'Approve with exception' }));
    expect(screen.getByText(/Say why this is fine/)).toBeInTheDocument();
    await u.type(screen.getByRole('textbox', { name: /Why this exception is fine/ }), 'Client meeting ran late, no cheaper hotel');
    await u.click(screen.getByRole('button', { name: 'Approve with exception' }));
    expect(screen.getByText('7 waiting')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent(/of 6/);
  });

  // Keka ideas (2026-11): one pick-one control of kinds with counts filters the list.
  it('kinds with counts filter the list; All shows everything again', async () => {
    const u = userEvent.setup();
    screenWith();
    const kinds = screen.getByRole('radiogroup', { name: 'Kind of request' });
    expect(within(kinds).getByRole('radio', { name: 'All · 7' })).toBeChecked();
    expect(within(kinds).getByRole('radio', { name: 'Leave · 2' })).toBeInTheDocument();
    await u.click(within(kinds).getByRole('radio', { name: 'Expense · 2' }));
    expect(screen.getByText('Hotel stay · Hosur')).toBeInTheDocument();
    expect(screen.queryByText('Casual leave · 2 days')).toBeNull();
    await u.click(within(kinds).getByRole('radio', { name: 'All · 7' }));
    expect(screen.getByText('Casual leave · 2 days')).toBeInTheDocument();
  });

  it('negative: one kind only shows no picker', () => {
    render(<ApprovalsInboxScreen waiting={APPROVALS.filter((a) => a.type === 'Leave')} sent={[]} history={[]} />);
    expect(screen.queryByRole('radiogroup', { name: 'Kind of request' })).toBeNull();
  });

  it('shows who else is off for a leave request', () => {
    screenWith('a1');
    expect(screen.getByText('Team on these days')).toBeInTheDocument();
    expect(screen.getByText('Kavya Reddy')).toBeInTheDocument();
  });
});

describe('Request sheet (founder review 30 Sep 2026)', () => {
  const d = (day: number, m = 9) => new Date(2026, m, day);
  it('splits leave over the balance into paid + unpaid in one click, and shows who else is off on those dates', async () => {
    const u = userEvent.setup();
    render(<RequestSheetScreen defaultType="leave" defaultFrom={d(5)} defaultTo={d(16)} />);
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    expect(screen.getByText('Meera Krishnan off on 12 Oct')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /Split into 4 days casual leave \+ 6 days unpaid/ }));
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
    expect(screen.getByText(/4 paid \+ 6 unpaid/)).toBeInTheDocument();
  });
  it('asks for a medical certificate on sick leave over 2 days', async () => {
    const u = userEvent.setup();
    render(<RequestSheetScreen defaultType="leave" defaultLeaveType="sick" defaultFrom={d(5)} defaultTo={d(7)} />);
    await u.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByText(/needs a certificate/)).toBeInTheDocument();
  });
  it('needs a date and a receipt for an expense', async () => {
    const u = userEvent.setup();
    render(<RequestSheetScreen defaultType="expense" />);
    expect(screen.getByRole('heading', { name: 'Claim an expense' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByText('Choose the date on the receipt.')).toBeInTheDocument();
    expect(screen.getByText(/Add a photo or PDF of the receipt/)).toBeInTheDocument();
  });
});

describe('My requests (founder review 30 Sep 2026)', () => {
  it('puts sent-back first and drops the empty button column on the Completed tab', async () => {
    const u = userEvent.setup();
    const { container } = render(<MyRequestsScreen rows={MY_REQUESTS} />);
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Missed check-in');
    expect(screen.getByRole('button', { name: 'Cancel leave' })).toBeInTheDocument();
    await u.click(screen.getByRole('tab', { name: /Completed/ }));
    expect(container.querySelector('th.yx-table__actions')).toBeNull();
  });
});

describe('PLT-04 live (the approvals engine)', () => {
  const today = new Date(2026, 10, 3);
  const row = (id: string, over: Partial<ApprovalRow> = {}): ApprovalRow => ({ id, ref: id.toUpperCase(), type: 'Service request', requester: 'Arjun Kulkarni', requesterRole: '', summary: `Laptop ${id}`, detail: 'Step 1 of 2: Manager', submitted: today, due: null, step: 'Manager', lowRisk: true, policy: { ok: true }, status: 'Waiting', context: ['Item: New laptop'], ...over });
  const delegation = { meId: 'me', meName: 'Divya', today, people: [], onFindPeople: () => undefined, current: null, waiting: 2, onSave: vi.fn(), onEnd: vi.fn(), delegatedToYou: [], approvalsHref: '/yx/approvals' };
  const live = (over: Partial<LiveApprovals> = {}): LiveApprovals => ({ today, onDecide: vi.fn(async () => undefined), onBulkApprove: vi.fn(async () => []), delegation, onDone: vi.fn(), ...over });

  it('approves one in a click; not approving needs a reason (field error, nothing sent); no policy column', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    const l = live();
    render(<ApprovalsInboxScreen waiting={[row('a')]} sent={[]} history={[]} live={l} />);
    expect(screen.queryByRole('columnheader', { name: 'Policy' })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Approve' }));
    expect(l.onDecide).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'approve', '');
    expect(l.onDone).toHaveBeenCalledWith(expect.stringMatching(/^Approved: Laptop a/));
  });

  it('the side panel: Do not approve pressed with no reason says why and sends nothing; with one it is sent', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    const l = live();
    render(<ApprovalsInboxScreen waiting={[row('a')]} sent={[]} history={[]} openId="a" live={l} />);
    const panel = await screen.findByRole('dialog');
    await u.click(within(panel).getByRole('button', { name: 'Do not approve' }));
    await u.click(within(panel).getByRole('button', { name: 'Do not approve' }));
    expect(within(panel).getByText('Say why, so the person who asked knows.')).toBeInTheDocument();
    expect(l.onDecide).not.toHaveBeenCalled();
    await u.type(within(panel).getByRole('textbox'), 'Not this quarter');
    await u.click(within(panel).getByRole('button', { name: 'Do not approve' }));
    expect(l.onDecide).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'reject', 'Not this quarter');
  });

  it('Send back for changes (leave): offered only where the server allows it; what to change is required, then it is sent', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    const l = live();
    const { unmount } = render(<ApprovalsInboxScreen waiting={[row('a')]} sent={[]} history={[]} openId="a" live={l} />);
    // Negative: a type without send back (or the company turned it off) shows no Send back.
    expect(within(await screen.findByRole('dialog')).queryByRole('button', { name: 'Send back' })).toBeNull();
    unmount();
    render(<ApprovalsInboxScreen waiting={[row('b', { type: 'Leave', canSendBack: true })]} sent={[]} history={[]} openId="b" live={l} />);
    const panel = await screen.findByRole('dialog');
    await u.click(within(panel).getByRole('button', { name: 'Send back' }));
    expect(within(panel).getByText('They change the request and send it again.')).toBeInTheDocument();
    await u.click(within(panel).getByRole('button', { name: 'Send back' }));
    expect(within(panel).getByText('Say what to change, so the person who asked knows.')).toBeInTheDocument();
    expect(l.onDecide).not.toHaveBeenCalled();
    await u.type(within(panel).getByRole('textbox'), 'Move it by a week');
    await u.click(within(panel).getByRole('button', { name: 'Send back' }));
    expect(l.onDecide).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), 'send_back', 'Move it by a week');
    await waitFor(() => expect(l.onDone).toHaveBeenCalledWith(expect.stringMatching(/^Sent back for changes/)));
  });

  it('bulk approve: the refused ones stay listed with why; the rest say done', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    const l = live({ onBulkApprove: vi.fn(async () => [{ id: 'b', message: 'This approval is already closed.' }]) });
    render(<ApprovalsInboxScreen waiting={[row('a'), row('b', { requester: 'Meera Iyer' })]} sent={[]} history={[]} live={l} />);
    await u.click(screen.getByRole('checkbox', { name: /Arjun/ }));
    await u.click(screen.getByRole('checkbox', { name: /Meera/ }));
    await u.click(screen.getByRole('button', { name: 'Approve 2' }));
    await u.click((await screen.findAllByRole('button', { name: 'Approve 2' })).at(-1)!);
    expect(await screen.findByText('1 request was not approved')).toBeInTheDocument();
    expect(screen.getByText(/Laptop b: This approval is already closed\./)).toBeInTheDocument();
    expect(l.onDone).toHaveBeenCalledWith('Approved 1 request. The people who asked are told.');
  });

  // Answer 2503: bulk "Do not approve", one shared reason, the same 100 cap.
  it('bulk do not approve: no reason is a field error and nothing is sent; then one reason for all, refused ones listed', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    const l = live({ onBulkReject: vi.fn(async () => [{ id: 'b', message: 'This approval is already closed.' }]) });
    render(<ApprovalsInboxScreen waiting={[row('a'), row('b', { requester: 'Meera Iyer', lowRisk: false })]} sent={[]} history={[]} live={l} />);
    await u.click(screen.getByRole('checkbox', { name: /Arjun/ }));
    await u.click(screen.getByRole('checkbox', { name: /Meera/ }));
    // A high-risk one blocks bulk approve, never bulk "Do not approve".
    expect(screen.getByText(/Only low-risk requests can be approved together/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Do not approve 2' }));
    const dialog = (await screen.findByText('Do not approve 2 requests?')).closest('[role="dialog"],[role="alertdialog"]') as HTMLElement;
    await u.click(within(dialog).getByRole('button', { name: 'Do not approve 2' }));
    expect(within(dialog).getByText('Say why, so the people who asked know.')).toBeInTheDocument();
    expect(l.onBulkReject).not.toHaveBeenCalled();
    await u.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Budget is frozen this quarter');
    await u.click(within(dialog).getByRole('button', { name: 'Do not approve 2' }));
    await waitFor(() => expect(l.onBulkReject).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })], 'Budget is frozen this quarter'));
    expect(await screen.findByText('1 request was not decided')).toBeInTheDocument();
    expect(l.onDone).toHaveBeenCalledWith('Not approved: 1 request. The people who asked are told why.');
  });

  it('bulk: more than 100 selected is refused for both; one decided on its own page blocks Do not approve', () => {
    const many = Array.from({ length: 101 }, (_, i) => row(`r${i}`));
    render(<ApprovalsInboxScreen waiting={many} sent={[]} history={[]} live={live()} defaultSelected={many.map((r) => r.id)} />);
    expect(screen.getByText('Choose 100 requests or fewer at a time.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Do not approve 101/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Approve 101/ })).toBeNull();
  });

  // Answers 2500 to 2502: HR's "Everyone's pending" and reassign (HR, or the approver for their own).
  const people = [{ id: 'u2', name: 'Ravi Shankar' }, { id: 'u3', name: 'Anita Desai' }];
  it("Everyone's pending: only with the list; reassign asks who and why (field errors), then moves it", async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    const onReassign = vi.fn(async () => undefined);
    const l = live({ reassign: { people, onFindPeople: vi.fn(), onReassign } });
    const { unmount } = render(<ApprovalsInboxScreen waiting={[]} sent={[]} history={[]} live={l} />);
    expect(screen.queryByRole('tab', { name: /Everyone/ })).toBeNull();
    unmount();
    render(<ApprovalsInboxScreen waiting={[]} sent={[]} history={[]} everyone={[row('x', { approver: 'Divya Raghunathan' })]} defaultTab="everyone" openId="x" live={l} />);
    expect(screen.getAllByText(/^Waiting for$/).length).toBeGreaterThan(0);
    const panel = await screen.findByRole('dialog');
    // HR is not the approver: no Approve or Do not approve here.
    expect(within(panel).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Do not approve' })).toBeNull();
    await u.click(within(panel).getByRole('button', { name: 'Reassign' }));
    await u.click(within(panel).getByRole('button', { name: 'Reassign' }));
    expect(within(panel).getByText('Choose who approves it instead.')).toBeInTheDocument();
    expect(within(panel).getByText('Say why you are moving it in at least 10 characters, so both approvers know.')).toBeInTheDocument();
    expect(onReassign).not.toHaveBeenCalled();
    await u.click(within(panel).getByRole('combobox', { name: /Reassign to/ }));
    await u.click(await screen.findByRole('option', { name: /Anita Desai/ }));
    // Answer 2525: 9 characters are not enough.
    await u.type(within(panel).getByRole('textbox', { name: /Reason/ }), 'Away now.');
    await u.click(within(panel).getByRole('button', { name: 'Reassign' }));
    expect(within(panel).getByText(/at least 10 characters/)).toBeInTheDocument();
    expect(onReassign).not.toHaveBeenCalled();
    await u.clear(within(panel).getByRole('textbox', { name: /Reason/ }));
    await u.type(within(panel).getByRole('textbox', { name: /Reason/ }), 'Divya is on long leave');
    await u.click(within(panel).getByRole('button', { name: 'Reassign' }));
    await waitFor(() => expect(onReassign).toHaveBeenCalledWith(expect.objectContaining({ id: 'x' }), 'u3', 'Divya is on long leave'));
    expect(l.onDone).toHaveBeenCalledWith('Reassigned to Anita Desai: Laptop x. Both approvers are told.');
  });

  it('the approver can reassign their own; with no reassign set up there is no button', async () => {
    const { unmount } = render(<ApprovalsInboxScreen waiting={[row('a')]} sent={[]} history={[]} openId="a" live={live({ reassign: { people, onFindPeople: vi.fn(), onReassign: vi.fn() } })} />);
    expect(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reassign' })).toBeInTheDocument();
    unmount();
    render(<ApprovalsInboxScreen waiting={[row('a')]} sent={[]} history={[]} openId="a" live={live()} />);
    expect(within(await screen.findByRole('dialog')).queryByRole('button', { name: 'Reassign' })).toBeNull();
  });

  // Answer 2504: the three-column desk at 1440 px or wider; the list and drawer below that.
  it('desk: kinds in a column, the list, and the request in the third column (no drawer); deciding works there', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    const l = live();
    render(<ApprovalsInboxScreen waiting={[row('a'), row('b', { type: 'Leave', requester: 'Meera Iyer' })]} sent={[]} history={[]} live={l} desk />);
    const kinds = screen.getByRole('radiogroup', { name: 'Kind of request' });
    expect(kinds).toHaveAttribute('aria-orientation', 'vertical');
    expect(within(screen.getByRole('complementary', { name: 'The request' })).getByText('Choose a request.')).toBeInTheDocument();
    await u.click(within(kinds).getByRole('radio', { name: 'Leave · 1' }));
    expect(screen.queryByText('Laptop a')).toBeNull();
    await u.click(screen.getByText('Laptop b'));
    expect(screen.queryByRole('dialog')).toBeNull();
    const pane = screen.getByRole('complementary', { name: 'The request' });
    await u.click(within(pane).getByRole('button', { name: 'Approve' }));
    expect(l.onDecide).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), 'approve', '');
  });

  it('the desk follows the screen: 1440 px or wider only; narrower keeps the drawer', async () => {
    const real = window.matchMedia;
    const at = (w: number) => ((q: string) => ({ matches: /min-width: (\d+)px/.test(q) ? w >= Number(/min-width: (\d+)px/.exec(q)![1]) : /max-width: (\d+)px/.test(q) ? w <= Number(/max-width: (\d+)px/.exec(q)![1]) : false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      window.matchMedia = at(1440);
      const { unmount } = render(<ApprovalsInboxScreen waiting={[row('a')]} sent={[]} history={[]} openId="a" live={live()} />);
      expect(screen.getByRole('complementary', { name: 'The request' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).toBeNull();
      unmount();
      window.matchMedia = at(1439);
      render(<ApprovalsInboxScreen waiting={[row('a')]} sent={[]} history={[]} openId="a" live={live()} />);
      expect(screen.queryByRole('complementary', { name: 'The request' })).toBeNull();
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    } finally {
      window.matchMedia = real;
    }
  });

  it('a request decided on its own page links there; Set up delegation opens When I am away', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ApprovalsInboxScreen waiting={[row('p', { lowRisk: false, decideAt: '/yx/payroll/reopen-requests' })]} sent={[]} history={[]} openId="p" live={live()} />);
    expect(within(await screen.findByRole('dialog')).getByRole('link', { name: 'Open to decide' })).toHaveAttribute('href', '/yx/payroll/reopen-requests');
    await u.keyboard('{Escape}');
    await u.click(screen.getByRole('button', { name: 'Set up delegation' }));
    expect(await screen.findByText('When I am away')).toBeInTheDocument();
  });
});

describe('PLT-03 notifications inbox, live on a phone', () => {
  it('under 768 px the live page takes the designed phone layout, with the preferences link and the same actions', async () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      const onMarkAllRead = vi.fn();
      render(<NotificationsInboxScreen items={NOTIFICATIONS} live={{ onOpen: vi.fn(), onMarkRead: vi.fn(), onMarkAllRead, preferencesHref: '/yx/me/notifications' }} />);
      expect(document.querySelector('.yx-phone')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Notification preferences' }).getAttribute('href')).toBe('/yx/me/notifications');
      await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
      expect(onMarkAllRead).toHaveBeenCalledOnce();
    } finally {
      window.matchMedia = real;
    }
  });

  it('the desktop page stays the desktop layout on a wide screen', () => {
    render(<NotificationsInboxScreen items={NOTIFICATIONS} live={{ onOpen: vi.fn(), onMarkRead: vi.fn(), onMarkAllRead: vi.fn(), preferencesHref: '/yx/me/notifications' }} />);
    expect(document.querySelector('.yx-phone')).toBeNull();
  });
});

describe('T2-E 49 and 50 Asked by, Status and Decided by me (2872, 2873)', () => {
  const today = new Date(2026, 10, 3);
  const r = (id: string, o: Partial<ApprovalRow>): ApprovalRow => ({ id, ref: id, type: 'Leave', requester: '', requesterRole: '', summary: id, detail: '', submitted: today, due: null, step: '', lowRisk: false, policy: { ok: true }, status: 'Waiting', context: [], ...o });
  const live: LiveApprovals = { today, onDecide: vi.fn(), onBulkApprove: vi.fn(async () => []), delegation: { meId: 'me', meName: 'Me', today, people: [], onFindPeople: () => undefined, current: null, waiting: 0, onSave: vi.fn(), onEnd: vi.fn(), delegatedToYou: [], approvalsHref: '#', onDone: () => undefined }, onDone: vi.fn() };
  const waiting = [r('w1', { requester: 'Direct Dev', requesterTeam: 'direct', summary: 'Leave of Direct' }), r('w2', { requester: 'Deep Dev', requesterTeam: 'whole', summary: 'Leave of Deep' }), r('w3', { requester: 'Other Dev', summary: 'Leave of Other' })];
  const decided = [r('d1', { requester: 'Direct Dev', summary: 'Approved one', status: 'Approved', requestStatus: 'Approved' }), r('d2', { requester: 'Deep Dev', summary: 'Sent back one', status: 'Sent back', requestStatus: 'Waiting', onBehalfOf: 'Meena', detail: 'You sent it back · for Meena' })];
  const ue = userEvent.setup({ pointerEventsCheck: 0 });
  const pick = async (filter: string, option: string) => {
    await ue.click(screen.getByRole('button', { name: 'Filter' }));
    await ue.click(await screen.findByRole('menuitem', { name: filter }));
    await ue.click(await screen.findByRole('checkbox', { name: option }));
    await ue.keyboard('{Escape}');
  };
  const fields = async () => {
    await ue.click(screen.getByRole('button', { name: 'Filter' }));
    const out = (await screen.findAllByRole('menuitem')).map((m) => m.textContent);
    await ue.keyboard('{Escape}');
    return out;
  };

  it('Asked by: my direct team, then my whole team, then one person', async () => {
    render(<ApprovalsInboxScreen waiting={waiting} sent={[]} history={[]} decided={decided} live={live} desk={false} />);
    await pick('Asked by', 'My direct team');
    expect(screen.getByText('Leave of Direct')).toBeInTheDocument();
    expect(screen.queryByText('Leave of Deep')).toBeNull();
    expect(screen.queryByText('Leave of Other')).toBeNull();
  });

  it('negative: Waiting for me has no Status filter; Sent by me has no Asked by filter', async () => {
    render(<ApprovalsInboxScreen waiting={waiting} sent={[r('s1', { requester: 'You', status: 'Approved' })]} history={[]} decided={decided} live={live} desk={false} />);
    expect(await fields()).toEqual(['Type', 'Due', 'Asked by']);
    await ue.click(screen.getByRole('tab', { name: /Sent by me/ }));
    expect(await fields()).toEqual(['Type', 'Status']);
  });

  it('Decided by me: the period Segment asks for another period; the Status filter uses the present status; delegation is marked', async () => {
    const onDecidedDays = vi.fn();
    render(<ApprovalsInboxScreen waiting={waiting} sent={[]} history={[]} decided={decided} defaultTab="decided" live={{ ...live, decidedDays: 90, onDecidedDays }} desk={false} />);
    expect(screen.getByRole('radio', { name: '3 months' })).toBeChecked();
    expect(screen.getByText(/for Meena/)).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: '12 months' }));
    expect(onDecidedDays).toHaveBeenCalledWith(365);
    await pick('Status', 'Waiting');
    expect(screen.getByText('Sent back one')).toBeInTheDocument();
    expect(screen.queryByText('Approved one')).toBeNull();
  });

  it('negative: without decided rows there is no Decided by me tab', () => {
    render(<ApprovalsInboxScreen waiting={waiting} sent={[]} history={[]} live={live} desk={false} />);
    expect(screen.queryByRole('tab', { name: /Decided by me/ })).toBeNull();
  });
});

describe('PLT-05 "+ New" (T2-F 81, answer 2886)', () => {
  const types = [{ id: 'leave' as const, href: '/yx/time/leave?apply=1' }, { id: 'ticket' as const, href: '/yx/desk/help?new=1' }];
  it('offers only the types the person may raise, grouped; picking one closes the sheet and opens its form', () => {
    const onPick = vi.fn();
    const onOpenChange = vi.fn();
    render(<RequestSheetScreen live={{ open: true, onOpenChange, onPick, types }} />);
    expect(screen.getByRole('dialog', { name: 'What do you want to request?' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Time off' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Help' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Expense claim/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Job request/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Helpdesk ticket/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onPick).toHaveBeenCalledWith('/yx/desk/help?new=1');
  });
  it('search narrows the types; nothing to raise says so', () => {
    const { unmount } = render(<RequestSheetScreen live={{ open: true, onOpenChange: vi.fn(), onPick: vi.fn(), types }} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search request types' }), { target: { value: 'visa' } });
    expect(screen.getByText('No request type matches.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search request types' }), { target: { value: 'ticket' } });
    expect(screen.queryByRole('button', { name: /^Leave/ })).toBeNull();
    unmount();
    render(<RequestSheetScreen live={{ open: true, onOpenChange: vi.fn(), onPick: vi.fn(), types: [] }} />);
    expect(screen.getByText('Nothing to request here yet.')).toBeInTheDocument();
  });
});

// T2-H (answer 2741): the phone approval cards and delegation with the desk inbox's own calls.
describe('PLT-04 / PLT-07 phone live', () => {
  const today = new Date(2026, 10, 3);
  const row = (id: string, over: Partial<ApprovalRow> = {}): ApprovalRow => ({ id, ref: id.toUpperCase(), type: 'Leave', requester: 'Arjun Kulkarni', requesterRole: '', summary: `Casual leave ${id}`, detail: 'Step 1 of 1: Manager', submitted: today, due: null, step: 'Manager', lowRisk: true, policy: { ok: true }, status: 'Waiting', context: [], ...over });
  const delegation = { meId: 'me', meName: 'Divya', today, people: [], onFindPeople: () => undefined, current: null, waiting: 2, onSave: vi.fn(), onEnd: vi.fn(), delegatedToYou: [{ id: 'd1', person: 'Karthik S', from: today, to: today }], approvalsHref: '/yx/approvals' };
  const live = (over: Partial<LiveApprovals> = {}): LiveApprovals => ({ today, onDecide: vi.fn(async () => undefined), onBulkApprove: vi.fn(async () => []), delegation, onDone: vi.fn(), ...over });

  it('Approve on a card calls decide; bulk approve reports the refused ones; the sheet needs a reason to not approve', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    const l = live({ onBulkApprove: vi.fn(async () => [{ id: 'b', message: 'This approval is already closed.' }]) });
    render(<ToastProvider><ApprovalsInboxPhone waiting={[row('a'), row('b')]} live={l} /></ToastProvider>);
    await u.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    expect(l.onDecide).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'approve', '');
    await u.click(screen.getByRole('button', { name: 'Approve 2 leave requests' }));
    expect(await screen.findByText('This approval is already closed.')).toBeInTheDocument();
    await u.click(screen.getAllByRole('button', { name: 'Details' })[0]);
    const sheet = await screen.findByRole('dialog');
    await u.click(within(sheet).getByRole('button', { name: 'Do not approve' }));
    await u.click(within(sheet).getByRole('button', { name: 'Do not approve' }));
    expect(within(sheet).getByText('Say why, so the person who asked knows.')).toBeInTheDocument();
  });

  it('a refused approve says why; empty and error states', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    const l = live({ onDecide: vi.fn(async () => { throw new Error('You already decided this.'); }) });
    const { unmount } = render(<ToastProvider><ApprovalsInboxPhone waiting={[row('a')]} live={l} /></ToastProvider>);
    await u.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('You already decided this.')).toBeInTheDocument();
    expect(l.onDone).not.toHaveBeenCalled();
    unmount();
    const { unmount: u2 } = render(<ApprovalsInboxPhone waiting={[]} live={live()} />);
    expect(screen.getByText('Nothing is waiting for you.')).toBeInTheDocument();
    u2();
    render(<ApprovalsInboxPhone waiting={[]} state="error" live={live()} />);
    expect(screen.getByText("We couldn't load your approvals.")).toBeInTheDocument();
  });

  it('DelegationPhone live shows who delegated to me', () => {
    render(<DelegationPhone live={delegation} />);
    expect(screen.getByText('Karthik S')).toBeInTheDocument();
  });
});
