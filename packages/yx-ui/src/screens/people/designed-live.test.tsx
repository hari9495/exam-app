import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { joinerCard, JourneyRecord, OnboardingBoard, ProbationQueue, ReadyToOnboardQueue, type ProbRow, type ReadyRow } from './onboarding';
import { MyChecklistTasks, LifeEventsList } from './checklists';
import { AbscondingTimeline, ClearanceSignoffs, ExitCaseWorkspace } from './exits';
import { AssetRegister, type Asset } from './assets';
import { DocumentVerificationQueue } from './documents';
import { OrgChartScreen, TeamPage } from './directory';
import { PersonWorkspace, type LiveRecord } from './record';
import { ChangeActionSheet, ScheduledChangesScreen } from './changes';
import { AddJoinerDrawer, ImportDrawer } from './live/lifecycle';
import type { AbscondingRow, AssetRow, ExitWorkspace, Handoff, Journey, JourneyTask, JoinerPlaces, MyClearanceItem, QueueDocument } from './live/types';
import type { ExitCaseScreenProps } from './live/exits';

// The designed People screens with the live app's data (design audit step 3): what each page must do once it is live.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const PLACES: JoinerPlaces = {
  entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd' }],
  locations: [{ value: 'l1', label: 'Hosur plant', entityId: 'e1' }],
  departments: [{ value: 'd1', label: 'Production' }],
  designations: [{ value: 'g1', label: 'Production Supervisor' }],
  employmentTypes: [{ value: 't1', label: 'Permanent' }],
  managers: [{ value: 'm1', label: 'Divya Raghunathan' }],
};
const task = (o: Partial<JourneyTask>): JourneyTask => ({
  id: 't1',
  key: 'welcome_call',
  title: 'Call the joiner before day one',
  kind: 'tick',
  ownerType: 'manager',
  ownerLabel: 'Manager',
  assignee: 'Divya Raghunathan',
  dueOn: '2026-10-16',
  dueOffsetDays: -3,
  status: 'open',
  overdue: false,
  required: true,
  locked: false,
  form: null,
  documentType: null,
  answers: null,
  link: null,
  completedAt: null,
  completedBy: null,
  skipReason: null,
  canComplete: true,
  canSkip: false,
  version: 1,
  ...o,
});

describe('Onboarding board (PPL-11)', () => {
  const columns = [
    { id: 'pre', title: 'Pre-boarding', slaDays: 30, cards: [joinerCard('jr1', 'Sneha Pillai', 'Production Supervisor', 'joins 14 Oct', 25, 3, 'Hosur plant', { text: 'Collect the PAN card · 8 Oct', owner: 'HR', overdue: true }), joinerCard('jr2', 'Asha Rao', '', 'joins 20 Nov', 0, 1, 'Chennai office', { text: 'Welcome call · 13 Nov', owner: 'Manager' })] },
    { id: 'day1', title: 'Day 1', cards: [] },
  ];
  it('the stage follows the dates: no Move menu; a card opens the checklist; Only overdue narrows', async () => {
    const onOpenCard = vi.fn();
    wrap(<OnboardingBoard columns={columns} live={{ error: false, onRetry: vi.fn(), onAdd: vi.fn(), onImport: vi.fn(), onOpenCard }} />);
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Sneha Pillai' }));
    expect(onOpenCard).toHaveBeenCalledWith('jr1');
    await ue.click(screen.getByRole('button', { name: 'Only overdue (1)' }));
    expect(screen.queryByRole('button', { name: 'Asha Rao' })).toBeNull();
  });

  it('Add joiner and Import joiners call the page; an empty board offers both', async () => {
    const onAdd = vi.fn();
    const onImport = vi.fn();
    wrap(<OnboardingBoard columns={[{ id: 'pre', title: 'Pre-boarding', cards: [] }]} live={{ error: false, onRetry: vi.fn(), onAdd, onImport, onOpenCard: vi.fn() }} />);
    expect(screen.getByText('No one is onboarding right now')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add joiner' }));
    await ue.click(screen.getByRole('button', { name: 'Import joiners' }));
    expect(onAdd).toHaveBeenCalled();
    expect(onImport).toHaveBeenCalled();
  });

  it('Add joiner shows what is missing only after Save', async () => {
    const onAdd = vi.fn(async () => undefined);
    render(<AddJoinerDrawer places={PLACES} today="2026-10-09" onClose={vi.fn()} onAdd={onAdd} />);
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByText('Enter the first name.')).toBeNull();
    await ue.click(within(sheet).getByRole('button', { name: 'Add joiner' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(within(sheet).getAllByText('Enter the first name.').length).toBeGreaterThan(0);
  });

  it('import checks the file first and shows each row’s problem', async () => {
    const onImport = vi.fn(async (_csv: string, commit: boolean) => ({ committed: commit, added: commit ? 1 : 0, rows: [{ line: 2, name: 'Asha Rao', joiningOn: '2026-11-20', ok: true, problem: null }, { line: 3, name: 'Bad Row', joiningOn: null, ok: false, problem: 'No location "NOWHERE".' }] }));
    render(<ImportDrawer onClose={vi.fn()} onImport={onImport} onDone={vi.fn()} />);
    const sheet = screen.getByRole('dialog');
    await ue.type(within(sheet).getByRole('textbox'), 'given_name');
    await ue.click(within(sheet).getByRole('button', { name: 'Check the file' }));
    expect(onImport).toHaveBeenLastCalledWith('given_name', false);
    expect(within(sheet).getByText('No location "NOWHERE".')).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Add 1 joiner' }));
    expect(onImport).toHaveBeenLastCalledWith('given_name', true);
  });
});

describe('Checklist record (PPL-13)', () => {
  const JOURNEY: Journey = {
    id: 'jr1',
    kind: 'onboarding',
    person: 'Sneha Pillai',
    personId: 'p1',
    subjectType: 'preboarding',
    subjectId: 'j1',
    anchorOn: '2026-10-19',
    status: 'active',
    progress: 25,
    template: 'Standard onboarding',
    owner: 'Lakshmi Venkatesan',
    canManage: true,
    today: '2026-10-09',
    tasks: [
      task({}),
      task({ id: 't2', key: 'appointment_letter', title: 'Issue the appointment letter', kind: 'letter', letterType: 'appointment', canComplete: false, ownerType: 'hr', ownerLabel: 'HR', assignee: 'Lakshmi Venkatesan', locked: true, dueOn: '2026-10-19', dueOffsetDays: 0 }),
      task({ id: 't3', key: 'esic', title: 'Register with ESIC where ESI applies', ownerType: 'payroll', ownerLabel: 'Payroll', required: false, canSkip: true, dueOffsetDays: 3 }),
      task({ id: 't4', key: 'collect_pan', title: 'Collect the PAN card', kind: 'document', documentType: 'pan_card', canComplete: false, dueOn: '2026-10-08', overdue: true, dueOffsetDays: -11 }),
      task({ id: 't5', key: 'laptop', title: 'Laptop or work device', kind: 'desk_request', status: 'done', canComplete: false, completedBy: 'Farah Khan', link: { type: 'sd_ticket', id: 'x' } }),
    ],
  };
  const live = (actions = {}) => ({ state: 'ready' as const, onRetry: vi.fn(), journey: JOURNEY, joiner: { role: 'Production Supervisor', location: 'Hosur plant', manager: 'Divya Raghunathan', buddy: null }, actions: { onComplete: vi.fn(), onSkip: vi.fn(), onUpload: vi.fn(), onIssueLetter: vi.fn(), onPreviewLetter: vi.fn(), ...actions } });
  const rowOf = (title: RegExp) => screen.getByText(title).closest('li') as HTMLElement;

  it('the law’s task is never skipped or ticked: it is issued; an optional task needs a reason to skip', async () => {
    const onSkip = vi.fn(async () => ({}));
    const onIssueLetter = vi.fn(async () => ({}));
    wrap(<JourneyRecord tasks={[]} joining={day('2026-10-19')} today={day('2026-10-09')} live={live({ onSkip, onIssueLetter })} />);
    const law = rowOf(/Issue the appointment letter/);
    expect(within(law).getByText(/Required by law/)).toBeInTheDocument();
    expect(within(law).queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(within(law).queryByRole('button', { name: 'Mark done' })).toBeNull();
    await ue.click(within(law).getByRole('button', { name: 'Issue letter' }));
    let dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Issue letter' }));
    expect(onIssueLetter).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }));
    await ue.click(within(rowOf(/ESIC/)).getByRole('button', { name: 'Skip' }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Skip task' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox'), 'ESI does not apply');
    await ue.click(within(dialog).getByRole('button', { name: 'Skip task' }));
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ id: 't3' }), 'ESI does not apply');
  });

  it('a document task is uploaded by HR, never ticked; done tasks fold away; phases follow the joining day', () => {
    wrap(<JourneyRecord tasks={[]} joining={day('2026-10-19')} today={day('2026-10-09')} live={live()} />);
    const pan = rowOf(/Collect the PAN card/);
    expect(within(pan).queryByRole('button', { name: 'Mark done' })).toBeNull();
    expect(within(pan).getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    expect(within(pan).getByText(/Overdue/)).toBeInTheDocument();
    expect(screen.getByText('Done (1)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Before joining' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Joining day' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'After joining' })).toBeInTheDocument();
  });
});

describe('My checklist tasks (PPL-47) and Life events (PPL-48)', () => {
  it('groups tasks by person and opens their checklist', async () => {
    const onOpen = vi.fn();
    wrap(<MyChecklistTasks tasks={[task({ person: 'Sneha Pillai', anchorOn: '2026-10-19', journeyId: 'jr1', journeyKind: 'onboarding' }), task({ id: 't9', title: 'Handover plan', person: 'Meera Iyer', anchorOn: '2026-10-31', journeyId: 'jr2', journeyKind: 'offboarding' })]} today={day('2026-10-09')} onOpen={onOpen} />);
    expect(screen.getByRole('heading', { name: 'Sneha Pillai · joining' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meera Iyer · leaving' })).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Open checklist' })[0]);
    expect(onOpen).toHaveBeenCalledWith('jr1');
  });

  it('Life events lists running checklists with progress and opens one', async () => {
    const onOpen = vi.fn();
    render(<LifeEventsList rows={[{ id: 'jr9', kind: 'transfer', kindLabel: 'Transfer', person: 'Ravi Kumar', anchorOn: '2026-10-15', progress: 40 }]} today={day('2026-10-09')} onOpen={onOpen} />);
    expect(screen.getByText('40%')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open checklist' }));
    expect(onOpen).toHaveBeenCalledWith('jr9');
  });
});

describe('Ready to onboard (PPL-12)', () => {
  const row = (o: Partial<ReadyRow>): ReadyRow => ({ id: 'o1', name: 'Priya Menon', role: 'Plant Engineer', dept: '', location: '', entity: '', manager: '', joining: day('2026-12-01'), offerAccepted: day('2026-10-19'), personType: 'New person', source: 'Accepted offer', note: '', live: { offerId: 'o1', email: 'priya@example.test', internal: false }, ...o });
  it('a current employee is sent to job changes, never onboarded; the create form waits for the place', async () => {
    const onJobChange = vi.fn();
    const onCreate = vi.fn(async () => undefined);
    render(<ReadyToOnboardQueue rows={[row({}), row({ id: 'o2', name: 'Arjun Kulkarni', personType: 'Current employee', live: { offerId: 'o2', email: 'a@example.test', internal: true } })]} live={{ state: 'ready', onRetry: vi.fn(), today: day('2026-10-20'), places: PLACES, onCreate, onJobChange }} />);
    await ue.click(screen.getByRole('button', { name: 'Job change' }));
    expect(onJobChange).toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Create employee' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByText('Choose the location.')).toBeNull();
    await ue.click(within(sheet).getByRole('button', { name: 'Create and start pre-boarding' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(within(sheet).getByText('Choose the location.')).toBeInTheDocument();
  });
});

describe('Probation (PPL-16 / PPL-17)', () => {
  const r: ProbRow = { id: 'e', name: 'Arun', role: 'Machine Operator', manager: 'Divya Raghunathan', start: day('2026-08-10'), end: day('2026-10-25'), extended: 0, reviewDone: false, live: { stage: 'review due', reviewDueOn: day('2026-10-10'), canReview: true, maxMonthsLeft: 6 } };
  it('the direct manager reviews: extending sends the months and the comments', async () => {
    const onReview = vi.fn(async () => undefined);
    render(<ProbationQueue rows={[r]} today={day('2026-10-20')} persona="mgr" live={{ state: 'ready', onRetry: vi.fn(), canDecide: false, onReview, onConfirm: vi.fn(), onExtend: vi.fn(), onOpenApproval: vi.fn() }} />);
    await ue.click(within(screen.getByRole('row', { name: /Arun/ })).getByRole('button', { name: 'Review' }));
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('radio', { name: /Extend/ }));
    await ue.type(within(sheet).getByRole('textbox', { name: /Extend by/ }), '3');
    await ue.type(within(sheet).getByRole('textbox', { name: /Comments/ }), 'More time on the line');
    await ue.click(within(sheet).getByRole('button', { name: 'Extend probation' }));
    expect(onReview).toHaveBeenCalledWith('e', 'extend', 3, expect.objectContaining({ comments: 'More time on the line' }));
  });

  it('HR confirms from a date with a reason; a confirmation waiting for approval opens the change list', async () => {
    const onConfirm = vi.fn(async () => undefined);
    const onOpenApproval = vi.fn();
    render(<ProbationQueue rows={[{ ...r, live: { ...r.live!, canReview: false } }, { ...r, id: 'w', name: 'Wasim', live: { ...r.live!, stage: 'waiting', canReview: false } }]} today={day('2026-10-20')} persona="hr" live={{ state: 'ready', onRetry: vi.fn(), canDecide: true, onReview: vi.fn(), onConfirm, onExtend: vi.fn(), onOpenApproval }} />);
    await ue.click(within(screen.getByRole('row', { name: /Wasim/ })).getByRole('button', { name: 'Review' }));
    expect(onOpenApproval).toHaveBeenCalled();
    await ue.click(within(screen.getByRole('row', { name: /Arun/ })).getByRole('button', { name: 'Decide' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByRole('radio', { name: /Recommend ending/ })).toBeNull();
    await ue.click(within(sheet).getByRole('button', { name: 'Send for approval' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(within(sheet).getByText('Enter the reason.')).toBeInTheDocument();
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Did well');
    await ue.click(within(sheet).getByRole('button', { name: 'Send for approval' }));
    expect(onConfirm).toHaveBeenCalledWith('e', day('2026-10-26'), 'Did well');
  });
});

describe('Exit case (PPL-19 / PPL-20)', () => {
  const base: ExitWorkspace = {
    id: 'k', employeeId: 'e', exitType: 'resignation', typeLabel: 'Resignation', initiatedBy: 'employee', reasonCode: null, reasonText: 'Closer to home', submittedOn: '2026-10-01', requestedLwd: null, noticePeriod: '30d', noticeLabel: '30 days', standardLwd: '2026-10-31', approvedLwd: '2026-10-31', lastDay: '2026-10-31', noticeArrangement: null, status: 'accepted', pendingChange: null, lettersHeld: false, version: 3,
    name: 'Ravi Kumar', employeeCode: 'E1', journeyId: null, interview: 'sent', hr: null, can: { manage: false, confidential: false, interview: false },
    clearance: [{ id: 'c1', department: 'finance', title: 'Advances settled', owner: 'Lakshmi', status: 'open', note: null, recoveryAmount: null, recoveryReason: null, signedOffAt: null, version: 1 }],
  };
  const props = (o: Partial<ExitCaseScreenProps>): ExitCaseScreenProps => ({ state: 'ready', data: base, today: '2026-10-09', onBack: vi.fn(), onNotice: vi.fn(), onHrFacts: vi.fn(), onSignOff: vi.fn(), onInterview: vi.fn(), onInterviewNotes: vi.fn(), checklistHref: () => '#', ...o });

  it('a manager sees no HR facts and cannot sign off or change the day', () => {
    wrap(<ExitCaseWorkspace today={day('2026-10-09')} persona="mgr" live={props({})} />);
    expect(screen.getByText('HR handles case checks for exits.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change last day' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign off' })).toBeNull();
  });

  it('HR records a recovery only with an amount and what it is for', async () => {
    const onSignOff = vi.fn(async () => ({}));
    wrap(<ExitCaseWorkspace today={day('2026-10-09')} live={props({ onSignOff, data: { ...base, can: { manage: true, confidential: true, interview: true } } })} />);
    await ue.click(screen.getByRole('button', { name: 'Sign off' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('checkbox', { name: /recovery/ }));
    expect(within(dialog).getByRole('button', { name: 'Sign off' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Amount/ }), '15000');
    await ue.type(within(dialog).getByRole('textbox', { name: /For/ }), 'Phone not returned');
    await ue.click(within(dialog).getByRole('button', { name: 'Sign off' }));
    expect(onSignOff).toHaveBeenCalledWith(base.clearance[0], { action: 'clear', note: null, recoveryAmount: '15000', recoveryReason: 'Phone not returned' });
  });

  it('after the last day: a failed step can be retried; F&F shows the hand-off and closes as settled outside', async () => {
    const ws: ExitWorkspace = { ...base, exitType: 'end_of_contract', typeLabel: 'End of contract', initiatedBy: 'company', status: 'exited', lastDay: '2026-10-30', clearance: [], can: { manage: true, confidential: false, interview: false } };
    const handoff: Handoff = { current: { revision: 2, cause: 'exited', lwd: '2026-10-30', wagesDueBy: '2026-11-03', noticePeriod: '0d', noticeServedDays: 0, recoveries: [{ source: 'asset', title: 'Return ThinkPad', amount: '50000.00', reason: 'Not returned yet', status: 'open' }], holds: { letters: false }, frozenAt: '2026-10-31T00:00:00Z' }, earlier: [], settledOutside: null, canSettle: true };
    const onRetryStep = vi.fn(async () => ({}));
    const onSettledOutside = vi.fn(async () => ({}));
    wrap(<ExitCaseWorkspace today={day('2026-11-02')} live={props({ data: ws, today: '2026-11-02', steps: [{ handler: 'desk.revoke', label: 'Close the accounts', timing: 't0', status: 'failed', attempts: 3, lastError: 'The desk did not answer.', doneAt: null }], onRetryStep, onStepDone: vi.fn(), handoff, onSettledOutside })} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryStep).toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: /^F&F/ }));
    expect(screen.getAllByText(/3 Nov 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Possible recovery/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Settled outside YukthiX' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Close the exit' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox', { name: /How/ }), 'Bank transfer');
    await ue.click(within(dialog).getByRole('button', { name: 'Close the exit' }));
    expect(onSettledOutside).toHaveBeenCalledWith({ settledOn: '2026-11-02', reason: 'Bank transfer' });
  });

  it('Clearance: waiving needs a note', async () => {
    const rows: MyClearanceItem[] = [{ ...base.clearance[0], exitCaseId: 'k', person: 'Ravi Kumar', lastDay: '2026-10-31' }];
    wrap(<ClearanceSignoffs live={{ state: 'ready', onRetry: vi.fn(), rows, onSignOff: vi.fn() }} />);
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Sign off' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('radio', { name: 'Waive' }));
    expect(within(dialog).getByRole('button', { name: 'Waive' })).toBeDisabled();
  });
});

describe('Absconding (PPL-24)', () => {
  const r: AbscondingRow = { id: 'a1', employeeId: 'e', name: 'Karthik Raja', lastPresentOn: '2026-10-12', status: 'running', stoppedReason: null, exitCaseId: null, version: 1, steps: [{ key: 'notice_1', label: 'Notice 1', day: 7, dueOn: '2026-10-19', doneAt: '2026-10-19T05:00:00Z', note: null, dispatchRef: null }] };
  it('a running timeline can be stopped; a sent notice asks for dispatch proof', async () => {
    const onStop = vi.fn();
    const onDispatch = vi.fn();
    wrap(<AbscondingTimeline today={day('2026-10-20')} live={{ state: 'ready', onRetry: vi.fn(), rows: [r], onStart: vi.fn(), onStop, onResume: vi.fn(), onDispatch, onOpenExit: vi.fn() }} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Stop timeline' }));
    expect(onStop).toHaveBeenCalledWith(r);
    await ue.click(screen.getByRole('button', { name: 'Add dispatch proof' }));
    expect(onDispatch).toHaveBeenCalledWith(r, 'notice_1');
  });
});

describe('Assets (PPL-25)', () => {
  const api: AssetRow = { id: 'a', category: 'Laptop', name: 'ThinkPad', tag: 'LT-1', serial: null, legalEntityId: null, locationId: null, purchasedOn: '2026-04-01', cost: '62000.00', status: 'assigned', version: 1, canManage: true, holder: { assignmentId: 'x', employeeId: 'e', name: 'Ravi', issuedOn: '2026-10-01', condition: 'New', acknowledged: false } };
  const row: Asset & { live: AssetRow } = { id: 'a', tag: 'LT-1', type: 'Laptop', name: 'ThinkPad', serial: '', location: 'Hosur plant', status: 'Assigned', holder: 'Ravi', cost: 62000, purchased: day('2026-04-01'), live: api };
  it('a return as "not returned" needs what happened and keeps the clearance open for a recovery', async () => {
    const onReturn = vi.fn(async () => undefined);
    wrap(<AssetRegister rows={[]} live={{ state: 'ready', onRetry: vi.fn(), rows: [row], today: day('2026-10-09'), people: [], onIssue: vi.fn(), onReturn }} />);
    expect(screen.getByText('Waiting for acknowledgement')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Return' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('combobox', { name: /Return condition/ }));
    await ue.click(screen.getByRole('option', { name: 'Not returned' }));
    expect(within(dialog).getByText(/stays open for a recovery/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Mark not returned' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox', { name: /What happened/ }), 'Lost on the train');
    await ue.click(within(dialog).getByRole('button', { name: 'Mark not returned' }));
    expect(onReturn).toHaveBeenCalledWith(api, expect.objectContaining({ status: 'lost', condition: 'Not returned: Lost on the train' }));
  });
});

describe('Document verification (PPL-27)', () => {
  const DOC: QueueDocument = { id: 'd1', personId: 'p1', person: 'Sneha Pillai', typeKey: 'pan_card', typeName: 'PAN card', sensitivity: 'confidential', status: 'uploaded', expiresOn: null, rejectReason: null, file: { name: 'pan.png', scanStatus: 'clean', size: 1000 }, uploadedAt: '2026-10-09T05:00:00Z', version: 2 };
  it('a file still being scanned offers nothing; Reject sends the reason to the person; Mark verified verifies', async () => {
    const onDecide = vi.fn(async () => undefined);
    const loadFile = vi.fn(async () => ({ url: 'blob:x', name: 'pan.png', type: 'image/png' }));
    wrap(<DocumentVerificationQueue rows={[]} live={{ state: 'ready', onRetry: vi.fn(), rows: [DOC, { ...DOC, id: 'd2', person: 'Asha Rao', file: { name: 'x.pdf', scanStatus: 'pending', size: 5 } }], loadFile, onDownload: vi.fn(), onDecide }} />);
    const asha = screen.getByRole('row', { name: /Asha Rao/ });
    expect(within(asha).queryByRole('button', { name: 'Review' })).toBeNull();
    expect(within(asha).getByText('Scanning')).toBeInTheDocument();
    await ue.click(within(screen.getByRole('row', { name: /Sneha Pillai/ })).getByRole('button', { name: 'Review' }));
    expect(loadFile).toHaveBeenCalledWith(DOC);
    let sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Reject' }));
    await ue.type(within(sheet).getByRole('textbox'), 'Upload the front side');
    await ue.click(within(sheet).getByRole('button', { name: 'Reject and ask to re-upload' }));
    expect(onDecide).toHaveBeenCalledWith(DOC, 'reject', 'Name does not match the record. Upload the front side');
    await ue.click(within(screen.getByRole('row', { name: /Sneha Pillai/ })).getByRole('button', { name: 'Review' }));
    sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Mark verified' }));
    expect(onDecide).toHaveBeenLastCalledWith(DOC, 'verify', undefined);
  });
});

describe('Org chart (PPL-02) and My team (PPL-08)', () => {
  const people = [{ id: 'p1', name: 'Ramesh Iyengar', role: 'Managing Director', department: 'Management', managerId: null }, { id: 'p2', name: 'Divya Raghunathan', role: 'Senior QA Engineer', department: 'Quality', managerId: 'p1' }];
  it('the date and the export are offered only when the page allows them', async () => {
    const onExportCsv = vi.fn();
    const { rerender } = render(<OrgChartScreen people={people} asOn={day('2026-10-20')} today={day('2026-10-20')} persona="emp" live={{ state: 'ready', onRetry: vi.fn(), companyName: 'Kaveri Foods', truncated: false }} />);
    expect(screen.queryByLabelText('View as on')).toBeNull();
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull();
    rerender(<OrgChartScreen people={people} asOn={day('2026-08-01')} today={day('2026-10-20')} live={{ state: 'ready', onRetry: vi.fn(), companyName: 'Kaveri Foods', truncated: false, onAsOn: vi.fn(), onExportCsv }} />);
    expect(screen.getByText(/^Showing the org as on 1 Aug 2026\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Position' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: /Export/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Spreadsheet (CSV)' }));
    expect(onExportCsv).toHaveBeenCalled();
  });

  it('the Position switch stays when nothing is open, and says why: a past date, or a company with no openings', async () => {
    const base = { state: 'ready' as const, onRetry: vi.fn(), companyName: 'Kaveri Foods', truncated: false, onAsOn: vi.fn(), positions: true };
    const { rerender } = render(<OrgChartScreen people={people} asOn={day('2026-08-01')} today={day('2026-10-20')} live={base} />);
    await ue.click(screen.getByRole('button', { name: 'Position' }));
    expect(screen.getByText('No open positions on this date. Openings show on today’s chart.')).toBeInTheDocument();
    rerender(<OrgChartScreen people={people} asOn={day('2026-10-20')} today={day('2026-10-20')} live={{ ...base, noPositionsText: 'No open positions for Kaveri Foods Pvt Ltd' }} />);
    await ue.click(screen.getByRole('button', { name: 'Position' }));
    expect(screen.getByText('No open positions for Kaveri Foods Pvt Ltd')).toBeInTheDocument();
  });

  it('My team: today and upcoming per person; a row opens the record; no Nudge', async () => {
    const onOpenMember = vi.fn();
    const onStartChange = vi.fn();
    wrap(<TeamPage members={[{ id: 'p2', name: 'Arjun Kulkarni', role: 'Quality Analyst', today: 'Present · in 9:05 am', upcoming: 'Probation ends 14 Nov' }]} approvals={[]} tasks={[]} today={day('2026-10-20')} live={{ state: 'ready', onRetry: vi.fn(), asOf: '20 Oct 2026, 10:21 am', onOpenMember, onStartChange, approvalsHref: '#', onReview: vi.fn(), onOpenTask: vi.fn() }} />);
    expect(screen.getByText('1 person · 1 present, 0 on leave, 0 late as of 20 Oct 2026, 10:21 am')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nudge' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Request a hire' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Start a change' }));
    expect(onStartChange).toHaveBeenCalled();
  });
});

describe('Person record (PPL-03)', () => {
  const live = (o: Partial<LiveRecord>): LiveRecord => ({
    directoryHref: '/d', name: 'Arjun Kulkarni', role: 'Quality Analyst', department: 'Quality', location: 'Bengaluru head office', code: 'KF-0142', manager: 'Divya Raghunathan', joined: day('2024-07-01'), grade: 'G2', badges: [{ label: 'Active', tone: 'success' }], facts: [], events: [],
    personal: null, identity: null, pending: [], job: [['Designation', 'Quality Analyst']], scheduled: [], pastChanges: 1, pay: { kind: 'none', grantedBy: 'HR' }, time: null, documents: null, assets: null, history: null, asOf: null, onAsOf: vi.fn(), ...o,
  });
  it('a masked identifier asks the server for the full value, and the look is recorded', async () => {
    const reveal = vi.fn(async () => 'AKDPK4821M');
    wrap(<PersonWorkspace persona="hr" relation="other" today={day('2026-10-20')} live={live({ identity: [{ label: 'PAN', value: '•••• 821M', masked: '•••• 821M', cls: 'Confidential', mono: true, canReveal: true, reveal }, { label: 'Aadhaar', value: '•••• 1942', masked: '•••• 1942', cls: 'Special', mono: true, canReveal: false }] })} />);
    expect(screen.getByText('•••• 821M')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Show / })).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: /^Show PAN/ }));
    expect(reveal).toHaveBeenCalled();
    expect(await screen.findByText('AKDPK4821M')).toBeInTheDocument();
  });

  it('a manager without pay access sees why, and only the tabs the live record has', async () => {
    wrap(<PersonWorkspace persona="mgr" relation="team" today={day('2026-10-20')} live={live({})} />);
    expect(screen.getByText('Personal, identity and bank details are for Arjun, HR and payroll.')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Learning' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Performance' })).toBeNull();
    await ue.click(screen.getByRole('tab', { name: 'Pay' }));
    expect(screen.getByText(/have access to pay details for Arjun Kulkarni/)).toBeInTheDocument();
  });

  it('pay: the table total is the header CTC, in whole rupees; empty cards say so', async () => {
    wrap(<PersonWorkspace persona="hr" relation="other" today={day('2026-10-20')} live={live({ pay: { kind: 'shown', ctc: 583200, currency: 'INR', from: day('2026-04-01'), lines: [{ label: 'Basic', monthly: 19440 }, { label: 'Special allowance', monthly: 28659.38 }, { label: 'Employer PF (12% of ₹15,000)', monthly: 500.62 }], outside: [{ label: 'Gratuity provision', monthly: 934.62 }], banks: [], lastNet: null, taxRegime: null } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Pay' }));
    expect(screen.getAllByText('₹5,83,200')).toHaveLength(2);
    expect(screen.getByText('₹48,600')).toBeInTheDocument();
    expect(screen.queryByText(/\.\d\d$/)).toBeNull();
    expect(screen.getByText('No payslip yet.')).toBeInTheDocument();
    expect(screen.getByText('Not chosen for this tax year yet.')).toBeInTheDocument();
  });

  it('pay is shown only after "Show pay"', async () => {
    const onShow = vi.fn();
    wrap(<PersonWorkspace persona="hr" relation="other" today={day('2026-10-20')} live={live({ pay: { kind: 'ask', onShow } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Pay' }));
    await ue.click(screen.getByRole('button', { name: 'Show pay' }));
    expect(onShow).toHaveBeenCalled();
  });
});

describe('Change action (PPL-04) and Scheduled (PPL-05)', () => {
  it('Start change waits for a person; a waiting change opens its review', async () => {
    const onStart = vi.fn();
    const onOpenWaiting = vi.fn();
    render(<ChangeActionSheet persona="hr" kind="Promotion" effective={day('2026-10-20')} today={day('2026-10-20')} live={{ state: 'ready', onRetry: vi.fn(), people: [{ id: 'p1', name: 'Arjun Kulkarni', role: 'Quality Analyst', department: 'Quality' }], waiting: [{ id: 'c1', name: 'Kavya Reddy', kind: 'Manager change', effective: day('2026-11-16'), note: 'raised 19 Oct 2026', canOpen: true }], onStart, onOpenWaiting }} />);
    expect(screen.getByRole('button', { name: 'Start change' })).toBeDisabled();
    await ue.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpenWaiting).toHaveBeenCalledWith('c1');
  });

  it('cancelling a scheduled change needs a reason of 5 characters', async () => {
    const onCancel = vi.fn(async () => undefined);
    render(<ScheduledChangesScreen rows={[{ id: 's1', name: 'Arjun Kulkarni', code: 'KF-0142', type: 'Promotion', effective: day('2026-11-01'), summary: 'Quality Lead · G3', raisedBy: '', status: 'Scheduled' }]} today={day('2026-10-20')} live={{ state: 'ready', onRetry: vi.fn(), onEdit: vi.fn(), onOpen: vi.fn(), onCancel }} />);
    await ue.click(screen.getByRole('button', { name: /More actions|Actions/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Cancel change' }));
    const dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox'), 'Not');
    expect(within(dialog).getByRole('button', { name: 'Cancel change' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox'), ' now');
    await ue.click(within(dialog).getByRole('button', { name: 'Cancel change' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledWith('s1', 'Not now'));
  });
});
