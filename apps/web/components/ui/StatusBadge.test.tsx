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

  it('is a squared tag, not a rounded pill', () => {
    render(<StatusBadge tone="danger">Fail</StatusBadge>);
    const badge = screen.getByText('Fail');
    expect(badge.className).not.toContain('rounded-full');
    expect(badge.className).toContain('rounded');
  });

  it('renders a filled marker beside the label so state is never colour-only', () => {
    render(<StatusBadge tone="success">Pass</StatusBadge>);
    // The marker is an aria-hidden span carrying the tone colour via currentColor.
    const marker = document.querySelector('[data-status-marker]');
    expect(marker).not.toBeNull();
    // The label text is still present and readable on its own.
    expect(screen.getByText('Pass')).toBeInTheDocument();
  });
});
