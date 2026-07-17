import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders its label with the tone-specific background and text classes', () => {
    render(<StatusBadge tone="success">Published</StatusBadge>);
    const badge = screen.getByText('Published');
    expect(badge.className).toContain('bg-status-success-bg');
    expect(badge.className).toContain('text-status-success');
  });

  it('supports every tone without throwing', () => {
    const tones = ['success', 'warning', 'danger', 'neutral', 'info', 'purple'] as const;
    for (const tone of tones) {
      render(<StatusBadge tone={tone}>{tone}</StatusBadge>);
      expect(screen.getByText(tone)).toBeInTheDocument();
    }
  });
});
