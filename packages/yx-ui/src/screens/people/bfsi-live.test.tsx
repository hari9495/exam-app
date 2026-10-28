import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BfsiComplianceList, BfsiDeclarations, type LiveBfsi, type LiveBfsiRegister } from './selfservice';

// PPL-43 live: a designated person's annual declarations, and the compliance officer's register.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const mine = (o: Partial<LiveBfsi> = {}): LiveBfsi => ({
  state: 'ready', onRetry: vi.fn(), cycle: '2026-27', due: day('2026-10-15'), submittedAt: null,
  holdings: [{ id: 'h1', security: 'Deccan Agro Industries Ltd', quantity: 350, how: 'Demat · NSDL' }],
  related: [{ id: 'r1', name: 'Shalini Kulkarni', relation: 'Spouse', pan: 'XXXXXX4411', holdings: null }],
  coi: null,
  onAddHolding: vi.fn(async () => undefined), onRemoveHolding: vi.fn(async () => undefined), onAddRelated: vi.fn(async () => undefined), onRemoveRelated: vi.fn(async () => undefined),
  onSaveCoi: vi.fn(async () => undefined), onSubmit: vi.fn(async () => undefined), ...o,
});

describe('PPL-43 annual declarations, live', () => {
  it('shows the year, the due date and what is declared; adds a holding and a related person', async () => {
    const live = mine();
    render(<BfsiDeclarations today={day('2026-09-29')} live={live} />);
    expect(screen.getByRole('heading', { name: 'Annual declarations 2026–27' })).toBeInTheDocument();
    expect(screen.getByText('Due in 16 days')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Deccan Agro Industries Ltd 350 Demat · NSDL/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add holding' }));
    let dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Add holding' }));
    expect(within(dialog).getByText('Enter the security.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a quantity of 1 or more.')).toBeInTheDocument();
    expect(live.onAddHolding).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Security/ }), 'Nilgiri Logistics Ltd');
    await ue.type(within(dialog).getByRole('textbox', { name: /Quantity/ }), '1000');
    await ue.click(within(dialog).getByRole('button', { name: 'Add holding' }));
    await waitFor(() => expect(live.onAddHolding).toHaveBeenCalledWith({ security: 'Nilgiri Logistics Ltd', quantity: 1000 }));
    await ue.click(screen.getByRole('button', { name: 'Remove Deccan Agro Industries Ltd' }));
    expect(live.onRemoveHolding).toHaveBeenCalledWith('h1');
    await ue.click(screen.getByRole('tab', { name: 'Related persons' }));
    expect(screen.getByRole('row', { name: /Shalini Kulkarni Spouse XXXXXX4411 None/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add related person' }));
    dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Suman Kulkarni');
    await ue.click(within(dialog).getByRole('combobox', { name: 'Relation' }));
    await ue.click(await screen.findByRole('option', { name: 'Mother' }));
    await ue.type(within(dialog).getByRole('textbox', { name: /PAN/ }), 'BRGPR7712');
    await ue.tab();
    expect(within(dialog).getByText('Enter a 10-character PAN like ABCDE1234F.')).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Add related person' }));
    expect(within(dialog).getByText('Enter a 10-character PAN like ABCDE1234F.')).toBeInTheDocument();
    expect(live.onAddRelated).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /PAN/ }), 'k');
    await ue.click(within(dialog).getByRole('button', { name: 'Add related person' }));
    await waitFor(() => expect(live.onAddRelated).toHaveBeenCalledWith({ name: 'Suman Kulkarni', relation: 'Mother', pan: 'BRGPR7712K' }));
  });

  it('attesting needs the conflict question answered and the code agreed; it saves then submits', async () => {
    const live = mine();
    render(<BfsiDeclarations today={day('2026-09-29')} live={live} />);
    await ue.click(screen.getByRole('tab', { name: 'Code of conduct' }));
    expect(screen.getByRole('button', { name: 'Send OTP to attest' })).toBeDisabled();
    expect(screen.getByText('Answer the conflict of interest question before you attest.')).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Conflict of interest' }));
    await ue.click(screen.getByRole('radio', { name: 'Yes' }));
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'My brother supplies packaging');
    await ue.click(screen.getByRole('tab', { name: 'Code of conduct' }));
    await ue.click(screen.getByRole('checkbox', { name: /I have read and will follow the code of conduct, 2026–27/ }));
    await ue.click(screen.getByRole('button', { name: 'Send OTP to attest' }));
    await waitFor(() => expect(live.onSubmit).toHaveBeenCalled());
    expect(live.onSaveCoi).toHaveBeenCalledWith({ answer: 'yes', details: 'My brother supplies packaging' });
  });

  it('submitted: read-only; overdue shows as overdue', () => {
    const { unmount } = render(<BfsiDeclarations today={day('2026-09-29')} live={mine({ submittedAt: day('2026-09-20') })} />);
    expect(screen.getByText('Submitted on 20 Sep 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add holding' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    unmount();
    render(<BfsiDeclarations today={day('2026-10-20')} live={mine()} />);
    expect(screen.getByText('Overdue by 5 days')).toBeInTheDocument();
  });
});

describe('PPL-43 compliance officer register, live', () => {
  const reg = (o: Partial<LiveBfsiRegister> = {}): LiveBfsiRegister => ({
    state: 'ready', onRetry: vi.fn(),
    rows: [
      { employeeId: 'e1', name: 'Arjun Kulkarni', due: day('2026-10-15'), status: 'Pending' },
      { employeeId: 'e2', name: 'Priya Nair', due: day('2026-10-15'), status: 'Done' },
    ],
    onExport: vi.fn(), onRemind: vi.fn(async () => undefined),
    onReview: vi.fn(async () => ({ submittedAt: day('2026-09-20'), holdings: [{ id: 'h', security: 'Deccan Agro', quantity: 80, how: null }], related: [], coi: { answer: 'no' as const, details: null } })),
    people: [{ value: 'e9', label: 'Sana Nizami · KF0090' }], onDesignate: vi.fn(async () => undefined), onUndesignate: vi.fn(async () => undefined), ...o,
  });

  it('reminds the pending, reviews the done, exports, and adds a designated person', async () => {
    const live = reg();
    render(<BfsiComplianceList live={live} />);
    await ue.click(within(screen.getByRole('row', { name: /Arjun Kulkarni/ })).getByRole('button', { name: 'Remind' }));
    expect(live.onRemind).toHaveBeenCalledWith('e1');
    await ue.click(within(screen.getByRole('row', { name: /Priya Nair/ })).getByRole('button', { name: 'Review' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Priya Nair · annual declaration')).toBeInTheDocument();
    expect(within(drawer).getByText('Deccan Agro')).toBeInTheDocument();
    await ue.click(within(drawer).getAllByRole('button', { name: 'Close' }).at(-1)!);
    await ue.click(screen.getByRole('button', { name: 'Export register' }));
    expect(live.onExport).toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Add designated person' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('combobox', { name: 'Person' }));
    await ue.click(await screen.findByRole('option', { name: 'Sana Nizami · KF0090' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Add designated person' }));
    await waitFor(() => expect(live.onDesignate).toHaveBeenCalledWith('e9'));
  });

  it('a failed reminder says why', async () => {
    render(<BfsiComplianceList live={reg({ onRemind: vi.fn(async () => Promise.reject(new Error('This year’s declaration is already submitted.'))) })} />);
    await ue.click(screen.getByRole('button', { name: 'Remind' }));
    expect(await screen.findByText('This year’s declaration is already submitted.')).toBeInTheDocument();
  });
});
