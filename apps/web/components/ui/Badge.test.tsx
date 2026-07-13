import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its label and applies the variant class', () => {
    render(<Badge variant="success">Published</Badge>);
    const badge = screen.getByText('Published');
    expect(badge.className).toContain('success');
  });
});
