import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ContainTenantScreen, FeatureFlagsScreen } from './console-ops';
import { CONTAIN_LIFT, CONTAIN_OPEN, CONTAIN_READY, liveContain, liveFlags } from './console-c4-data';

// Console C-4 (answers 1049, 1050): the live Feature flags and Contain company screens.
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const NOW = new Date('2026-11-12T05:00:00.000Z');

describe('Feature flags (live)', () => {
  it('shows each switch, who differs from the default, and the kill switch state', () => {
    wrap(<FeatureFlagsScreen flags={[]} live={liveFlags()} />);
    expect(screen.getByText(/1 with their own value \(Vaigai Motors: off\)/)).toBeInTheDocument();
    expect(screen.getAllByText('Engaged')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'New flag' })).toBeNull();
  });

  it('the kill switch asks for a reason first; then it is engaged', async () => {
    const onKill = vi.fn().mockResolvedValue(undefined);
    wrap(<FeatureFlagsScreen flags={[]} live={liveFlags({ onKill })} />);
    const row = screen.getByText('access.requests').closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /actions|more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Engage kill switch' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Engage kill switch' }));
    expect(within(dialog).getByText(/Give a reason of at least 5 characters/)).toBeInTheDocument();
    expect(onKill).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Provider outage');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Engage kill switch' }));
    await waitFor(() => expect(onKill).toHaveBeenCalledWith('access.requests', 'Provider outage'));
  });

  it('whoever engaged the kill switch is not offered to turn it back on', async () => {
    wrap(<FeatureFlagsScreen flags={[]} live={liveFlags({ meId: 'staff-1' })} />);
    const row = screen.getByText('help.whats_new').closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /actions|more/i }));
    expect(await screen.findByRole('menuitem', { name: /You engaged it/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Turn back on' })).toBeNull();
  });
});

describe('Contain company (live)', () => {
  it('needs a reason of a sentence before containing', async () => {
    const onContain = vi.fn().mockResolvedValue(undefined);
    wrap(<ContainTenantScreen stepUpAt={null} now={NOW} live={liveContain(CONTAIN_READY, { onContain })} />);
    expect(screen.getByText(/CERT-In 6 hours; DPDP Rules 2025 detailed report to the Data Protection Board 72 hours/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Contain company' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'CONTAIN VAIGAI MOTORS');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Contain company' }));
    expect(onContain).not.toHaveBeenCalled();
    expect(await screen.findByText(/Say what happened, in a sentence/)).toBeInTheDocument();
  });

  it('contained: the breach clock and the company banner; the lift is offered to a second person only', () => {
    const { unmount } = wrap(<ContainTenantScreen stepUpAt={null} now={NOW} live={liveContain(CONTAIN_OPEN)} />);
    expect(screen.getByText(/CERT-In report due by/)).toBeInTheDocument();
    expect(screen.getByText(/Bank-detail changes, exports and payouts are on hold/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request lift' })).toBeInTheDocument();
    unmount();
    const { unmount: u2 } = wrap(<ContainTenantScreen stepUpAt={null} now={NOW} live={liveContain(CONTAIN_LIFT)} />);
    expect(screen.getByRole('button', { name: 'Lift containment' })).toBeInTheDocument();
    u2();
    wrap(<ContainTenantScreen stepUpAt={null} now={NOW} live={liveContain({ ...CONTAIN_LIFT, containment: { ...CONTAIN_LIFT.containment!, liftRequest: { ...CONTAIN_LIFT.containment!.liftRequest!, byMe: true } } })} />);
    expect(screen.queryByRole('button', { name: 'Lift containment' })).toBeNull();
    expect(screen.getByText('Waiting for another staff member')).toBeInTheDocument();
  });
});
