import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TalentPoolsScreen } from './talent';
import { pools } from './candidates.stories';

// Recruitment batch AT4 (M10-BUILD-DESIGN §7.3): talent pools (the HIR-05 screens have their own tests).

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Talent pools (AT4)', () => {
  it('creates a hotlist', async () => {
    const onCreate = vi.fn(async () => ({}));
    render(<TalentPoolsScreen {...pools} onCreate={onCreate} />);
    await ue.click(screen.getByRole('button', { name: 'New list' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('radio', { name: 'Hotlist' }));
    await ue.type(within(d).getByLabelText(/^Name/), 'Drivers');
    await ue.click(within(d).getByRole('button', { name: 'Create list' }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Drivers', kind: 'hotlist', description: null });
  });
});
