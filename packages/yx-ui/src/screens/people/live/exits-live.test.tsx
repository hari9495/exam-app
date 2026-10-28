import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AlumniPortalScreen } from '../../portals/t9-workforce';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Alumni', () => {
  it('alumni see their letters', async () => {
    const onDownload = vi.fn(async () => ({}));
    const letter = { id: 'l', title: 'Relieving letter: Ravi', letterType: 'relieving', personId: 'p', referenceNo: 'KF/REL/2026/000001', verifyCode: null, status: 'issued' as const, renderError: null, issuedAt: null, personSigns: false, acceptedAt: null, signature: null, supersededById: null };
    render(<AlumniPortalScreen live={{ data: { company: 'Kaveri Foods', name: 'Ravi', lastDay: '2026-10-30', accessUntil: '2033-10-30', letters: [letter] }, email: 'ravi@example.in', today: '2026-11-03', onDownload, onSignOut: vi.fn() }} />);
    expect(screen.getByText(/Access ends 30 Oct 2033/)).toBeInTheDocument();
    expect(screen.getByText('Relieving letter')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalledWith(letter);
  });
});
