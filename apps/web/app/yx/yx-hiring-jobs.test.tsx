import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHiringJobsPage from './(app)/hiring/jobs/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › Jobs on the existing hiring API (M10 batch AT1, AT-1.03 / 1.05).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;
const push = jest.fn();

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/jobs');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'recruiter', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Hiring › Jobs (M10 AT1)', () => {
  it('lists jobs with their pipeline, opens the existing workspace and creates a job linked to a department', async () => {
    const posted: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
      if (key === 'GET /rbac/me/permissions') return ['pipeline:manage', 'results:view', 'org.structure.view'];
      if (key === 'GET /jobs') return [{ id: 'j1', title: 'Senior accountant', status: 'open', createdAt: '2026-10-01T09:00:00Z', pipelineId: 'p1', stageCounts: { byStageId: { s1: 2 }, byCategory: { active: 2, offer: 0, hired: 0, rejected: 0, archived: 0 } }, approval: null }];
      if (key === 'GET /pipelines') return [{ id: 'p1', name: 'Standard', isDefault: true, stages: [{ id: 's1', name: 'Interview' }] }];
      if (key === 'GET /users/directory' || key.startsWith('GET /users')) return [];
      if (key === 'GET /custom-fields') return [];
      if (key === 'GET /org/masters/departments') return [{ id: 'd1', name: 'Finance', archivedAt: null }];
      if (key === 'GET /org/locations' || key === 'GET /org/masters/designations') return [];
      if (key === 'POST /jobs') return (posted.push(JSON.parse(String(init!.body))), { id: 'j2' });
      throw new Error(`unexpected ${key}`);
    });
    wrap(<YxHiringJobsPage />);
    expect(await screen.findByText('2 Interview')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(push).toHaveBeenCalledWith('/v2/jobs/j1');
    await userEvent.click(screen.getByRole('button', { name: 'New job' }));
    const d = screen.getByRole('dialog');
    await userEvent.type(within(d).getByRole('textbox', { name: /Job title/ }), 'Accountant');
    await userEvent.click(within(d).getByRole('combobox', { name: 'Department' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Finance' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(posted).toEqual([expect.objectContaining({ title: 'Accountant', departmentId: 'd1', pipelineId: 'p1' })]));
  });
});
