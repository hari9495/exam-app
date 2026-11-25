import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SystemLogsScreen, UserSearchScreen, type FoundUser, type SystemLogEntry } from './lookups';

const LOG: SystemLogEntry = { id: 'l1', at: '2026-11-18T09:42:10Z', service: 'exam-runtime', severity: 'error', message: 'Code runner returned no result', context: { attemptId: '9a77be10' }, company: 'Deccan Logistics', companyId: 'c2' };
const USER: FoundUser = { id: 'u1', email: 'priya.sharma@kaveri.test', name: 'Priya Sharma', role: 'org_admin', status: 'active', lastSignIn: null, company: 'Kaveri Foods Pvt Ltd', companyId: 'c1' };

describe('Console: system logs (answer 2421)', () => {
  it('lists the entry with its level, where, context and company; level and where are single choices', async () => {
    const onSeverity = vi.fn();
    render(<SystemLogsScreen state="ready" entries={[LOG]} service="all" onService={() => {}} severity="all" onSeverity={onSeverity} hasMore={false} loadingMore={false} onLoadMore={() => {}} />);
    const row = screen.getByRole('row', { name: /Code runner/ });
    expect(row).toHaveTextContent('Error');
    expect(row).toHaveTextContent('Exam runtime');
    expect(row).toHaveTextContent('attemptId: 9a77be10');
    expect(row).toHaveTextContent('Deccan Logistics');
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Level' })).getByRole('radio', { name: 'Errors' }));
    expect(onSeverity).toHaveBeenCalledWith('error');
  });

  it('says when nothing is logged, and who grants the page without the key', () => {
    const { unmount } = render(<SystemLogsScreen state="ready" entries={[]} service="all" onService={() => {}} severity="all" onSeverity={() => {}} hasMore={false} loadingMore={false} onLoadMore={() => {}} />);
    expect(screen.getByText('Nothing logged. No errors or warnings yet.')).toBeInTheDocument();
    unmount();
    render(<SystemLogsScreen state="no-access" entries={[]} service="all" onService={() => {}} severity="all" onSeverity={() => {}} hasMore={false} loadingMore={false} onLoadMore={() => {}} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('Console: find a user (answer 2431)', () => {
  it('refuses fewer than 3 characters and a wildcard, saying why, and searches nothing', async () => {
    const onSearch = vi.fn();
    render(<UserSearchScreen state="ready" searched={null} results={null} onSearch={onSearch} companyHref={(id) => `/staff/companies/${id}`} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Email or name' }), 'pr');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('Type at least 3 characters of an email address or a name.')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Email or name' }), '%%');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('Search with letters, digits, @ and dots.')).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('searches the trimmed text and shows each user with a link to the company', async () => {
    const onSearch = vi.fn();
    const { rerender } = render(<UserSearchScreen state="ready" searched={null} results={null} onSearch={onSearch} companyHref={(id) => `/staff/companies/${id}`} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Email or name' }), '  priya  ');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledWith('priya');
    rerender(<UserSearchScreen state="ready" searched="priya" results={{ state: 'ready', users: [USER], more: false }} onSearch={onSearch} companyHref={(id) => `/staff/companies/${id}`} />);
    const row = screen.getByRole('row', { name: /Priya Sharma/ });
    expect(row).toHaveTextContent('System admin');
    expect(row).toHaveTextContent('Never');
    expect(within(row).getByRole('link', { name: 'Kaveri Foods Pvt Ltd' })).toHaveAttribute('href', '/staff/companies/c1');
  });

  it('says so when nobody matches', () => {
    render(<UserSearchScreen state="ready" searched="zzz" results={{ state: 'ready', users: [], more: false }} onSearch={() => {}} companyHref={() => '#'} />);
    expect(screen.getByText('No user matches “zzz”.')).toBeInTheDocument();
  });
});
