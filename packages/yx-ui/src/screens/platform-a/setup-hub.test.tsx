import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SetupHubScreen, type ModuleCard } from './setup-admin';

// Answer 952: the live set-up hub asks nothing new (no sign-off, no go-live); each check opens its set-up page.
const AREAS: ModuleCard[] = [
  { id: 'org', name: 'Organisation', owner: 'HR', checks: [{ id: 'entities', label: 'Legal entities', blocking: true, done: true }, { id: 'org-rules', label: 'Company rules reviewed', blocking: false, done: false, starter: true }] },
  { id: 'time', name: 'Time & Leave', owner: 'HR', checks: [{ id: 'holidays', label: 'Holiday calendars', blocking: true, done: false }] },
];
const live = (over = {}) => ({ state: 'ready' as const, onRetry: vi.fn(), onStart: vi.fn(), ...over });

describe('Set-up hub (PLT-08)', () => {
  it('live: scores from the checks, no Go live or Sign off, and the tour anchors are there', () => {
    const { container } = render(<SetupHubScreen modules={AREAS} live={live()} />);
    expect(screen.getByText('1 blocking checks open')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Go live|Sign off/ })).toBeNull();
    for (const a of ['setup-hub', 'setup-modules', 'setup-starter']) expect(container.querySelector(`[data-tour="${a}"]`)).not.toBeNull();
  });

  it('opening an area lists its checks; Start opens that check’s set-up page; nothing can be skipped', async () => {
    const l = live();
    render(<SetupHubScreen modules={AREAS} live={l} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open Time & Leave' }));
    const list = screen.getByRole('region', { name: 'Time & Leave: checks' });
    expect(within(list).queryByRole('button', { name: /Skip/ })).toBeNull();
    await userEvent.click(within(list).getByRole('button', { name: 'Start Holiday calendars' }));
    expect(l.onStart).toHaveBeenCalledWith('time', 'holidays');
  });

  it('loading, error and no access', async () => {
    const l = live({ state: 'error' });
    const { rerender } = render(<SetupHubScreen modules={[]} live={l} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(l.onRetry).toHaveBeenCalled();
    rerender(<SetupHubScreen modules={[]} live={live({ state: 'no-access' })} />);
    expect(screen.getByText("You don't have access to the set-up hub")).toBeInTheDocument();
  });

  it('the design keeps its go-live and sign-off buttons', () => {
    render(<SetupHubScreen modules={AREAS.map((m) => ({ ...m, checks: m.checks.map((c) => ({ ...c, done: true })) }))} />);
    expect(screen.getByRole('button', { name: /Go live/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Sign off' })).toHaveLength(2);
  });
});
