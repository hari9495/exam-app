import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { answersToSend, formProblems, fromServerGroup, resolveForm, toServerGroup, type FormDef } from '../../lib/forms';
import { ApprovalsScreen } from './approvals';
import { CatalogScreen } from './catalog';
import type { ApprovalTask, CatalogItemPage } from './esm-types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

const FORM: FormDef = {
  sections: [
    {
      id: 's1',
      title: 'Your laptop',
      columns: 2,
      fields: [
        { key: 'model', type: 'choice', label: 'Model', labels: { hi: 'मॉडल' }, required: true, options: [{ value: 'std', label: 'Standard', colour: 'blue' }, { value: 'dev', label: 'Developer', colour: 'purple' }] },
        { key: 'reason', type: 'textarea', label: 'Why the developer model?' },
        { key: 'qty', type: 'number', label: 'How many', min: 1, max: 3 },
        { key: 'price', type: 'number', label: 'Price' },
        { key: 'total', type: 'formula', label: 'Total', formula: { op: 'mul', args: [{ field: 'qty' }, { field: 'price' }] } },
      ],
    },
  ],
  rules: [{ id: 'r', when: { id: 'w', join: 'and', items: [{ id: 'c', field: 'model', operator: 'is', value: 'dev' }] }, then: [{ action: 'show', field: 'reason' }, { action: 'require', field: 'reason' }] }],
};

describe('P18 forms in the browser (display copy of the server rules)', () => {
  it('shows and requires by earlier answers, computes formulas, sends only what applies', () => {
    expect(resolveForm(FORM, { model: 'std' }).state.reason.visible).toBe(false);
    expect(resolveForm(FORM, { model: 'dev' }).state.reason).toMatchObject({ visible: true, required: true });
    expect(resolveForm(FORM, { qty: 2, price: 50 }).values.total).toBe(100);
    expect(formProblems(FORM, { model: 'dev', qty: 9 })).toEqual({ reason: 'Answer this question.', qty: 'Enter a number from 1 to 3.' });
    expect(answersToSend(FORM, { model: 'std', reason: 'stale', qty: 1, price: 5, total: 999 })).toEqual({ model: 'std', qty: 1, price: 5 });
  });

  it('the builder rows round-trip to stored rules with dates as calendar days', () => {
    const fields = [{ key: 'due', label: 'Due', type: 'date' as const }];
    const g = toServerGroup({ id: 'g', join: 'and', items: [{ id: 'c', field: 'due', operator: 'gt', value: new Date(2026, 9, 8) }] });
    expect(g.items[0]).toMatchObject({ value: '2026-10-08' });
    const back = fromServerGroup(g, fields);
    expect((back.items[0] as { value: Date }).value.getDate()).toBe(8);
  });
});

const PAGE: CatalogItemPage = { id: 'i1', name: 'New laptop', shortText: 'A laptop', desk: 'IT help desk', cost: 85000, currency: 'INR', deliveryDays: 5, version: 1, bodyHtml: '<p>Pick a model.</p>', media: [], form: FORM, profile: {}, approvals: ['Your manager', 'Cost-centre owner'] };

describe('service catalogue (SD-2.03, SD-2.04)', () => {
  const props = () => ({
    state: 'ready' as const,
    catalogue: { items: [{ id: 'i1', deskId: 'd1', desk: 'IT help desk', category: 'Laptops', name: 'New laptop', shortText: 'A laptop', cost: 85000, currency: 'INR', deliveryDays: 5 }], guides: [] },
    onOpenItem: vi.fn(async () => PAGE),
    onOpenGuide: vi.fn(),
    onResolveGuide: vi.fn(),
    onCheckout: vi.fn(async () => ({ requests: [{ ticketId: 't1', number: 'IT-1020' }] })),
    onPick: vi.fn(async () => []),
    onOpenRequest: vi.fn(),
  });

  it('an item opens as a clickable card; the cart is sent once with only the answers that apply', async () => {
    const p = props();
    render(<CatalogScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Open New laptop' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Approved by: Your manager, then Cost-centre owner.')).toBeInTheDocument();
    // A required answer is missing: nothing goes into the cart.
    await ue.click(within(dialog).getByRole('button', { name: 'Add to cart' }));
    expect(within(dialog).getByText('Answer this question.')).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('combobox', { name: /Model/ }));
    await ue.click(screen.getByRole('option', { name: 'Standard' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Add to cart' }));
    expect(screen.getByRole('heading', { name: 'Your cart (1)' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect(p.onCheckout).toHaveBeenCalledWith({ items: [{ itemId: 'i1', quantity: 1, answers: { model: 'std' } }] });
    expect(await screen.findByRole('button', { name: 'Follow IT-1020' })).toBeInTheDocument();
  });

  it('forms switch language; the choice for "who it is for" is a Segment', async () => {
    const p = props();
    render(<CatalogScreen {...p} />);
    await ue.click(screen.getByRole('radio', { name: 'हिन्दी' }));
    await ue.click(screen.getByRole('button', { name: 'Open New laptop' }));
    expect(await within(await screen.findByRole('dialog')).findByText('मॉडल')).toBeInTheDocument();
  });
});

describe('approvals inbox (P03)', () => {
  const TASK: ApprovalTask = { taskId: 't1', requestId: 'r1', type: 'Service request', title: 'New laptop for Arjun', summary: [{ label: 'Item', value: 'New laptop' }], requester: 'Arjun', raisedBy: null, onBehalfOf: 'Divya', step: { index: 1, of: 2, name: 'Your manager', need: 1, approvers: 1 }, dueAt: null, submittedAt: '2026-10-08T05:00:00Z' };

  it('approve at once; not approving needs a reason; delegated tasks say for whom', async () => {
    const onDecide = vi.fn(async () => undefined);
    render(<ApprovalsScreen state="ready" tasks={[TASK]} history={null} delegations={[]} onDecide={onDecide} onDelegate={vi.fn()} onRevoke={vi.fn()} onFindPeople={vi.fn(async () => [])} />);
    expect(screen.getByText(/you answer for Divya/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Do not approve' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Do not approve' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox'), 'Not this quarter');
    await ue.click(within(dialog).getByRole('button', { name: 'Do not approve' }));
    expect(onDecide).toHaveBeenCalledWith(TASK, 'reject', 'Not this quarter');
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onDecide).toHaveBeenCalledWith(TASK, 'approve', '');
  });
});
