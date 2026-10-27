import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { DeathInServiceFlow, type LiveDeath } from './exits';
import type { FnfSettlementView } from '../pay/live/types-5j';

// PPL-23 live: the designed five steps with the case's facts, payees, the F&F split by shares, the claim forms and
// the letters; pay only for those who may see it; Send F&F for approval says why it cannot run.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const PAYEES = { payees: [{ id: 'p1', kind: 'nominee' as const, name: 'Kamala Shankar', relation: 'Wife', sharePercent: '70.00', email: 'k@mail.test', documentId: null }, { id: 'p2', kind: 'nominee' as const, name: 'Divakar Shankar', relation: 'Son', sharePercent: '30.00', email: null, documentId: null }], total: '100.00', complete: true };
const FNF = {
  id: 's1', employeeId: 'e1', exitType: 'death', lwd: '2026-09-14', deadline: '2026-09-16', overdue: false, status: 'open', runId: 'r1', runReference: 'FNF-2026-0041', runStatus: 'draft', secondRunId: null, net: null, workingDaysLeft: 2,
  items: [{ id: 'i1', componentCode: 'gratuity', kind: 'earning', amount: '100000.00', label: null, title: 'Gratuity', how: '', wage: false, auto: true, claim: false, held: null, heldTag: null, inRun: null, byPayroll: false }],
  salary: null, totals: { earnings: '100000.00', wageLines: '0', recoveries: '0', tds: null, statutory: null, rounding: null, net: null, held: '0' }, gratuity: null,
  payees: [{ kind: 'nominee', name: 'Kamala Shankar', relation: 'Wife', sharePercent: '70.00', accountLast4: '3321', ifsc: 'IDIB000H001', amount: null }], noticeWaived: null, version: 1,
} as unknown as FnfSettlementView;

function page(over: Partial<LiveDeath> = {}) {
  const live: LiveDeath = {
    state: 'ready',
    onRetry: () => {},
    name: 'Ravi Shankar',
    about: 'Maintenance Supervisor, Hosur plant',
    diedOn: new Date(2026, 8, 14),
    contact: 'u1',
    contacts: [{ value: 'u1', label: 'Lakshmi Venkatesan' }, { value: 'u2', label: 'Farah Khan' }],
    onContact: vi.fn(async () => {}),
    certificate: { status: 'verified' },
    onCertificate: vi.fn(async () => {}),
    payees: PAYEES,
    successionDocuments: [],
    onSuccession: vi.fn(async () => {}),
    onPayees: vi.fn(async () => {}),
    claims: [{ id: 'c1', department: 'hr', title: 'EDLI claim (Form 5 IF): attest', owner: 'Lakshmi Venkatesan', status: 'open', note: null, recoveryAmount: null, recoveryReason: null, signedOffAt: null, version: 1 }],
    letters: [{ handler: 'letters.condolence', label: 'Letter to the family', timing: 't0', status: 'done', attempts: 1, lastError: null, doneAt: '2026-09-15T00:00:00Z' }],
    onAccess: vi.fn(async () => {}),
    onBack: vi.fn(),
    finishBlocked: 'Payroll sends the F&F for approval.',
    ...over,
  };
  render(
    <ToastProvider>
      <DeathInServiceFlow live={live} />
    </ToastProvider>,
  );
  return live;
}
const next = async (times = 1) => {
  for (let i = 0; i < times; i++) await ue.click(screen.getByRole('button', { name: 'Continue' }));
};

describe('PPL-23 death in service, live', () => {
  it('shows the case, the payees per nominations, no bank accounts to someone who may not see pay, and why it cannot finish', async () => {
    page();
    expect(screen.getByRole('heading', { name: 'Death in service · Late Ravi Shankar' })).toBeInTheDocument();
    expect(screen.getByText(/Maintenance Supervisor, Hosur plant\. Access was revoked at once\..*Compassionate contact: Lakshmi Venkatesan\./)).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /Kamala Shankar/ })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Bank account' })).toBeNull();
    await next(3);
    expect(screen.getByText('Payroll sends the F&F for approval.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send F&F for approval' })).toBeDisabled();
  });

  it('pay: the bank account and each due split by share', async () => {
    page({ settlement: FNF });
    expect(screen.getByRole('columnheader', { name: 'Bank account' })).toBeInTheDocument();
    expect(screen.getByText('XXXX 3321')).toBeInTheDocument();
    expect(screen.getAllByText('Not given yet')).toHaveLength(1);
    await next();
    expect(screen.getByText(/Kamala ₹70,000 · Divakar ₹30,000/)).toBeInTheDocument();
  });

  it('no nomination: legal heirs need the certificate; shares short of 100 % mark the step', async () => {
    page({ payees: { payees: [], total: '0.00', complete: false }, settlement: FNF });
    expect(screen.getByText('No valid nomination on file')).toBeInTheDocument();
    expect(screen.getAllByText(/The shares do not make 100 % yet/).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Change payees' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save payees' }));
    expect(within(screen.getByRole('dialog')).getByText('Enter a name of at least 2 characters.')).toBeInTheDocument();
    await ue.keyboard('{Escape}');
    await next();
    expect(screen.getAllByText('When the payees make 100 %').length).toBeGreaterThan(0);
  });

  it('claim forms and letters; Send nominee access; the contact can change', async () => {
    const live = page();
    await next(2);
    expect(screen.getByText('EDLI claim (Form 5 IF): attest')).toBeInTheDocument();
    await next();
    expect(screen.getByText('Letter to the family')).toBeInTheDocument();
    expect(screen.getByText('Issued')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send nominee access' }));
    expect(live.onAccess).toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: /Details and certificate/ }));
    await ue.click(screen.getByRole('combobox', { name: /Compassionate contact/ }));
    await ue.click(screen.getByRole('option', { name: 'Farah Khan' }));
    expect(live.onContact).toHaveBeenCalledWith('u2');
  });

  it('a refused action shows in the page', async () => {
    page({ onAccess: vi.fn(async () => Promise.reject(new Error('No payee has an email.'))) });
    await next(3);
    await ue.click(screen.getByRole('button', { name: 'Send nominee access' }));
    expect(await screen.findByText('No payee has an email.')).toBeInTheDocument();
  });
});
