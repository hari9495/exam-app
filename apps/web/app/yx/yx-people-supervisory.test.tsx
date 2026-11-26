import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxJobHistoryPage from './(app)/people/history/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Answer 2762: People › Job history shows whether HR marked the job as a manager or supervisor (payroll uses it for the
// Tamil Nadu and Delhi labour welfare fund).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const PERSON = { id: 'p-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142', legalEntityId: 'le-1', designation: 'Quality Lead', department: 'Quality', location: 'Chennai office' };
const HEADER = { id: 'p-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142', legalEntity: { id: 'le-1', name: 'Kaveri Foods Pvt Ltd' }, joinedOn: '2024-07-01', exitedOn: null };
const FACTS = {
  location: { id: 'loc-1', name: 'Chennai office', state: 'IN-TN', timezone: 'Asia/Kolkata' },
  department: { id: 'd-1', name: 'Quality' },
  designation: { id: 'des-1', name: 'Quality Lead' },
  grade: { id: 'g-1', name: 'G3' },
  employmentType: { id: 'et-1', name: 'Permanent' },
  manager: { id: 'p-divya', name: 'Divya Raghunathan' },
  costCentres: [],
};
const api = apiFetch as jest.Mock;
const load = (assignment: Record<string, unknown>) =>
  api.mockImplementation(async (path: string) => {
    const p = path.split('?')[0];
    if (p === '/rbac/me/permissions') return [];
    if (p === '/people/employees') return [PERSON];
    if (p === '/people/employees/p-arjun/as-of') return { employee: HEADER, asOf: '2026-11-26', assignment: { ...FACTS, validFrom: '2026-11-01', validTo: null, ...assignment }, status: { status: 'confirmed', validFrom: '2024-07-01', validTo: null }, payAccess: false, compensation: null };
    if (p === '/people/employees/p-arjun/history') return { employee: HEADER, payAccess: false, changes: [], assignment: [], status: [], compensation: [] };
    throw new Error(`unexpected ${path}`);
  });

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/people/history');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('person=p-arjun'));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const answer = async () => (await screen.findByText('Manager or supervisor')).nextElementSibling?.textContent;

describe('/yx/people/history: manager or supervisor (answer 2762)', () => {
  it('a job HR marked as a manager or supervisor says Yes', async () => {
    load({ supervisory: true });
    wrap(<YxJobHistoryPage />);
    expect(await answer()).toBe('Yes');
  });

  it('negative: not marked, or a record from before the field, says No', async () => {
    load({ supervisory: false });
    const { unmount } = wrap(<YxJobHistoryPage />);
    expect(await answer()).toBe('No');
    unmount();
    load({});
    wrap(<YxJobHistoryPage />);
    expect(await answer()).toBe('No');
  });
});
