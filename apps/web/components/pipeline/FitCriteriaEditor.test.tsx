import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FitCriteriaEditor } from './FitCriteriaEditor';
import { QueryProvider } from '../../lib/query-provider';
import { ToastProvider } from '../ui';
import { JobDetail } from '../../lib/types';

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org', role: 'recruiter' }),
}));

const BASE_JOB: JobDetail = {
  id: 'job-1',
  title: 'Backend Engineer',
  description: null,
  status: 'open',
  createdById: 'u1',
  createdAt: '2026-01-01T00:00:00.000Z',
  closedAt: null,
  linkedExams: [],
  publicApplyEnabled: false,
  applyToken: null,
  fitCriteria: null,
  fitRubric: null,
};

function mockFetch(overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  const fetchMock = jest.fn(async (url, options) => {
    const override = overrides(String(url), options);
    if (override) return override;
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderEditor(job: JobDetail = BASE_JOB) {
  return render(
    <QueryProvider>
      <ToastProvider>
        <FitCriteriaEditor job={job} jobId="job-1" />
      </ToastProvider>
    </QueryProvider>,
  );
}

describe('FitCriteriaEditor', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('saves fitCriteria via useUpdateJob', async () => {
    const fetchMock = mockFetch((url, options) => {
      if (url.endsWith('/jobs/job-1') && options?.method === 'PATCH') {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return null;
    });
    renderEditor();

    await userEvent.type(screen.getByLabelText("What you're looking for"), 'Strong SQL and system design skills');
    await userEvent.click(screen.getByRole('button', { name: 'Save fit criteria' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/jobs/job-1') && call[1]?.method === 'PATCH')).toBe(true),
    );
    const patchCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/jobs/job-1') && call[1]?.method === 'PATCH');
    expect(JSON.parse(String(patchCall![1]?.body))).toMatchObject({ fitCriteria: 'Strong SQL and system design skills' });
  });

  it('shows a running weight total and blocks save when the rubric does not sum to 100', async () => {
    mockFetch();
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Add dimension' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add dimension' }));

    const weightInputs = screen.getAllByLabelText(/weight/i);
    await userEvent.clear(weightInputs[0]);
    await userEvent.type(weightInputs[0], '60');
    await userEvent.clear(weightInputs[1]);
    await userEvent.type(weightInputs[1], '30');

    expect(await screen.findByText(/90/)).toBeInTheDocument();
    expect(screen.getByText(/sum to 100/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save fit criteria' })).toBeDisabled();
  });

  it('saves a valid rubric (sums to 100) as an array', async () => {
    const fetchMock = mockFetch((url, options) => {
      if (url.endsWith('/jobs/job-1') && options?.method === 'PATCH') {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return null;
    });
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Add dimension' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add dimension' }));

    const labelInputs = screen.getAllByLabelText(/dimension.*label/i);
    const weightInputs = screen.getAllByLabelText(/weight/i);
    await userEvent.type(labelInputs[0], 'Communication');
    await userEvent.clear(weightInputs[0]);
    await userEvent.type(weightInputs[0], '60');
    await userEvent.type(labelInputs[1], 'Technical depth');
    await userEvent.clear(weightInputs[1]);
    await userEvent.type(weightInputs[1], '40');

    const saveButton = screen.getByRole('button', { name: 'Save fit criteria' });
    expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/jobs/job-1') && call[1]?.method === 'PATCH')).toBe(true),
    );
    const patchCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/jobs/job-1') && call[1]?.method === 'PATCH');
    expect(JSON.parse(String(patchCall![1]?.body)).fitRubric).toEqual([
      { label: 'Communication', weight: 60 },
      { label: 'Technical depth', weight: 40 },
    ]);
  });
});
