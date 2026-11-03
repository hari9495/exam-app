import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AccidentWorkspaceScreen, ReportAccidentScreen } from './cases-more';
import { SpeakUpScreen } from './cases';
import { SpeakUpSetupScreen } from './helpdesk-speakup-live';
import { ACC_CONTRACT, ACC_DETAIL, ACC_ESI_UNKNOWN, ACC_MANAGER, ACC_NON_ESI, ACC_SUBMITTED, liveAccident, liveReport } from './accident-live-samples';
import { liveSetup, liveSpeakUp } from './helpdesk-speakup-live-samples';

// HLP-12 Accident case, live (the designed screens with real records): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('HLP-12 Report an accident (live)', () => {
  it('Send report too early says what is missing and sends nothing', async () => {
    const onSend = vi.fn();
    show(<ReportAccidentScreen device="desk" live={liveReport({ onSend })} />);
    await ue.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Enter the time, like 10:30 am.')).toBeInTheDocument();
    expect(screen.getByText('Choose the location.')).toBeInTheDocument();
    expect(screen.getByText('Say what happened (10 letters or more).')).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('a witness reports for a contract worker: the time is India time; a toast names the case', async () => {
    const onSend = vi.fn().mockResolvedValue({ id: 'acc-9', number: 'ACC-0009' });
    const onDone = vi.fn();
    show(<ReportAccidentScreen device="desk" live={liveReport({ onSend, onDone, start: { kind: 'contract' } })} />);
    await ue.type(screen.getByRole('textbox', { name: /^Name/ }), 'Murugan P.');
    await ue.type(screen.getByRole('textbox', { name: /Contractor/ }), 'Sri Lakshmi Facility Services');
    const time = screen.getByRole('textbox', { name: /Time/ });
    await ue.type(time, '10:30 am');
    await ue.tab();
    await ue.click(screen.getByRole('combobox', { name: /Location/ }));
    await ue.click(await screen.findByRole('option', { name: 'Hosur plant' }));
    await ue.type(screen.getByRole('textbox', { name: /Where exactly/ }), 'Packing line 2');
    await ue.type(screen.getByRole('textbox', { name: /What happened/ }), 'Slipped on the wet floor near the cold room.');
    await ue.click(screen.getByRole('combobox', { name: /Injury type/ }));
    await ue.click(await screen.findByRole('option', { name: 'Fall' }));
    await ue.click(screen.getByRole('button', { name: 'Send report' }));
    expect(onSend).toHaveBeenCalledWith({ injuredKind: 'contract', injuredName: 'Murugan P.', contractor: 'Sri Lakshmi Facility Services', occurredAt: '2026-11-04T10:30:00+05:30', locationId: 'hsr', place: 'Packing line 2', description: 'Slipped on the wet floor near the cold room.', injuryType: 'Fall', firstAid: false });
    expect(await screen.findByText('Accident ACC-0009 reported')).toBeInTheDocument();
    expect(onDone).toHaveBeenCalled();
  });

  it('no safety team yet: says so and refuses to send', async () => {
    const onSend = vi.fn();
    show(<ReportAccidentScreen device="phone" live={liveReport({ onSend, form: { ...liveReport().form!, ready: false } })} />);
    expect(screen.getByText('Nobody receives accident reports yet')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send report' }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('a refusal from the server stays on the form', async () => {
    const onSend = vi.fn().mockRejectedValue(Object.assign(new Error('Choose one of the injury types in the list.'), { status: 400 }));
    show(<ReportAccidentScreen device="desk" live={liveReport({ onSend })} />);
    expect(screen.getByRole('combobox', { name: /^Name/ })).toHaveTextContent('Ravi K. (me)');
    await ue.type(screen.getByRole('textbox', { name: /Time/ }), '9:15 am');
    await ue.tab();
    await ue.click(screen.getByRole('combobox', { name: /Location/ }));
    await ue.click(await screen.findByRole('option', { name: 'Chennai office' }));
    await ue.type(screen.getByRole('textbox', { name: /Where exactly/ }), 'Stores');
    await ue.type(screen.getByRole('textbox', { name: /What happened/ }), 'A box fell from the top shelf on my foot.');
    await ue.click(screen.getByRole('combobox', { name: /Injury type/ }));
    await ue.click(await screen.findByRole('option', { name: 'Crush' }));
    await ue.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Choose one of the injury types in the list.')).toBeInTheDocument();
  });
});

describe('HLP-12 Accident case workspace (live)', () => {
  it('the safety team sees the case, the ESIC clock from the rule set and the members', () => {
    show(<AccidentWorkspaceScreen live={liveAccident()} />);
    expect(screen.getByText('Crush, Packing line 2')).toBeInTheDocument();
    expect(screen.getByText('ESI covered')).toBeInTheDocument();
    expect(screen.getAllByText('ESIC accident report (employer’s report)').length).toBeGreaterThan(0);
    expect(screen.getByText('The injured person’s manager')).toBeInTheDocument();
  });

  it('Review report shows the details to print; Mark submitted records the date with a toast', async () => {
    const onFiled = vi.fn().mockResolvedValue(undefined);
    show(<AccidentWorkspaceScreen live={liveAccident({ onFiled, start: { tab: 'statutory' } })} />);
    await ue.click(screen.getByRole('button', { name: 'Review report' }));
    const form = await screen.findByRole('dialog', { name: /ESIC accident report/ });
    expect(within(form).getByText('3110012345')).toBeInTheDocument();
    await ue.click(within(form).getByRole('button', { name: 'Done' }));
    await ue.click(screen.getByRole('button', { name: 'Mark submitted' }));
    const d = await screen.findByRole('dialog', { name: 'Filed on the ESIC portal' });
    await ue.type(within(d).getByRole('textbox', { name: /Acknowledgement number/ }), 'ESIC/ACC/1');
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(onFiled).toHaveBeenCalledWith({ on: '2026-11-04', ack: 'ESIC/ACC/1' });
    expect((await screen.findAllByText('ESIC report marked submitted')).length).toBeGreaterThan(0);
  });

  it('submitted: the acknowledgement shows and the buttons go', () => {
    show(<AccidentWorkspaceScreen live={liveAccident({ detail: ACC_SUBMITTED, start: { tab: 'statutory' } })} />);
    expect(screen.getByRole('textbox', { name: /Acknowledgement number/ })).toHaveValue('ESIC/ACC/2026/0917743');
    expect(screen.queryByRole('button', { name: 'Mark submitted' })).not.toBeInTheDocument();
  });

  it('a contract worker late: "contractor hasn\'t filed" and Mark contractor filed', () => {
    show(<AccidentWorkspaceScreen live={liveAccident({ detail: ACC_CONTRACT, start: { tab: 'statutory' } })} />);
    expect(screen.getByText("The contractor hasn't filed yet")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark contractor filed' })).toBeInTheDocument();
  });

  it('not ESI covered: the EC claim with the interest estimate', () => {
    show(<AccidentWorkspaceScreen live={liveAccident({ detail: ACC_NON_ESI, start: { tab: 'statutory' } })} />);
    expect(screen.getByText('Employee’s Compensation claim')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Interest (estimate)')).toBeInTheDocument();
  });

  it('ESI cover unknown: asks for it; case details use the joined Segment; a bad IP number is refused before sending', async () => {
    const onFacts = vi.fn().mockResolvedValue(undefined);
    show(<AccidentWorkspaceScreen live={liveAccident({ detail: ACC_ESI_UNKNOWN, onFacts, start: { tab: 'statutory' } })} />);
    await ue.click(screen.getByRole('button', { name: 'Record ESI cover' }));
    const d = await screen.findByRole('dialog', { name: 'Case details' });
    await ue.click(within(d).getByRole('radio', { name: 'No' }));
    await ue.type(within(d).getByRole('textbox', { name: /ESIC IP number/ }), '123');
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(await within(d).findByText('The ESIC IP number has 10 or 17 digits.')).toBeInTheDocument();
    expect(onFacts).not.toHaveBeenCalled();
    await ue.clear(within(d).getByRole('textbox', { name: /ESIC IP number/ }));
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(onFacts).toHaveBeenCalledWith({ esiCovered: false, hospital: 'ESI dispensary, Hosur' });
  });

  it('a medical record: pressed too early, then added with a toast', async () => {
    const onMedical = vi.fn().mockResolvedValue(undefined);
    show(<AccidentWorkspaceScreen live={liveAccident({ onMedical, start: { tab: 'medical', dialog: 'medical' } })} />);
    const d = screen.getByRole('dialog', { name: 'Add medical record' });
    await ue.click(within(d).getByRole('button', { name: 'Add record' }));
    expect(await within(d).findByText('Write what it says.')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /What it says/ }), 'Fit for light duty from 10 Nov');
    await ue.click(within(d).getByRole('button', { name: 'Add record' }));
    expect(onMedical).toHaveBeenCalledWith({ kind: 'diagnosis', note: 'Fit for light duty from 10 Nov' }, null);
    expect(await screen.findByText('Medical record added')).toBeInTheDocument();
  });

  it('closing with a deadline open shows the refusal as a toast', async () => {
    const onClose = vi.fn().mockRejectedValue(Object.assign(new Error('Record the filings and payments first: a deadline is still open.'), { status: 409 }));
    show(<AccidentWorkspaceScreen live={liveAccident({ onClose })} />);
    await ue.click(screen.getByRole('button', { name: 'Close case' }));
    expect((await screen.findAllByText('Record the filings and payments first: a deadline is still open.')).length).toBeGreaterThan(0);
  });

  it('the manager sees leave dates only; anyone else sees Not found', () => {
    const { unmount } = show(<AccidentWorkspaceScreen live={liveAccident({ detail: ACC_MANAGER })} />);
    expect(screen.getByText('Injury leave · Sathish Kumar')).toBeInTheDocument();
    expect(screen.queryByText(/Packing line/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fracture/)).not.toBeInTheDocument();
    unmount();
    show(<AccidentWorkspaceScreen live={liveAccident({ state: 'not-found', detail: null })} />);
    expect(screen.getByText('Not found')).toBeInTheDocument();
    expect(screen.queryByText(ACC_DETAIL.description)).not.toBeInTheDocument();
  });
});

describe('HLP-12 in Speak up and its set-up', () => {
  it('the fourth choice sends people to the accident report', async () => {
    show(<SpeakUpScreen live={liveSpeakUp({ accidentHref: '/yx/desk/accidents/report' })} />);
    await ue.click(screen.getByRole('radio', { name: /A workplace accident or injury/ }));
    expect(screen.getByRole('button', { name: 'Continue to the accident report' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'File report' })).not.toBeInTheDocument();
  });

  it('the set-up has a Safety team list and warns while it is empty', () => {
    const base = liveSetup();
    show(<SpeakUpSetupScreen live={{ ...base, data: { ...base.data!, members: base.data!.members.filter((m) => m.team !== 'safety') } }} />);
    expect(screen.getByText('Safety team')).toBeInTheDocument();
    expect(screen.getByText(/Add the safety team: until then accident reports are refused./)).toBeInTheDocument();
  });
});
