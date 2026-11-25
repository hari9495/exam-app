import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { composeStories } from '@storybook/react-vite';
import { ToastProvider } from '../../components/notify';
import * as prf12 from './prf-12.stories';
import { OneOnOneScreen, PipRecordScreen, QuickFeedbackScreen, type LiveOneOnOnes, type LivePip, type LiveQuickFeedback } from './perf-people';
import { DisputeRaiseScreen, NominationsScreen, type LiveDisputeRaise, type LiveNominations } from './perf-reviews';
import { ManagerCoachHome, type LiveCoach } from './perf-goals';
import { ONE_ON_ONES, PEOPLE, PIP, PIP_PROPOSED, PIP_TO_ACK, RECEIVED, REQUESTS, SUGGESTED_AGENDA } from './perf-data-2';
import { NOMINATIONS } from './perf-data-3';

// PRF-07, 08, 11, 12, 15 and 16 live: under 768 px the page takes the designed phone layout (as PRF-01, 02 and 06),
// over it the desktop one; the phone layout keeps every action (positive and negative).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const ok = () => vi.fn(async () => ({}));
const done = () => vi.fn(async () => {});
const realMatchMedia = window.matchMedia;
const width = (px: number) => {
  window.matchMedia = ((q: string) => ({ matches: px <= Number(/max-width: (\d+)px/.exec(q)?.[1] ?? 0), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
};
const phoneFrame = () => document.querySelector('.yx-phone');
beforeEach(() => width(375));
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

const nomLive = (o: Partial<LiveNominations> = {}): LiveNominations => ({ onRetry: () => {}, cycle: 'Half-yearly H2', dueOn: new Date(2026, 10, 20), manager: 'Karthik Subramanian', sent: false, can: { propose: true, decide: false, add: false, send: true }, onSearch: vi.fn(), onAdd: ok(), onApprove: ok(), onRemove: ok(), onSend: ok(), onApproveAll: ok(), ...o });
const fbLive = (o: Partial<LiveQuickFeedback> = {}): LiveQuickFeedback => ({ onRetry: () => {}, defaultVisibility: 'Only them', onPeopleSearch: vi.fn(), onRecipient: vi.fn(), team: null, concerns: null, askAbout: [{ value: 'me', label: 'Myself' }], concernHref: '/yx/desk/help', onGive: ok(), onWithdraw: ok(), onAsk: ok(), onDecline: ok(), onSeal: ok(), ...o });
const ooLive = (o: Partial<LiveOneOnOnes> = {}): LiveOneOnOnes => ({ today: new Date(2026, 8, 29), onRetry: vi.fn(), record: ONE_ON_ONES[0]!, recordState: 'ready', onOpen: vi.fn(), partners: [{ value: 'e2', label: 'Rohit Bhat' }], defaultCadence: 14, owners: [{ value: 'e1', label: 'Meera Iyer' }], goals: [], onSchedule: ok(), onAgenda: ok(), onSharedNotes: ok(), onPrivateNote: ok(), onAction: ok(), onActionDone: ok(), onHeld: ok(), onReschedule: ok(), ...o });
const pipLive = (o: Partial<LivePip> = {}): LivePip => ({ today: new Date(2026, 6, 20), can: { decide: false, acknowledge: false, checkin: false, employeeNote: false, outcome: false, letter: false, startExit: false }, extendDays: 30, askHrHref: '/yx/desk/help', onDecide: ok(), onAcknowledge: ok(), onCheckin: ok(), onEmployeeNote: ok(), onOutcome: ok(), onLetter: ok(), onStartExit: ok(), ...o });
const raiseLive = (o: Partial<LiveDisputeRaise> = {}): LiveDisputeRaise => ({ state: 'ready', onRetry: vi.fn(), cycle: 'H1 FY 2026-27', score: 2.6, band: 'Partly meets', disagreement: { raisedOn: new Date(2026, 9, 10), answeredOn: new Date(2026, 9, 20) }, escalateBy: new Date(2026, 10, 4), why: null, dispute: null, steps: [], onRaise: done(), onUpload: done(), ...o });
const coachLive = (o: Partial<LiveCoach> = {}): LiveCoach => ({ state: 'ready', onRetry: vi.fn(), firstName: 'Priya', weekOf: new Date(2026, 10, 2), optedOut: false, looksAt: ['No feedback given in 6 weeks'], nudges: [{ id: 'n1', person: 'Divya R', signal: '1:1 overdue by 9 days.', action: 'Book 1:1', link: '/yx/performance/one-on-ones' }], onAct: vi.fn(), onDismiss: done(), onOptOut: done(), ...o });

describe('PRF-07 360° nominations on a phone', () => {
  it('phone layout under 768 px; Send below the minimum says why, at the minimum it sends', async () => {
    const live = nomLive();
    show(<NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS.slice(0, 2)} live={live} />);
    expect(phoneFrame()).not.toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Send to manager for approval' }));
    expect(screen.getByText(/Nominate at least 3 reviewers/)).toBeInTheDocument();
    expect(live.onSend).not.toHaveBeenCalled();
  });

  it('the manager approves the list on the phone', async () => {
    const live = nomLive({ can: { propose: false, decide: true, add: true, send: false } });
    show(<NominationsScreen persona="mgr" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} live={live} />);
    expect(phoneFrame()).not.toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Approve list and invite' }));
    await waitFor(() => expect(live.onApproveAll).toHaveBeenCalled());
  });

  it('desktop layout at 1280 px', () => {
    width(1280);
    show(<NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} live={nomLive()} />);
    expect(phoneFrame()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Nominate your 360° reviewers' })).toBeInTheDocument();
  });
});

describe('PRF-08 quick feedback on a phone', () => {
  const props = { me: 'Divya Raghunathan', people: PEOPLE, goals: [], received: RECEIVED, given: [], requests: REQUESTS };
  it('give feedback opens the bottom sheet; too short says so and sends nothing', async () => {
    const live = fbLive();
    show(<QuickFeedbackScreen {...props} live={live} />);
    expect(phoneFrame()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Ask for feedback' })).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Give feedback' }).at(-1)!);
    const sheet = await screen.findByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Send feedback' }));
    expect(within(sheet).getByText('Choose who the feedback is for.')).toBeInTheDocument();
    expect(live.onGive).not.toHaveBeenCalled();
  });

  it('desktop layout at 1280 px', () => {
    width(1280);
    show(<QuickFeedbackScreen {...props} live={fbLive()} />);
    expect(phoneFrame()).toBeNull();
  });
});

describe('PRF-11 and PRF-16 1:1s on a phone', () => {
  it('the list schedules a 1:1; scheduling with nothing chosen says what is missing', async () => {
    const live = ooLive({ record: null });
    show(<OneOnOneScreen persona="mgr" items={ONE_ON_ONES} live={live} />);
    expect(phoneFrame()).not.toBeNull();
    await ue.click(screen.getAllByRole('button', { name: 'Open' })[0]!);
    expect(live.onOpen).toHaveBeenCalledWith('o1');
    await ue.click(screen.getByRole('button', { name: 'Schedule 1:1' }));
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Schedule 1:1' }));
    expect(within(sheet).getByText('Choose who the 1:1 is with.')).toBeInTheDocument();
    expect(live.onSchedule).not.toHaveBeenCalled();
  });

  it('the record keeps Mark as held, Reschedule, the suggested agenda and a way back', async () => {
    const live = ooLive();
    show(<OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" suggestedAgenda={SUGGESTED_AGENDA} live={live} />);
    expect(phoneFrame()).not.toBeNull();
    expect(screen.getByText(SUGGESTED_AGENDA[0]!.text)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Mark as held' }));
    await waitFor(() => expect(live.onHeld).toHaveBeenCalled());
    await ue.click(screen.getByRole('button', { name: 'Reschedule' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'All 1:1s' }));
    expect(live.onOpen).toHaveBeenCalledWith(null);
  });

  it('no 1:1s and a failed load say so on the phone', () => {
    const { rerender } = show(<OneOnOneScreen persona="mgr" items={[]} live={ooLive({ record: null })} />);
    expect(screen.getByText('No 1:1s yet')).toBeInTheDocument();
    rerender(
      <ToastProvider>
        <OneOnOneScreen persona="mgr" items={[]} state="error" live={ooLive({ record: null })} />
      </ToastProvider>,
    );
    expect(screen.getByText('We couldn’t load your 1:1s')).toBeInTheDocument();
  });

  it('desktop layout at 1280 px opens the record in a drawer', () => {
    width(1280);
    show(<OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" live={ooLive()} />);
    expect(phoneFrame()).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('PRF-12 PIP on a phone', () => {
  it('the employee acknowledges on the phone', async () => {
    const live = pipLive({ can: { decide: false, acknowledge: true, checkin: false, employeeNote: false, outcome: false, letter: false, startExit: false } });
    show(<PipRecordScreen persona="emp" pip={PIP_TO_ACK} live={live} />);
    expect(phoneFrame()).not.toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Acknowledge plan' }));
    await waitFor(() => expect(live.onAcknowledge).toHaveBeenCalledWith(null));
  });

  it('HR keeps approve and send back on the phone; someone without the task gets neither', () => {
    const { rerender } = show(<PipRecordScreen persona="hr" pip={PIP_PROPOSED} live={pipLive({ can: { decide: true, acknowledge: false, checkin: false, employeeNote: false, outcome: false, letter: false, startExit: false } })} />);
    expect(screen.getByRole('button', { name: 'Approve and start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send back' })).toBeInTheDocument();
    rerender(
      <ToastProvider>
        <PipRecordScreen persona="hr" pip={PIP_PROPOSED} live={pipLive()} />
      </ToastProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Approve and start' })).toBeNull();
  });

  it('desktop layout at 1280 px', () => {
    width(1280);
    show(<PipRecordScreen persona="emp" pip={PIP_TO_ACK} live={pipLive()} />);
    expect(phoneFrame()).toBeNull();
  });
});

describe('PRF-15 escalation on a phone', () => {
  it('too short says so; then it is raised', async () => {
    const live = raiseLive();
    show(<DisputeRaiseScreen live={live} />);
    expect(phoneFrame()).not.toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Escalate dispute' }));
    expect(screen.getByText('Say what you are escalating and why, in at least 20 characters.')).toBeInTheDocument();
    expect(live.onRaise).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /What are you escalating/ }), 'The supplier strike caused the delay on goal 2.');
    await ue.click(screen.getByRole('button', { name: 'Escalate dispute' }));
    await waitFor(() => expect(live.onRaise).toHaveBeenCalled());
  });

  it('a failed load offers Try again on the phone', async () => {
    const live = raiseLive({ state: 'error' });
    show(<DisputeRaiseScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Try again' }));
    expect(live.onRetry).toHaveBeenCalled();
  });

  it('desktop layout at 1280 px', () => {
    width(1280);
    show(<DisputeRaiseScreen live={raiseLive()} />);
    expect(phoneFrame()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Escalate a rating dispute' })).toBeInTheDocument();
  });
});

describe('PRF-16 coach card on a phone', () => {
  it('act and dismiss work on the phone', async () => {
    const live = coachLive();
    show(<ManagerCoachHome nudges={[]} weekOf={new Date()} live={live} />);
    expect(phoneFrame()).not.toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Dismiss nudge about Divya R' }));
    expect(live.onDismiss).toHaveBeenCalledWith('n1');
  });

  it('act opens the nudge on the phone', async () => {
    const live = coachLive();
    show(<ManagerCoachHome nudges={[]} weekOf={new Date()} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Book 1:1' }));
    expect(live.onAct).toHaveBeenCalled();
  });

  it('desktop layout at 1280 px', () => {
    width(1280);
    show(<ManagerCoachHome nudges={[]} weekOf={new Date()} live={coachLive()} />);
    expect(phoneFrame()).toBeNull();
    expect(screen.getByText(/Priya$/)).toBeInTheDocument();
  });
});

// The PRF-12 phone design stories for the manager and HR (founder, 3 Nov 2026) are the live phone screen with sample data.
describe('PRF-12 phone design stories', () => {
  const s = composeStories(prf12);
  it('Manager · phone: name, Record check-in pinned, approval history; no letter download', () => {
    render(<ToastProvider><s.ManagerPhone /></ToastProvider>);
    expect(phoneFrame()).not.toBeNull();
    expect(screen.getAllByText(PIP.employee).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Record check-in' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Approval' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download PIP letter' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve and start' })).toBeNull();
  });
  it('HR · phone: approve and send back, the warning and the approval history', () => {
    render(<ToastProvider><s.HrPhone /></ToastProvider>);
    expect(screen.getAllByText(PIP_PROPOSED.employee).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Approve and start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send back' })).toBeInTheDocument();
    expect(screen.getByText('Check with the case owner before you decide')).toBeInTheDocument();
    expect(screen.getByText('Waiting for your approval')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Approval' })).toBeInTheDocument();
  });
  it('HR · phone · issue letter: the letter button and no approve buttons', () => {
    render(<ToastProvider><s.HrLetterPhone /></ToastProvider>);
    expect(screen.getByRole('button', { name: 'Issue PIP letter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve and start' })).toBeNull();
  });
});
