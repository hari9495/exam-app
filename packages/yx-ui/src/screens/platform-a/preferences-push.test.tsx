import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationPreferencesScreen, type PushPreferences } from './preferences';
import { PUSH, PUSH_TYPES } from './preferences.stories';

// T2-E 52 (answers 2875 to 2878): push preferences, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (push: Partial<PushPreferences> = {}) => {
  const p: PushPreferences = { ...PUSH, onDevice: vi.fn(), onPause: vi.fn(), onQuiet: vi.fn(), onTogglePush: vi.fn(), ...push };
  render(<NotificationPreferencesScreen types={PUSH_TYPES} digest="immediate" onToggle={vi.fn()} onDigest={vi.fn()} push={p} />);
  return p;
};

describe('PLT-65 push (T2-E 52)', () => {
  it('a Push switch per kind next to Email (approvals on by default); turning one off calls back', async () => {
    const p = show();
    expect(screen.getByRole('switch', { name: /^Push: A request needs your approval/ })).toBeChecked();
    expect(screen.getByRole('switch', { name: /^Push: A letter for you is ready/ })).not.toBeChecked();
    await ue.click(screen.getByRole('switch', { name: /^Push: A request needs your approval/ }));
    expect(p.onTogglePush).toHaveBeenCalledWith('workflow.approval.needed', false);
  });

  it('this device, Pause push and quiet hours 21:00 to 08:00 by default', async () => {
    const p = show({ device: 'off' });
    await ue.click(screen.getByRole('switch', { name: /^Push on this device/ }));
    expect(p.onDevice).toHaveBeenCalledWith(true);
    await ue.click(screen.getByRole('switch', { name: /^Pause push/ }));
    expect(p.onPause).toHaveBeenCalledWith(true);
    expect(screen.getByText('21:00')).toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
  });

  it('negative: an iPhone without the Home Screen app is told to add it, with no device switch', () => {
    show({ device: 'ios-install' });
    expect(screen.getByText('Add YukthiX to your Home Screen to get push')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /^Push on this device/ })).toBeNull();
  });

  it('negative: push switched off for the company shows no Push column', () => {
    show({ available: false });
    expect(screen.getByText(/Push is switched off for your company/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /^Push:/ })).toBeNull();
  });
});
