import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HelpCentreScreen } from './helpdesk';
import { rateCandidate, topicOptions } from './helpdesk-live';
import { HELP_ARTICLE, HELP_BANNERS, HELP_TICKETS, liveHelp } from './helpdesk-live-samples';
import { RAISE_DESKS } from '../desk/data';
import { RAISE_FIELDS } from '../desk/ticket-fields-sample';

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

  it('1646: a closed team says so with its next opening in the raise form; an open team says nothing; raising still works', async () => {
    const onRaise = vi.fn().mockResolvedValue({ id: 'n1', number: 'HR-1009' });
    const closed = { message: 'Closed for the night. Back {opens}.', opensAt: '2026-10-13T03:30:00Z' };
    render(<HelpCentreScreen live={liveHelp({ onRaise, desks: [{ ...RAISE_DESKS[1], closed }, RAISE_DESKS[0]] })} />);
    await ue.click(screen.getByRole('button', { name: 'Raise a ticket' }));
    await ue.click(await screen.findByRole('combobox', { name: /What is it about/ }));
    await ue.click(await screen.findByRole('option', { name: /Something else for IT help desk/ }));
    expect(screen.queryByText('Closed now')).toBeNull();
    await ue.click(screen.getByRole('combobox', { name: /What is it about/ }));
    await ue.click(await screen.findByRole('option', { name: /Payslip and pay/ }));
    expect(screen.getByText('Closed now')).toBeInTheDocument();
    expect(screen.getByText(/^Closed for the night\. Back 13 Oct 2026, /)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'LOP in October');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Two days cut');
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    await waitFor(() => expect(onRaise).toHaveBeenCalled());
  });

  it('1647: a ticket raised from an open article carries the article; one raised straight away carries nothing', async () => {
    const onRaise = vi.fn().mockResolvedValue({ id: 'n1', number: 'HR-1009' });
    const base = liveHelp();
    const onArticle = vi.fn().mockResolvedValue(HELP_ARTICLE);
    const fill = async () => {
      await ue.click(await screen.findByRole('combobox', { name: /What is it about/ }));
      await ue.click(await screen.findByRole('option', { name: /Payslip and pay/ }));
      await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'LOP in October');
      await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Two days cut');
      await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    };
    const { unmount } = render(<HelpCentreScreen live={liveHelp({ onRaise, kb: { ...base.kb, onArticle, openNumber: 12 } })} />);
    await ue.click(await screen.findByRole('button', { name: /still need help/i }));
    await fill();
    await waitFor(() => expect(onRaise).toHaveBeenCalledWith(expect.objectContaining({ originArticleId: HELP_ARTICLE.id })));
    unmount();
    onRaise.mockClear();
    render(<HelpCentreScreen live={liveHelp({ onRaise })} />);
    await ue.click(screen.getByRole('button', { name: 'Raise a ticket' }));
    await fill();
    await waitFor(() => expect(onRaise).toHaveBeenCalled());
    expect(onRaise.mock.calls[0][0]).not.toHaveProperty('originArticleId');
    expect(onRaise.mock.calls[0][0]).not.toHaveProperty('originQuery');
  });

  it('1662: an IT desk asks which device (own devices only) and sends it; a desk that does not ask shows no picker', async () => {
    const onRaise = vi.fn().mockResolvedValue({ id: 'n1', number: 'IT-1009' });
    const onPickDevice = vi.fn().mockResolvedValue([{ id: 'as1', label: 'Dell Latitude 5440 (KF-LT-0142)', detail: 'Laptop' }, { id: 'as2', label: 'Logitech headset (KF-HS-0077)', detail: 'Accessory' }]);
    const { unmount } = render(<HelpCentreScreen live={liveHelp({ onRaise, onPickDevice, startRaise: true, desks: [{ ...RAISE_DESKS[0], categories: [], askDevice: true }] })} />);
    await ue.click(await screen.findByRole('combobox', { name: 'Which device?' }));
    await ue.click(await screen.findByRole('option', { name: /KF-LT-0142/ }));
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'Laptop will not charge');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Since Monday');
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    await waitFor(() => expect(onRaise).toHaveBeenCalledWith(expect.objectContaining({ deskId: 'd-it', assetId: 'as1' })));
    unmount();
    render(<HelpCentreScreen live={liveHelp({ onPickDevice, startRaise: true, desks: [{ ...RAISE_DESKS[0], categories: [], askDevice: false }] })} />);
    await screen.findByRole('textbox', { name: /Subject/ });
    expect(screen.queryByRole('combobox', { name: 'Which device?' })).toBeNull();
  });

  it('1801: on behalf of a colleague; nobody chosen stops it; the device asked follows the colleague; sent with the colleague', async () => {
    const onRaise = vi.fn().mockResolvedValue({ id: 'n1', number: 'IT-1009' });
    const onPickDevice = vi.fn().mockResolvedValue([{ id: 'as9', label: 'HP EliteBook (KF-LT-0009)', detail: 'Laptop' }]);
    const onDesksFor = vi.fn().mockResolvedValue([{ ...RAISE_DESKS[0], categories: [], askDevice: true }]);
    const onPickPeople = vi.fn().mockResolvedValue([{ id: 'p-ravi', label: 'Ravi Kumar', detail: 'Sales' }]);
    render(<HelpCentreScreen live={liveHelp({ onRaise, onPickDevice, startRaise: true, desks: [{ ...RAISE_DESKS[0], categories: [], askDevice: false }], onBehalf: { onPickPeople, onDesksFor } })} />);
    expect(screen.queryByRole('combobox', { name: 'Which device?' })).toBeNull();
    await ue.click(await screen.findByRole('radio', { name: 'On behalf of someone' }));
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'Laptop for Ravi');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'It will not start');
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    expect((await screen.findAllByText('Choose who it is for.')).length).toBeGreaterThan(0);
    expect(onRaise).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: 'Colleague' }));
    await ue.click(await screen.findByRole('option', { name: /Ravi Kumar/ }));
    await waitFor(() => expect(onDesksFor).toHaveBeenCalledWith('p-ravi'));
    await ue.click(await screen.findByRole('combobox', { name: 'Which device?' }));
    await ue.click(await screen.findByRole('option', { name: /KF-LT-0009/ }));
    expect(onPickDevice).toHaveBeenCalledWith(expect.any(String), 'p-ravi');
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    await waitFor(() => expect(onRaise).toHaveBeenCalledWith(expect.objectContaining({ requestedForPersonId: 'p-ravi', assetId: 'as9' })));
  });

  it('1842: the desk fields everyone sees are on the raise form; the floor follows the office; only filled ones are sent', async () => {
    const onRaise = vi.fn().mockResolvedValue({ id: 'n1', number: 'IT-1010' });
    render(<HelpCentreScreen live={liveHelp({ onRaise, startRaise: true, desks: [{ ...RAISE_DESKS[0], categories: [], fields: RAISE_FIELDS }] })} />);
    await ue.click(await screen.findByRole('combobox', { name: /Office/ }));
    await ue.click(await screen.findByRole('option', { name: 'Chennai' }));
    await ue.click(screen.getByRole('combobox', { name: /Floor/ }));
    expect(await screen.findByRole('option', { name: 'Chennai · ground floor' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bengaluru · 1st floor' })).toBeNull();
    await ue.click(screen.getByRole('option', { name: 'Chennai · ground floor' }));
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'Projector broken');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Room 2');
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    await waitFor(() => expect(onRaise).toHaveBeenCalledWith(expect.objectContaining({ fields: { office: 'che', floor: 'che_g' } })));
  });

  it('1842 negative: a refused field shows its message by the field and the form stays; no fields, none sent', async () => {
    const onRaise = vi.fn().mockRejectedValueOnce(Object.assign(new Error('Check the fields.'), { body: { errors: { office: 'Choose one of the options offered.' } } })).mockResolvedValue({ id: 'n2', number: 'IT-1011' });
    const { unmount } = render(<HelpCentreScreen live={liveHelp({ onRaise, startRaise: true, desks: [{ ...RAISE_DESKS[0], categories: [], fields: RAISE_FIELDS }] })} />);
    await ue.click(await screen.findByRole('combobox', { name: /Office/ }));
    await ue.click(await screen.findByRole('option', { name: 'Bengaluru' }));
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'Projector broken');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Room 2');
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    expect((await screen.findAllByText('Choose one of the options offered.')).length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: /Subject/ })).toHaveValue('Projector broken');
    unmount();
    onRaise.mockClear();
    render(<HelpCentreScreen live={liveHelp({ onRaise, startRaise: true, desks: [{ ...RAISE_DESKS[0], categories: [] }] })} />);
    await ue.type(await screen.findByRole('textbox', { name: /Subject/ }), 'Mouse');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Broken');
    expect(screen.queryByRole('combobox', { name: /Office/ })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    await waitFor(() => expect(onRaise).toHaveBeenCalled());
    expect(onRaise.mock.calls[0][0]).not.toHaveProperty('fields');
  });

  it('1911: a facilities desk asks where it is: the building, then an area of that building; both are sent', async () => {
    const onRaise = vi.fn().mockResolvedValue({ id: 'n1', number: 'FAC-1050' });
    const onPickPlace = vi.fn(async (kind: string, _q: string, locationId?: string) => (kind === 'locations' ? [{ id: 'l-blr', label: 'Bengaluru office', detail: 'BLR' }] : locationId === 'l-blr' ? [{ id: 'a-2', label: '2nd floor', detail: null }] : []));
    render(<HelpCentreScreen live={liveHelp({ onRaise, onPickPlace, startRaise: true, desks: [{ ...RAISE_DESKS[0], id: 'd-fac', name: 'Facilities', categories: [], askPlace: true }] })} />);
    expect(screen.queryByRole('combobox', { name: 'Floor or area' })).toBeNull();
    await ue.click(await screen.findByRole('combobox', { name: 'Building' }));
    await ue.click(await screen.findByRole('option', { name: /Bengaluru office/ }));
    await ue.click(await screen.findByRole('combobox', { name: 'Floor or area' }));
    await ue.click(await screen.findByRole('option', { name: /2nd floor/ }));
    expect(onPickPlace).toHaveBeenCalledWith('areas', expect.any(String), 'l-blr');
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'Leak');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Near the pantry');
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    await waitFor(() => expect(onRaise).toHaveBeenCalledWith(expect.objectContaining({ deskId: 'd-fac', locationId: 'l-blr', areaId: 'a-2' })));
  });

  it('1911 negative: other desks never ask where; nothing chosen, nothing sent', async () => {
    const onRaise = vi.fn().mockResolvedValue({ id: 'n1', number: 'IT-1050' });
    const { unmount } = render(<HelpCentreScreen live={liveHelp({ onRaise, onPickPlace: vi.fn(), startRaise: true, desks: [{ ...RAISE_DESKS[0], categories: [] }] })} />);
    await screen.findByRole('textbox', { name: /Subject/ });
    expect(screen.queryByRole('combobox', { name: 'Building' })).toBeNull();
    unmount();
    render(<HelpCentreScreen live={liveHelp({ onRaise, onPickPlace: vi.fn().mockResolvedValue([]), startRaise: true, desks: [{ ...RAISE_DESKS[0], id: 'd-fac', categories: [], askPlace: true }] })} />);
    await ue.type(await screen.findByRole('textbox', { name: /Subject/ }), 'Leak');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Somewhere');
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    await waitFor(() => expect(onRaise).toHaveBeenCalled());
    expect(onRaise.mock.calls[0][0]).not.toHaveProperty('locationId');
    expect(onRaise.mock.calls[0][0]).not.toHaveProperty('areaId');
  });

  it('1801: without the right there is no "Who is this for"', async () => {
    render(<HelpCentreScreen live={liveHelp({ startRaise: true })} />);
    await screen.findByRole('textbox', { name: /Subject/ });
    expect(screen.queryByRole('radiogroup', { name: 'Who is this for' })).toBeNull();
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
