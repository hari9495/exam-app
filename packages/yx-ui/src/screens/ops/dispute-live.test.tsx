import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CollectiveDisputeScreen } from './cases-more';
import { CaseListScreen } from './cases';
import { SpeakUpSetupScreen } from './helpdesk-speakup-live';
import { liveCaseList } from './cases-live-samples';
import { liveSetup } from './helpdesk-speakup-live-samples';
import { IRD_APPROVED, IRD_CLOSED, IRD_FILED, IRD_MINE, IRD_PROPOSED, IRD_SENT_BACK, liveDispute } from './dispute-live-samples';

// HLP-13 Collective dispute, live (the designed screen with real records): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const refused = (message: string) => Object.assign(new Error(message), { status: 409 });

describe('HLP-13 dispute workspace (live)', () => {
  it('conciliation: the designed header, demands, next dates from the rule set, and who can see it', () => {
    show(<CollectiveDisputeScreen live={liveDispute()} />);
    expect(screen.getByRole('heading', { name: 'Charter of demands 2026' })).toBeInTheDocument();
    expect(screen.getByText('Confidential. Visible to the industrial relations team of this company. Every view is logged.')).toBeInTheDocument();
    expect(screen.getByText('5 (2 agreed)')).toBeInTheDocument();
    expect(screen.getByText('Agreed at 11 %')).toBeInTheDocument();
    expect(screen.getByText('Time limits from IN.IR.DISPUTE 2020-v1 (verify)')).toBeInTheDocument();
    expect(screen.getByText('Adv. Rohini Kamath')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record settlement' })).toBeInTheDocument();
  });

  it('add a demand: pressed too early says what is missing; filled, it is sent with a toast', async () => {
    const onDemand = vi.fn().mockResolvedValue(undefined);
    show(<CollectiveDisputeScreen live={liveDispute({ onDemand, start: { dialog: 'demand' } })} />);
    const d = screen.getByRole('dialog', { name: 'Add demand' });
    await ue.click(within(d).getByRole('button', { name: 'Add demand' }));
    expect(await within(d).findByText('Write the demand as the charter puts it.')).toBeInTheDocument();
    expect(onDemand).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /^Demand/ }), 'Uniform allowance twice a year');
    await ue.type(within(d).getByRole('textbox', { name: /Union asks/ }), '₹2,000');
    await ue.type(within(d).getByRole('textbox', { name: /Company position/ }), '₹1,000');
    await ue.click(within(d).getByRole('button', { name: 'Add demand' }));
    expect(onDemand).toHaveBeenCalledWith({ text: 'Uniform allowance twice a year', union: '₹2,000', mgmt: '₹1,000' });
    expect((await screen.findAllByText('Demand added')).length).toBeGreaterThan(0);
  });

  it('a demand agreed needs the agreed words (single choice by Segment)', async () => {
    const onDemandUpdate = vi.fn().mockResolvedValue(undefined);
    show(<CollectiveDisputeScreen live={liveDispute({ onDemandUpdate, start: { dialog: 'demand-update', demandId: 'd3' } })} />);
    const d = screen.getByRole('dialog', { name: /D3/ });
    await ue.click(within(d).getByRole('radio', { name: 'Agreed' }));
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(await within(d).findByText('Write what was agreed.')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /Agreed at/ }), 'All shifts');
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(onDemandUpdate).toHaveBeenCalledWith('d3', { status: 'agreed', agreed: 'All shifts' });
  });

  it('log a meeting: a conciliation meeting needs the officer; the minutes paper is uploaded and linked', async () => {
    const onMeeting = vi.fn().mockResolvedValue(undefined);
    const onPaper = vi.fn().mockResolvedValue({ id: 'f-9' });
    show(<CollectiveDisputeScreen live={liveDispute({ onMeeting, onPaper, start: { dialog: 'meeting' } })} />);
    const d = screen.getByRole('dialog', { name: 'Log meeting' });
    await ue.clear(within(d).getByRole('textbox', { name: /Conciliation officer/ }));
    await ue.click(within(d).getByRole('button', { name: 'Log meeting' }));
    expect(await within(d).findByText('Name the conciliation officer.')).toBeInTheDocument();
    expect(within(d).getByText('Choose the day it was held.')).toBeInTheDocument();
    expect(onMeeting).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Held on/ }), '03 Nov 2026');
    await ue.type(within(d).getByRole('textbox', { name: /Conciliation officer/ }), 'Assistant Labour Commissioner, Hosur');
    await ue.type(within(d).getByRole('textbox', { name: /Attended/ }), 'Union office bearers, HR-IR');
    await ue.type(within(d).getByRole('textbox', { name: /What was discussed/ }), 'Transport for all shifts agreed in principle.');
    await ue.upload(d.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF-1.4'], 'minutes.pdf', { type: 'application/pdf' }));
    await vi.waitFor(() => expect(onPaper).toHaveBeenCalledWith('Minutes, conciliation meeting 2026-11-03', expect.any(File)));
    await ue.click(within(d).getByRole('button', { name: 'Log meeting' }));
    expect(onMeeting).toHaveBeenCalledWith({ kind: 'conciliation', on: '2026-11-03', officer: 'Assistant Labour Commissioner, Hosur', attended: 'Union office bearers, HR-IR', minutes: 'Transport for all shifts agreed in principle.', paperId: 'f-9' });
  });

  it('record settlement: pressed too early lists every gap and sends nothing; a refusal stays in the dialog', async () => {
    const onPropose = vi.fn().mockRejectedValue(refused('A settlement is already waiting for approval.'));
    const onPaper = vi.fn().mockResolvedValue({ id: 'f-signed' });
    show(<CollectiveDisputeScreen live={liveDispute({ onPropose, onPaper, start: { tab: 'settlement', dialog: 'settlement' } })} />);
    const d = screen.getByRole('dialog', { name: 'Record settlement' });
    await ue.click(within(d).getByRole('button', { name: 'Record settlement' }));
    expect(await within(d).findByText('Choose the day both sides signed.')).toBeInTheDocument();
    expect(within(d).getByText('Give each worker category and its monthly increase.')).toBeInTheDocument();
    expect(within(d).getByText('Add the signed copy.')).toBeInTheDocument();
    expect(onPropose).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Signed on/ }), '03 Nov 2026');
    await ue.type(within(d).getByRole('textbox', { name: /Takes effect/ }), '01 Apr 2026');
    await ue.type(within(d).getByRole('textbox', { name: /Workers covered/ }), 'All plant workers');
    await ue.type(within(d).getByRole('textbox', { name: /Agreed terms/ }), 'Basic +11 % from 1 April 2026.');
    await ue.click(within(d).getByRole('combobox', { name: 'Worker category 1' }));
    await ue.click(await screen.findByRole('option', { name: 'Skilled' }));
    await ue.type(within(d).getByRole('textbox', { name: /Monthly increase 1/ }), '1650');
    await ue.upload(d.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF-1.4'], 'signed.pdf', { type: 'application/pdf' }));
    await vi.waitFor(() => expect(onPaper).toHaveBeenCalled());
    await ue.click(within(d).getByRole('button', { name: 'Record settlement' }));
    expect(onPropose).toHaveBeenCalledWith({ kind: 'conciliation', signedOn: '2026-11-03', effectiveFrom: '2026-04-01', covered: 'All plant workers', terms: 'Basic +11 % from 1 April 2026.', rates: [{ category: 'skilled', monthlyIncrease: '1650' }], paperId: 'f-signed' });
    expect(await within(d).findByText('A settlement is already waiting for approval.')).toBeInTheDocument();
  });

  it('a second IR member approves: the toast says payroll pays it as usual', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    show(<CollectiveDisputeScreen live={liveDispute({ detail: IRD_PROPOSED, onApprove })} />);
    expect(screen.getByText('This settlement needs your approval')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Approve and send to payroll' })[0]);
    expect(onApprove).toHaveBeenCalled();
    expect((await screen.findAllByText('Settlement approved and sent to payroll arrears')).length).toBeGreaterThan(0);
  });

  it('the person who recorded it cannot approve: no approve button, only a wait note', () => {
    show(<CollectiveDisputeScreen live={liveDispute({ detail: IRD_MINE })} />);
    expect(screen.getByText('Waiting for a second IR member')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve and send to payroll' })).not.toBeInTheDocument();
  });

  it('sent back: the reason stays; approved: payroll arrears and the copy to file; filed and closed: nothing left to do', async () => {
    const { unmount } = show(<CollectiveDisputeScreen live={liveDispute({ detail: IRD_SENT_BACK, start: { tab: 'settlement' } })} />);
    expect(screen.getByText('The effective date should be 1 Apr 2026, as signed.')).toBeInTheDocument();
    unmount();
    const onFiled = vi.fn().mockResolvedValue(undefined);
    const two = show(<CollectiveDisputeScreen live={liveDispute({ detail: IRD_APPROVED, onFiled })} />);
    expect(screen.getByText('Sent to payroll arrears 4 Nov 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log meeting' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Record copy filed' }));
    const d = await screen.findByRole('dialog', { name: 'Record copy filed' });
    await ue.type(within(d).getByRole('textbox', { name: /Receipt or reference/ }), 'ALC/HSR/2026/118');
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(onFiled).toHaveBeenCalledWith({ on: '2026-11-04', ref: 'ALC/HSR/2026/118' });
    two.unmount();
    const three = show(<CollectiveDisputeScreen live={liveDispute({ detail: IRD_FILED })} />);
    expect(screen.queryByRole('button', { name: 'Record copy filed' })).not.toBeInTheDocument();
    three.unmount();
    show(<CollectiveDisputeScreen live={liveDispute({ detail: IRD_CLOSED })} />);
    expect(screen.getByText('The union withdrew the charter after the bonus was paid.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record settlement' })).not.toBeInTheDocument();
  });

  it('close without a settlement needs how it ended (Segment) and a note', async () => {
    const onClose = vi.fn().mockResolvedValue(undefined);
    show(<CollectiveDisputeScreen live={liveDispute({ onClose, start: { dialog: 'close' } })} />);
    const d = screen.getByRole('dialog', { name: 'Close without a settlement' });
    await ue.click(within(d).getByRole('button', { name: 'Close dispute' }));
    expect(await within(d).findByText('Choose how it ended.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('radio', { name: 'Withdrawn' }));
    await ue.type(within(d).getByRole('textbox', { name: /What happened/ }), 'The union withdrew it.');
    await ue.click(within(d).getByRole('button', { name: 'Close dispute' }));
    expect(onClose).toHaveBeenCalledWith({ how: 'withdrawn', note: 'The union withdrew it.' });
  });

  it('not on the IR team: Not found; loading and error in the same look', () => {
    const { unmount } = show(<CollectiveDisputeScreen live={liveDispute({ state: 'not-found', detail: null })} />);
    expect(screen.getByText('Not found')).toBeInTheDocument();
    unmount();
    const two = show(<CollectiveDisputeScreen live={liveDispute({ state: 'loading', detail: null })} />);
    expect(screen.getByRole('status', { name: 'Loading the dispute' })).toBeInTheDocument();
    two.unmount();
    show(<CollectiveDisputeScreen live={liveDispute({ state: 'error', detail: null })} />);
    expect(screen.getByText("We couldn't load this dispute.")).toBeInTheDocument();
  });
});

describe('HLP-13 on the Cases list and in set-up (live)', () => {
  it('the IR team records a dispute: pressed too early shows the gaps; filled, it opens the new dispute', async () => {
    const onRecord = vi.fn().mockResolvedValue({ id: 'ird-3', number: 'IRD-0003' });
    const onOpen = vi.fn();
    show(<CaseListScreen live={liveCaseList({ onOpen, today: new Date(2026, 10, 4), dispute: { locations: [{ id: 'hsr', name: 'Hosur plant' }], onRecord } })} />);
    await ue.click(screen.getByRole('button', { name: 'Record a dispute' }));
    const d = await screen.findByRole('dialog', { name: 'Record a dispute' });
    await ue.click(within(d).getByRole('button', { name: 'Record dispute' }));
    expect(await within(d).findByText('Give the number of workers covered.')).toBeInTheDocument();
    expect(onRecord).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /^Dispute/ }), 'Charter of demands 2027');
    await ue.type(within(d).getByRole('textbox', { name: /Raised by/ }), 'Kaveri Foods Workers Union');
    await ue.type(within(d).getByRole('textbox', { name: /Workers covered/ }), '212');
    await ue.type(within(d).getByRole('textbox', { name: /Charter received on/ }), '02 Nov 2026');
    await ue.click(within(d).getByRole('button', { name: 'Record dispute' }));
    expect(onRecord).toHaveBeenCalledWith({ title: 'Charter of demands 2027', unionName: 'Kaveri Foods Workers Union', locationId: 'hsr', workersCovered: 212, receivedOn: '2026-11-02' });
    expect(onOpen).toHaveBeenCalledWith('ird-3');
  });

  it('answer 85: with unions in payroll’s register the union is chosen from that list (no free text), and sent by id', async () => {
    const onRecord = vi.fn().mockResolvedValue({ id: 'ird-4', number: 'IRD-0004' });
    const unions = [{ id: 'un-kfwu', name: 'Kaveri Foods Workers Union' }];
    show(<CaseListScreen live={liveCaseList({ today: new Date(2026, 10, 4), dispute: { locations: [{ id: 'hsr', name: 'Hosur plant', unions }], onRecord }, start: { recording: true } })} />);
    const d = await screen.findByRole('dialog', { name: 'Record a dispute' });
    expect(within(d).queryByRole('textbox', { name: /Raised by/ })).not.toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /^Dispute/ }), 'Wage revision 2027');
    await ue.type(within(d).getByRole('textbox', { name: /Workers covered/ }), '180');
    await ue.type(within(d).getByRole('textbox', { name: /Charter received on/ }), '02 Nov 2026');
    await ue.click(within(d).getByRole('button', { name: 'Record dispute' }));
    expect(await within(d).findByText('Choose the union.')).toBeInTheDocument();
    expect(onRecord).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('combobox', { name: /Raised by \(union\)/ }));
    await ue.click(await screen.findByRole('option', { name: 'Kaveri Foods Workers Union' }));
    await ue.click(within(d).getByRole('button', { name: 'Record dispute' }));
    expect(onRecord).toHaveBeenCalledWith({ title: 'Wage revision 2027', unionId: 'un-kfwu', locationId: 'hsr', workersCovered: 180, receivedOn: '2026-11-02' });
  });

  it('without the IR team there is no Record a dispute button', () => {
    show(<CaseListScreen live={liveCaseList()} />);
    expect(screen.queryByRole('button', { name: 'Record a dispute' })).not.toBeInTheDocument();
  });

  it('set-up: the System Admin adds an outside lawyer to the IR team (Segment), sent as external', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    show(<SpeakUpSetupScreen live={liveSetup({ onAdd, start: { adding: 'ir' } })} />);
    expect(screen.getAllByText('Outside lawyer').length).toBeGreaterThan(0);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('combobox', { name: /Person/ }));
    await ue.click(await screen.findByRole('option', { name: /Joseph Mathew/ }));
    await ue.click(within(d).getByRole('radio', { name: 'Outside lawyer' }));
    await ue.click(within(d).getByRole('button', { name: /Add/ }));
    expect(onAdd).toHaveBeenCalledWith({ team: 'ir', userId: 'u-joseph', role: 'external' });
  });
});
