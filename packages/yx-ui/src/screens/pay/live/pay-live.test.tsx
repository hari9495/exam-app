import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuditScreen } from './audit';
import { ExchangeFilesScreen, VerifyDocumentScreen } from './documents';
import { PayPeriodsScreen, ReopenRequestsScreen } from './periods';
import type { ExchangeFiles, PayPeriods, ReopenRequest } from './types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

const PERIODS: PayPeriods = {
  year: '2026',
  today: '2026-10-09',
  entities: [
    {
      id: 'e1',
      name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)',
      shortName: 'KFPL-TN',
      canRequestReopen: true,
      months: [
        { month: '2026-08', periodId: 'p8', stage: 'open', lockedAt: null, lockedBy: null, changedAt: null, changedBy: null, reason: null, reopenRequestId: null, corrections: { pending: 0, approved: 0 } },
        { month: '2026-09', periodId: 'p9', stage: 'locked', lockedAt: '2026-10-02T05:00:00Z', lockedBy: 'Lakshmi Venkatesan', changedAt: '2026-10-02T05:00:00Z', changedBy: 'Lakshmi Venkatesan', reason: null, reopenRequestId: null, corrections: { pending: 1, approved: 2 } },
      ],
    },
  ],
};

const REQUEST: ReopenRequest = {
  id: 'r1',
  entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)',
  legalEntityId: 'e1',
  month: '2026-09',
  stage: 'locked',
  reason: 'A late overtime claim was approved after the lock',
  status: 'pending',
  requestedBy: 'Suresh Pillai',
  requestedByMe: false,
  at: '2026-10-09T05:00:00Z',
  decidedAt: null,
  steps: [
    { name: 'Payroll check', state: 'approved', approvers: ['Meena Raghavan'], decidedBy: [{ who: 'Meena Raghavan', action: 'approved', reason: null, at: '2026-10-09T06:00:00Z' }] },
    { name: 'Finance or System Admin', state: 'open', approvers: ['Neha Joshi'], decidedBy: [] },
  ],
  canDecide: true,
  phrase: 'REOPEN KFPL-TN 2026-09',
};

describe('Pay periods (PAY-1.02)', () => {
  it('shows each month with its stage; asking to reopen a locked month needs a reason first', async () => {
    const onAskReopen = vi.fn(async () => ({}));
    render(<PayPeriodsScreen state="ready" data={PERIODS} year="2026" onYear={() => undefined} onHistory={vi.fn()} onAskReopen={onAskReopen} onOpenRequests={() => undefined} />);
    const table = screen.getByRole('table', { name: 'Kaveri Foods Pvt Ltd (Tamil Nadu) pay periods' });
    const sept = within(table).getByRole('row', { name: /September 2026/ });
    expect(within(sept).getByText('Locked')).toBeInTheDocument();
    expect(within(sept).getByText('2 approved, 1 waiting')).toBeInTheDocument();
    expect(within(within(table).getByRole('row', { name: /August 2026/ })).queryByRole('button', { name: 'Ask to reopen' })).toBeNull();
    await ue.click(within(sept).getByRole('button', { name: 'Ask to reopen' }));
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Send for approval' }));
    expect(onAskReopen).not.toHaveBeenCalled();
    expect(within(sheet).getAllByText(/Say why in a sentence/).length).toBeGreaterThan(0);
    await ue.type(within(sheet).getByRole('textbox', { name: /Why/ }), 'A late overtime claim was approved');
    await ue.click(within(sheet).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onAskReopen).toHaveBeenCalledWith('e1', '2026-09', 'A late overtime claim was approved'));
  });
});

describe('Reopen requests (YX-LOCK-05)', () => {
  it('shows both steps; approving needs the typed phrase and sends what was shown', async () => {
    const onDecide = vi.fn(async () => ({}));
    render(<ReopenRequestsScreen state="ready" data={[REQUEST]} me="Neha Joshi" onDecide={onDecide} />);
    expect(screen.getByText('1 request is waiting for you.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    const sheet = screen.getByRole('dialog');
    const confirm = within(sheet).getByRole('button', { name: 'Approve' });
    expect(confirm).toBeDisabled();
    await ue.type(within(sheet).getByRole('textbox', { name: /Type REOPEN KFPL-TN 2026-09 to confirm/ }), 'REOPEN KFPL-TN 2026-09');
    await ue.click(confirm);
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('r1', 'approve', null, expect.objectContaining({ phrase: 'REOPEN KFPL-TN 2026-09' })));
  });

  it('turning down asks why', async () => {
    const onDecide = vi.fn(async () => ({}));
    render(<ReopenRequestsScreen state="ready" data={[REQUEST]} me="Neha Joshi" onDecide={onDecide} />);
    await ue.click(screen.getByRole('button', { name: 'Turn down' }));
    const sheet = screen.getByRole('dialog');
    await ue.type(within(sheet).getByRole('textbox', { name: /Why/ }), 'Pay it as a correction');
    await ue.click(within(sheet).getByRole('button', { name: 'Turn down' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('r1', 'reject', 'Pay it as a correction'));
  });
});

describe('Payroll files (PAY-1.11)', () => {
  const FILES: ExchangeFiles = {
    entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' }],
    files: [
      { id: 'f1', legalEntityId: 'e1', kind: 'bank', kindLabel: 'Bank file', month: '2026-07', fileName: 'KFPL-salary-2026-07.csv', sha256: 'a'.repeat(64), sizeBytes: 120, rows: 2, totals: { amount: '126620.00' }, status: 'generated', generatedBy: 'Suresh Pillai', generatedAt: '2026-10-09T05:00:00Z', releasedBy: null, releasedAt: null, madeByMe: false, canRelease: true },
    ],
  };

  it('shows rows, the total in rupees and the hash; release asks for the typed phrase', async () => {
    const onRelease = vi.fn(async () => ({}));
    render(<ExchangeFilesScreen state="ready" data={FILES} me="Meena Raghavan" onDownload={vi.fn()} onRelease={onRelease} />);
    expect(screen.getByText('₹1,26,620.00')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Release' }));
    const sheet = screen.getByRole('dialog');
    await ue.type(within(sheet).getByRole('textbox', { name: /Type RELEASE 2 to confirm/ }), 'RELEASE 2');
    await ue.click(within(sheet).getByRole('button', { name: 'Release the file' }));
    await waitFor(() => expect(onRelease).toHaveBeenCalledWith(FILES.files[0], expect.objectContaining({ phrase: 'RELEASE 2' })));
  });
});

describe('Audit log and the verify page', () => {
  it('shows the chain check and offers export only when allowed', () => {
    render(
      <AuditScreen
        state="ready"
        data={{ entries: [{ id: 'a1', seq: '7', at: '2026-10-09T05:00:00Z', action: 'payroll.period.reopened', entityType: 'pay_period', entityId: 'p9', actor: 'YukthiX system', actorRole: null, details: { month: '2026-09' } }], next: null }}
        chain={{ canVerify: true, checks: [{ at: '2026-10-09T05:00:00Z', result: 'ok', lastSeq: '7', rows: '7', problem: null }] }}
        filters={{}}
        onFilters={() => undefined}
        canExport={false}
        onExport={vi.fn()}
        onVerify={vi.fn()}
        onTimeline={vi.fn()}
      />,
    );
    expect(screen.getByText('Chain OK')).toBeInTheDocument();
    expect(screen.getByText('Payroll period reopened')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check now' })).toBeInTheDocument();
  });

  it('the verify page says whether a document is current, in plain words', async () => {
    const onCheck = vi.fn(async () => ({ company: 'Kaveri Foods', kind: 'Payslip', name: 'Arjun Kulkarni', issuedOn: '2026-10-09', status: 'superseded' as const }));
    render(<VerifyDocumentScreen code="ABCDEFGHJK" onCode={() => undefined} onCheck={onCheck} />);
    await ue.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('This document was replaced by a corrected one')).toBeInTheDocument();
  });
});
