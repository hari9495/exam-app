import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAttemptQuery, useRunnerActions } from '../../../lib/hooks/useAttempt';
import CandidateSubmittedPage from './page';
import CandidateResultPage from '../result/page';

jest.mock('../../../lib/hooks/useAttempt', () => ({
  useAttemptQuery: jest.fn(),
  useRunnerActions: jest.fn(() => ({ sendSurvey: jest.fn(), sendAppeal: jest.fn() })),
  useCandidateCertificate: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
  useCandidateBrand: jest.fn(() => ({ company: 'Acme Labs', candidate: 'Ada Lovelace', logoUrl: null, myTestsHref: '/my-tests' })),
}));

// AS-4a: the designed submitted step (PRC-26) with the survey, and the result page (PRC-27).
const state = (feedback: unknown, surveyDone = false) => ({
  data: {
    candidateName: 'Arjun', status: 'submitted', remainingSeconds: 0, sections: [], answers: [], messages: [],
    exam: { title: 'Java L2', proctoring: { enableAntiCheating: false } }, feedback,
    runner: { surveyDone },
  },
});

describe('CandidateSubmittedPage', () => {
  beforeEach(() => (useRunnerActions as jest.Mock).mockReturnValue({ sendSurvey: jest.fn().mockResolvedValue({ ok: true }) }));

  it('shows the submitted step while loading', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: true });
    render(<CandidateSubmittedPage />);
    expect(screen.getByText('Test submitted')).toBeInTheDocument();
  });

  it('links to the result once it is released, and sends the survey', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue(state({ status: 'settled', visibility: 'pass_fail', passFail: 'pass', percentage: null, sections: null }));
    const sendSurvey = jest.fn().mockResolvedValue({ ok: true });
    (useRunnerActions as jest.Mock).mockReturnValue({ sendSurvey });
    render(<CandidateSubmittedPage />);
    expect(screen.getByRole('link', { name: 'See your result' })).toHaveAttribute('href', '/result');
    await userEvent.click(screen.getByRole('button', { name: 'Start survey' }));
    await userEvent.click(screen.getByRole('radio', { name: '4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendSurvey).toHaveBeenCalledWith({ rating: 4 });
  });

  it('negative: a held result says it is under review, no link; an answered survey is not offered again', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue(state({ status: 'held', visibility: 'pass_fail', passFail: null, percentage: null, sections: null }, true));
    render(<CandidateSubmittedPage />);
    expect(screen.getByText(/under review/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'See your result' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start survey' })).not.toBeInTheDocument();
  });
});

describe('CandidateResultPage', () => {
  it('shows pass or fail only as the test allows; held shows no score', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue(state({ status: 'settled', visibility: 'score', passFail: 'fail', percentage: 41, sections: null }));
    const { unmount } = render(<CandidateResultPage />);
    // AS-3: the header names the real company and candidate, never the sample ones.
    expect(screen.getByText('Acme Labs')).toBeInTheDocument();
    expect(screen.queryByText('Kaveri Foods')).toBeNull();
    expect(screen.getByText('Result: not passed')).toBeInTheDocument();
    expect(screen.getByText('41 %')).toBeInTheDocument();
    unmount();
    (useAttemptQuery as jest.Mock).mockReturnValue(state({ status: 'held', visibility: 'score', passFail: null, percentage: null, sections: null }));
    render(<CandidateResultPage />);
    expect(screen.getByText('Result under review')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  // AS-5 (answer 2012): an integrity decision with its window; the candidate appeals in their own words.
  const decision = (over: object = {}) => ({ verdict: 'warning', sectionTitle: null, reason: 'A second voice was heard twice.', decidedAt: '2026-11-15T10:00:00.000Z', appealUntil: '2026-11-22T10:00:00.000Z', canAppeal: true, appeal: null, ...over });
  it('shows the decision and its reason, and sends the appeal', async () => {
    const sendAppeal = jest.fn().mockResolvedValue({ ok: true });
    (useRunnerActions as jest.Mock).mockReturnValue({ sendAppeal });
    (useAttemptQuery as jest.Mock).mockReturnValue(state({ status: 'settled', visibility: 'pass_fail', passFail: 'pass', percentage: null, sections: null, integrity: decision() }));
    render(<CandidateResultPage />);
    expect(screen.getByText('A warning was noted on your test')).toBeInTheDocument();
    expect(screen.getByText('A second voice was heard twice.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Appeal this decision' }));
    await userEvent.type(screen.getByLabelText(/Why should we look again/), 'It was the TV in the next room.');
    await userEvent.click(screen.getByRole('button', { name: 'Send appeal' }));
    expect(sendAppeal).toHaveBeenCalledWith('It was the TV in the next room.');
  });

  it('negative: an invalidated test shows the decision and no score; a sent appeal cannot be sent again', () => {
    (useRunnerActions as jest.Mock).mockReturnValue({ sendAppeal: jest.fn() });
    (useAttemptQuery as jest.Mock).mockReturnValue(state({ status: 'invalidated', visibility: 'score', passFail: null, percentage: null, sections: null, integrity: decision({ verdict: 'attempt', canAppeal: false, appeal: { status: 'open', sentAt: '2026-11-16T10:00:00.000Z', decidedAt: null, reason: null } }) }));
    render(<CandidateResultPage />);
    expect(screen.getByText('Your test was not counted')).toBeInTheDocument();
    expect(screen.getByText(/Appeal received on/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Appeal this decision' })).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
