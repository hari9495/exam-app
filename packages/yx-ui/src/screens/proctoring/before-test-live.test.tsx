import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AccommodationQueueScreen, ConnectivityPanelScreen } from './delivery';
import { AccommodationRequestScreen, TestRunnerScreen } from './candidate';
import { approvedForYou } from './before-test-live';
import { ACC_ROWS, CONNECTIVITY_ROWS, HELP_APPROVED, HELP_WAITING, liveAccommodations, liveConnectivity, liveRequest } from './before-test-live-samples';
import { LIVE_RUNNER } from './runner-live-samples';

// AS-4b (answers 2011, 2164): the designed before-the-test screens with live data.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('PRC-11 accommodation queue (live)', () => {
  it('lists the requests; approving all sends each item with the extra time', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    wrap(<AccommodationQueueScreen live={liveAccommodations({ onDecide })} />);
    await ue.click(within(screen.getByRole('table', { name: 'Accommodation requests' })).getByText('Deepa Pillai'));
    expect(screen.getByText('Low vision; I use NVDA.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve all' }));
    expect(onDecide).toHaveBeenCalledWith('r1', { approvedKinds: ['time', 'reader'], extraTimePercent: 25, message: null });
  });

  it('negative: a started test cannot get extra time: it is not ticked; approving sends the rest', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    wrap(<AccommodationQueueScreen live={liveAccommodations({ onDecide })} />);
    await ue.click(within(screen.getByRole('table', { name: 'Accommodation requests' })).getByText('Karthik Krishnan'));
    expect(screen.getByText('The test has started: extra time can no longer change.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve 1 of 2' }));
    expect(onDecide).toHaveBeenCalledWith('r2', { approvedKinds: ['separate'], extraTimePercent: null, message: null });
  });

  it('negative: a refused decision shows the reason in the drawer', async () => {
    const onDecide = vi.fn().mockRejectedValue(new Error('This request was already decided. Reload to see the decision.'));
    wrap(<AccommodationQueueScreen live={liveAccommodations({ onDecide })} />);
    await ue.click(within(screen.getByRole('table', { name: 'Accommodation requests' })).getByText('Deepa Pillai'));
    await ue.click(screen.getByRole('button', { name: 'Decline' }));
    expect(await screen.findByText('This request was already decided. Reload to see the decision.')).toBeInTheDocument();
  });

  it('opens the evidence through the page (audited by the server)', async () => {
    const onOpenEvidence = vi.fn().mockResolvedValue(undefined);
    wrap(<AccommodationQueueScreen live={liveAccommodations({ onOpenEvidence, rows: [ACC_ROWS[0]!] })} />);
    await ue.click(within(screen.getByRole('table', { name: 'Accommodation requests' })).getByText('Deepa Pillai'));
    await ue.click(screen.getByRole('button', { name: 'View' }));
    expect(onOpenEvidence).toHaveBeenCalledWith('r1');
  });
});

describe('PRC-10 connectivity panel (live)', () => {
  it('negative: approving without a 10-character reason says so and sends nothing', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    wrap(<ConnectivityPanelScreen live={liveConnectivity({ onApprove })} />);
    await ue.click(screen.getByRole('button', { name: 'Approve extra time' }));
    expect(screen.getByText('Enter a reason of at least 10 characters.')).toBeInTheDocument();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('approves with a reason after the confirmation', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    wrap(<ConnectivityPanelScreen live={liveConnectivity({ onApprove })} />);
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Area-wide outage confirmed');
    await ue.click(screen.getByRole('button', { name: 'Approve extra time' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve extra time' }));
    expect(onApprove).toHaveBeenCalledWith('c1', 'Area-wide outage confirmed');
  });

  it('negative: an ended test offers only Decline', () => {
    wrap(<ConnectivityPanelScreen live={liveConnectivity({ rows: [CONNECTIVITY_ROWS[1]!] })} />);
    expect(screen.getByText('The test has ended')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve extra time' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Decline extra time' })).toBeInTheDocument();
  });
});

describe('PRC-23 accommodation request (live)', () => {
  it('negative: nothing chosen is not sent; then 25 % extra time and screen-reader mode are', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    wrap(<AccommodationRequestScreen live={liveRequest({ onSend })} />);
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText('Choose what you need.')).toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: 'Extra time' }));
    await ue.click(screen.getByRole('checkbox', { name: 'Screen-reader mode' }));
    expect(screen.getByText('Your 75-minute test would become 94 minutes')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect(onSend).toHaveBeenCalledWith({ kinds: ['time', 'reader'], extraTimePercent: 25, note: null, evidence: null });
  });

  it('a waiting request says so; an approved one says what was approved; a started test closes the form', () => {
    const { unmount } = wrap(<AccommodationRequestScreen live={liveRequest({ help: HELP_WAITING })} />);
    expect(screen.getByText('Request sent on 14 Nov 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).toBeNull();
    unmount();
    const r = wrap(<AccommodationRequestScreen live={liveRequest({ help: HELP_APPROVED })} />);
    expect(screen.getByText(/Approved for you: 50 % extra time, Screen-reader mode/)).toBeInTheDocument();
    r.unmount();
    wrap(<AccommodationRequestScreen live={liveRequest({ started: true })} />);
    expect(screen.getByText('Your test has started')).toBeInTheDocument();
  });
});

describe('answer 2164: approved for you', () => {
  it('the runner shows screen-reader mode only when it was approved', async () => {
    const { unmount } = wrap(<TestRunnerScreen live={{ ...LIVE_RUNNER, approvedHelp: ['reader'] }} />);
    await ue.click(screen.getByRole('button', { name: /Display/ }));
    expect(screen.getByRole('switch', { name: /Screen-reader mode/ })).toBeInTheDocument();
    unmount();
    wrap(<TestRunnerScreen live={LIVE_RUNNER} />);
    await ue.click(screen.getByRole('button', { name: /Display/ }));
    expect(screen.queryByRole('switch', { name: /Screen-reader mode/ })).toBeNull();
  });

  it('says it as one line, without the manual identity check', () => {
    expect(approvedForYou(['time', 'reader', 'identity'], 50)).toBe('Approved for you: 50 % extra time, Screen-reader mode');
    expect(approvedForYou(['identity'], 0)).toBeNull();
  });
});
