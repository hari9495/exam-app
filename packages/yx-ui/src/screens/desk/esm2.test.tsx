import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatWindow } from './chat';
import { ActionLinkScreen, LifecycleAdmin, MyDocumentsCard } from './esm2';
import type { ChatSession, LifecycleSetup } from './esm2-types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('3b-2 batch 2 screens', () => {
  it('the approval link page decides only on a press, and a reject asks why first', async () => {
    const onDecide = vi.fn(async () => undefined);
    render(<ActionLinkScreen view={{ state: 'open', title: 'Mouse for Arjun', summary: [{ label: 'Item', value: 'Mouse' }], expiresAt: new Date(Date.now() + 3_600_000).toISOString() }} error={null} done={null} onDecide={onDecide} onSignIn={vi.fn()} />);
    expect(onDecide).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Not approve' }));
    expect(screen.getByRole('button', { name: 'Send: not approved' })).toBeDisabled();
    await ue.click(screen.getByRole('button', { name: 'Back' }));
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onDecide).toHaveBeenCalledWith('approve', '');
  });

  it('a sensitive approval shows nothing and asks to sign in', () => {
    render(<ActionLinkScreen view={{ state: 'sign_in', title: 'An approval is waiting for you', summary: [], expiresAt: new Date().toISOString() }} error={null} done={null} onDecide={vi.fn()} onSignIn={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('chat shows "Seen" only once the other side looked after my last message (D11)', () => {
    const base: ChatSession = { id: 's', deskId: 'd', queueId: 'q', state: 'active', subject: 'Slow', agentUserId: 'a', ticketId: null, rating: null, endReason: null, requesterSeenAt: null, agentSeenAt: null, startedAt: '2026-10-09T10:00:00Z', acceptedAt: null, endedAt: null, messages: [{ id: 'm', author: 'requester', body: 'Hi', card: null, file: null, at: '2026-10-09T10:01:00Z' }] };
    const { rerender } = render(<ChatWindow session={base} me="requester" live={{ connected: true, typing: false }} canWrite onSend={vi.fn()} />);
    expect(screen.queryByText('Seen')).toBeNull();
    rerender(<ChatWindow session={{ ...base, agentSeenAt: '2026-10-09T10:02:00Z' }} me="requester" live={{ connected: true, typing: false }} canWrite onSend={vi.fn()} />);
    expect(screen.getByText('Seen')).toBeInTheDocument();
  });

  it('a card button answers with one tap', async () => {
    const onSend = vi.fn(async () => undefined);
    const s: ChatSession = { id: 's', deskId: 'd', queueId: 'q', state: 'active', subject: 'Slow', agentUserId: 'a', ticketId: null, rating: null, endReason: null, requesterSeenAt: null, agentSeenAt: null, startedAt: '2026-10-09T10:00:00Z', acceptedAt: null, endedAt: null, messages: [{ id: 'm', author: 'agent', name: 'Farah', body: '', card: { title: 'Did that help?', buttons: [{ label: 'Yes', reply: 'Yes' }] }, file: null, at: '2026-10-09T10:01:00Z' }] };
    render(<ChatWindow session={s} me="requester" live={{ connected: true, typing: false }} canWrite onSend={onSend} />);
    await ue.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onSend).toHaveBeenCalledWith('Yes');
  });

  it('signing needs the name and the confirmation', async () => {
    const onSign = vi.fn(async () => undefined);
    render(<MyDocumentsCard documents={[{ id: 'd', title: 'Hand-over', status: 'pending', sha256: 'x', signedAt: null, createdAt: '', needsMe: true, text: 'I received it.' }]} onSign={onSign} onDecline={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Read and sign' }));
    expect(screen.getByRole('button', { name: 'Sign' })).toBeDisabled();
    await ue.type(screen.getByRole('textbox', { name: /Type your full name/ }), 'Arjun Kulkarni');
    await ue.click(screen.getByRole('checkbox', { name: /I have read this document/ }));
    await ue.click(screen.getByRole('button', { name: 'Sign' }));
    expect(onSign).toHaveBeenCalledWith(expect.objectContaining({ id: 'd' }), 'Arjun Kulkarni');
  });

  it('the lifecycle designer ticks allowed moves in the grid', async () => {
    const setup: LifecycleSetup = {
      types: [{ id: 't', name: 'Incident', kind: 'incident' }],
      statuses: [
        { id: 'n', label: 'New', systemState: 'new', ticketTypeId: null },
        { id: 'p', label: 'In progress', systemState: 'open', ticketTypeId: null },
      ],
      requirable: [{ key: 'resolution_note', label: 'Resolution note' }],
      lifecycles: [{ id: 'l', ticketTypeId: 't', name: 'Flow', state: 'draft', currentVersion: null, draft: { startStatusId: 'n', statusIds: ['n', 'p'], transitions: [] }, version: 1, versions: [] }],
    };
    const onSave = vi.fn(async () => undefined);
    render(<LifecycleAdmin setup={setup} onCreate={vi.fn()} onSave={onSave} onCheck={vi.fn()} onPublish={vi.fn()} onRetire={vi.fn()} />);
    await ue.click(screen.getByRole('checkbox', { name: 'New to In progress' }));
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'l' }), expect.objectContaining({ transitions: [expect.objectContaining({ from: 'n', to: 'p' })] }));
  });
});
