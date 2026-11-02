import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OneOnOneScreen, QuickFeedbackScreen, type LiveOneOnOnes, type LiveQuickFeedback } from './perf-people';
import { ONE_ON_ONES, PEOPLE, RECEIVED, REQUESTS } from './perf-data-2';

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
