import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LegalNoticeScreen } from './legal';

describe('Accessibility statement page (answer 2352)', () => {
  it('shows the approved statement: target, the menu, the known gaps (G-1 fixed), the contact', () => {
    render(<LegalNoticeScreen doc="accessibility" contactEmail="accessibility@yukthix.example" />);
    expect(screen.getByText(/WCAG\) 2\.1, level AA\. Today we partly conform/)).toBeInTheDocument();
    expect(screen.queryByText(/Every screen in our design library is checked automatically/)).not.toBeInTheDocument();
    expect(screen.queryByText('Being finalised')).not.toBeInTheDocument();
    const gaps = screen.getByRole('table', { name: 'Known accessibility gaps' });
    expect(within(gaps).getByText('G-2')).toBeInTheDocument();
    expect(within(gaps).queryByText('G-1')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'accessibility@yukthix.example' })).toHaveAttribute('href', 'mailto:accessibility@yukthix.example');
  });

  it('without a published contact says so instead of an address', () => {
    render(<LegalNoticeScreen doc="accessibility" />);
    expect(screen.getByText(/the address YukthiX publishes here before go-live/)).toBeInTheDocument();
  });
});
