import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { useAttemptQuery, useStartAttempt } from '../../../lib/hooks/useAttempt';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import CandidateWelcomePage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('../../../lib/hooks/useAttempt', () => ({ useAttemptQuery: jest.fn(), useStartAttempt: jest.fn() }));
jest.mock('../../../lib/candidate-auth-context', () => ({ useCandidateAuth: jest.fn() }));

const mockToast = jest.fn();
jest.mock('../../../components/ui', () => {
  const actual = jest.requireActual('../../../components/ui');
  return { ...actual, useToast: () => ({ toast: mockToast }) };
});

function mockCameraGranted() {
  const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] });
  Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
}

describe('CandidateWelcomePage', () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockClear();
    mockToast.mockClear();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: 'token-1', isLoading: false });
  });

  it('shows exam title, duration, instructions, and a monitoring disclosure before start', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: 'Answer all questions.', durationMinutes: 45 } },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);

    expect(screen.getByText('Backend Screening')).toBeInTheDocument();
    expect(screen.getByText(/45 minutes/)).toBeInTheDocument();
    expect(screen.getByText('Answer all questions.')).toBeInTheDocument();
    expect(screen.getByText(/monitored/)).toBeInTheDocument();
  });

  it('starts the attempt and navigates to /exam', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45 } },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start exam' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/exam'));
  });

  it('shows a toast and does not navigate when starting the attempt fails', async () => {
    const mutateAsync = jest.fn().mockRejectedValue(new Error('network error'));
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45 } },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start exam' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(push).not.toHaveBeenCalledWith('/exam');
  });

  it('redirects straight to /exam if an attempt is already in progress (resume case)', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { status: 'in_progress', remainingSeconds: 100, sections: [], answers: [], messages: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);

    expect(push).toHaveBeenCalledWith('/exam');
  });

  it('redirects to /submitted when the attempt is already finished', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { status: 'submitted', remainingSeconds: 0, sections: [], answers: [], messages: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);

    expect(push).toHaveBeenCalledWith('/submitted');
    expect(push).not.toHaveBeenCalledWith('/exam');
  });

  it('redirects to /session-ended when the attempt query errors (dead session)', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);

    expect(push).toHaveBeenCalledWith('/session-ended');
  });

  it('redirects to /session-ended when there is no access token', () => {
    (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: null, isLoading: false });
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: false });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);

    expect(push).toHaveBeenCalledWith('/session-ended');
  });

  it('shows a waiting message with the open time when schedulingWindowState is not_open', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: {
          title: 'Scheduled Exam', instructions: null, durationMinutes: 60,
          schedulingEnabled: true, availabilityWindowStart: '2026-07-20T09:00:00.000Z', availabilityWindowEnd: '2026-07-27T18:00:00.000Z',
        },
        schedulingWindowState: 'not_open',
      },
      isLoading: false, isError: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);

    expect(screen.getByText(/opens on/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start exam' })).not.toBeInTheDocument();
  });

  it('shows a closed message when schedulingWindowState is closed', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: {
          title: 'Scheduled Exam', instructions: null, durationMinutes: 60,
          schedulingEnabled: true, availabilityWindowStart: '2026-07-01T09:00:00.000Z', availabilityWindowEnd: '2026-07-02T18:00:00.000Z',
        },
        schedulingWindowState: 'closed',
      },
      isLoading: false, isError: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);

    expect(screen.getByText(/availability window has closed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start exam' })).not.toBeInTheDocument();
  });

  it('shows the normal Start button when schedulingWindowState is open', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: {
          title: 'Scheduled Exam', instructions: null, durationMinutes: 60,
          schedulingEnabled: true, availabilityWindowStart: '2026-07-01T09:00:00.000Z', availabilityWindowEnd: '2026-12-31T18:00:00.000Z',
        },
        schedulingWindowState: 'open',
      },
      isLoading: false, isError: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));

    expect(await screen.findByRole('button', { name: 'Start exam' })).toBeInTheDocument();
  });

  it('shows the normal Start button when schedulingWindowState is null (non-scheduled exam)', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: { title: 'Normal Exam', instructions: null, durationMinutes: 60, schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null },
        schedulingWindowState: null,
      },
      isLoading: false, isError: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));

    expect(await screen.findByRole('button', { name: 'Start exam' })).toBeInTheDocument();
  });

  it('requires camera permission before Start exam is available', async () => {
    const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] });
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45 } },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);

    expect(screen.queryByRole('button', { name: /start exam/i })).not.toBeInTheDocument();
    const enableButton = screen.getByRole('button', { name: /enable camera/i });
    await userEvent.click(enableButton);

    expect(getUserMedia).toHaveBeenCalledWith({ video: true });
    expect(await screen.findByRole('button', { name: /start exam/i })).toBeInTheDocument();
  });

  it('shows an error and keeps Start hidden when camera permission is denied', async () => {
    const getUserMedia = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45 } },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: /enable camera/i }));

    expect(await screen.findByText(/camera access is required/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start exam/i })).not.toBeInTheDocument();
  });
});
