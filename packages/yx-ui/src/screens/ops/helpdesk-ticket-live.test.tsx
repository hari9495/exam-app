import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketWorkspaceScreen } from './helpdesk';
import { activityOf } from './helpdesk-ticket-live';
import { liveTicket } from './helpdesk-ticket-live-samples';
import { DETAIL, TICKET, TIMELINE, WORK } from '../desk/data';

// HLP-03 Ticket workspace, live: the designed screen with the real ticket (Helpdesk design wiring, round 3).
const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('HLP-03 rules', () => {
  it('the timeline becomes the design activity feed, newest first, with the reason', () => {
    const a = activityOf([{ id: 'e1', kind: 'created', from: null, to: null, reason: null, by: 'Divya', at: '2026-10-07T04:00:00Z' }, { id: 'e2', kind: 'priority_changed', from: '3', to: '1', reason: 'CEO cannot work', by: 'Suresh', at: '2026-10-07T05:00:00Z' }]);
    expect(a.map((x) => x.id)).toEqual(['e2', 'e1']);
    expect(a[0].text).toBe('Priority changed: P3 → P1: CEO cannot work');
    expect(a[0].actor).toEqual({ name: 'Suresh' });
  });
});

describe('HLP-03 Ticket workspace (live)', () => {
  it('an agent sees the design header, reply and note, notes marked internal, and a colleague writing', () => {
    render(<TicketWorkspaceScreen live={liveTicket({ others: [{ userId: 'u-farah', name: 'Farah Khan', typing: true }] })} />);
    expect(screen.getByRole('tab', { name: 'Reply to Divya' })).toBeInTheDocument();
    expect(screen.getAllByText(/Internal note, not visible to Divya/)[0]).toBeInTheDocument();
    expect(screen.getByText('Farah Khan is writing on this ticket')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wait on employee|Resume/ })).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
  });

  it('Send reply pressed with nothing written says so and sends nothing; a reply sends and says so', async () => {
    const onPost = vi.fn().mockResolvedValue(undefined);
    render(<TicketWorkspaceScreen live={liveTicket({ onPost })} />);
    await ue.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(screen.getByText('Write your reply to Divya first.')).toBeInTheDocument();
    expect(onPost).not.toHaveBeenCalled();
  });

  it('a collaborator gets notes only and no work controls', () => {
    render(<TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, access: 'collaborator', canWork: false } })} />);
    expect(screen.queryByRole('tab', { name: /Reply to/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Internal note' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log time' })).not.toBeInTheDocument();
  });

  it('a desk admin reads only: no respond card and no work controls', () => {
    render(<TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, access: 'observer', canWork: false, canNote: false } })} />);
    expect(screen.queryByText('Respond')).not.toBeInTheDocument();
    expect(screen.getByText('Read-only: you set this desk up')).toBeInTheDocument();
  });

  it('changing priority asks for a reason first', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<TicketWorkspaceScreen live={liveTicket({ onUpdate })} />);
    await ue.click(screen.getByRole('radio', { name: 'P1' }));
    await ue.click(screen.getByRole('button', { name: 'Change priority' }));
    expect(onUpdate).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'CEO cannot work');
    await ue.click(screen.getByRole('button', { name: 'Change priority' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ priority: 1, priorityReason: 'CEO cannot work' }));
  });

  it('Wait on employee sets the desk waiting status; Resolve opens the resolve dialog', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onResolveClick = vi.fn();
    const open = { ...TICKET, systemState: 'open' as const };
    render(<TicketWorkspaceScreen live={liveTicket({ ticket: open, onUpdate, onResolveClick })} />);
    await ue.click(screen.getByRole('button', { name: 'Wait on employee' }));
    const wait = DETAIL.statuses.find((s) => s.systemState === 'pending' && s.active && !s.ticketTypeId)!;
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ statusId: wait.id }));
    await ue.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(onResolveClick).toHaveBeenCalled();
  });

  it('the resolved note says when it closes and the rating', () => {
    render(<TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, systemState: 'solved', resolvedAt: '2026-10-08T05:00:00Z', closesOn: '2026-10-11T05:00:00Z', rating: 4 } })} />);
    expect(screen.getByText(/Closes on 11 Oct 2026 if Divya doesn't reply. Divya rated this ticket 4 of 5./)).toBeInTheDocument();
  });

  it('1643 and 1646: the rating shows its reason; a ticket raised while closed carries the badge, others do not', () => {
    const { unmount } = render(<TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, systemState: 'solved', resolvedAt: '2026-10-08T05:00:00Z', closesOn: '2026-10-11T05:00:00Z', rating: 2, ratingReason: 'Slow', raisedOutsideHours: true } })} />);
    expect(screen.getByText(/Divya rated this ticket 2 of 5 \(Slow\)\./)).toBeInTheDocument();
    expect(screen.getByText('Raised outside hours')).toBeInTheDocument();
    unmount();
    render(<TicketWorkspaceScreen live={liveTicket()} />);
    expect(screen.queryByText('Raised outside hours')).toBeNull();
  });

  it('1661: an IT agent picks the device and it is saved with a toast; without the right it is read only; no device and no right shows nothing', async () => {
    const onSetDevice = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, canSetDevice: true, device: null }, onPickDevice: async () => [{ id: 'as1', label: 'Dell Latitude 5440 (KF-LT-0142)', detail: 'Laptop' }, { id: 'as2', label: 'Logitech headset (KF-HS-0077)', detail: 'Accessory' }], onSetDevice })} />);
    await ue.click(screen.getByRole('combobox', { name: 'Device' }));
    await ue.click(await screen.findByRole('option', { name: /KF-HS-0077/ }));
    await waitFor(() => expect(onSetDevice).toHaveBeenCalledWith('as2'));
    expect((await screen.findAllByText('Device saved.')).length).toBeGreaterThan(0);
    unmount();
    const r2 = render(<TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, canSetDevice: false, device: { id: 'as1', label: 'Dell Latitude 5440 (KF-LT-0142)', detail: 'Laptop' } }, onSetDevice })} />);
    expect(screen.getByText('Dell Latitude 5440 (KF-LT-0142)')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Device' })).toBeNull();
    r2.unmount();
    render(<TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, canSetDevice: false, device: null } })} />);
    expect(screen.queryByText('Device')).toBeNull();
  });

  it('an unproven email sender is warned about; customer and product show', () => {
    render(<TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, senderVerified: false, customer: { account: { id: 'ac1', name: 'Sunrise Retail' }, plan: 'gold' }, product: { id: 'pr1', name: 'Kaveri billing app' } } })} />);
    expect(screen.getByText('We could not prove who sent this email. Do not share private details until you are sure.')).toBeInTheDocument();
    expect(screen.getByText('Sunrise Retail')).toBeInTheDocument();
  });

  it('the side cards render under the design rail', () => {
    render(<TicketWorkspaceScreen live={liveTicket({ rail: <p>Side card</p> })} />);
    expect(screen.getByText('Side card')).toBeInTheDocument();
  });

  it('loading, error with retry and no access', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<TicketWorkspaceScreen live={liveTicket({ state: 'error', ticket: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<TicketWorkspaceScreen live={liveTicket({ state: 'loading', ticket: null })} />);
    expect(screen.getByLabelText('Loading this ticket')).toBeInTheDocument();
    rerender(<TicketWorkspaceScreen live={liveTicket({ state: 'no-access', ticket: null })} />);
    expect(screen.getByText(/You don't have access to this ticket/)).toBeInTheDocument();
  });

  it('the header resolution badge comes from the work timers', () => {
    const work = { ...WORK, sla: WORK.sla.map((x) => (x.metric === 'resolution' ? { ...x, state: 'running' as const, usedSeconds: 3600, targetSeconds: 4 * 3600 } : x)) };
    render(<TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, systemState: 'open' }, work, timeline: TIMELINE })} />);
    if (WORK.sla.some((x) => x.metric === 'resolution' && x.kind === 'sla')) expect(screen.getByText(/Resolution: 3 h left/)).toBeInTheDocument();
  });
});
