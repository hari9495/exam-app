import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePathname } from 'next/navigation';
import { Users, Briefcase, KeyRound, Settings as SettingsIcon, TrendingUp, Sun, LayoutDashboard } from 'lucide-react';
import { Sidebar } from './Sidebar';

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));

const NAV = [
  { href: '/v2/today', label: 'Today', icon: Sun }, // pinned (no group)
  { href: '/v2/dashboard', label: 'Dashboard', icon: LayoutDashboard }, // pinned
  { href: '/v2/candidates', label: 'Candidates', icon: Users, group: 'Hiring' },
  { href: '/v2/jobs', label: 'Jobs', icon: Briefcase, group: 'Hiring' },
  { href: '/v2/settings/branding', label: 'Brand Settings', icon: SettingsIcon, group: 'Settings' },
  { href: '/v2/settings/sso', label: 'Single Sign-On', icon: KeyRound, group: 'Settings' },
  { href: '/v2/analytics/hiring', label: 'Hiring Analytics', icon: TrendingUp, group: 'Analytics' }, // single-item group
];

function renderSidebar() {
  render(
    <Sidebar navItems={NAV} orgName="Acme" orgInitial="A" roleLabel="Org admin" onLogout={() => {}} />,
  );
}

describe('Sidebar (collapsible sections)', () => {
  beforeEach(() => {
    localStorage.clear();
    (usePathname as jest.Mock).mockReturnValue('/v2/candidates'); // Hiring is the active section
  });

  it('pins ungrouped items flat at the top', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('auto-expands the section containing the current route', () => {
    renderSidebar();
    // Hiring is active -> its items are visible without any click
    expect(screen.getByRole('link', { name: 'Candidates' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jobs' })).toBeInTheDocument();
  });

  it('keeps other sections collapsed until their header is clicked', async () => {
    renderSidebar();
    // Settings is not active -> collapsed, its items hidden
    expect(screen.queryByRole('link', { name: 'Single Sign-On' })).not.toBeInTheDocument();
    const header = screen.getByRole('button', { name: 'Settings' });
    expect(header).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(header);

    expect(screen.getByRole('link', { name: 'Single Sign-On' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders a single-item section as a plain link, with no collapsible header', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Hiring Analytics' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analytics' })).not.toBeInTheDocument();
  });

  it('persists an opened section to localStorage', async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(JSON.parse(localStorage.getItem('v2-nav-open-groups') || '[]')).toContain('Settings');
  });
});
