import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceShell, type WorkspaceLink } from './shell';

const LINKS: WorkspaceLink[] = [
  { id: 'directory', label: 'Directory', href: '/yx/people/directory', group: 'People' },
  { id: 'org-chart', label: 'Org chart', href: '/yx/people/org-chart', group: 'People' },
  { id: 'structure', label: 'Structure', href: '/yx/settings/structure', group: 'Organisation' },
  { id: 'access', label: 'Roles & access', href: '/yx/settings/access', group: 'Access' },
  { id: 'me', label: 'My security', href: '/yx/me/security', group: 'Me' },
];

const shell = (over: Partial<Parameters<typeof WorkspaceShell>[0]> = {}) =>
  render(
    <WorkspaceShell active="org-chart" links={LINKS} company="Kaveri Foods Pvt Ltd" profileHref="/profile" name="Lakshmi Venkatesan" onSignOut={() => {}} {...over}>
      <p>page</p>
    </WorkspaceShell>,
  );

describe('WorkspaceShell', () => {
  it('groups the side panel (People, Organisation, Access, Me) and marks the open page', () => {
    shell();
    const panel = screen.getByRole('navigation', { name: 'Menu' });
    expect(within(panel).getAllByRole('group').map((g) => g.getAttribute('aria-labelledby') && document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent)).toEqual(['People', 'Organisation', 'Access', 'Me']);
    expect(within(panel).getByRole('link', { name: 'Org chart' })).toHaveAttribute('aria-current', 'page');
  });

  it('rail has one area per group, the open one active; no bottom tab bar of every page', () => {
    shell();
    const rail = screen.getByRole('navigation', { name: 'Areas' });
    expect(within(rail).getAllByRole('link').map((l) => l.getAttribute('aria-label'))).toEqual(['People', 'Organisation', 'Access', 'Me']);
    expect(within(rail).getByRole('link', { name: 'People' })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('.yx-shell__tabs')).toBeNull();
  });

  it('rail areas draw Fluent colour icons (§8); the panel page links stay Lucide outline', () => {
    shell({ hiringHref: '/v2/today' });
    const rail = screen.getByRole('navigation', { name: 'Areas' });
    for (const l of within(rail).getAllByRole('link')) expect(l.querySelector('.yx-color-icon img')).not.toBeNull();
    expect(within(rail).getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('navigation', { name: 'Menu' }).querySelector('.yx-color-icon')).toBeNull();
  });

  it('offers hiring only when given (people with exam/ATS permissions)', () => {
    const { unmount } = shell();
    expect(screen.queryByRole('link', { name: /Hiring/ })).toBeNull();
    unmount();
    shell({ hiringHref: '/v2/today' });
    expect(screen.getByRole('link', { name: 'Hiring and assessments' })).toHaveAttribute('href', '/v2/today');
  });

  it('top bar: company, a menu button for narrow screens, and sign out in the account menu', async () => {
    const onSignOut = vi.fn();
    shell({ onSignOut });
    expect(screen.getByText('Kaveri Foods Pvt Ltd', { selector: '.yx-workspace__company' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Search/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Lakshmi Venkatesan' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it('client-side navigation from the panel', async () => {
    const onNavigate = vi.fn();
    shell({ onNavigate });
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('link', { name: 'Structure' }));
    expect(onNavigate).toHaveBeenCalledWith('/yx/settings/structure');
  });
});
