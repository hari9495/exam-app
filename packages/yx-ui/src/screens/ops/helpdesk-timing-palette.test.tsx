import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketWorkspaceScreen } from './helpdesk';
import { liveTicket } from './helpdesk-ticket-live-samples';
import { SlaCard, TimingFacts } from '../desk/work';
import { TICKET, WORK } from '../desk/data';

// Answers 1648 and 1649: fuller timing on the SLA card for agents, and a saved reply chosen in Ctrl K landing in the
// reply being written.
describe('ticket timing on the SLA card (1648)', () => {
  it('the average wait for a reply, time on hold, moves and the agents involved', () => {
    render(<TimingFacts timing={WORK.timing!} />);
    expect(screen.getByRole('region', { name: 'Ticket timing' })).toBeInTheDocument();
    expect(screen.getByText(/\(2 replies\)$/)).toBeInTheDocument();
    expect(screen.getByText('2 times (queue or owner)')).toBeInTheDocument();
    expect(screen.getByText('Imran Sheikh, Suresh Pillai')).toBeInTheDocument();
  });

  it('nothing yet: says so in words', () => {
    render(<TimingFacts timing={{ averageReplySeconds: null, agentReplies: 0, onHoldSeconds: 0, moves: 0, agents: [] }} />);
    expect(screen.getByText('No agent reply yet')).toBeInTheDocument();
    expect(screen.getAllByText('Never')).toHaveLength(2);
    expect(screen.getByText('None yet')).toBeInTheDocument();
  });

  it('no timing for someone who is not an agent on the ticket (the API sends none)', () => {
    render(<SlaCard work={{ ...WORK, timing: null }} canWork={false} onBreachReason={vi.fn()} onExclude={vi.fn()} />);
    expect(screen.queryByRole('region', { name: 'Ticket timing' })).toBeNull();
  });
});

describe('a saved reply from Ctrl K (1649)', () => {
  it('lands in the reply being written', async () => {
    const live = liveTicket();
    const view = render(<TicketWorkspaceScreen live={{ ...live, insertReply: null }} />);
    expect(screen.queryByText(/open My security/)).toBeNull();
    view.rerender(<TicketWorkspaceScreen live={{ ...live, insertReply: { key: 1, cannedId: 'cr1' } }} />);
    expect(await screen.findByText(/open My security and choose Change password/)).toBeInTheDocument();
  });

  it('never on a ticket the person cannot work', () => {
    const live = liveTicket({ ticket: { ...TICKET, access: 'collaborator', canWork: false } });
    const view = render(<TicketWorkspaceScreen live={{ ...live, insertReply: null }} />);
    view.rerender(<TicketWorkspaceScreen live={{ ...live, insertReply: { key: 1, cannedId: 'cr1' } }} />);
    expect(screen.queryByText(/open My security/)).toBeNull();
  });
});
