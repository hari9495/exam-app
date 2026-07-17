import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its label and applies only the mapped variant classes', () => {
    render(<Badge variant="success">Published</Badge>);
    const badge = screen.getByText('Published');
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
    // The old implementation also added the raw variant name ("success") as its own,
    // unstyled class -- a leftover bug. Assert it's gone.
    expect(badge.className.split(' ')).not.toContain('success');
  });
});
