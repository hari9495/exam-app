import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home (landing page)', () => {
  it('shows the nav Login link pointing to /login', () => {
    render(<Home />);
    const navLogin = screen.getAllByRole('link', { name: 'Login' })[0];
    expect(navLogin).toHaveAttribute('href', '/login');
  });

  it('shows the headline and a hero CTA linking to /login', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /automate early screens/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '/login');
  });

  it('shows all four capability cards', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'AI-generated questions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live proctoring & integrity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Structured reports & dashboards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Flexible AI providers' })).toBeInTheDocument();
  });

  it('shows the three how-it-works steps', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Create an exam' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invite candidates' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review AI-assisted results' })).toBeInTheDocument();
  });

  it('shows the footer copyright without a redundant Login link (nav already has one)', () => {
    render(<Home />);
    expect(screen.getByText(`© ${new Date().getFullYear()} Prudent Hire`)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Login' })).toHaveLength(1);
  });
});
