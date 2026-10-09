import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessagingAdmin, MyChannelsCard, TeamScreen } from './esm3';
import type { MsgSetup, TeamMember } from './esm3-types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('3b-2 batch 3 screens', () => {
  it('linking a phone shows the JOIN message to send; the demo phone sends it', async () => {
    const onJoinCode = vi.fn(async () => ({ code: 'ABCD2345', text: 'JOIN ABCD2345', expiresInMinutes: 15 }));
    const onSend = vi.fn(async () => undefined);
    render(
      <MyChannelsCard
        channels={{ devTransport: true, lines: [{ kind: 'whatsapp', name: 'IT help', sendTo: '+91 80000 00000', linked: null }] }}
        onJoinCode={onJoinCode}
        onUnlink={vi.fn()}
        dev={{ outbox: [{ kind: 'whatsapp', text: 'Your phone is linked.', template: null, at: new Date().toISOString() }], onSend }}
      />,
    );
    await ue.click(screen.getByRole('button', { name: 'Link my phone' }));
    expect(screen.getByRole('textbox', { name: 'Message to send' })).toHaveValue('JOIN ABCD2345');
    expect(screen.getByText(/to \+91 80000 00000 within 15 minutes/)).toBeInTheDocument();
    // The demo phone takes the JOIN message and a number (the phone is not linked yet).
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('JOIN ABCD2345');
    await ue.type(screen.getByRole('textbox', { name: /Phone number/ }), '+919812345678');
    await ue.click(screen.getByRole('button', { name: 'Send from my phone' }));
    expect(onSend).toHaveBeenCalledWith('whatsapp', 'JOIN ABCD2345', '+919812345678');
    expect(within(screen.getByRole('list', { name: 'Messages to my phone' })).getByText('Your phone is linked.')).toBeInTheDocument();
  });

  it('a line is added with the joined channel choice, and its secret is shown once', async () => {
    const setup: MsgSetup = { channels: [], accounts: [], devTransport: false };
    const onAdd = vi.fn(async () => ({ webhookUrl: 'https://api.test/x', secret: 's3cret-value' }));
    render(<MessagingAdmin deskId="d1" setup={setup} onAdd={onAdd} onSave={vi.fn()} onRotate={vi.fn()} />);
    await ue.click(screen.getByRole('radio', { name: 'SMS' }));
    expect(screen.getByRole('button', { name: 'Add the line' })).toBeDisabled();
    await ue.type(screen.getByRole('textbox', { name: /Name/ }), 'IT by SMS');
    await ue.type(screen.getByRole('textbox', { name: /Registered reply template/ }), 'You have a reply on {{#var#}. Read it: {{#var#}');
    await ue.click(screen.getByRole('button', { name: 'Add the line' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ kind: 'sms', name: 'IT by SMS', accountId: null, templates: { reply_notice: expect.objectContaining({ body: 'You have a reply on {#var#}. Read it: {#var#}' }) } }));
    expect(screen.getByRole('textbox', { name: 'Signing secret' })).toHaveValue('s3cret-value');
  });

  it('presence is one joined choice; a lead changes capacity and languages', async () => {
    const onPresence = vi.fn(async () => undefined);
    const onRouting = vi.fn(async () => undefined);
    const team: TeamMember[] = [{ userId: 'u1', name: 'Suresh', role: 'agent', presence: 'available', awayUntil: null, skills: ['network'], languages: ['en'], onShift: true, openTickets: 2, activeChats: 0, capacity: { ticket: null, chat: 2, messaging: null } }];
    render(<TeamScreen state="ready" desks={[{ id: 'd', name: 'IT' }]} deskId="d" onDesk={vi.fn()} canLead canReport={false} me={{ presence: 'available' }} onPresence={onPresence} team={team} onRouting={onRouting} shifts={[]} range={{ from: '2026-10-09', to: '2026-10-15' }} onAddShift={vi.fn()} onRemoveShift={vi.fn()} onImportShifts={vi.fn()} forecast={null} availability={null} />);
    await ue.click(screen.getByRole('radio', { name: 'Busy' }));
    expect(onPresence).toHaveBeenCalledWith('busy');
    expect(screen.getByText(/2 open tickets · 0 chats of 2 · skills network · speaks en/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Change capacity and languages' }));
    await ue.type(screen.getByRole('textbox', { name: /Open tickets at most/ }), '5');
    await ue.clear(screen.getByRole('textbox', { name: /Languages they answer in/ }));
    await ue.type(screen.getByRole('textbox', { name: /Languages they answer in/ }), 'en, ta');
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(onRouting).toHaveBeenCalledWith('u1', { capacity: { ticket: 5, chat: 2, messaging: null }, languages: ['en', 'ta'] });
  });
});
