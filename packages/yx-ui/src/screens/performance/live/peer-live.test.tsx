import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeerFormScreen, PeerPanel, ReviewerBlocksScreen, type PeerPanelProps } from './peer';
import type { PeerForm } from './types';

// Performance batch PM5 screens (M06-BUILD-DESIGN §10, §15.3; PRF-07; PM-5.03).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const panel = (o: Partial<PeerPanelProps> = {}): PeerPanelProps => ({
  data: { peer: { minNominees: 3, maxNominees: 6, dueOn: '2026-10-25' }, nominations: [{ id: 'n1', reviewer: 'Sita', reviewerEmployeeId: 'e2', relationship: 'peer', proposedBy: 'employee', status: 'proposed' }], can: { propose: false, decide: true, add: true } },
  groups: null,
  questions: { g: 'Goals' },
  options: [],
  onSearch: vi.fn(),
  onNominate: vi.fn(ok),
  onDecide: vi.fn(ok),
  onWithdraw: vi.fn(ok),
  ...o,
});

describe('Peer feedback (PM5)', () => {
  it('the manager approves a proposal and asks someone found by the server search', async () => {
    const p = panel();
    const { rerender } = render(<PeerPanel {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(p.onDecide).toHaveBeenCalledWith('n1', true);
    await ue.click(screen.getByRole('button', { name: 'Ask someone' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Who' }));
    await ue.type(screen.getByPlaceholderText('Name, email, role or department'), 'Mee');
    await vi.waitFor(() => expect(p.onSearch).toHaveBeenLastCalledWith('Mee'));
    rerender(<PeerPanel {...p} options={[{ id: 'e7', name: 'Meena Pillai' }]} />);
    await ue.click(await screen.findByRole('option', { name: /Meena Pillai/ }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('radio', { name: 'Reports to them' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ask' }));
    expect(p.onNominate).toHaveBeenCalledWith('e7', 'report');
  });

  it('grouped answers are labelled advisory, with averages and ranges, and say how many are held back', () => {
    render(<PeerPanel {...panel({ groups: { advisory: true, peer: null, released: true, responses: 4, shown: [{ group: 'others', responses: 3, ratings: { g: { average: 3.67, low: 3, high: 4, count: 3 } }, texts: ['Calm'] }], heldBack: 1 } })} />);
    expect(screen.getByText('Advisory')).toBeInTheDocument();
    expect(screen.getByText('Goals: average 3.67, from 3 to 4')).toBeInTheDocument();
    expect(screen.getByText(/Not enough responses to show one answer/)).toBeInTheDocument();
  });

  it('a nominee answers anonymously and sends it', async () => {
    const onSave = vi.fn(ok);
    const form: PeerForm = { reviewId: 'r1', employee: 'Arjun', cycle: 'FY', dueOn: '2026-10-25', anonymous: true, sections: [{ id: 'c', title: 'Competencies', questions: [{ id: 'c', text: 'Competencies', answer: 'both', required: false, maxChars: 2000, wholeSection: true }] }], levels: [{ value: 4, label: 'Exceeds' }], entry: null, can: { answer: true } };
    render(<PeerFormScreen state="ready" form={form} onBack={vi.fn()} onSave={onSave} />);
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: '4 · Exceeds' }));
    await ue.click(screen.getByRole('button', { name: 'Send feedback' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send' }));
    expect(onSave).toHaveBeenCalledWith({ answers: [{ questionId: 'c', rating: 4, text: null }], comment: null }, true);
  });

  it('HR blocks a pair only with two different people', async () => {
    const onBlock = vi.fn(ok);
    const people = [{ id: 'e1', name: 'Arjun' }, { id: 'e2', name: 'Sita' }];
    render(<ReviewerBlocksScreen state="ready" blocks={[]} people={people} onSearch={vi.fn()} onBlock={onBlock} onEnd={vi.fn(ok)} />);
    await ue.click(screen.getByRole('button', { name: 'Block a pair' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('button', { name: 'Block' })).toBeDisabled();
    await ue.click(within(d).getByRole('combobox', { name: 'One person' }));
    await ue.click(screen.getByRole('option', { name: /Arjun/ }));
    await ue.click(within(d).getByRole('combobox', { name: 'The other person' }));
    await ue.click(screen.getByRole('option', { name: /Sita/ }));
    await ue.click(within(d).getByRole('button', { name: 'Block' }));
    expect(onBlock).toHaveBeenCalledWith({ employeeA: 'e1', employeeB: 'e2', reasonCode: 'conflict', untilOn: null });
  });
});
