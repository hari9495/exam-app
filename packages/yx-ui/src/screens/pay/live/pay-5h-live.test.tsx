import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsultantsScreen } from './consultants';
import { ENTITIES } from './fixtures-ops';
import { CONSULTANTS, INVOICES } from './pay-5h-live.stories';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const fn = () => vi.fn(async () => ({}) as never);
const props = () => ({
  state: 'ready' as const,
  entities: ENTITIES,
  consultants: CONSULTANTS,
  invoices: INVOICES,
  batches: [],
  can: { manage: true, release: true },
  onCreate: fn(),
  onBankCheck: fn(),
  onCertificate: fn(),
  onInvoice: fn(),
  onInvoiceFile: fn(),
  onAdvice: fn(),
  onPayout: fn(),
  onDownloadBatch: fn(),
  onRelease: fn(),
  onResults: fn(),
});

describe('consultant screens', () => {
  it('only approved or failed invoices can be picked for a bank file, with the total to pay', async () => {
    const p = props();
    render(<ConsultantsScreen {...p} />);
    expect(screen.queryByRole('checkbox', { name: 'Pay invoice NW-77' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: 'Pay invoice INV-001' }));
    await ue.click(screen.getByRole('checkbox', { name: 'Pay invoice NW-76' }));
    expect(screen.getByText(/2 to pay/)).toHaveTextContent('81,500.00');
    await ue.click(screen.getByRole('button', { name: 'Make bank file' }));
    await ue.type(screen.getByRole('textbox', { name: /Pay from account/ }), '123456789012');
    await ue.click(screen.getAllByRole('button', { name: 'Make bank file' }).at(-1)!);
    await waitFor(() => expect(p.onPayout).toHaveBeenCalledWith(['i1', 'i4'], '123456789012'));
  });

  it('a new consultant: errors only after trying to save; the PAN is checked', async () => {
    const p = props();
    render(<ConsultantsScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Add consultant' }));
    await ue.type(screen.getByRole('textbox', { name: /^PAN/ }), 'BAD');
    expect(screen.queryByText(/Fix these/)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText(/Fix these/)).toBeInTheDocument();
    expect(p.onCreate).not.toHaveBeenCalled();
  });
});
