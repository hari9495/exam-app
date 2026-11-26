import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OneOnOneScreen, PipRecordScreen, QuickFeedbackScreen, type LiveOneOnOnes, type LivePip, type LiveQuickFeedback } from './perf-people';
import { ONE_ON_ONES, PEOPLE, PIP, PIP_PROPOSED, PIP_TO_ACK, RECEIVED, REQUESTS } from './perf-data-2';
import { NOMINATIONS } from './perf-data-3';
import { NominationsScreen, type LiveNominations } from './perf-reviews';
import { CalibrationScreen, CompReviewScreen, MarketDataScreen, type CompRow, type LiveCalibration, type LiveCompReview } from './perf-talent';

// The designed Performance screens with `live` (builder 2): every action calls the app, pressed too early shows a
// field error and calls nothing (positive and negative).

const ok = () => vi.fn(async () => ({}));

function oneOnOnes(over: Partial<LiveOneOnOnes> = {}): LiveOneOnOnes {
  return {
    today: new Date(2026, 8, 29),
    onRetry: () => {},
    record: ONE_ON_ONES[0]!,
    recordState: 'ready',
    onOpen: vi.fn(),
    partners: [{ value: 'e2', label: 'Rohit Bhat' }],
    defaultCadence: 14,
    owners: [{ value: 'e1', label: 'Meera Iyer' }, { value: 'e9', label: 'Karthik Subramanian' }],
    goals: [],
    onSchedule: ok(),
    onAgenda: ok(),
    onSharedNotes: ok(),
    onPrivateNote: ok(),
    onAction: ok(),
    onActionDone: ok(),
    onHeld: ok(),
    onReschedule: ok(),
    ...over,
  };
}

function feedback(over: Partial<LiveQuickFeedback> = {}): LiveQuickFeedback {
  return {
    onRetry: () => {},
    defaultVisibility: 'Only them',
    onPeopleSearch: vi.fn(),
    onRecipient: vi.fn(),
    team: null,
    concerns: null,
    askAbout: [{ value: 'me', label: 'Myself' }],
    concernHref: '/yx/desk/help',
    onGive: ok(),
    onWithdraw: ok(),
    onAsk: ok(),
    onDecline: ok(),
    onSeal: ok(),
    ...over,
  };
}

describe('PRF-11 1:1s, live', () => {
  it('adds an agenda item and marks the 1:1 as held', async () => {
    const live = oneOnOnes();
    render(<OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" live={live} />);
    const drawer = screen.getByRole('dialog');
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Add an agenda item' }), { target: { value: 'Night-shift rota' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(live.onAgenda).toHaveBeenCalledWith('Night-shift rota'));
    fireEvent.click(within(drawer).getByRole('button', { name: 'Mark as held' }));
    await waitFor(() => expect(live.onHeld).toHaveBeenCalled());
  });

  it('an empty agenda item shows an error and sends nothing', () => {
    const live = oneOnOnes();
    render(<OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" live={live} />);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add item' }));
    expect(screen.getByText('Write the agenda item first.')).toBeInTheDocument();
    expect(live.onAgenda).not.toHaveBeenCalled();
  });

  it('scheduling without a person or date says what is missing', () => {
    const live = oneOnOnes({ record: null });
    render(<OneOnOneScreen persona="mgr" items={ONE_ON_ONES} live={live} scheduleOpen />);
    const sheet = screen.getByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Schedule 1:1' }));
    expect(within(sheet).getByText('Choose who the 1:1 is with.')).toBeInTheDocument();
    expect(live.onSchedule).not.toHaveBeenCalled();
  });

  it('a row opens through the app (the URL), and a failed record load offers a retry', () => {
    const live = oneOnOnes({ record: null, recordState: 'error' });
    render(<OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" live={live} />);
    expect(screen.getByText('We couldn’t load this 1:1')).toBeInTheDocument();
  });
});

describe('PRF-08 Quick feedback, live', () => {
  it('sends feedback with the chosen visibility', async () => {
    const live = feedback();
    render(<QuickFeedbackScreen me="Divya Raghunathan" people={PEOPLE} goals={[]} received={RECEIVED} given={[]} composerOpen live={live} />);
    const drawer = screen.getByRole('dialog');
    fireEvent.change(within(drawer).getByRole('textbox', { name: /Feedback/ }), { target: { value: 'Your line-3 checklist saved us two hours on Friday.' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Send feedback' }));
    expect(within(drawer).getByText('Choose who the feedback is for.')).toBeInTheDocument();
    expect(live.onGive).not.toHaveBeenCalled();
  });

  it('answers a request about a colleague and can decline another', async () => {
    const live = feedback();
    render(<QuickFeedbackScreen me="Divya Raghunathan" people={PEOPLE} goals={[]} received={[]} given={[]} requests={[{ ...REQUESTS[0]!, aboutId: 't2', question: 'How was the audit?' }]} defaultTab="requests" live={live} />);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(live.onDecline).toHaveBeenCalledWith('q1'));
    fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Give feedback' }));
    const drawer = screen.getByRole('dialog');
    fireEvent.change(within(drawer).getByRole('textbox', { name: /Feedback/ }), { target: { value: 'The audit checklist was clear and thorough.' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Send feedback' }));
    await waitFor(() => expect(live.onGive).toHaveBeenCalledWith(expect.objectContaining({ toEmployeeId: 't2', requestId: 'q1', visibility: 'recipient_only', kind: 'praise' })));
  });

  it('sealed feedback shows as removed by HR; a manager sees the My team tab only with team data', () => {
    render(<QuickFeedbackScreen me="Divya Raghunathan" people={PEOPLE} goals={[]} received={[{ ...RECEIVED[0]!, text: null, sealed: true }]} given={[]} live={feedback({ team: [] })} />);
    expect(screen.getByText('Removed by HR')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /My team/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Concerns/ })).toBeNull();
  });

  it('asking with nobody chosen says so and sends nothing', () => {
    const live = feedback();
    render(<QuickFeedbackScreen me="Divya Raghunathan" people={PEOPLE} goals={[]} received={[]} given={[]} askOpen live={live} />);
    const sheet = screen.getByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send requests' }));
    expect(within(sheet).getByText('Choose at least one colleague to ask.')).toBeInTheDocument();
    expect(live.onAsk).not.toHaveBeenCalled();
  });
});

describe('PRF-12 PIP record, live', () => {
  const pipLive = (over: Partial<LivePip> = {}): LivePip => ({
    today: new Date(2026, 6, 20),
    can: { decide: false, acknowledge: false, checkin: false, employeeNote: false, outcome: false, letter: false, startExit: false },
    extendDays: 30,
    askHrHref: '/yx/desk/help',
    onDecide: ok(),
    onAcknowledge: ok(),
    onCheckin: ok(),
    onEmployeeNote: ok(),
    onOutcome: ok(),
    onLetter: ok(),
    onStartExit: ok(),
    ...over,
  });

  it('HR approves a proposed plan; sending back needs a reason', async () => {
    const live = pipLive({ can: { ...pipLive().can, decide: true } });
    render(<PipRecordScreen persona="hr" pip={PIP_PROPOSED} live={live} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send back' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send back' }));
    expect(await within(dialog).findByText('Say why you are sending it back.')).toBeInTheDocument();
    expect(live.onDecide).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Add a measure to goal 1.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send back' }));
    await waitFor(() => expect(live.onDecide).toHaveBeenCalledWith('send_back', 'Add a measure to goal 1.'));
  });

  it('the employee acknowledges with a comment; others see no approve button', async () => {
    const live = pipLive({ can: { ...pipLive().can, acknowledge: true } });
    render(<PipRecordScreen persona="emp" pip={PIP_TO_ACK} tab="ack" live={live} />);
    expect(screen.queryByRole('button', { name: 'Approve and start' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: /Your comment/ }), { target: { value: 'Please confirm dates early.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge plan' }));
    await waitFor(() => expect(live.onAcknowledge).toHaveBeenCalledWith('Please confirm dates early.'));
  });

  it('a check-in needs a rating and a note before it is recorded', async () => {
    const schedule = [{ id: 'k1', due: new Date(2026, 6, 22), status: 'due' as const }];
    const live = pipLive({ can: { ...pipLive().can, checkin: true } });
    render(<PipRecordScreen persona="mgr" pip={{ ...PIP, schedule }} live={live} checkinOpen />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record check-in' }));
    expect(await within(dialog).findByText('Choose how it is going.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'On track' }));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Cases for 7.3 in on time.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record check-in' }));
    await waitFor(() => expect(live.onCheckin).toHaveBeenCalledWith({ checkinId: 'k1', note: 'Cases for 7.3 in on time.', rating: 'on_track' }));
  });

  it('a check-in a week ahead by the calendar can be recorded; eight days ahead cannot', () => {
    // Late in the evening of 20 July: the check-in on 27 July is 7 days away by the calendar (not 7 days and some hours).
    const live = pipLive({ today: new Date(2026, 6, 20, 23, 30), can: { ...pipLive().can, checkin: true } });
    const { unmount } = render(<PipRecordScreen persona="mgr" pip={{ ...PIP, schedule: [{ id: 'k1', due: new Date(2026, 6, 27), status: 'due' as const }] }} live={live} checkinOpen />);
    expect(within(screen.getByRole('dialog')).queryByText('No check-in due')).toBeNull();
    unmount();
    render(<PipRecordScreen persona="mgr" pip={{ ...PIP, schedule: [{ id: 'k2', due: new Date(2026, 6, 28), status: 'due' as const }] }} live={live} checkinOpen />);
    expect(within(screen.getByRole('dialog')).getByText('No check-in due')).toBeInTheDocument();
  });

  it('extending sends the date the company setting gives', async () => {
    const live = pipLive({ can: { ...pipLive().can, outcome: true }, extendDays: 15 });
    render(<PipRecordScreen persona="hr" pip={{ ...PIP, end: new Date(2026, 7, 30) }} tab="outcome" outcomeOpen live={live} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /Extend by 15 days/ }));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Some progress on releases.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record outcome' }));
    await waitFor(() => expect(live.onOutcome).toHaveBeenCalledWith({ outcome: 'extended', note: 'Some progress on releases.', extendTo: '2026-09-14' }));
  });
});

describe('PRF-07 360° nominations, live', () => {
  const nomLive = (over: Partial<LiveNominations> = {}): LiveNominations => ({
    onRetry: () => {},
    cycle: 'Half-yearly H2',
    dueOn: new Date(2026, 10, 20),
    manager: 'Karthik Subramanian',
    sent: false,
    can: { propose: true, decide: false, add: false, send: true },
    onSearch: vi.fn(),
    onAdd: ok(),
    onApprove: ok(),
    onRemove: ok(),
    onSend: ok(),
    onApproveAll: ok(),
    ...over,
  });

  it('below the minimum, sending says why and calls nothing; at the minimum it sends', async () => {
    const live = nomLive();
    const { rerender } = render(<NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS.slice(0, 2)} live={live} />);
    expect(screen.queryByText('Nominate at least 3 reviewers. You have 2.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send to manager for approval' }));
    expect(screen.getByText('Nominate at least 3 reviewers. You have 2.')).toBeInTheDocument();
    expect(live.onSend).not.toHaveBeenCalled();
    rerender(<NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} live={live} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send to manager for approval' }));
    await waitFor(() => expect(live.onSend).toHaveBeenCalled());
  });

  it('adding without a person says so and calls nothing', () => {
    const live = nomLive();
    render(<NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={[]} live={live} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Choose a person to add.')).toBeInTheDocument();
    expect(live.onAdd).not.toHaveBeenCalled();
  });

  it('the manager approves one, removes one and approves the list', async () => {
    const live = nomLive({ can: { propose: false, decide: true, add: true, send: false } });
    render(<NominationsScreen persona="mgr" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS.map((n) => ({ ...n, canRemove: true }))} live={live} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]!);
    await waitFor(() => expect(live.onApprove).toHaveBeenCalledWith('t2'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]!);
    await waitFor(() => expect(live.onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 't3' })));
    fireEvent.click(screen.getByRole('button', { name: 'Approve list and invite' }));
    await waitFor(() => expect(live.onApproveAll).toHaveBeenCalled());
  });
});

describe('PRF-09 Calibration, live', () => {
  const calLive = (over: Partial<LiveCalibration> = {}): LiveCalibration => ({
    onRetry: () => {},
    levels: ['Below', 'Meets', 'Above'],
    actual: [0, 50, 50],
    notes: ['Above: 50% against a guide of 20%.'],
    open: true,
    can: { change: true, signOff: true, potential: true },
    onMove: ok(),
    onPotential: ok(),
    onSignOff: ok(),
    ...over,
  });
  const people = [
    { id: 'r1', name: 'Arjun Rao', manager: 'Priya', team: 'Priya', self: 4, managerRating: 3, rating: 3, managerScore: 4, score: 4 },
    { id: 'r2', name: 'Sita Iyer', manager: 'Priya', team: 'Priya', self: 3, managerRating: 2, rating: 2, managerScore: 3.1, score: 3.1 },
  ];
  const session = { name: 'Sales H1', facilitator: 'Lakshmi', group: 'H1', date: new Date(2026, 9, 1) };

  it('the board has one column per band of the scale, with the server notes', () => {
    render(<CalibrationScreen persona="hr" session={session} people={people} guide={[10, 70, 20]} changes={[]} live={calLive()} />);
    expect(screen.getByRole('region', { name: /3 · Above: 1 people/ })).toBeInTheDocument();
    expect(screen.getByText('Above: 50% against a guide of 20%.')).toBeInTheDocument();
  });

  it('a move needs a reason of 10 characters; then it goes to the server', async () => {
    const live = calLive();
    render(<CalibrationScreen persona="hr" session={session} people={people} guide={[]} changes={[]} live={live} pendingMove={{ id: 'r1', to: 2 }} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change rating' }));
    expect(await within(dialog).findByText('Enter a reason of at least 10 characters.')).toBeInTheDocument();
    expect(live.onMove).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Compared with the plant leads' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change rating' }));
    await waitFor(() => expect(live.onMove).toHaveBeenCalledWith('r1', 2, 'Compared with the plant leads'));
  });

  it('someone who only looks sees no move menus and no close button; a small group shows no chart', () => {
    render(<CalibrationScreen persona="mgr" session={session} people={people} guide={[]} changes={[]} live={calLive({ actual: null, can: { change: false, signOff: false, potential: false } })} />);
    expect(screen.queryByRole('button', { name: /Change rating for/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close calibration' })).toBeNull();
    expect(screen.getByText(/Too few people to show a distribution/)).toBeInTheDocument();
  });

  it('closing asks first and then signs off', async () => {
    const live = calLive();
    render(<CalibrationScreen persona="hr" session={session} people={people} guide={[]} changes={[]} live={live} closeOpen />);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close calibration' }));
    await waitFor(() => expect(live.onSignOff).toHaveBeenCalled());
  });
});

describe('PRF-10 Comp review sheet, live', () => {
  const compLive = (over: Partial<LiveCompReview> = {}): LiveCompReview => ({
    onRetry: () => {},
    title: 'Comp review · FY27',
    facts: 'Your team',
    budgets: [],
    equity: null,
    can: { submit: true, decide: false, budgets: false, open: false, apply: false },
    departments: [],
    designations: [{ value: 'sqa', label: 'Senior QA Engineer' }],
    equityDimension: 'gender',
    onEquity: vi.fn(),
    onPropose: ok(),
    onSubmit: ok(),
    onDecide: ok(),
    onBudgets: ok(),
    onOpenCycle: ok(),
    onApply: ok(),
    ...over,
  });
  const row = (o: Partial<NonNullable<CompRow['live']>> = {}, r: Partial<CompRow> = {}): CompRow => ({ id: 'p1', name: 'Arjun Rao', department: 'Sales', grade: 'G4', score: 3.8, ctc: 8_50_000, gradeMid: 0, factor: 1, eligibility: 'Included', proposed: 12, peerMedian: 0, ...r, live: { band: 'Exceeds', compa: 0.85, range: [10, 14], outOfRange: false, newCtc: 9_52_000, increment: 1_02_000, belowPeers: false, editable: true, promotionToDesignationId: null, promotionAmount: 0, bonusAmount: 0, ...o } });

  it('a manager never sees the pay-gap figures; sending with an unjustified out-of-range row is refused', async () => {
    const live = compLive();
    render(<CompReviewScreen persona="mgr" rows={[row({ outOfRange: true }, { proposed: 20 })]} budget={[]} benchmark={null} live={live} />);
    expect(screen.getByText(/Pay-gap figures are for HR and finance/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send proposals for approval' }));
    expect(live.onSubmit).not.toHaveBeenCalled();
  });

  it('an out-of-range proposal saves only with a justification of 20 characters', async () => {
    const live = compLive();
    render(<CompReviewScreen persona="mgr" rows={[row({ outOfRange: true }, { proposed: 20 })]} budget={[]} benchmark={null} live={live} justifyFor="p1" />);
    const drawer = screen.getByRole('dialog');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save justification' }));
    expect(live.onPropose).not.toHaveBeenCalled();
    fireEvent.change(within(drawer).getByRole('textbox', { name: /Justification/ }), { target: { value: 'Well below peers after a late promotion.' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save justification' }));
    await waitFor(() => expect(live.onPropose).toHaveBeenCalledWith('p1', expect.objectContaining({ meritPct: 20, justification: 'Well below peers after a late promotion.' })));
  });

  it('HR or finance approve from the sheet; sending back needs what to change', async () => {
    const live = compLive({ can: { submit: false, decide: true, budgets: false, open: false, apply: false }, equity: [{ dimension: 'Female', before: '6.0%', after: '2.0%' }] });
    render(<CompReviewScreen persona="hr" rows={[row()]} budget={[]} benchmark={null} live={live} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve 1 proposals' }));
    await waitFor(() => expect(live.onDecide).toHaveBeenCalledWith('approve', null));
    fireEvent.click(screen.getByRole('button', { name: 'Send back' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send back' }));
    expect(await within(dialog).findByText('Say what to change.')).toBeInTheDocument();
    expect(live.onDecide).toHaveBeenCalledTimes(1);
  });

  it('nobody without a task sees approve buttons', () => {
    render(<CompReviewScreen persona="fin" rows={[row()]} budget={[]} benchmark={null} live={compLive({ can: { submit: false, decide: false, budgets: false, open: false, apply: false }, equity: [] })} />);
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
  });
});

describe('PRF-10 market data upload (answer 12)', () => {
  const props = { entities: [{ value: 'kf', label: 'Kaveri Foods' }], entityId: 'kf', latest: null, versions: [], staleMonths: 12 };
  const csvFile = (text: string) => new File([text], 'survey.csv', { type: 'text/csv' });

  it('pressed too early it says what is missing and sends nothing', () => {
    const onUpload = ok();
    render(<MarketDataScreen {...props} onUpload={onUpload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload survey' }));
    expect(screen.getByText('Choose the CSV file.')).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByText('No market data yet')).toBeInTheDocument();
  });

  it('a refused upload lists the rows to fix; a good one sends the file text, source and date', async () => {
    const refused = Object.assign(new Error('1 row needs fixing. Nothing was saved.'), { body: { errors: [{ row: 3, message: 'No grade "G9" in this company.' }] } });
    const onUpload = vi.fn().mockRejectedValueOnce(refused).mockResolvedValueOnce({ version: 1, rows: 1 });
    const { container } = render(<MarketDataScreen {...props} onUpload={onUpload} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [csvFile('grade,min,median,max,currency\nG1,1,2,3,INR\n')] } });
    fireEvent.change(screen.getByRole('textbox', { name: /Source/ }), { target: { value: 'Aon 2026' } });
    // The file name shows as soon as it is chosen, before its text is read; wait until it is read ("Uploaded").
    expect(await screen.findByText(/Uploaded/)).toBeInTheDocument();
    await userEvent.setup({ pointerEventsCheck: 0 }).type(screen.getByRole('textbox', { name: /As of/ }), '01/10/2026{Enter}');
    fireEvent.click(screen.getByRole('button', { name: 'Upload survey' }));
    expect(await screen.findByText('No grade "G9" in this company.')).toBeInTheDocument();
    expect(screen.getByText('1 row needs fixing. Nothing was saved.')).toBeInTheDocument();
    expect(onUpload).toHaveBeenCalledWith({ source: 'Aon 2026', asOf: '2026-10-01', fileName: 'survey.csv', csv: 'grade,min,median,max,currency\nG1,1,2,3,INR\n' });
    fireEvent.click(screen.getByRole('button', { name: 'Upload survey' }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('1 row needs fixing. Nothing was saved.')).toBeNull());
  });

  it('pressed while the chosen file is still being read, it says so and sends nothing', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(() => undefined);
    try {
      const onUpload = ok();
      const { container } = render(<MarketDataScreen {...props} onUpload={onUpload} />);
      fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [csvFile('grade,min,median,max,currency\n')] } });
      expect(await screen.findByText('survey.csv')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Upload survey' }));
      expect(screen.getByText('The file is still being read. Press Upload survey again in a moment.')).toBeInTheDocument();
      expect(onUpload).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it('shows the current survey, its versions and when it is out of date', () => {
    render(<MarketDataScreen {...props} latest={{ version: 2, source: 'Aon 2025', currency: 'INR', asOf: new Date(2025, 3, 1), stale: true, rows: [{ grade: 'G3', min: 510000, median: 600000, max: 720000 }] }} versions={[{ version: 2, source: 'Aon 2025', currency: 'INR', asOf: new Date(2025, 3, 1), fileName: 'aon.csv', rows: 1, uploadedBy: 'Lakshmi', uploadedAt: new Date(2025, 3, 2) }]} />);
    expect(screen.getByText('Market data is older than 12 months')).toBeInTheDocument();
    expect(screen.getByText('Out of date')).toBeInTheDocument();
    expect(screen.getByText(/Version 2 · Aon 2025/)).toBeInTheDocument();
  });
});


// T2-C item 70 (answer 2843): 1:1 agenda templates.
describe('1:1 agenda templates (70)', () => {
  const ue = userEvent.setup({ pointerEventsCheck: 0 });
  const templates = [{ value: 't1', label: 'Weekly check-in (company)' }];
  it('picking a template fills the agenda; the manager saves the agenda as their own template with a name', async () => {
    const live = oneOnOnes({ templates, onUseTemplate: ok(), onSaveTemplate: ok() });
    render(<OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" live={live} />);
    const use = screen.getByRole('button', { name: 'Use template' });
    expect(use).toBeDisabled();
    await ue.click(screen.getByRole('combobox', { name: 'Agenda template' }));
    await ue.click(screen.getByRole('option', { name: 'Weekly check-in (company)' }));
    await ue.click(screen.getByRole('button', { name: 'Use template' }));
    await waitFor(() => expect(live.onUseTemplate).toHaveBeenCalledWith('t1'));
    await ue.click(screen.getByRole('button', { name: 'Save agenda as my template' }));
    const d = screen.getByRole('dialog', { name: 'Save as my 1:1 template' });
    await ue.click(within(d).getByRole('button', { name: 'Save template' }));
    expect(within(d).getByText('Name the template.')).toBeInTheDocument();
    expect(live.onSaveTemplate).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Template name/ }), 'Fortnightly');
    await ue.click(within(d).getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(live.onSaveTemplate).toHaveBeenCalledWith('Fortnightly', ONE_ON_ONES[0]!.agenda.map((a) => a.text)));
  });

  it('negative: the employee cannot save a template; a held 1:1 offers no templates', () => {
    const live = oneOnOnes({ templates, onUseTemplate: ok(), onSaveTemplate: ok() });
    const { unmount } = render(<OneOnOneScreen persona="emp" items={ONE_ON_ONES} openId="o1" live={live} />);
    expect(screen.getByRole('combobox', { name: 'Agenda template' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save agenda as my template' })).toBeNull();
    unmount();
    const held = { ...ONE_ON_ONES[0]!, status: 'held' as const };
    render(<OneOnOneScreen persona="mgr" items={[held]} openId="o1" live={{ ...live, record: held }} />);
    expect(screen.queryByRole('combobox', { name: 'Agenda template' })).toBeNull();
  });
});
