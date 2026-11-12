import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';

// Walk of S-3: on a live settings page, the company's second-factor floor (the API's MFA_REQUIRED) is its own state with a
// way to set it up; a real load failure still says it could not load, with Retry.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '4.3')!;

describe('Settings page: the second-factor state', () => {
  it('state mfa: "add a passkey" with Set it up, never "couldn\'t load"', async () => {
    const onSetUpMfa = vi.fn();
    render(<SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.3" live={{ page: design, canEdit: false, lastChange: null, state: 'mfa', onSetUpMfa, onSave: vi.fn() }} />);
    expect(screen.getByText('Add a passkey or an authenticator app to open this page')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/)).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Set it up' }));
    expect(onSetUpMfa).toHaveBeenCalled();
  });

  it('negative: a real failure keeps "couldn\'t load" with Retry', async () => {
    const onRetry = vi.fn();
    render(<SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.3" live={{ page: design, canEdit: false, lastChange: null, state: 'error', onRetry, onSave: vi.fn() }} />);
    expect(screen.getByText("We couldn't load Payroll policies.")).toBeInTheDocument();
    expect(screen.queryByText('Add a passkey or an authenticator app to open this page')).toBeNull();
    await ue.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
