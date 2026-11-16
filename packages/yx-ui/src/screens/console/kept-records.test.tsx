import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CompanyScreen, legalHoldInput } from './company';
import type { CompanyDetail } from './types';

// Answers 2081 and 2083: a deleted company's kept records on the console company page: each removal (group, day,
// SHA-256), and the legal holds staff set (security key at the API) and end.
const COMPANY = {
  id: 'c1',
  name: 'Kaveri Foods',
  slug: 'kaveri',
  lifecycle: 'closed',
  signInAllowed: false,
  trialEndsAt: null,
  trialExtended: false,
  lifecycleChangedAt: '2026-11-01T10:00:00Z',
  createdAt: '2025-01-01T10:00:00Z',
  products: ['hrms'],
  deletion: null,
  employees: 0,
  admins: [],
  history: [],
  deleted: {
    at: '2026-12-20T10:00:00Z',
    recordsKeptUntil: '2036-12-20',
    certificateSha256: 'a'.repeat(64),
    removals: [{ group: 'filings', removedAt: '2034-12-21T21:35:00Z', sha256: 'b'.repeat(64) }],
    holds: [{ id: 'h1', caseRef: 'WP-118', reason: 'A wage claim before the labour court', until: '2035-06-30' }],
  },
} as unknown as CompanyDetail;
const screenFor = (over: Partial<Parameters<typeof CompanyScreen>[0]> = {}) =>
  render(
    <ToastProvider>
      <CompanyScreen
        state="ready"
        company={COMPANY}
        sessions={[]}
        canManage
        canSupport={false}
        onBack={vi.fn()}
        onLifecycle={vi.fn()}
        onExtendTrial={vi.fn()}
        onRequestSupport={vi.fn()}
        onOpenSession={vi.fn()}
        onEndSession={vi.fn()}
        onWithdrawRequest={vi.fn()}
        {...over}
      />
    </ToastProvider>,
  );

describe('Kept records on the console company page (2081, 2083)', () => {
  it('lists each removal with its day and SHA-256, and the hold in force', () => {
    screenFor({ onSetHold: vi.fn(), onEndHold: vi.fn() });
    expect(screen.getByText('Kept records')).toBeInTheDocument();
    expect(screen.getByText(/Statutory filings removed/)).toBeInTheDocument();
    expect(screen.getByText('b'.repeat(64))).toBeInTheDocument();
    expect(screen.getByText(/Legal hold WP-118 until/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End the hold' })).toBeInTheDocument();
  });

  it('sets a hold: pressed too early it says what is missing; filled in, it sends the case, reason and day', async () => {
    const onSetHold = vi.fn().mockResolvedValue(undefined);
    screenFor({ onSetHold });
    await userEvent.click(screen.getByRole('button', { name: 'Set a legal hold' }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Set the hold' }));
    expect(within(drawer).getAllByText(/Give the case or matter reference/).length).toBeGreaterThan(0);
    expect(onSetHold).not.toHaveBeenCalled();
    expect(legalHoldInput({ caseRef: 'WP-2', reason: 'Labour court wage claim', until: new Date(2035, 5, 30) }, new Date(2034, 0, 1)).input).toEqual({ caseRef: 'WP-2', reason: 'Labour court wage claim', until: '2035-06-30' });
  });

  it('negative: a day today or before, or a short reason, is refused before sending', () => {
    const today = new Date(2034, 0, 10);
    expect(legalHoldInput({ caseRef: 'WP-2', reason: 'Labour court wage claim', until: new Date(2034, 0, 10) }, today).errors.map((e) => e.fieldId)).toEqual(['lh-until']);
    expect(legalHoldInput({ caseRef: ' ', reason: 'short', until: null }, today).errors.map((e) => e.fieldId)).toEqual(['lh-case', 'lh-reason', 'lh-until']);
  });

  it('negative: staff who cannot manage companies see the removals but cannot set or end a hold', () => {
    screenFor({ canManage: false, onSetHold: vi.fn(), onEndHold: vi.fn() });
    expect(screen.getByText(/Statutory filings removed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set a legal hold' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End the hold' })).not.toBeInTheDocument();
  });
});
