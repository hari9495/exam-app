import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeerFormScreen, ReviewerBlocksScreen } from './peer';
import type { PeerForm } from './types';

// Performance batch PM5 screens (M06-BUILD-DESIGN §10, §15.3; PM-5.03). Nominations are the PRF-07 design and the
// grouped answers the PRF-05 workspace's peer card (tested with those designs).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
describe('Peer feedback (PM5)', () => {
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
    await ue.click(within(d).getByRole('button', { name: 'Block' }));
    expect(within(d).getByText('Choose the first person.')).toBeInTheDocument();
    expect(within(d).getByText('Choose the other person.')).toBeInTheDocument();
    expect(onBlock).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('combobox', { name: 'One person' }));
    await ue.click(screen.getByRole('option', { name: /Arjun/ }));
    await ue.click(within(d).getByRole('combobox', { name: 'The other person' }));
    await ue.click(screen.getByRole('option', { name: /Sita/ }));
    await ue.click(within(d).getByRole('button', { name: 'Block' }));
    expect(onBlock).toHaveBeenCalledWith({ employeeA: 'e1', employeeB: 'e2', reasonCode: 'conflict', untilOn: null });
  });
});
