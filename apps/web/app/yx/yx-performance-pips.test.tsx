import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxPipPage from './(app)/performance/pips/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// PRF-12 PIP record: the designed screen wired to /performance (M06 batch PM8; builder 2).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/performance/pips/p1');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'p1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Improvement plan (M06 batch PM8)', () => {
  it('the manager records a check-in with a rating and a note; too early it says what is missing', async () => {
    const posted: unknown[] = [];
    const pip = {
      id: 'p1', employee: 'Arjun', employeeId: 'e1', manager: 'Priya', reason: 'Accuracy fell.', expectations: 'Errors at most 2%.', support: 'Coaching.',
      startsOn: '2026-10-01', plannedEndsOn: '2026-10-31', endsOn: '2026-10-31', pausedDays: 0, pausedNow: false, checkinEveryDays: 7, status: 'active',
      acknowledgedAt: null, employeeComment: null, extendedFrom: null, extendReason: null, outcomeNote: null, outcomeAt: null, letterId: null, exitCaseId: null,
      goals: [], checkins: [{ id: 'c1', dueOn: '2026-10-08', heldOn: null, managerNote: null, employeeNote: null, status: 'due' }],
      warning: false, role: 'manager', can: { acknowledge: false, checkin: true, employeeNote: false, outcome: false, extend: false, letter: false, startExit: false }, version: 2,
      approval: { steps: [{ id: 'proposed', label: 'Proposed', status: 'done' }, { id: 'hr', label: 'HR approval', status: 'done', approver: 'Hema' }, { id: 'ack', label: 'Employee acknowledgement', status: 'current' }], canDecide: false }, extendDays: 30,
    };
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/performance/pips/p1' && !init?.method) return pip;
      if (path === '/performance/pips/p1/checkins' && init?.method === 'POST') return (posted.push(JSON.parse(String(init.body))), pip);
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    wrap(<YxPipPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Record check-in' }))[0]!);
    const d = screen.getByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: 'Record check-in' }));
    expect(await within(d).findByText('Choose how it is going.')).toBeInTheDocument();
    expect(posted).toEqual([]);
    await userEvent.click(within(d).getByRole('radio', { name: 'On track' }));
    await userEvent.type(within(d).getByRole('textbox', { name: /Note/ }), 'Errors down to 3%.');
    await userEvent.click(within(d).getByRole('button', { name: 'Record check-in' }));
    await waitFor(() => expect(posted).toEqual([{ checkinId: 'c1', note: 'Errors down to 3%.', rating: 'on_track' }]));
  });
});
