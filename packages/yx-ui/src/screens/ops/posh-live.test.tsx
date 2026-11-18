import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { IcConsoleScreen, PoshComplaintScreen } from './posh';
import { IC_NO_EXTERNAL, IC_TWO_COMMITTEES, IC_WRONG, liveIcConsole, livePoshFiling } from './posh-live-samples';

// Batch F item 13: CMP-10 POSH complaint and CMP-11 Internal Committee console, live. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const TODAY = new Date(2026, 9, 15);

async function fill(place: string, about: string, what: string) {
  await ue.click(screen.getByRole('combobox', { name: /Workplace/ }));
  await ue.click(await screen.findByRole('option', { name: place }));
  await ue.type(screen.getByRole('textbox', { name: /Who is the complaint about/ }), about);
  await ue.type(screen.getByRole('textbox', { name: /What happened/ }), what);
}

describe('CMP-10 POSH complaint (live)', () => {
  it('File complaint with nothing filled says what is missing under each field and sends nothing', async () => {
    const onFile = vi.fn();
    show(<PoshComplaintScreen today={TODAY} live={livePoshFiling({ onFile })} />);
    await ue.click(screen.getByRole('button', { name: 'File complaint' }));
    expect(await screen.findByText('Choose the date it happened.')).toBeInTheDocument();
    expect(screen.getByText('Choose the workplace.')).toBeInTheDocument();
    expect(screen.getByText('Say who the complaint is about.')).toBeInTheDocument();
    expect(screen.getByText('Describe what happened, in at least 10 characters.')).toBeInTheDocument();
    expect(onFile).not.toHaveBeenCalled();
  });

  it('files with the company workplace and shows the reference', async () => {
    const onFile = vi.fn().mockResolvedValue({ id: 'rep-1', reference: 'SPK-0012' });
    show(<PoshComplaintScreen today={TODAY} incidentDate={new Date(2026, 8, 18)} live={livePoshFiling({ onFile })} />);
    await fill('Hosur plant', 'Ravi K.', 'Repeated comments about my clothes at the plant.');
    await ue.click(screen.getByRole('button', { name: 'File complaint' }));
    expect(await screen.findByText(/Reference SPK-0012/)).toBeInTheDocument();
    expect(onFile).toHaveBeenCalledWith(expect.objectContaining({ happenedOn: '2026-09-18', locationId: 'loc-hsr', involved: 'Ravi K.' }));
  });

  it('on her behalf needs her name and the relationship, which travel in the summary', async () => {
    const onFile = vi.fn().mockResolvedValue({ id: 'rep-2', reference: 'SPK-0013' });
    show(<PoshComplaintScreen today={TODAY} incidentDate={new Date(2026, 8, 18)} onBehalf live={livePoshFiling({ onFile })} />);
    await ue.click(screen.getByRole('button', { name: 'File complaint' }));
    expect(await screen.findByText('Write her name.')).toBeInTheDocument();
    expect(screen.getByText('Say how you know her.')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Her name/ }), 'Meena');
    await ue.type(screen.getByRole('textbox', { name: /relationship/ }), 'Sister');
    await fill('Bengaluru head office', 'A visitor', 'Unwelcome touching at the reception.');
    await ue.click(screen.getByRole('button', { name: 'File complaint' }));
    expect(await screen.findByText(/Reference SPK-0013/)).toBeInTheDocument();
    expect(onFile).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Unwelcome touching at the reception.', onBehalfName: 'Meena', onBehalfRelation: 'Sister' }));
  });

  it('more than 6 months ago is refused before sending, with a way to raise a grievance', async () => {
    const onFile = vi.fn();
    const onGrievance = vi.fn();
    show(<PoshComplaintScreen today={TODAY} incidentDate={new Date(2026, 1, 2)} live={livePoshFiling({ onFile, onGrievance })} />);
    await ue.click(screen.getByRole('button', { name: 'File complaint' }));
    expect(onFile).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Raise a grievance' }));
    expect(onGrievance).toHaveBeenCalled();
  });

  it('no Internal Committee: says so and offers no File button', () => {
    show(<PoshComplaintScreen today={TODAY} live={livePoshFiling({ icReady: false })} />);
    expect(screen.getByText('The Internal Committee is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'File complaint' })).toBeNull();
  });

  it('a refused filing shows the reason and keeps the form', async () => {
    const onFile = vi.fn().mockRejectedValue(new Error('The Internal Committee is not set up.'));
    show(<PoshComplaintScreen today={TODAY} incidentDate={new Date(2026, 8, 18)} live={livePoshFiling({ onFile })} />);
    await fill('Hosur plant', 'Ravi K.', 'Repeated comments about my clothes.');
    await ue.click(screen.getByRole('button', { name: 'File complaint' }));
    expect(await screen.findByText('The Internal Committee is not set up.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File complaint' })).toBeInTheDocument();
  });
});

describe('CMP-11 Internal Committee console (live)', () => {
  it('shows the committee as complete and the members with their roles', () => {
    show(<IcConsoleScreen today={TODAY} live={liveIcConsole()} />);
    expect(screen.getByText('Committee complete')).toBeInTheDocument();
    expect(screen.getByText('Dr. Anuradha Menon')).toBeInTheDocument();
    expect(screen.getAllByText('Presiding officer').length).toBeGreaterThan(0);
  });

  it('flags a committee with no external member', () => {
    show(<IcConsoleScreen today={TODAY} live={liveIcConsole({ members: IC_NO_EXTERNAL })} />);
    expect(screen.getByText(/Committee not complete: Add one external member/)).toBeInTheDocument();
  });

  it('answer 2591: a man presiding, a term over and missing details are each named', () => {
    show(<IcConsoleScreen today={TODAY} live={liveIcConsole({ members: IC_WRONG })} />);
    expect(screen.getByText(/Presiding officer must be a senior woman employee/)).toBeInTheDocument();
    expect(screen.getByText(/Adv. Shobha Rao: tenure ended/)).toBeInTheDocument();
    expect(screen.getByText(/Kavitha Srinivasan: woman or term end not recorded/)).toBeInTheDocument();
    expect(screen.getByText('Ended')).toBeInTheDocument();
  });

  it('answer 2592: each committee is checked on its own and named', () => {
    show(<IcConsoleScreen today={TODAY} live={liveIcConsole({ members: IC_TWO_COMMITTEES })} />);
    expect(screen.getByText(/Hosur plant: Add one external member/)).toBeInTheDocument();
    expect(screen.queryByText(/Whole company: Add one external member/)).toBeNull();
    expect(screen.getAllByText('Hosur plant').length).toBeGreaterThan(0);
  });

  it('lists the complaints and opens one', async () => {
    const onOpen = vi.fn();
    show(<IcConsoleScreen today={TODAY} live={liveIcConsole({ onOpen })} />);
    await ue.click(screen.getByRole('tab', { name: /Complaints/ }));
    expect(await screen.findByText('POSH-0007')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    expect(onOpen).toHaveBeenCalledWith('c1');
  });

  it('someone not on the committee sees Not found, never the committee', () => {
    show(<IcConsoleScreen today={TODAY} live={liveIcConsole({ state: 'no-access' })} />);
    expect(screen.queryByText('Dr. Anuradha Menon')).toBeNull();
  });
});
