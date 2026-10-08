import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { YukthixSupportScreen, type YukthixSupportScreenProps } from './yukthix-support';
import { YX_ROWS, YX_TICKET } from './yukthix-support-data';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const base = (p: Partial<YukthixSupportScreenProps> = {}): YukthixSupportScreenProps => ({
  state: 'ready',
  tickets: YX_ROWS,
  onRaise: vi.fn().mockResolvedValue({ number: 'YXS-1050', sending: false }),
  fromPage: '/yx/settings/structure',
  openId: null,
  onOpen: vi.fn(),
  ticket: null,
  ticketState: 'loading',
  onReply: vi.fn().mockResolvedValue(undefined),
  supportAccessHref: '/yx/settings/support-access',
  ...p,
});

describe('SD-1.31 Contact YukthiX', () => {
  it('severity is one pick in plain words; the page goes only when ticked', async () => {
    const props = base();
    render(<YukthixSupportScreen {...props} />);
    expect(screen.getByRole('radiogroup', { name: 'How bad is it?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A question or small problem' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Monday to Saturday, 9:00 to 19:00 India time/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Support access' })).toHaveAttribute('href', '/yx/settings/support-access');
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'Nobody can sign in');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Since 8:00');
    await ue.click(screen.getByRole('radio', { name: 'Down for everyone' }));
    await ue.click(screen.getByRole('button', { name: 'Send to YukthiX' }));
    await waitFor(() => expect(props.onRaise).toHaveBeenCalledWith({ subject: 'Nobody can sign in', body: 'Since 8:00', severity: 1 }));
    expect(await screen.findByText(/YXS-1050/)).toBeInTheDocument();

    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'Again');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'More');
    await ue.click(screen.getByRole('checkbox', { name: /Include the page I was on/ }));
    await ue.click(screen.getByRole('button', { name: 'Send to YukthiX' }));
    await waitFor(() => expect(props.onRaise).toHaveBeenLastCalledWith(expect.objectContaining({ screen: '/yx/settings/structure', severity: 1 })));
  });

  it('lists tickets; one still being sent has no number and does not open', async () => {
    const props = base();
    render(<YukthixSupportScreen {...props} />);
    expect(screen.getByText('No number yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'An idea for the org chart' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Nobody can sign in' }));
    expect(props.onOpen).toHaveBeenCalledWith('t1');
  });

  it('shows the conversation and sends a reply', async () => {
    const props = base({ openId: 't1', ticket: YX_TICKET, ticketState: 'ready' });
    render(<YukthixSupportScreen {...props} />);
    expect(screen.getByText('Anand from YukthiX')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Your reply/ }), 'Thanks');
    await ue.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(props.onReply).toHaveBeenCalledWith('t1', 'Thanks'));
  });
});
