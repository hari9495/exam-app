import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdvisoriesScreen, LoansScreen, MyDeclarationsScreen, NomineeDrawer, PayslipQueriesScreen, ProofCheckScreen, RegistersScreen, RunPaymentsScreen, TaxCertificatesScreen } from './operations';
import { PAYSLIPS, PEOPLE, RUN } from './fixtures-5j';
import { ADVISORIES, CERTIFICATES, DECLARATIONS, DISBURSEMENTS, ENTITIES, LOANS, PROOFS, QUERIES, REGISTERS } from './fixtures-ops';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const fn = () => vi.fn(async () => ({}) as never);
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';
const search = async () => PEOPLE.map((p) => ({ id: p.employeeId, name: p.name, employeeCode: p.employeeCode ?? undefined }));

describe('payroll operations screens', () => {
  it('payments: a failed bank result needs the bank’s reason, shown only after trying to save', async () => {
    const onResults = fn();
    render(
      <RunPaymentsScreen
        state="ready"
        run={{ ...RUN, status: 'approved' }}
        payslips={PAYSLIPS}
        disbursements={DISBURSEMENTS}
        nameOf={nameOf}
        can={{ record: true }}
        onBack={vi.fn()}
        onResults={onResults}
        onUploadResults={vi.fn(async () => ({ recorded: 1 }))}
        onDisburse={fn()}
      />,
    );
    // s3 is paid in cash, so it is not in the bank list.
    expect(within(screen.getByRole('table', { name: 'Bank payments' })).queryByText('Sridhar Fernandes')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Record the bank result for Arjun Kulkarni' }));
    await ue.click(screen.getByRole('radio', { name: 'Failed' }));
    expect(screen.queryByText(/Fix these/)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Record' }));
    expect(screen.getByText(/Fix these/)).toBeInTheDocument();
    expect(onResults).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Reason from the bank/ }), 'Account closed');
    await ue.click(screen.getByRole('button', { name: 'Record' }));
    await waitFor(() => expect(onResults).toHaveBeenCalledWith([{ payslipId: 's1', status: 'failed', reason: 'Account closed' }]));
  });

  it('payments: a paid result entered by hand says how it is known; the API’s row problems are shown', async () => {
    const onResults = vi.fn(async () => {
      throw Object.assign(new Error('Nothing was recorded. Fix these rows first.'), { body: { problems: ['Row 1: the payslip is pending, not waiting for a bank result.'] } });
    });
    render(<RunPaymentsScreen state="ready" run={{ ...RUN, status: 'approved' }} payslips={PAYSLIPS} disbursements={[]} nameOf={nameOf} can={{ record: true }} onBack={vi.fn()} onResults={onResults} onUploadResults={vi.fn(async () => ({ recorded: 0 }))} onDisburse={fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Record the bank result for Arjun Kulkarni' }));
    await ue.click(screen.getByRole('button', { name: 'Record' }));
    expect(onResults).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /How you know/ }), 'Seen on the statement');
    await ue.click(screen.getByRole('button', { name: 'Record' }));
    expect(await screen.findByText(/not waiting for a bank result/)).toBeInTheDocument();
    expect(onResults).toHaveBeenCalledWith([{ payslipId: 's1', status: 'paid', reason: 'Seen on the statement' }]);
  });

  it('cash and cheque: a cheque needs its number; cash records the day', async () => {
    const onDisburse = fn();
    render(<RunPaymentsScreen state="ready" run={{ ...RUN, status: 'approved' }} payslips={PAYSLIPS} disbursements={DISBURSEMENTS} nameOf={nameOf} can={{ record: true }} onBack={vi.fn()} onResults={fn()} onUploadResults={vi.fn(async () => ({ recorded: 0 }))} onDisburse={onDisburse} />);
    await ue.click(screen.getByRole('tab', { name: 'Cash and cheque' }));
    await ue.click(screen.getByRole('button', { name: 'Record the payment to Sridhar Fernandes' }));
    await ue.click(screen.getByRole('radio', { name: 'Cheque' }));
    await ue.type(screen.getByLabelText(/Paid on/), '2026-10-01');
    await ue.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(screen.getAllByText('A cheque number is 6 to 10 digits.').length).toBeGreaterThan(0);
    await ue.type(screen.getByRole('textbox', { name: /Cheque number/ }), '123456');
    await ue.click(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(onDisburse).toHaveBeenCalledWith({ payslipId: 's3', mode: 'cheque', chequeNo: '123456', paidOn: '2026-10-01' }));
  });

  it('loans: payroll asks for someone else with a person; their own loan cannot be changed by them', async () => {
    const onRequest = fn();
    render(<LoansScreen state="ready" loans={LOANS} nameOf={nameOf} can={{ manage: true }} onSearch={search} onRequest={onRequest} onChange={fn()} />);
    expect(screen.getAllByRole('button', { name: /^Change the loan of/ })).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'New advance or loan' }));
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(onRequest).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Search' }));
    await ue.click(await screen.findByRole('button', { name: /Divya Raghunathan/ }));
    await ue.type(screen.getByRole('textbox', { name: /Amount/ }), '25000');
    await ue.type(screen.getByRole('textbox', { name: /Instalments/ }), '5');
    await ue.type(screen.getByLabelText(/First instalment in/), '2026-11');
    await ue.type(screen.getByRole('textbox', { name: /Why/ }), 'Medical bills');
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onRequest).toHaveBeenCalledWith({ employeeId: 'p2', loanType: 'advance', principal: '25000', instalments: 5, firstMonth: '2026-11', reason: 'Medical bills' }));
  });

  it('loans: a new instalment is above zero and not more than what is left', async () => {
    const onChange = fn();
    render(<LoansScreen state="ready" loans={LOANS} nameOf={nameOf} can={{ manage: true }} onSearch={search} onRequest={fn()} onChange={onChange} />);
    await ue.click(screen.getByRole('button', { name: 'Change the loan of Arjun Kulkarni' }));
    await ue.click(screen.getByRole('radio', { name: 'New instalment' }));
    await ue.type(screen.getByRole('textbox', { name: /New instalment/ }), '25000');
    await ue.type(screen.getByRole('textbox', { name: /Why/ }), 'Asked to repay faster');
    await ue.click(screen.getByRole('button', { name: 'Save change' }));
    expect(onChange).not.toHaveBeenCalled();
    await ue.clear(screen.getByRole('textbox', { name: /New instalment/ }));
    await ue.type(screen.getByRole('textbox', { name: /New instalment/ }), '15000');
    await ue.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(LOANS[0], { kind: 'reschedule', emi: '15000', reason: 'Asked to repay faster' }));
  });

  it('my loans: only mine, and no person to choose', async () => {
    render(<LoansScreen state="ready" loans={LOANS} nameOf={nameOf} mine can={{ manage: false }} onRequest={fn()} onChange={fn()} />);
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await ue.click(screen.getByRole('button', { name: 'Ask for an advance or loan' }));
    expect(screen.queryByRole('radiogroup', { name: 'For' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
  });

  it('payslip queries: payroll replies and closes; its own queries are not here', async () => {
    const onReply = fn();
    const onClose = fn();
    render(<PayslipQueriesScreen state="ready" queries={[...QUERIES, { ...QUERIES[0], id: 'q9', mine: true, employeeId: 'p3' }]} nameOf={nameOf} status="open" onStatus={vi.fn()} onReply={onReply} onClose={onClose} />);
    expect(screen.queryByText('Sridhar Fernandes')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open the query from Arjun Kulkarni' }));
    await ue.type(screen.getByRole('textbox', { name: /Reply/ }), 'HRA follows the new basic from September.');
    await ue.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(onReply).toHaveBeenCalledWith(QUERIES[0], 'HRA follows the new basic from September.'));
    await ue.click(screen.getByRole('button', { name: 'Close query' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(QUERIES[0]));
  });

  it('declarations: rent asks for its months and city; a turned-down proof shows the reason', async () => {
    const onDeclare = fn();
    render(<MyDeclarationsScreen state="ready" data={{ ...DECLARATIONS, lines: [DECLARATIONS.lines[1]] }} certificates={[]} onDeclare={onDeclare} onProof={fn()} onPartA={fn()} />);
    expect(screen.getByText(/last year/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Declare' }));
    await ue.click(screen.getByRole('combobox', { name: /What/ }));
    await ue.click(await screen.findByRole('option', { name: 'Rent paid (HRA)' }));
    await ue.type(screen.getByRole('textbox', { name: /Rent for the year/ }), '180000');
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(onDeclare).not.toHaveBeenCalled();
    await ue.type(screen.getByLabelText(/Rent paid from/), '2026-04');
    await ue.type(screen.getByLabelText(/Rent paid to/), '2027-03');
    await ue.click(screen.getByRole('radio', { name: /Delhi, Mumbai/ }));
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onDeclare).toHaveBeenCalledWith({ subjectKey: 'hra', amount: '180000', rentFrom: '2026-04', rentTo: '2027-03', metro: true }));
  });

  it('declarations: before the proof window opens there is no proof upload, and the day is given', () => {
    render(<MyDeclarationsScreen state="ready" data={{ ...DECLARATIONS, proofWindowOpens: '2099-01-01', lines: [{ ...DECLARATIONS.lines[1], proofStatus: 'none', proofs: [], comment: null }] }} certificates={[]} onDeclare={fn()} onProof={fn()} onPartA={fn()} />);
    expect(screen.getByText(/Proofs open on/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a proof/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Change/ })).toBeInTheDocument();
  });

  it('proof checking: a part acceptance is below what was declared; turning down needs a reason', async () => {
    const onDecide = fn();
    render(<ProofCheckScreen state="ready" lines={PROOFS} status="pending" onStatus={vi.fn()} onFile={fn()} onDecide={onDecide} />);
    await ue.click(screen.getAllByRole('button', { name: /^Decide on/ })[1]);
    await ue.click(screen.getByRole('radio', { name: 'Accept part' }));
    await ue.type(screen.getByRole('textbox', { name: /Amount accepted/ }), '150000');
    await ue.type(screen.getByRole('textbox', { name: /Comment/ }), 'Only the PPF receipt is this year’s');
    await ue.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(onDecide).not.toHaveBeenCalled();
    await ue.clear(screen.getByRole('textbox', { name: /Amount accepted/ }));
    await ue.type(screen.getByRole('textbox', { name: /Amount accepted/ }), '90000');
    await ue.click(screen.getByRole('button', { name: 'Save decision' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(PROOFS[1], { decision: 'partly', amount: '90000', comment: 'Only the PPF receipt is this year’s' }));
  });

  it('registers: freezing asks first; a signed register only downloads', async () => {
    const onFreeze = fn();
    render(<RegistersScreen state="ready" entities={ENTITIES} entityId="e1" onEntity={vi.fn()} month="2026-09" onMonth={vi.fn()} registers={REGISTERS} can={{ generate: true, sign: true, download: true }} onGenerate={fn()} onDownload={fn()} onFreeze={onFreeze} onSign={fn()} onPack={fn()} />);
    expect(screen.getByRole('button', { name: 'Upload the signed Wages register' })).toBeInTheDocument();
    const signed = screen.getByRole('row', { name: /Overtime/ });
    expect(within(signed).getAllByRole('button')).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Freeze the Deductions register' }));
    expect(onFreeze).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Freeze' }));
    await waitFor(() => expect(onFreeze).toHaveBeenCalledWith(REGISTERS[1]));
  });

  it('advisories: marked reviewed with what was done', async () => {
    const onReview = fn();
    render(<AdvisoriesScreen state="ready" entities={ENTITIES} entityId="e1" onEntity={vi.fn()} advisories={ADVISORIES} onReview={onReview} />);
    expect(screen.getAllByRole('button', { name: /^Mark ".*" reviewed$/ })).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Mark "Karnataka minimum wages revised" reviewed' }));
    await ue.type(screen.getByRole('textbox', { name: /What you did/ }), 'Raised two salaries in Mysuru');
    await ue.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith(ADVISORIES[0], 'Raised two salaries in Mysuru'));
  });

  it('advisories: only an https source becomes a link', () => {
    render(<AdvisoriesScreen state="ready" entities={ENTITIES} entityId="e1" onEntity={vi.fn()} advisories={[ADVISORIES[0], { ...ADVISORIES[1], link: 'javascript:alert(1)' }]} onReview={fn()} />);
    expect(screen.getAllByRole('link', { name: 'Read the source' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Read the source' })).toHaveAttribute('href', 'https://labour.karnataka.gov.in/');
  });

  it('certificates: issuing everything ready needs the typed phrase', async () => {
    const onIssueAll = vi.fn(async () => ({ issued: 1, failed: [] }));
    render(
      <TaxCertificatesScreen
        state="ready"
        entities={ENTITIES}
        entityId="e1"
        onEntity={vi.fn()}
        taxYear="2025-26"
        onTaxYear={vi.fn()}
        certificates={CERTIFICATES}
        nameOf={nameOf}
        can={{ importZip: true, issueAll: true }}
        onImportZip={vi.fn(async () => ({ files: 0, matched: 0, unmatched: [] }))}
        onPartA={fn()}
        onIssue={fn()}
        onIssueAll={onIssueAll}
      />,
    );
    await ue.click(screen.getByRole('button', { name: 'Issue 1 ready' }));
    const confirm = screen.getAllByRole('button', { name: 'Issue' }).pop()!;
    expect(confirm).toBeDisabled();
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'ISSUE FORM16 2025-26');
    await ue.click(confirm);
    await waitFor(() => expect(onIssueAll).toHaveBeenCalledWith(expect.objectContaining({ phrase: 'ISSUE FORM16 2025-26' })));
    expect(await screen.findByText('1 issued')).toBeInTheDocument();
  });

  it('nominee: whose documents, an email and a day after today', async () => {
    const onSave = fn();
    render(<NomineeDrawer onSearch={search} onClose={vi.fn()} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Add nominee' }));
    expect(onSave).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Search' }));
    await ue.click(await screen.findByRole('button', { name: /Arjun Kulkarni/ }));
    await ue.type(screen.getByRole('textbox', { name: /Nominee's name/ }), 'Lakshmi Kulkarni');
    await ue.type(screen.getByRole('textbox', { name: /Nominee's email/ }), 'lakshmi@example.com');
    await ue.type(screen.getByLabelText(/Access until/), '2099-12-31');
    await ue.click(screen.getByRole('button', { name: 'Add nominee' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ employeeId: 'p1', name: 'Lakshmi Kulkarni', email: 'lakshmi@example.com', validUntil: '2099-12-31' }));
  });
});
