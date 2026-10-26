import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AlumniScreen, ResignationScreen } from './exits';
import type { MyResignation } from './types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Me › Resign (PPL-18)', () => {
  const data: MyResignation = { today: '2026-10-09', notice: { period: '30d', label: '30 days', standardLwd: '2026-11-08', onProbation: false }, reasons: ['better_opportunity', 'family'], current: null, last: null };
  it('shows the notice and the last day before sending; Resign waits for a reason and own words', async () => {
    const onResign = vi.fn(async () => ({}));
    render(<ResignationScreen state="ready" data={data} onResign={onResign} onWithdraw={vi.fn()} interviewHref="/i" />);
    expect(screen.getByText('30 days')).toBeInTheDocument();
    expect(screen.getByText('8 Nov 2026')).toBeInTheDocument();
    const resign = screen.getByRole('button', { name: 'Resign' });
    expect(resign).toBeDisabled();
    await ue.click(screen.getByRole('combobox', { name: 'Main reason' }));
    await ue.click(screen.getByRole('option', { name: 'Family reasons' }));
    await ue.type(screen.getByRole('textbox', { name: /In your own words/ }), 'Moving home');
    await ue.click(resign);
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send resignation' }));
    expect(onResign).toHaveBeenCalledWith({ reasonCode: 'family', reasonText: 'Moving home', requestedLwd: null });
  });

  it('a hold shows only the neutral message', () => {
    const current = { id: 'k', employeeId: 'e', exitType: 'resignation' as const, typeLabel: 'Resignation', initiatedBy: 'employee' as const, reasonCode: 'family', reasonText: 'x', submittedOn: '2026-10-01', requestedLwd: null, noticePeriod: '30d', noticeLabel: '30 days', standardLwd: '2026-10-31', approvedLwd: '2026-10-31', lastDay: '2026-10-31', noticeArrangement: null, status: 'accepted' as const, pendingChange: null, lettersHeld: true, version: 2, interview: 'sent' as const };
    render(<ResignationScreen state="ready" data={{ ...data, current }} onResign={vi.fn()} onWithdraw={vi.fn()} interviewHref="/i" />);
    expect(screen.getByText('Your relieving letter is on hold')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Answer the exit interview' })).toHaveAttribute('href', '/i');
  });
});

describe('Alumni', () => {
  it('alumni see their letters', async () => {
    const onDownload = vi.fn(async () => ({}));
    const letter = { id: 'l', title: 'Relieving letter: Ravi', letterType: 'relieving', personId: 'p', referenceNo: 'KF/REL/2026/000001', verifyCode: null, status: 'issued' as const, renderError: null, issuedAt: null, personSigns: false, acceptedAt: null, signature: null, supersededById: null };
    render(<AlumniScreen data={{ company: 'Kaveri Foods', name: 'Ravi', lastDay: '2026-10-30', accessUntil: '2033-10-30', letters: [letter] }} onDownload={onDownload} onSignOut={vi.fn()} />);
    expect(screen.getByText(/until 30 Oct 2033/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalledWith(letter);
  });
});
