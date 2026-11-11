import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SupportDeskQueueScreen, SupportDeskTicketScreen, textToParagraphs, type SupportDeskTicketScreenProps } from './support-desk';
import { DESK_NOW, DESK_TICKET, QUEUE, UNLINKED_TICKET } from './support-desk-data';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn().mockResolvedValue(undefined);
const ticketProps = (p: Partial<SupportDeskTicketScreenProps> = {}): SupportDeskTicketScreenProps => ({
  state: 'ready',
  view: DESK_TICKET,
  canRequestAccess: true,
  onBack: vi.fn(),
  onPost: ok(),
  onAssignMe: ok(),
  onResolve: ok(),
  onLink: ok(),
  onRequestAccess: ok(),
  now: DESK_NOW,
  ...p,
});

describe('SD-1.31 console support desk', () => {
  it('keeps the API order (Priority Support first within a severity) and marks unlinked tickets', () => {
    render(<SupportDeskQueueScreen state="ready" rows={QUEUE} show="open" onShow={vi.fn()} onOpen={vi.fn()} now={DESK_NOW} />);
    const table = screen.getByRole('table');
    const numbers = within(table).getAllByText(/^YXS-/).map((n) => n.textContent);
    expect(numbers).toEqual(['YXS-1042', 'YXS-1040', 'YXS-1043']);
    expect(within(table).getAllByText('Priority Support')).toHaveLength(1);
    expect(within(table).getByText('Not linked')).toBeInTheDocument();
    expect(within(table).getByText(/^Late/)).toBeInTheDocument();
  });

  it('says plainly when the staff member is not a support agent', () => {
    render(<SupportDeskQueueScreen state="no-access" blocked="You are not a YukthiX Support agent. Ask the support lead to add you." rows={[]} show="open" onShow={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText(/You are not a YukthiX Support agent/)).toBeInTheDocument();
  });

  it('request access needs a reason of 10 characters and sends the hours', async () => {
    const props = ticketProps();
    render(<SupportDeskTicketScreen {...props} />);
    await ue.click(screen.getByRole('button', { name: 'Request access' }));
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'too short');
    await ue.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText('Write at least 10 characters')).toBeInTheDocument();
    expect(props.onRequestAccess).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), ' - sign-in config check');
    await ue.click(within(dialog).getByRole('radio', { name: '24 h' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(props.onRequestAccess).toHaveBeenCalledWith({ reason: 'too short - sign-in config check', hours: 24 }));
  });

  it('shows the session state in words instead of the button', () => {
    render(<SupportDeskTicketScreen {...ticketProps({ view: { ...DESK_TICKET, session: { id: 's', status: 'requested', hours: 4, startsAt: null, endsAt: null, mine: true, requestedBy: 'You', decidedBy: null, decisionNote: null } } })} />);
    expect(screen.getByText('Asked. Waiting for the company to approve.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request access' })).toBeNull();
  });

  it('the tenant panel has account facts only, no HR words', () => {
    render(<SupportDeskTicketScreen {...ticketProps()} />);
    const panel = screen.getByRole('region', { name: 'Godavari Agro Pvt Ltd' });
    expect(within(panel).getByText('godavari-agro')).toBeInTheDocument();
    expect(within(panel).getByText('YukthiX HR, Service Desk')).toBeInTheDocument();
    expect(panel.textContent).not.toMatch(/employee|salary|payslip|payroll|leave|attendance|aadhaar|PAN\b|bank/i);
  });

  it('notes look different; a reply is sent as escaped paragraphs; resolve sends the version', async () => {
    const props = ticketProps();
    render(<SupportDeskTicketScreen {...props} />);
    expect(screen.getByText(/Internal note · only YukthiX sees it/).closest('li')).toHaveAttribute('data-kind', 'note');
    await ue.type(screen.getByRole('textbox', { name: 'Reply' }), 'Use <b> & retry');
    await ue.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(props.onPost).toHaveBeenCalledWith('reply', '<p>Use &lt;b&gt; &amp; retry</p>'));
    await ue.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(props.onResolve).toHaveBeenCalledWith(3));
    expect(textToParagraphs('a\nb\n\nc')).toBe('<p>a<br>b</p><p>c</p>');
  });

  it('an unlinked ticket is linked to a company from the list', async () => {
    const props = ticketProps({ view: UNLINKED_TICKET });
    render(<SupportDeskTicketScreen {...props} />);
    expect(screen.getByText('Not linked to a company')).toBeInTheDocument();
    await ue.click(screen.getByRole('combobox', { name: /Company/ }));
    await ue.click(await screen.findByRole('option', { name: 'Kaveri Foods' }));
    await ue.click(screen.getByRole('button', { name: 'Link to a company' }));
    await waitFor(() => expect(props.onLink).toHaveBeenCalledWith('a2'));
  });
});

// Answer 1051: staff look a Not found reference up across companies.
describe('Support desk · look up a reference', () => {
  const hits = [
    { code: 'NF-7KQ2MP', company: 'Kaveri Foods', at: '2026-11-11T05:42:00.000Z', path: '/yx/people/abc' },
    { code: 'NF-7KQ2MP', company: 'Sahyadri Textiles', at: '2026-10-02T10:15:00.000Z', path: '/yx/no-such-page' },
  ];
  it('lists every company that has the code, with the page and no person', async () => {
    const onLookUpReference = vi.fn().mockResolvedValueOnce(hits).mockResolvedValueOnce([]);
    render(<SupportDeskQueueScreen state="ready" rows={[]} show="open" onShow={() => {}} onOpen={() => {}} onLookUpReference={onLookUpReference} />);
    await userEvent.click(screen.getByRole('button', { name: 'Look up a reference' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Reference/ }), 'nf-7kq2mp');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(onLookUpReference).toHaveBeenCalledWith('NF-7KQ2MP');
    expect(await screen.findByText('Kaveri Foods')).toBeInTheDocument();
    expect(screen.getByText('Sahyadri Textiles')).toBeInTheDocument();
    expect(screen.queryByText('Who')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('No company has this reference.')).toBeInTheDocument();
  });

  it('no look-up for staff who are not Support agents, or without the action', () => {
    const { unmount } = render(<SupportDeskQueueScreen state="ready" blocked="You are not a YukthiX Support agent." rows={[]} show="open" onShow={() => {}} onOpen={() => {}} onLookUpReference={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Look up a reference' })).toBeNull();
    unmount();
    render(<SupportDeskQueueScreen state="ready" rows={[]} show="open" onShow={() => {}} onOpen={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Look up a reference' })).toBeNull();
  });
});
