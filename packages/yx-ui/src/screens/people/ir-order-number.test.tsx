import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DecideDialog, orderNumberProblem } from './live/special';
import { VrsScheme } from './relations';
import type { IrPermission } from './live/types';

// Founder 2 Nov 2026 (pay gaps, item 1): an optional government order number with a granted permission (People › Exits,
// PPL-40), checked as the API checks it, shown in the list and on the PAY-11 run.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const REQ: IrPermission = { id: 'ir1', legalEntityId: 'le1', kind: 'retrenchment', workersAffected: 12, reasons: 'Line closed', appliedOn: '2026-09-01', authority: 'Labour Commissioner, Chennai', status: 'applied', decidedOn: null, version: 1 };

describe('order number on the government permission', () => {
  it('the rule: empty is fine; letters, digits and . / ( ) - & , : _ up to 60', () => {
    expect(orderNumberProblem('')).toBeNull();
    expect(orderNumberProblem(' L-42011/12/2026-IR(M) ')).toBeNull();
    expect(orderNumberProblem('L-1 <b>')).toBe('Use letters, digits, spaces and . / ( ) - & , : _ only.');
    expect(orderNumberProblem('-L1')).not.toBeNull();
    expect(orderNumberProblem('A'.repeat(60))).toBeNull();
    expect(orderNumberProblem('A'.repeat(61))).toBe('Keep the order number to 60 characters.');
  });

  it('granted: sent trimmed with the decision; a bad one is refused in the dialog with the focus on it', async () => {
    const onDecide = vi.fn(async () => undefined);
    render(<DecideDialog r={REQ} today="2026-09-29" onClose={vi.fn()} onDecide={onDecide} />);
    const dialog = screen.getByRole('dialog');
    const field = within(dialog).getByRole('textbox', { name: /Order number/ });
    await ue.type(field, 'L-1 <b>');
    await ue.click(within(dialog).getByRole('button', { name: 'Save decision' }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Use letters, digits, spaces and . / ( ) - & , : _ only.')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(field));
    await ue.clear(field);
    await ue.type(field, ' L-42011/12/2026-IR(M) ');
    await ue.click(within(dialog).getByRole('button', { name: 'Save decision' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(REQ, { status: 'granted', decidedOn: '2026-09-29', orderNumber: 'L-42011/12/2026-IR(M)' }));
  });

  it('left empty, or a refusal: no order number is sent (the field is only for a grant)', async () => {
    const onDecide = vi.fn(async () => undefined);
    const { unmount } = render(<DecideDialog r={REQ} today="2026-09-29" onClose={vi.fn()} onDecide={onDecide} />);
    await ue.click(screen.getByRole('button', { name: 'Save decision' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(REQ, { status: 'granted', decidedOn: '2026-09-29' }));
    unmount();
    onDecide.mockClear();
    render(<DecideDialog r={REQ} today="2026-09-29" onClose={vi.fn()} onDecide={onDecide} initialOrderNumber="L-9" />);
    await ue.click(screen.getByRole('radio', { name: 'Refused' }));
    expect(screen.queryByRole('textbox', { name: /Order number/ })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Save decision' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(REQ, { status: 'refused', decidedOn: '2026-09-29' }));
  });

  it('the stories: the error state shows at once; the permissions list shows the order number', () => {
    const e = render(<DecideDialog r={REQ} today="2026-09-29" onClose={vi.fn()} onDecide={vi.fn()} initialOrderNumber="L-42011 <copy>" pressed />);
    expect(screen.getByText('Use letters, digits, spaces and . / ( ) - & , : _ only.')).toBeInTheDocument();
    e.unmount();
    render(<VrsScheme tab="permissions" />);
    expect(screen.getByText(/order no\. L-42011\/12\/2026-IR\(M\), granted 18 Sep 2026/)).toBeInTheDocument();
  });
});
