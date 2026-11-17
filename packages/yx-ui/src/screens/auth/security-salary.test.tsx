import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecuritySettingsScreen } from './security-settings';
import { ADMINS, FLOOR, IDPS, POLICY } from './data';

const show = (onSave = vi.fn(async () => {}), policy = POLICY) =>
  render(<SecuritySettingsScreen state="ready" policy={policy} floor={FLOOR} providers={IDPS} admins={ADMINS} providersHref="#" onSave={onSave} />);

describe('Security settings › Salary pages (batch B item 1)', () => {
  it('is on by default with a single-choice 5 / 10 / 15 minute Segment, and saves only what changed', async () => {
    const u = userEvent.setup();
    const onSave = vi.fn(async () => {});
    show(onSave);
    expect(screen.getByRole('switch', { name: /Confirm it's you again before salary pages/ })).toBeChecked();
    const group = screen.getByRole('radiogroup', { name: 'Ask again after' });
    expect(within(group).getByRole('radio', { name: '15 min' })).toBeChecked();
    await u.click(within(group).getByRole('radio', { name: '5 min' }));
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ salaryRecheckMinutes: 5 });
  });

  it('turned off hides the minutes and saves salaryRecheck false', async () => {
    const u = userEvent.setup();
    const onSave = vi.fn(async () => {});
    show(onSave);
    await u.click(screen.getByRole('switch', { name: /Confirm it's you again before salary pages/ }));
    expect(screen.queryByRole('radiogroup', { name: 'Ask again after' })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ salaryRecheck: false });
  });
});
