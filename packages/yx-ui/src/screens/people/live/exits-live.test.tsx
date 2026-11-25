import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AlumniPortalScreen, NomineePortalScreen, type LivePortalDoc } from '../../portals/t9-workforce';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const DOCS: LivePortalDoc[] = [
  { id: 'ps', kind: 'Payslip', title: 'Payslip October 2026', issuedOn: '2026-10-31', period: 'FY 2026-27' },
  { id: 'f16', kind: 'Form 16', title: 'Form 16 FY 2025-26', issuedOn: '2026-06-12' },
  { id: 'l', kind: 'Letter', title: 'Relieving letter', issuedOn: '2026-10-30' },
];
const live = { company: 'Kaveri Foods', name: 'Ravi', email: 'ravi@example.in', lastDay: '2026-10-30', accessUntil: '2033-10-30', today: '2026-11-03', docs: DOCS, onSignOut: vi.fn() };

describe('Alumni (T9-02 live)', () => {
  it('alumni see payslips, Form 16 and letters in the designed tabs', async () => {
    const onDownload = vi.fn(async () => ({}));
    render(<AlumniPortalScreen live={{ ...live, onDownload }} />);
    expect(screen.getByText(/Access ends 30 Oct 2033/)).toBeInTheDocument();
    expect(screen.getByText('Payslip October 2026')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalledWith(DOCS[0]);
    await ue.click(screen.getByRole('tab', { name: /Letters/ }));
    expect(screen.getByText('Relieving letter')).toBeInTheDocument();
  });

  it('a refused download says why', async () => {
    render(<AlumniPortalScreen live={{ ...live, onDownload: async () => Promise.reject(new Error('This file was deleted after the keeping period.')) }} />);
    await ue.click(screen.getByRole('button', { name: 'Download' }));
    expect(await screen.findByText('This file was deleted after the keeping period.')).toBeInTheDocument();
  });

  it('a nominee sees the documents released for the claims', () => {
    render(<NomineePortalScreen live={{ ...live, onDownload: vi.fn() }} />);
    expect(screen.getByText("Documents for Ravi's claims")).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(3);
  });
});
