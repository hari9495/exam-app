import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import YxAuditLogPage from './(app)/settings/audit-log/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn(() => ({ accessToken: 't' })) }));

// Settings S-5 (answer 1563): the company audit log, readable with audit.view, filtered by area, person and date.
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const asked: string[] = [];
const ENTRY = { id: 'e1', seq: '9', at: '2026-11-12T10:05:00.000Z', action: 'org.setting.changed', entityType: 'setting', entityId: 's1', actor: 'Lakshmi Venkatesan', actorRole: 'org_admin', details: { key: 'roster.min_weekly_offs', from: '1', to: '2' } };
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <YxAuditLogPage />
    </QueryClientProvider>,
  );

beforeEach(() => {
  asked.length = 0;
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
});

describe('Settings › Audit log', () => {
  it('reads the company audit log, and an area filter asks the API for that area', async () => {
    api.mockImplementation(async (path: string) => {
      asked.push(path);
      if (path.startsWith('/rbac/me/permissions')) return ['audit.view'];
      if (path === '/payroll/audit/chain') return { canVerify: true, checks: [] };
      if (path.startsWith('/payroll/audit')) return { entries: [ENTRY], next: null };
      throw new Error(`unexpected ${path}`);
    });
    show();
    expect(await screen.findByText('org.setting.changed')).toBeInTheDocument();
    await ue.click(screen.getByRole('combobox', { name: /Area/ }));
    await ue.click(screen.getByRole('option', { name: 'Settings' }));
    await waitFor(() => expect(asked).toContain('/payroll/audit?area=settings'));
  });

  it('negative: without audit.view the page says no access', async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/rbac/me/permissions')) return [];
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    });
    show();
    expect(await screen.findByText(/You don't have access to the audit log/)).toBeInTheDocument();
  });
});
