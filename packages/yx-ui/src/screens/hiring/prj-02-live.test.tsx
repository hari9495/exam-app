import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { TimesheetApprovalsScreen, type LiveTimesheetApprovals } from './projects';
import { LIVE_LINE_APPROVALS } from './projects-live-fixtures';

// Projects P-2 (PRJ-02, answers 1406, 1407, 1442): the designed timesheet approvals with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const live = (over: Partial<LiveTimesheetApprovals> = {}): LiveTimesheetApprovals => ({ state: 'ready', data: LIVE_LINE_APPROVALS, onDecide: vi.fn().mockResolvedValue(undefined), onBulk: vi.fn().mockResolvedValue(undefined), ...over });
const card = (name: string, project = 'NRP-WEB') => within(screen.getByRole('region', { name: new RegExp(`^${project}, Week of`) })).getByRole('article', { name: `Timesheet for ${name}` });

describe('PRJ-02 Timesheet approvals (live)', () => {
  it('groups my lines by project and week; says which client approves after me; flags hours outside an allocation', () => {
    show(<TimesheetApprovalsScreen live={live()} />);
    expect(screen.getByRole('region', { name: /NRP-WEB, Week of/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /OLDAUDIT, Week of/ })).toBeInTheDocument();
    expect(screen.getByText(/NRP-WEB \(Nilgiri Retail\): approved lines then go to the client/)).toBeInTheDocument();
    expect(screen.getByText(/Booked outside Meera Iyer's allocation/)).toBeInTheDocument();
    expect(within(card('Meera Iyer')).getByText('not allocated to this project')).toBeInTheDocument();
  });

  it('bulk takes only people within their allocation (never over it, never unallocated), after asking', async () => {
    const l = live();
    show(<TimesheetApprovalsScreen live={l} />);
    const nrp = screen.getByRole('region', { name: /NRP-WEB, Week of/ });
    await ue.click(within(nrp).getByRole('button', { name: 'Approve 1 within allocation' }));
    expect(l.onBulk).not.toHaveBeenCalled();
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve 2 lines' }));
    expect(l.onBulk).toHaveBeenCalledWith([{ lineId: 'l1', version: 2 }, { lineId: 'l2', version: 2 }]);
  });

  it('approves every line of a card with its version', async () => {
    const l = live();
    show(<TimesheetApprovalsScreen live={l} />);
    await ue.click(within(card('Priya Nair')).getAllByRole('button', { name: 'Approve all' })[0]!);
    expect(l.onDecide).toHaveBeenCalledWith([{ lineId: 'l1', version: 2, status: 'approved' }, { lineId: 'l2', version: 2, status: 'approved' }]);
  });

  it('a reduction needs fewer hours and a reason the person sees; then it is sent with both', async () => {
    const l = live();
    show(<TimesheetApprovalsScreen live={l} />);
    const rohit = card('Rohit Bhat');
    await ue.click(within(rohit).getByRole('button', { name: 'Reduce hours for NRP-WEB · Build' }));
    await ue.click(await screen.findByRole('button', { name: 'Reduce hours' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Approved hours/ }), '20');
    await ue.type(screen.getByRole('textbox', { name: /Reason for reducing/ }), 'Two days were the offsite');
    await ue.click(screen.getByRole('button', { name: 'Reduce hours' }));
    await ue.click(within(rohit).getByRole('button', { name: 'Approve all' }));
    expect(l.onDecide).toHaveBeenCalledWith([{ lineId: 'l3', version: 2, status: 'reduced', hours: 20, reason: 'Two days were the offsite' }]);
  });

  it('send back rejects every line of the card with the reason', async () => {
    const l = live();
    show(<TimesheetApprovalsScreen live={l} />);
    await ue.click(within(card('Meera Iyer')).getByRole('button', { name: 'Send back' }));
    await ue.type(await screen.findByRole('textbox', { name: /What should they fix/ }), 'Not on this project');
    await ue.click(within(screen.getByRole('dialog', { name: /What should they fix/ })).getByRole('button', { name: 'Send back' }));
    expect(l.onDecide).toHaveBeenCalledWith([{ lineId: 'l4', version: 2, status: 'rejected', reason: 'Not on this project' }]);
  });

  it('a refused decision says why and changes nothing on screen', async () => {
    const l = live({ onDecide: vi.fn().mockRejectedValue(new Error('You approve only the lines of your own projects.')) });
    show(<TimesheetApprovalsScreen live={l} />);
    await ue.click(within(card('Priya Nair')).getAllByRole('button', { name: 'Approve all' })[0]!);
    expect(await screen.findByText('You approve only the lines of your own projects.')).toBeInTheDocument();
  });

  it('empty, error and no access', () => {
    const a = show(<TimesheetApprovalsScreen live={live({ data: { withinAllocation: true, groups: [] } })} />);
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    a.unmount();
    const b = show(<TimesheetApprovalsScreen live={live({ state: 'error', data: null })} />);
    expect(screen.getByText("Couldn't load timesheets")).toBeInTheDocument();
    b.unmount();
    show(<TimesheetApprovalsScreen live={live({ state: 'no-access', data: null })} />);
    expect(screen.getByText("You don't have access to timesheet approvals")).toBeInTheDocument();
  });
});
