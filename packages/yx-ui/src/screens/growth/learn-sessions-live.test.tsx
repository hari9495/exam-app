import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CoursePlayerScreen, TrainingFeedbackScreen } from './learn-me';
import { SessionsScreen, TrainerQrScreen } from './learn-admin';
import { FOOD_SAFETY, liveFeedback, liveMySessions, livePlayer, liveSessions, liveTrainerCode } from './learn-live-samples';

// Batch G3b: LRN-04 sessions, LRN-05 code, LRN-12 feedback and the learner's seats. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('LRN-04 sessions (live)', () => {
  it('lists sessions; a row opens it; only L&D can schedule', async () => {
    const onOpen = vi.fn();
    const { unmount } = show(<SessionsScreen live={liveSessions({ onOpen })} />);
    await ue.click(screen.getByText('Forklift safety'));
    expect(onOpen).toHaveBeenCalledWith('ss1');
    expect(screen.getByRole('button', { name: 'Schedule session' })).toBeInTheDocument();
    unmount();
    show(<SessionsScreen live={liveSessions({ isLd: false })} />);
    expect(screen.queryByRole('button', { name: 'Schedule session' })).toBeNull();
  });

  it('scheduling refuses a missing course, venue and trainer, and sends nothing', async () => {
    const onSchedule = vi.fn();
    show(<SessionsScreen live={liveSessions({ onSchedule })} />);
    await ue.click(screen.getByRole('button', { name: 'Schedule session' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Schedule session' }));
    expect(await within(d).findByText('Choose the course.')).toBeInTheDocument();
    expect(within(d).getByText('Choose the trainer.')).toBeInTheDocument();
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it('the session page: withdraw tells who moved up; closing asks first and reports the results', async () => {
    const onWithdraw = vi.fn().mockResolvedValue({ promoted: 'u3' });
    const onClose = vi.fn().mockResolvedValue({ completed: 1, noShow: 1 });
    show(<SessionsScreen live={liveSessions({ view: 'page', onWithdraw, onClose })} />);
    await ue.click(screen.getAllByRole('button', { name: 'Withdraw' })[0]);
    expect(onWithdraw).toHaveBeenCalledWith('u1');
    expect((await screen.findAllByText(/next person on the waitlist/)).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Close session' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText(/at least 75%/)).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Close session' }));
    expect(onClose).toHaveBeenCalled();
    expect((await screen.findAllByText('Session closed. 1 completed, 1 no-show.')).length).toBeGreaterThan(0);
  });

  it('a trainer sees no withdraw, close or cost', () => {
    show(<SessionsScreen live={liveSessions({ view: 'page', isLd: false, page: { ...liveSessions().page!, isLd: false } })} />);
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close session' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Cost' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show attendance code' })).toBeInTheDocument();
  });
});

describe('LRN-05 trainer code (live)', () => {
  it('shows the server code and marks by hand', async () => {
    const onMarks = vi.fn().mockResolvedValue({ marked: 2 });
    show(<TrainerQrScreen live={liveTrainerCode({ onMarks })} />);
    expect(screen.getByText('482913')).toBeInTheDocument();
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Mark manually' }));
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Meena Iyer attended' })).getByRole('radio', { name: 'Absent' }));
    await ue.click(screen.getByRole('button', { name: 'Save attendance' }));
    expect(onMarks).toHaveBeenCalledWith('s1', [{ userId: 'u1', mark: 'present' }, { userId: 'u2', mark: 'absent' }]);
  });

  it('a closed session shows no code', () => {
    show(<TrainerQrScreen live={liveTrainerCode({ page: { ...liveTrainerCode().page!, status: 'closed' } })} />);
    expect(screen.queryByText('482913')).toBeNull();
    expect(screen.getByText('This session is closed')).toBeInTheDocument();
  });
});

describe('Seats in the course player (live)', () => {
  it('a seated person checks in with the code on the slot day; another session cannot be booked meanwhile', async () => {
    const onCheckIn = vi.fn().mockRejectedValueOnce(new Error('That code is not right or has changed. Type the code shown now.')).mockResolvedValueOnce({ checkedIn: true });
    show(<CoursePlayerScreen live={livePlayer({ data: { ...livePlayer().data!, course: { ...FOOD_SAFETY, type: 'classroom' } }, sessions: liveMySessions({ onCheckIn }) })} />);
    expect(screen.queryByRole('button', { name: 'Book a seat' })).toBeNull();
    await ue.type(screen.getByRole('textbox', { name: /Check in/ }), '12ab34');
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    expect(onCheckIn).toHaveBeenCalledWith('ss1', 's1', '1234');
    expect((await screen.findAllByText(/not right/)).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    expect((await screen.findAllByText('You are checked in.')).length).toBeGreaterThan(0);
  });

  it('without a seat: Book a seat; a self-paced course shows no sessions', async () => {
    const onBook = vi.fn().mockResolvedValue({ status: 'waiting', position: 2 });
    const s = liveMySessions();
    const { unmount } = show(<CoursePlayerScreen live={livePlayer({ data: { ...livePlayer().data!, course: { ...FOOD_SAFETY, type: 'classroom' } }, sessions: { ...s, onBook, sessions: s.sessions.map((x) => ({ ...x, mySeat: null })) } })} />);
    await ue.click(screen.getAllByRole('button', { name: /Book a seat|Join the waitlist/ })[0]);
    expect(onBook).toHaveBeenCalledWith('ss1');
    expect((await screen.findAllByText('Session full. You are number 2 on the waitlist.')).length).toBeGreaterThan(0);
    unmount();
    show(<CoursePlayerScreen live={livePlayer({ sessions: liveMySessions() })} />);
    expect(screen.queryByText('Sessions')).toBeNull();
  });
});

describe('LRN-12 feedback (live)', () => {
  it('a reaction needs both ratings', async () => {
    const onReact = vi.fn().mockResolvedValue({ rated: true });
    const onDone = vi.fn();
    show(<TrainingFeedbackScreen live={liveFeedback({ onReact, onDone })} />);
    await ue.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(screen.getAllByText('Choose a rating.')).toHaveLength(2);
    expect(onReact).not.toHaveBeenCalled();
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Overall' })).getByRole('radio', { name: /Very good/ }));
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Trainer' })).getByRole('radio', { name: /Excellent/ }));
    await ue.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(onReact).toHaveBeenCalledWith('ss1', { overall: 4, trainer: 5 });
    expect(onDone).toHaveBeenCalled();
  });

  it('the manager check needs an answer; none due shows an empty state', async () => {
    const onCheck = vi.fn().mockResolvedValue({ checked: true });
    const { unmount } = show(<TrainingFeedbackScreen live={liveFeedback({ mode: 'manager-check', onCheck })} />);
    await ue.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(screen.getByText('Choose one.')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Partly' }));
    await ue.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(onCheck).toHaveBeenCalledWith('ss1', { aboutUserId: 'u1', applying: 'partly' });
    unmount();
    show(<TrainingFeedbackScreen live={liveFeedback({ mode: 'manager-check', checks: [] })} />);
    expect(screen.getByText('No checks due')).toBeInTheDocument();
  });
});
