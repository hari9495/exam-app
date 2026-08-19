import { render, screen } from '@testing-library/react';
import { IntegrityBadge } from './IntegrityBadge';

describe('IntegrityBadge', () => {
  it('renders a green "Clear" badge for the clear level', () => {
    render(<IntegrityBadge level="clear" />);
    const badge = screen.getByText('Integrity: Clear');
    expect(badge.className).toContain('bg-status-success-bg');
    expect(badge.className).toContain('text-status-success');
  });

  it('renders an amber "Review recommended" badge for the review level', () => {
    render(<IntegrityBadge level="review" />);
    const badge = screen.getByText('Integrity: Review recommended');
    expect(badge.className).toContain('bg-status-warning-bg');
    expect(badge.className).toContain('text-status-warning');
  });

  it('renders a red "High concern" badge for the high_concern level', () => {
    render(<IntegrityBadge level="high_concern" />);
    const badge = screen.getByText('Integrity: High concern');
    expect(badge.className).toContain('bg-status-danger-bg');
    expect(badge.className).toContain('text-status-danger');
  });

  it('renders a gray placeholder badge when the level is null', () => {
    render(<IntegrityBadge level={null} />);
    const badge = screen.getByText('Integrity: —');
    expect(badge.className).toContain('bg-status-neutral-bg');
    expect(badge.className).toContain('text-status-neutral');
  });

  it('renders the gray placeholder badge when the level is undefined or unrecognized', () => {
    render(<IntegrityBadge level={undefined} />);
    expect(screen.getByText('Integrity: —')).toBeInTheDocument();
  });

  // Wave 2: IntegrityBadge delegates to StatusBadge, so it inherited the squared tag + filled
  // marker from Wave 1 with no change of its own. Guard that delegation.
  it('inherits the StatusBadge marker', () => {
    const { container } = render(<IntegrityBadge level="clear" />);
    expect(container.querySelector('[data-status-marker]')).not.toBeNull();
  });
});
