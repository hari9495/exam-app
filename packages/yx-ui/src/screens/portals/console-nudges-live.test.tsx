import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { NudgeEditorScreen } from './console-ops';
import { NudgeCard, type LiveNudges, type NudgeRow } from './console-nudges-live';

// Console C-8, YX-12: nudges per feature switch (live) and the card a company person sees.
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const row = (o: Partial<NudgeRow> = {}): NudgeRow => ({ id: 'n1', featureKey: 'access.requests', kind: 'switch_on', heading: 'Let people ask for access', body: 'Switch on access requests so people can ask for a page.', status: 'live', writtenBy: 'Joseph Thomas', mine: false, reviewedBy: 'Anand Iyer', reviewNote: null, createdAt: '2026-11-10T00:00:00Z', ...o });
const live = (o: Partial<LiveNudges> = {}): LiveNudges => ({
  state: 'ready',
  onRetry: () => {},
  features: [{ key: 'access.requests', label: 'Access requests', killed: false }, { key: 'policy.ai_writer', label: 'Write policies with AI', killed: true }],
  nudges: [row()],
  weeklyLimit: 2,
  onWrite: vi.fn().mockResolvedValue(undefined),
  onReview: vi.fn().mockResolvedValue(undefined),
  onRetire: vi.fn().mockResolvedValue(undefined),
  ...o,
});
const show = (l: LiveNudges) => wrap(<NudgeEditorScreen nudges={[]} me="" live={l} />);

describe('Nudges (live)', () => {
  it('lists the copy per switch with the weekly limit; a killed switch says it is not shown', () => {
    show(live({ nudges: [row(), row({ id: 'n2', featureKey: 'policy.ai_writer', heading: 'Draft policies faster', status: 'pending' })] }));
    expect(screen.getByText(/at most 2 a week per person/)).toBeInTheDocument();
    expect(screen.getByText('Let people ask for access')).toBeInTheDocument();
    expect(screen.getByText(/switched off for everyone: not shown/)).toBeInTheDocument();
  });

  it('new copy needs a switch, a heading and a body before it is sent', async () => {
    const onWrite = vi.fn().mockResolvedValue(undefined);
    show(live({ onWrite }));
    await userEvent.click(screen.getByRole('button', { name: 'New copy' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    expect(within(dialog).getByText('Choose the feature switch.')).toBeInTheDocument();
    expect(within(dialog).getByText('Write a heading of at least 3 characters.')).toBeInTheDocument();
    expect(onWrite).not.toHaveBeenCalled();
  });

  it('the writer cannot approve their own copy', () => {
    show(live({ nudges: [row({ status: 'pending', mine: true, reviewedBy: null })] }));
    expect(screen.getByText('Another staff member approves it')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
  });

  it('another staff member approves; sending back needs a note', async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    show(live({ nudges: [row({ status: 'pending', reviewedBy: null })], onReview }));
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send back' }));
    expect(within(dialog).getByText('Say what to change before sending it back.')).toBeInTheDocument();
    expect(onReview).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith('n1', true, undefined));
  });
});

describe('What a company person sees', () => {
  it('switch-on copy opens the setting; Not now puts it away', async () => {
    const onDismiss = vi.fn();
    render(<NudgeCard heading="Let people ask for access" body="Switch on access requests." switchHref="/yx/settings/access-settings" onDismiss={onDismiss} />);
    expect(screen.getByRole('link', { name: 'Switch on' })).toHaveAttribute('href', '/yx/settings/access-settings');
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('a suggestion has no Switch on', () => {
    render(<NudgeCard heading="Try first-run tours" body="Each tour starts once." switchHref={null} />);
    expect(screen.queryByRole('link', { name: 'Switch on' })).toBeNull();
  });
});
