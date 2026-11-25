import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BoardNoticeSteps } from './board-notice';

// DPDP Rule 7 (founder, 13 Nov 2026): notify the Board now, then the detailed report; both verify with counsel.
describe('BoardNoticeSteps', () => {
  it('shows both steps with the counsel mark; marking needs a note, then sends the time and the note', async () => {
    const onMark = vi.fn().mockResolvedValue(undefined);
    render(<BoardNoticeSteps notice={null} dpdpDueAt="2026-11-16T10:00:00Z" dpdpHours={72} onMark={onMark} />);
    expect(screen.getByText('Verify with counsel')).toBeTruthy();
    expect(screen.getByText('1. Notify the Board now')).toBeTruthy();
    expect(screen.getByText('2. Detailed report (within 72 hours)')).toBeTruthy();
    const ue = userEvent.setup();
    await ue.click(screen.getByRole('button', { name: 'Mark first notice sent' }));
    expect(onMark).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 5 characters/)).toBeTruthy();
    await ue.type(screen.getByRole('textbox', { name: /Note/ }), 'Emailed the Board, ref DPB-1');
    await ue.click(screen.getByRole('button', { name: 'Mark first notice sent' }));
    expect(onMark).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), 'Emailed the Board, ref DPB-1');
  });

  it('once marked: when, who and the note; nothing to mark again', () => {
    render(<BoardNoticeSteps notice={{ at: '2026-11-13T10:00:00Z', by: 'Asha', note: 'Emailed, ref DPB-1' }} dpdpDueAt="2026-11-16T10:00:00Z" onMark={vi.fn()} />);
    expect(screen.getByText(/Sent .* by Asha: Emailed, ref DPB-1/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark first notice sent' })).toBeNull();
  });
});
