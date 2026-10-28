import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PayAccessDialog, PayAccessNote, PayAccessRequests } from './pay-access';
import { PAY_ACCESS_ROWS, TODAY } from './people-data';
import { PersonWorkspace } from './record';

// PPL-50 Team pay access: the manager's request, HR's two approvals (length and scope), and the manager's states.
const wrap = (ui: ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);
const [first, second, mineFirst, active, ended, refused] = PAY_ACCESS_ROWS;

describe('PayAccessDialog (manager)', () => {
  it('asks for one person or the whole team, with a reason, and says it is sent', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    wrap(<PayAccessDialog person={{ id: 't1', name: 'Arjun Kulkarni' }} teamSize={6} defaultScope="team" days={30} onSubmit={onSubmit} onClose={onClose} />);
    expect(screen.getByText(/Access lasts 30 days unless HR changes it/)).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send request' });
    expect(send).toBeDisabled(); // no reason yet
    expect(screen.getByRole('radio', { name: 'My whole team (6)' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Only Arjun' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Why you need it/ }), 'Retention case');
    await userEvent.click(send);
    expect(onSubmit).toHaveBeenCalledWith({ scope: 'person', employeeId: 't1', reason: 'Retention case' });
    expect(await screen.findByText('Request sent to HR')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the dialog open with the server’s reason when it is refused', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('You already have a request waiting for HR.'));
    const onClose = vi.fn();
    wrap(<PayAccessDialog person={{ id: 't1', name: 'Arjun Kulkarni' }} teamSize={6} defaultScope="team" days={30} onSubmit={onSubmit} onClose={onClose} />);
    await userEvent.type(screen.getByRole('textbox', { name: /Why you need it/ }), 'Budget');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('You already have a request waiting for HR.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('PayAccessNote (manager, Pay tab)', () => {
  it('waiting: which approval, and no way to ask again', () => {
    render(<PayAccessNote latest={second} onRequest={vi.fn()} />);
    expect(screen.getByText('Your request waits for HR · approval 2 of 2')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('active: until which day', () => {
    render(<PayAccessNote latest={active} />);
    expect(screen.getByText('You can see the pay of your whole team (4 people) until 31 Oct 2026')).toBeInTheDocument();
  });
  it('a whole-team request reads "your whole team" to the manager; one person stays named', () => {
    const { unmount } = render(<PayAccessNote latest={{ ...second, scope: 'team', person: null, covers: 'their whole team (6 people)' }} />);
    expect(screen.getByText(/You asked on .* to see the pay of your whole team \(6 people\)\./)).toBeInTheDocument();
    expect(screen.queryByText(/their whole team/)).toBeNull();
    unmount();
    render(<PayAccessNote latest={ended} />);
    expect(screen.getByText(/the pay of Ritu Sharma/)).toBeInTheDocument();
  });
  it('ended and refused: say so, and ask again', async () => {
    const onRequest = vi.fn();
    const { unmount } = render(<PayAccessNote latest={ended} onRequest={onRequest} />);
    expect(screen.getByText('Your access to the pay of Ritu Sharma ended on 19 Aug 2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ask again' }));
    expect(onRequest).toHaveBeenCalled();
    unmount();
    render(<PayAccessNote latest={refused} onRequest={onRequest} />);
    expect(screen.getByText('HR refused your request on 12 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText(/payroll report/)).toBeInTheDocument();
  });
  it('design, access open: pay waits for Show pay, as live (founder 28 Oct 2026)', async () => {
    wrap(<PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="pay" payGrant payAccess={{ ...active, scope: 'person', person: first.person, covers: 'Arjun Kulkarni' }} />);
    expect(screen.getByText('Arjun can see each time someone else looks at their pay.')).toBeInTheDocument();
    expect(screen.queryByText('Annual CTC')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show pay' }));
    expect(screen.getByText('Annual CTC')).toBeInTheDocument();
  });
  it('design, HR and the employee: pay waits for Show pay too; a manager without a grant reads the live wording', async () => {
    const { unmount } = wrap(<PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="pay" />);
    expect(screen.queryByText('Annual CTC')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show pay' }));
    expect(screen.getByText('Annual CTC')).toBeInTheDocument();
    unmount();
    const own = wrap(<PersonWorkspace persona="emp" relation="self" today={TODAY} defaultTab="pay" />);
    expect(screen.getByText('Your pay is shown when you ask.')).toBeInTheDocument();
    own.unmount();
    wrap(<PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="pay" />);
    expect(screen.getByText('Pay needs a salary grant for your team. Ask HR to give you access.')).toBeInTheDocument();
  });
  it('nothing asked yet: Request access', () => {
    render(<PayAccessNote latest={null} onRequest={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Request access' })).toBeInTheDocument();
  });
});

describe('PayAccessRequests (HR, PPL-50)', () => {
  it('lists waiting requests; Decide only where this HR person may decide (never their own first approval again)', () => {
    wrap(<PayAccessRequests rows={PAY_ACCESS_ROWS} onDecide={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Waiting (3)' })).toBeChecked();
    expect(screen.getAllByText('Approval 1 of 2').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Decide' })).toHaveLength(2);
    expect(mineFirst.canDecide).toBe(false);
    // The row this HR person gave approval 1 to says why there is no Decide.
    expect(within(screen.getByRole('row', { name: /Neha Joshi/ })).getByText('Waiting for another HR person')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting for another HR person')).toHaveLength(1);
  });
  it('without the approve key: no Decide and no waiting hint', () => {
    wrap(<PayAccessRequests rows={PAY_ACCESS_ROWS} />);
    expect(screen.queryByRole('button', { name: 'Decide' })).toBeNull();
    expect(screen.queryByText('Waiting for another HR person')).toBeNull();
  });

  it('first approval: HR changes the length and narrows it to one person', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    wrap(<PayAccessRequests rows={[{ ...first, scope: 'team', person: null, covers: 'their whole team (6 people)' }]} onDecide={onDecide} defaultOpenId={first.id} />);
    const drawer = await screen.findByRole('dialog', { name: /Team pay access for Divya Raghunathan/ });
    expect(within(drawer).getByText('Two different HR people approve')).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('radio', { name: 'One person' }));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Approve' }));
    expect(onDecide).not.toHaveBeenCalled(); // no person chosen yet
    expect(await within(drawer).findByText('Choose the person it covers.')).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('combobox', { name: 'Person' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Kavya Reddy' }));
    await userEvent.click(within(drawer).getByRole('combobox', { name: 'How long' }));
    await userEvent.click(await screen.findByRole('option', { name: '15 days' }));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Approve' }));
    expect(onDecide).toHaveBeenCalledWith(first.id, { decision: 'approve', days: '15', scope: 'person', employeeId: 't2' });
    expect(await screen.findByText('First approval given')).toBeInTheDocument();
  });

  it('refusing needs a note the manager reads', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    wrap(<PayAccessRequests rows={PAY_ACCESS_ROWS} onDecide={onDecide} defaultOpenId={first.id} />);
    const drawer = await screen.findByRole('dialog', { name: /Team pay access/ });
    await userEvent.click(within(drawer).getByRole('button', { name: 'Refuse' }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(await within(drawer).findByText('Say why you refuse it. The manager reads this.')).toBeInTheDocument();
    await userEvent.type(within(drawer).getByRole('textbox', { name: /Note/ }), 'Not now');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Refuse' }));
    expect(onDecide).toHaveBeenCalledWith(first.id, { decision: 'refuse', note: 'Not now' });
  });

  it('second approval: shows who gave the first, and gives access', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    wrap(<PayAccessRequests rows={PAY_ACCESS_ROWS} onDecide={onDecide} defaultOpenId={second.id} />);
    const drawer = await screen.findByRole('dialog', { name: /Ramesh Gowda/ });
    expect(within(drawer).getByText(/First approval by Karthik Subramanian/)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Approve and give access' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(second.id, { decision: 'approve', days: '15', scope: 'team' }));
    expect(await screen.findByText('Access given to Ramesh Gowda')).toBeInTheDocument();
  });

  it('active and ended or refused requests in their own views', async () => {
    wrap(<PayAccessRequests rows={PAY_ACCESS_ROWS} onDecide={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Active (1)' }));
    expect(screen.getAllByText('Active until 31 Oct 2026').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('radio', { name: 'Ended or refused (2)' }));
    expect(screen.getAllByText('Ended 19 Aug 2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Refused').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Decide' })).toBeNull();
  });

  it('ending open access early: the reason is required, then a toast', async () => {
    const onEnd = vi.fn().mockResolvedValue(undefined);
    wrap(<PayAccessRequests rows={PAY_ACCESS_ROWS} onDecide={vi.fn()} onEnd={onEnd} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Active (1)' }));
    await userEvent.click(within(screen.getByRole('row', { name: /Vikram Rao/ })).getByRole('button', { name: 'End access' }));
    const dialog = await screen.findByRole('dialog', { name: /End Vikram Rao's access to pay/ });
    expect(within(dialog).getByText(/hidden from them now, not on 31 Oct 2026/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'End access' });
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onEnd).not.toHaveBeenCalled();
    expect(await within(dialog).findByText('Say why you end it.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Reason/ }), ' Budget closed ');
    await userEvent.click(confirm);
    expect(onEnd).toHaveBeenCalledWith(active.id, 'Budget closed');
    expect(await screen.findByText('Access ended')).toBeInTheDocument();
  });

  it('ending: the server’s refusal stays in the dialog; without the key there is no End access', async () => {
    const onEnd = vi.fn().mockRejectedValue(new Error('Only access that is open now can be ended.'));
    const { unmount } = wrap(<PayAccessRequests rows={PAY_ACCESS_ROWS} onEnd={onEnd} defaultOpenId={active.id} />);
    const dialog = await screen.findByRole('dialog', { name: /End Vikram Rao's access to pay/ });
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Done');
    await userEvent.click(within(dialog).getByRole('button', { name: 'End access' }));
    expect(await within(dialog).findByText('Only access that is open now can be ended.')).toBeInTheDocument();
    unmount();
    wrap(<PayAccessRequests rows={PAY_ACCESS_ROWS} onDecide={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Active (1)' }));
    expect(screen.queryByRole('button', { name: 'End access' })).toBeNull();
  });

  it('access ended early shows the day and who ended it', () => {
    const early = { ...active, state: 'ended' as const, validTo: '2026-10-28', canEnd: false, ended: { by: 'Lakshmi Venkatesan', at: '2026-10-28T06:30:00Z', note: 'Budget closed' } };
    wrap(<PayAccessRequests rows={[early]} onEnd={vi.fn()} defaultOpenId={early.id} />);
    expect(screen.getByRole('radio', { name: 'Ended or refused (1)' })).toBeChecked();
    expect(screen.getByText('Ended 28 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Ended early by Lakshmi Venkatesan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End access' })).toBeNull();
  });

  it('says when there is no access', () => {
    wrap(<PayAccessRequests rows={[]} state="no-access" />);
    expect(screen.getByText(/You don't have access to team pay access requests/)).toBeInTheDocument();
  });
});
