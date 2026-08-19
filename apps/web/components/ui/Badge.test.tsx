import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its label on the squared status tokens, not the old pill', () => {
    render(<Badge variant="success">Published</Badge>);
    const badge = screen.getByText('Published');
    // Wave 2: retoned onto the semantic status.* tokens + a squared tag.
    expect(badge.className).toContain('bg-status-success-bg');
    expect(badge.className).toContain('text-status-success');
    expect(badge.className).not.toContain('bg-green-100');
    expect(badge.className.split(' ')).not.toContain('rounded-full');
    // The old implementation also added the raw variant name ("success") as its own,
    // unstyled class -- a leftover bug. Assert it's gone.
    expect(badge.className.split(' ')).not.toContain('success');
  });

  it('maps default to the neutral tone', () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft').className).toContain('bg-status-neutral-bg');
  });
});
