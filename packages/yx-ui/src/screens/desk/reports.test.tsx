import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WallScreen } from './reports';
import { WALL } from './report-data';

describe('wall screen', () => {
  it('big counts per desk, and a clear message when switched off', () => {
    const { rerender } = render(<WallScreen state="ready" wall={WALL} />);
    expect(within(screen.getByRole('region', { name: 'IT help desk' })).getByText('Due within an hour').nextSibling).toHaveTextContent('3');
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
    rerender(<WallScreen state="not-found" wall={null} />);
    expect(screen.getByRole('heading', { name: 'This wall screen is switched off' })).toBeInTheDocument();
  });
});
