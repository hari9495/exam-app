import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoAccessState, SalaryCheckContext } from '../../components/feedback';

describe('Salary page after "Confirm it\'s you" was cancelled (answer 2370)', () => {
  it('asks to confirm with Try again, instead of saying there is no access', async () => {
    const onRetry = vi.fn();
    render(
      <SalaryCheckContext.Provider value={{ cancelled: true, onRetry }}>
        <NoAccessState grantedBy="HR" what="pay runs" />
      </SalaryCheckContext.Provider>,
    );
    expect(screen.getByText("Confirm it's you to see salary details")).toBeInTheDocument();
    expect(screen.queryByText(/You don't have access/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a real missing permission still says no access', () => {
    render(
      <SalaryCheckContext.Provider value={{ cancelled: false, onRetry: vi.fn() }}>
        <NoAccessState grantedBy="HR" what="pay runs" />
      </SalaryCheckContext.Provider>,
    );
    expect(screen.getByText("You don't have access to pay runs")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
