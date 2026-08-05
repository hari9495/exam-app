import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home (landing page)', () => {
  it('shows the nav Login link pointing to /login', () => {
    render(<Home />);
    const navLogin = screen.getAllByRole('link', { name: 'Login' })[0];
    expect(navLogin).toHaveAttribute('href', '/login');
  });

  it('shows the headline and Get Started CTAs linking to the lead-capture form', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /hiring exams that run themselves/i })).toBeInTheDocument();
    const getStartedLinks = screen.getAllByRole('link', { name: 'Get Started' });
    expect(getStartedLinks.length).toBeGreaterThan(0);
    getStartedLinks.forEach((link) => expect(link).toHaveAttribute('href', '/get-started'));
  });

  it('shows nav anchors and the security proof strip', () => {
    render(<Home />);
    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '#features');
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '#how-it-works');
    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '#security');
    expect(screen.getByText('SAML 2.0, org-scoped')).toBeInTheDocument();
  });

  it('names the problem before pitching the product', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /screening still looks like it did ten years ago/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /resumes don't test anything/i })).toBeInTheDocument();
  });

  it('shows the five-step walkthrough from building an exam to a hiring decision', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Build The Exam' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invite Candidates' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Candidate Takes A Proctored Exam' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI-Assisted Scoring' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review Structured Results' })).toBeInTheDocument();
  });

  it('shows the four feature deep-dives', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /AI drafts the questions/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /real proctoring stack/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /code questions that actually run/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /reports built for a hiring decision/i })).toBeInTheDocument();
  });

  it('shows the three consoles and the enterprise-readiness items', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Candidate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recruiter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Org Admin' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'SAML SSO' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Audit Log' })).toBeInTheDocument();
  });

  it('shows a closing CTA banner linking to the lead-capture form', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /ready to run an exam instead of another call/i })).toBeInTheDocument();
  });

  it('shows the footer copyright without a redundant Login link (nav already has one)', () => {
    render(<Home />);
    expect(screen.getByText('© 2026 Prudent Consulting')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Login' })).toHaveLength(1);
  });
});
