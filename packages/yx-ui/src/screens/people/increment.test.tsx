import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BulkChangesWizard } from './changes';
import type { IncrementResult, LiveIncrement } from './increment';

const ue = userEvent.setup({ pointerEventsCheck: 0, delay: null });
const RESULT: IncrementResult = {
  people: [{ employeeId: 'e1', name: 'Arjun Kulkarni', code: 'KF-0142', department: 'Quality', grade: 'G5', rating: 'Exceeds', currentCtc: '850000.00', percent: '7.25', newCtc: '911625.00', bandMax: '900000.00', aboveBand: true, capped: false }],
  leftOut: [{ employeeId: 'e3', name: 'Nikhil Rao', rating: null, why: 'No released rating in FY 2025-26 annual review.' }],
  ratingCycles: [{ id: 'fy26', name: 'FY 2025-26 annual review' }],
  ratingCycleId: 'fy26',
  bands: ['Exceeds'],
  rows: [{ employeeId: 'e1', ok: true, error: null }],
  errors: 0,
  bandPolicy: 'warn',
  letterTemplates: [{ id: 'inc', name: 'Increment letter', version: 1 }],
};
const live = (over: Partial<LiveIncrement> = {}): LiveIncrement => ({
  entities: [{ value: 'kf', label: 'Kaveri Foods Pvt Ltd' }],
  departments: [{ value: 'q', label: 'Quality' }],
  today: new Date(2026, 9, 20),
  canRate: true,
  onCheck: vi.fn(async () => RESULT),
  onSend: vi.fn(async () => undefined),
  onPreviewLetter: vi.fn(async () => ({ url: 'about:blank', size: 1 })),
  lettersHref: '#settings-letters',
  ...over,
});

describe('Annual increment, live (PPL-06)', () => {
  it('checks the people once the date is set, says who has no rating, and sends the rule', async () => {
    const l = live();
    render(<BulkChangesWizard live={l} />);
    await ue.click(screen.getByRole('textbox', { name: /Effective date/ }));
    await ue.keyboard('01/11/2026{Enter}');
    await waitFor(() => expect(l.onCheck).toHaveBeenCalled(), { timeout: 3000 });
    expect(vi.mocked(l.onCheck).mock.calls[0][0]).toMatchObject({ legalEntityId: 'kf', mode: 'rating', byRating: [], reason: 'Annual increment' });
    expect(await screen.findByText(/1 person matches\. 1 is left out\./)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'See who' }));
    expect(within(screen.getByRole('dialog')).getByText('No released rating in FY 2025-26 annual review.')).toBeInTheDocument();
  });

  const toPreview = async (l: LiveIncrement) => {
    render(<BulkChangesWizard live={l} />);
    await ue.click(screen.getByRole('textbox', { name: /Effective date/ }));
    await ue.keyboard('01/11/2026{Enter}');
    await waitFor(() => expect(l.onCheck).toHaveBeenCalled(), { timeout: 3000 });
    await screen.findByText(/1 person matches/);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
  };

  it('pay range, rule "warn": the person above is flagged and can be held at the maximum', async () => {
    const l = live();
    await toPreview(l);
    expect(screen.getByText('1 person goes above the band maximum')).toBeInTheDocument();
    expect(screen.getByText('Above band')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Cap at band max' }));
    await waitFor(() => expect(vi.mocked(l.onCheck).mock.calls.at(-1)![0]).toMatchObject({ capped: ['e1'] }), { timeout: 3000 });
  });

  it('rule "block": nothing is sent while someone is above the maximum', async () => {
    await toPreview(live({ onCheck: vi.fn(async () => ({ ...RESULT, bandPolicy: 'block' as const })) }));
    expect(screen.getByText(/raises above the band maximum are not sent/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: /^Send for approval/ })).toBeDisabled();
    expect(screen.getByText('1 above the band maximum: cap them first.')).toBeInTheDocument();
  });

  it('letters: the chosen template previews one person, and goes with the batch', async () => {
    const l = live();
    await toPreview(l);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Preview letter' }));
    await waitFor(() => expect(l.onPreviewLetter).toHaveBeenCalledWith(expect.objectContaining({ letterTemplateId: 'inc' }), 'e1'));
    expect((await screen.findAllByText('Increment letter, Arjun Kulkarni.pdf')).length).toBeGreaterThan(0);
  });

  it('without perf.review.view there is only one raise for everyone', () => {
    render(<BulkChangesWizard live={live({ canRate: false })} />);
    expect(screen.queryByRole('radiogroup', { name: 'Raise by' })).toBeNull();
  });
});
