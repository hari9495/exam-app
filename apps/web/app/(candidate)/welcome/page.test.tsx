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
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ defaultValue }: { defaultValue?: string }) => (
    <textarea aria-label="code-editor" defaultValue={defaultValue} />
  ),
}));

function mockCameraGranted() {
  const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] });
  Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
}

async function checkConsent() {
  await userEvent.click(screen.getByRole('checkbox', { name: /i understand and consent to monitoring/i }));
}

async function skipPractice() {
  await userEvent.click(screen.getByRole('button', { name: /skip practice/i }));
}

describe('CandidateWelcomePage', () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockClear();
    mockToast.mockClear();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: 'token-1', isLoading: false });
  });

  it('shows exam title, duration, instructions, and a monitoring disclosure before start', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: 'Answer all questions.', durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();

    expect(screen.getByText('Backend Screening')).toBeInTheDocument();
    expect(screen.getByText(/45 minutes/)).toBeInTheDocument();
    expect(screen.getByText('Answer all questions.')).toBeInTheDocument();
    expect(screen.getByText(/monitored/)).toBeInTheDocument();
  });

  it('greets the candidate by name so shared devices are not confusing', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { candidateName: 'Ada Lovelace', exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();

    expect(screen.getByText(/Hi, Ada Lovelace/)).toBeInTheDocument();
  });

  it('starts the attempt and navigates to /exam', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    await checkConsent();
    await userEvent.click(await screen.findByRole('button', { name: 'Start exam' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/exam'));
  });

  it('shows a toast and does not navigate when starting the attempt fails', async () => {
    const mutateAsync = jest.fn().mockRejectedValue(new Error('network error'));
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    await checkConsent();
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

  it('shows a waiting message with the open time when schedulingWindowState is not_open', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: {
          title: 'Scheduled Exam', instructions: null, durationMinutes: 60,
          schedulingEnabled: true, availabilityWindowStart: '2026-07-20T09:00:00.000Z', availabilityWindowEnd: '2026-07-27T18:00:00.000Z',
          proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] },
        },
        schedulingWindowState: 'not_open',
        sections: [],
      },
      isLoading: false, isError: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();

    expect(screen.getByText(/opens on/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start exam' })).not.toBeInTheDocument();
  });

  it('shows a closed message when schedulingWindowState is closed', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: {
          title: 'Scheduled Exam', instructions: null, durationMinutes: 60,
          schedulingEnabled: true, availabilityWindowStart: '2026-07-01T09:00:00.000Z', availabilityWindowEnd: '2026-07-02T18:00:00.000Z',
          proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] },
        },
        schedulingWindowState: 'closed',
        sections: [],
      },
      isLoading: false, isError: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();

    expect(screen.getByText(/availability window has closed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start exam' })).not.toBeInTheDocument();
  });

  it('shows the normal Start button when schedulingWindowState is open', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: {
          title: 'Scheduled Exam', instructions: null, durationMinutes: 60,
          schedulingEnabled: true, availabilityWindowStart: '2026-07-01T09:00:00.000Z', availabilityWindowEnd: '2026-12-31T18:00:00.000Z',
          proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] },
        },
        schedulingWindowState: 'open',
        sections: [],
      },
      isLoading: false, isError: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));

    expect(await screen.findByRole('button', { name: 'Start exam' })).toBeInTheDocument();
  });

  it('shows the normal Start button when schedulingWindowState is null (non-scheduled exam)', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: { title: 'Normal Exam', instructions: null, durationMinutes: 60, schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
        schedulingWindowState: null,
        sections: [],
      },
      isLoading: false, isError: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));

    expect(await screen.findByRole('button', { name: 'Start exam' })).toBeInTheDocument();
  });

  it('requires camera permission before Start exam is available', async () => {
    const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] });
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();

    expect(screen.queryByRole('button', { name: /start exam/i })).not.toBeInTheDocument();
    const enableButton = screen.getByRole('button', { name: /enable camera/i });
    await userEvent.click(enableButton);

    expect(getUserMedia).toHaveBeenCalledWith({ video: true });
    expect(await screen.findByRole('button', { name: /start exam/i })).toBeInTheDocument();
  });

  it('shows a blocked state and a retry action when camera access is denied', async () => {
    const getUserMedia = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: /enable camera/i }));

    expect(await screen.findByText('Camera access blocked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry camera access' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start exam/i })).not.toBeInTheDocument();
  });

  it('shows Start exam once the camera is granted', async () => {
    mockCameraGranted();
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));

    expect(await screen.findByText('Camera connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start exam' })).toBeInTheDocument();
  });

  it('keeps Start exam disabled when camera is granted but consent is unchecked', async () => {
    mockCameraGranted();
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));

    expect(await screen.findByRole('button', { name: 'Start exam' })).toBeDisabled();
  });

  it('enables Start exam once both camera is granted and consent is checked', async () => {
    mockCameraGranted();
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    await checkConsent();

    expect(await screen.findByRole('button', { name: 'Start exam' })).toBeEnabled();
  });

  it('shows a section/question-count breakdown when the preview includes sections', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
        sections: [{ title: 'Aptitude', questionCount: 5 }, { title: 'Coding', questionCount: 2 }],
      },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();

    expect(screen.getByText('Aptitude')).toBeInTheDocument();
    expect(screen.getByText('5 questions')).toBeInTheDocument();
    expect(screen.getByText('Coding')).toBeInTheDocument();
    expect(screen.getByText('2 questions')).toBeInTheDocument();
    expect(screen.getByText('7 questions total')).toBeInTheDocument();
  });

  it('uses singular "question total" when the breakdown totals exactly one question', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
        sections: [{ title: 'General Knowledge', questionCount: 1 }],
      },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();

    expect(screen.getByText('1 question total')).toBeInTheDocument();
  });

  function setIsExtended(value: boolean | undefined) {
    Object.defineProperty(window.screen, 'isExtended', { value, configurable: true });
  }

  it('blocks start and shows the disconnect message while a second display is detected', async () => {
    setIsExtended(true);
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    await checkConsent();
    await userEvent.click(await screen.findByRole('button', { name: 'Start exam' }));

    expect(screen.getByText('Please disconnect additional displays before starting the exam.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('proceeds when clicked again after the display is disconnected', async () => {
    setIsExtended(true);
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    await checkConsent();
    await userEvent.click(await screen.findByRole('button', { name: 'Start exam' }));
    expect(mutateAsync).not.toHaveBeenCalled();

    setIsExtended(false);
    await userEvent.click(screen.getByRole('button', { name: 'Start exam' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  });

  it('proceeds normally when isExtended is unsupported (undefined)', async () => {
    setIsExtended(undefined);
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { exam: { title: 'Backend Screening', instructions: null, durationMinutes: 45, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } }, sections: [] },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    await checkConsent();
    await userEvent.click(await screen.findByRole('button', { name: 'Start exam' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  });

  it('does not block starting on a second display when the exam has that signal turned off', async () => {
    setIsExtended(true);
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: {
          title: 'Backend Screening', instructions: null, durationMinutes: 45,
          proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: ['multi_monitor_detected'] },
        },
        sections: [],
      },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    mockCameraGranted();

    render(<CandidateWelcomePage />);
    await skipPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    await checkConsent();
    await userEvent.click(await screen.findByRole('button', { name: 'Start exam' }));

    expect(screen.queryByText('Please disconnect additional displays before starting the exam.')).not.toBeInTheDocument();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  });

  it('does not request camera permission or show the camera step when webcam proctoring is off for this exam', async () => {
    setIsExtended(undefined);
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' });
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        exam: {
          title: 'Backend Screening', instructions: null, durationMinutes: 45,
          proctoring: { webcamEnabled: false, enforcement: 'block', strikeLimit: 3, disabledSignals: [] },
        },
        sections: [],
      },
      isLoading: false,
    });
    (useStartAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });

    render(<CandidateWelcomePage />);
    await skipPractice();

    expect(screen.queryByRole('button', { name: /enable camera/i })).not.toBeInTheDocument();
    await checkConsent();
    await userEvent.click(await screen.findByRole('button', { name: 'Start exam' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  });
});
