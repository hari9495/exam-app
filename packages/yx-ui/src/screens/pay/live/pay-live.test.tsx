import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VerifyPageScreen } from '../../portals/t9-workforce';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('The verify page', () => {
  it('the verify page says whether a document is current, in plain words', async () => {
    const onCheck = vi.fn(async () => ({ company: 'Kaveri Foods', kind: 'Payslip', name: 'Arjun Kulkarni', issuedOn: '2026-10-09', status: 'superseded' as const }));
    render(<VerifyPageScreen tenant="YukthiX" docs={[]} code="ABCDEFGHJK" live={{ onCheck }} />);
    // The code from the address is checked at once.
    expect(await screen.findByText('This document was replaced by a newer version')).toBeInTheDocument();
    expect(onCheck).toHaveBeenCalledWith('ABCDEFGHJK');
    // A short code: Verify says what is missing and does not ask the server.
    await ue.clear(screen.getByRole('textbox', { name: /Verification code/ }));
    await ue.type(screen.getByRole('textbox', { name: /Verification code/ }), 'ABC');
    await ue.click(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByText('Enter the 10-letter code printed on the document.')).toBeInTheDocument();
    expect(onCheck).toHaveBeenCalledTimes(1);
  });
});
