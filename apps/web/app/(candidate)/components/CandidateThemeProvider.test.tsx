import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { useAttemptQuery } from '../../../lib/hooks/useAttempt';
import { CandidateThemeProvider } from './CandidateThemeProvider';

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
jest.mock('../../../lib/hooks/useAttempt', () => ({ useAttemptQuery: jest.fn() }));

describe('CandidateThemeProvider', () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/welcome');
  });

  it('shows the org name and logo in the header bar when branding is available', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { organizationName: 'Acme Corp', organizationLogoUrl: 'https://cdn.example.com/logo.png' },
    });

    render(<CandidateThemeProvider>content</CandidateThemeProvider>);

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByAltText('Acme Corp logo')).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
  });

  it('falls back to the default Prudent Hire name and logo when no org branding is set', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: undefined });

    render(<CandidateThemeProvider>content</CandidateThemeProvider>);

    expect(screen.getByText('Prudent Hire')).toBeInTheDocument();
    expect(screen.getByAltText('Prudent Hire')).toHaveAttribute('src', '/logo.png');
  });

  it('uses the same header treatment on the exam page as every other candidate page', () => {
    (usePathname as jest.Mock).mockReturnValue('/exam');
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { organizationName: 'Acme Corp', organizationLogoUrl: 'https://cdn.example.com/logo.png' },
    });

    render(<CandidateThemeProvider>content</CandidateThemeProvider>);

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByAltText('Acme Corp logo')).toHaveClass('h-8', 'w-8');
  });
});
