import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HelpCentreScreen } from './helpdesk';
import { rateCandidate, topicOptions } from './helpdesk-live';
import { HELP_ARTICLE, HELP_BANNERS, HELP_TICKETS, liveHelp } from './helpdesk-live-samples';
import { RAISE_DESKS } from '../desk/data';

// HLP-01 Help centre, live: the designed screen with real records (Helpdesk design wiring, round 1).
const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('HLP-01 rules', () => {
  it('topics name the team; a desk without topics is one choice', () => {
    const o = topicOptions(RAISE_DESKS);
    expect(o.find((x) => x.label === 'Payslip and pay')).toMatchObject({ value: 'd-hr|c-pay', description: 'HR help desk · private to this team’s agents' });
    expect(o.find((x) => x.label === 'Something else for HR help desk')).toMatchObject({ value: 'd-hr|' });
    expect(topicOptions([{ ...RAISE_DESKS[1], categories: [] }])).toEqual([{ value: 'd-hr|', label: 'HR help desk', description: 'Anything for this team' }]);
  });

  it('the resolved card is the newest solved ticket that can be rated or reopened', () => {
    const now = new Date('2026-11-03T00:00:00Z');
    expect(rateCandidate(HELP_TICKETS, now)?.id).toBe('t7');
    expect(rateCandidate([{ ...HELP_TICKETS[2], canRate: false, reopenUntil: '2026-11-01T00:00:00Z' }], now)).toBeNull();
    expect(rateCandidate([{ ...HELP_TICKETS[2], systemState: 'open' }], now)).toBeNull();
  });
});

describe('HLP-01 Help centre (live)', () => {
  it('shows my tickets with the resolution promise, popular articles and the assistant not on yet', () => {
    render(<HelpCentreScreen live={liveHelp()} />);
    expect(screen.getByRole('link', { name: 'VPN keeps disconnecting from home' })).toBeInTheDocument();
    expect(screen.getByText(/Resolve: 1 h 10 min left/)).toBeInTheDocument();
    expect(screen.getByText(/Resolve: Paused/)).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('Popular articles')).toBeInTheDocument();
    expect(screen.getByText('The assistant is not switched on yet.')).toBeInTheDocument();
    expect(screen.getByText('Resolved: Laptop battery drains fast')).toBeInTheDocument();
  });

  it('opens a ticket from its title', async () => {
    const onOpen = vi.fn();
    render(<HelpCentreScreen live={liveHelp({ onOpen })} />);
    await ue.click(screen.getByRole('link', { name: 'VPN keeps disconnecting from home' }));
    expect(onOpen).toHaveBeenCalledWith('t1');
  });

  it('Raise ticket pressed too early says what is missing and sends nothing', async () => {
    const onRaise = vi.fn();
    render(<HelpCentreScreen live={liveHelp({ onRaise })} />);
    await ue.click(screen.getByRole('button', { name: 'Raise a ticket' }));
    await ue.click(await screen.findByRole('button', { name: 'Raise ticket' }));
    expect(onRaise).not.toHaveBeenCalled();
    expect(await screen.findByText('Choose what it is about.')).toBeInTheDocument();
    expect(screen.getByText('Write a subject.')).toBeInTheDocument();
    expect(screen.getByText('Add the details.')).toBeInTheDocument();
  });

  it('raises a ticket with the topic’s team and says the number', async () => {
    const onRaise = vi.fn().mockResolvedValue({ id: 'n1', number: 'HR-1009' });
    render(<HelpCentreScreen live={liveHelp({ onRaise })} />);
    await ue.click(screen.getByRole('button', { name: 'Raise a ticket' }));
    await ue.click(await screen.findByRole('combobox', { name: /What is it about/ }));
    await ue.click(await screen.findByRole('option', { name: /Payslip and pay/ }));
    expect(screen.getByText('Private by default')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'LOP in October');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Two days cut, I was on leave');
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    await waitFor(() => expect(onRaise).toHaveBeenCalledWith({ deskId: 'd-hr', categoryId: 'c-pay', subject: 'LOP in October', description: 'Two days cut, I was on leave', impact: 3, urgency: 3, private: undefined }));
    expect((await screen.findAllByText(/Your ticket number is HR-1009/))[0]).toBeInTheDocument();
  });

  it('a refused raise stays in the drawer with the reason', async () => {
    const onRaise = vi.fn().mockRejectedValue(new Error('This desk is closed for new tickets.'));
    render(<HelpCentreScreen live={liveHelp({ onRaise, desks: [RAISE_DESKS[0]] })} />);
    await ue.click(screen.getByRole('button', { name: 'Raise a ticket' }));
    await ue.click(await screen.findByRole('combobox', { name: /What is it about/ }));
    await ue.click((await screen.findAllByRole('option'))[0]);
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'Wi-Fi');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Drops');
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    expect(await screen.findByText('The ticket was not raised')).toBeInTheDocument();
  });

  it('"This answers it" raises no ticket and counts the article as the answer', async () => {
    const onRaise = vi.fn();
    const onSolved = vi.fn().mockResolvedValue(undefined);
    const base = liveHelp();
    render(<HelpCentreScreen live={liveHelp({ onRaise, kb: { ...base.kb, onSolved } })} />);
    await ue.click(screen.getByRole('button', { name: 'Raise a ticket' }));
    await ue.type(await screen.findByRole('textbox', { name: /Subject/ }), 'payslip loss of pay');
    await ue.click(await screen.findByRole('button', { name: 'This answers it' }, { timeout: 2000 }));
    expect(onSolved).toHaveBeenCalledWith('a1');
    expect(onRaise).not.toHaveBeenCalled();
    expect((await screen.findAllByText('Glad that helped'))[0]).toBeInTheDocument();
  });

  it('search with no match says so', async () => {
    const base = liveHelp();
    render(<HelpCentreScreen live={liveHelp({ kb: { ...base.kb, onSearch: async () => [] } })} />);
    await ue.type(screen.getByRole('textbox', { name: 'Search help articles' }), 'gym membership');
    expect(await screen.findByText('No articles match these words.', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('an article opens from a link (?article=12)', async () => {
    const base = liveHelp();
    const onArticle = vi.fn().mockResolvedValue(HELP_ARTICLE);
    render(<HelpCentreScreen live={liveHelp({ kb: { ...base.kb, onArticle, openNumber: 12 } })} />);
    await waitFor(() => expect(onArticle).toHaveBeenCalledWith(12, undefined));
    expect((await screen.findAllByText(/Loss of pay is counted/))[0]).toBeInTheDocument();
  });

  it('rating: pressed too early asks for a rating; then saves it', async () => {
    const onRate = vi.fn().mockResolvedValue(undefined);
    render(<HelpCentreScreen live={liveHelp({ onRate })} />);
    await ue.click(screen.getByRole('button', { name: 'Send rating' }));
    expect(onRate).not.toHaveBeenCalled();
    expect(await screen.findByText('Choose a rating from 1 to 5.')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: '4' }));
    await ue.click(screen.getByRole('button', { name: 'Send rating' }));
    await waitFor(() => expect(onRate).toHaveBeenCalledWith('t7', 4, undefined));
    expect(await screen.findByText('You rated the help 4 of 5. Thank you.')).toBeInTheDocument();
  });

  it('rating (1643): the main reason is optional and goes with the stars', async () => {
    const onRate = vi.fn().mockResolvedValue(undefined);
    render(<HelpCentreScreen live={liveHelp({ onRate })} />);
    await ue.click(screen.getByRole('radio', { name: '2' }));
    await ue.click(screen.getByRole('combobox', { name: /The main reason/ }));
    await ue.click(await screen.findByRole('option', { name: 'Not solved' }));
    await ue.click(screen.getByRole('button', { name: 'Send rating' }));
    await waitFor(() => expect(onRate).toHaveBeenCalledWith('t7', 2, 'Not solved'));
  });

  it('Reopen ticket opens the ticket to reply', async () => {
    const onOpen = vi.fn();
    render(<HelpCentreScreen live={liveHelp({ onOpen })} />);
    await ue.click(screen.getByRole('button', { name: 'Reopen ticket' }));
    expect(onOpen).toHaveBeenCalledWith('t7');
  });

  it('Me too joins the known issue once', async () => {
    const onMeToo = vi.fn().mockResolvedValue({ linked: true });
    render(<HelpCentreScreen live={liveHelp({ banners: HELP_BANNERS, onMeToo })} />);
    await ue.click(screen.getByRole('button', { name: 'Me too' }));
    expect(onMeToo).toHaveBeenCalledWith('bn1');
    await ue.click(await screen.findByRole('button', { name: 'You are on it' }));
    expect(onMeToo).toHaveBeenCalledTimes(1);
  });

  it('loading, error with retry, empty and no access', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<HelpCentreScreen live={liveHelp({ state: 'loading' })} />);
    expect(screen.getByLabelText('Loading your tickets')).toBeInTheDocument();
    rerender(<HelpCentreScreen live={liveHelp({ state: 'error', onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<HelpCentreScreen live={liveHelp({ tickets: [] })} />);
    expect(screen.getByText('You have no tickets.')).toBeInTheDocument();
    rerender(<HelpCentreScreen live={liveHelp({ state: 'no-access' })} />);
    expect(screen.getByText(/You don't have access to the Help centre/)).toBeInTheDocument();
  });

  it('no team takes tickets: Raise a ticket says so instead of an empty form', async () => {
    render(<HelpCentreScreen live={liveHelp({ desks: [] })} />);
    await ue.click(screen.getByRole('button', { name: 'Raise a ticket' }));
    expect((await screen.findAllByText(/No team takes tickets here yet/))[0]).toBeInTheDocument();
  });
});
