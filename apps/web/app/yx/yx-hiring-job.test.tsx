import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHiringJobPage from './(app)/hiring/jobs/[id]/page';
import YxInterviewPage from './(app)/hiring/interviews/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › one job and one interview on the API (M10 batch AT5).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;
const router = { push: jest.fn(), replace: jest.fn() };

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue(router);
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/jobs/j1');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'j1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const JOB = { id: 'j1', title: 'Plant Engineer', description: null, status: 'open', createdById: 'u', createdAt: '2026-09-01T00:00:00.000Z', closedAt: null, linkedExams: [], publicApplyEnabled: false, listOnCareers: false, applyToken: null, department: 'Production', hiringManagerId: null, headcount: 2, salaryMin: null, salaryMax: null, salaryCurrency: null, approval: null, customFields: [], jobBoardIds: [] };
const BOARD = {
  pipeline: { id: 'p', name: 'Standard', stages: [{ id: 's1', name: 'Applied', category: 'active', position: 0, statuses: [{ id: 'st1', name: 'Applied', position: 0 }], rules: [] }, { id: 's4', name: 'Rejected', category: 'rejected', position: 1, statuses: [{ id: 'st4', name: 'Rejected', position: 0 }], rules: [] }] },
  columns: { s1: [{ entryId: 'e1', candidateId: 'c1', candidateName: 'Priya Raman', candidateEmail: 'priya@example.com', statusId: 'st1', stageId: 's1', category: 'active', enteredVia: 'manual', rejectedReason: null, examResults: [], avgRating: null, feedbackCount: 0, fitScore: null, fitStatus: null, fitStale: false, assignedUserId: null, assigneeName: null, referredByName: null, assignedGroupId: null, assignedGroupName: null, customFields: [], blueprintChecklist: {}, stageEnteredAt: '2026-10-10T00:00:00.000Z', scorecards: { interviewId: 'iv1', complete: true, submitted: 2, expected: 2, score: 3, passes: true }, nextInterviewAt: null, rejectionPendingUntil: null }], s4: [] },
};

describe('Hiring › one job (M10 AT5)', () => {
  it('shows the board with the scorecard result and sets the job’s scorecard', async () => {
    const put: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/rbac/me/permissions')) return ['pipeline:manage', 'results:view'];
      if (path === '/jobs/j1') return JOB;
      if (path === '/hiring/jobs/j1/board') return BOARD;
      if (path === '/hiring/jobs/j1/interview-settings') return { scorecardTemplateId: null, exams: [] };
      if (path === '/hiring/scorecard-templates') return [{ id: 'tp1', name: 'Engineer round 1' }];
      if (path === '/hiring/jobs/j1/scorecard' && init?.method === 'PUT') return (put.push(JSON.parse(String(init.body))), {});
      if (path.startsWith('/exams')) return { data: [], total: 0 };
      if (path.startsWith('/candidates?')) return { data: [], total: 0 };
      return [];
    });
    wrap(<YxHiringJobPage />);
    expect(await screen.findByText('Passes the bar (3)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Job settings' }));
    await userEvent.click(await screen.findByRole('combobox', { name: 'Scorecard for new interviews' }));
    await userEvent.click(screen.getByRole('option', { name: 'Engineer round 1' }));
    await waitFor(() => expect(put).toEqual([{ templateId: 'tp1' }]));
  });
});

describe('Hiring › one interview (M10 AT5, D7)', () => {
  it('submits the panellist’s scorecard', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'iv1' });
    const posted: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/rbac/me/permissions')) return ['interview:view_assigned'];
      if (path === '/hiring/interviews/iv1') return {
        interview: { id: 'iv1', status: 'confirmed', location: 'Room 4', timeZone: 'Asia/Kolkata', meetingUrl: null, slots: [], jobId: 'j1', jobTitle: 'Plant Engineer', candidateId: 'c1', candidateName: 'Priya Raman' },
        panel: [{ userId: 'u2', name: 'Kavya', submitted: false }], resume: null,
        template: { id: 'tp1', name: 'Round 1', scaleMax: 4, passBar: 2.5, items: [{ id: 'a', label: 'Safety', guidance: null, weight: 1 }] },
        viewer: { isPanelist: true, isOverseer: false }, scorecards: [], result: null, earlier: [],
      };
      if (path === '/hiring/interviews/iv1/scorecard/submit') return (posted.push(JSON.parse(String(init!.body))), { status: 'submitted' });
      return [];
    });
    wrap(<YxInterviewPage />);
    await userEvent.click(within(await screen.findByRole('radiogroup', { name: 'Safety' })).getByRole('radio', { name: '3' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Strong yes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit scorecard' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit scorecard' }));
    await waitFor(() => expect(posted).toEqual([{ ratings: [{ itemId: 'a', rating: 3, notes: null }], recommendation: 'strong_yes', summary: null }]));
  });
});
