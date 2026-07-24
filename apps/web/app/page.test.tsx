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

  it('shows a footer Login link', () => {
    render(<Home />);
    const links = screen.getAllByRole('link', { name: 'Login' });
    expect(links.length).toBeGreaterThanOrEqual(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
  });
});
