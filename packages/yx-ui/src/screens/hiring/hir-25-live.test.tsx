import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { DraftScorecardReview, NotetakerConsentPanel, type DraftRating, type LiveDraftReview, type NotetakerControls, type Participant } from './hiring-pipeline';

// HIR-25 notetaker (founder decision 2), the designed card and draft review with the panel's controls: positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const people = (cand: Participant['consent'], me: Participant['consent'], hm: Participant['consent'] = 'given'): Participant[] => [
  { key: 'candidate', name: 'Ananya Iyer', role: 'Candidate', consent: cand, canAnswer: true },
  { key: 'u1', name: 'Joseph Mathew', role: 'Interviewer', consent: me, canAnswer: true },
  { key: 'u2', name: 'Karthik S', role: 'Hiring manager', consent: hm, canAnswer: false },
];
const controls = (over: Partial<NotetakerControls> = {}): NotetakerControls => ({ provider: null, aiDraft: true, isPanelist: true, transcript: null, myDraft: false, submitted: false, onConsent: vi.fn().mockResolvedValue(undefined), onTranscript: vi.fn().mockResolvedValue(undefined), onDraft: vi.fn().mockResolvedValue(undefined), ...over });

describe('HIR-25 notetaker card (live)', () => {
  it('waiting: the panellist answers for themselves and records the candidate’s answer; others’ rows have no buttons', async () => {
    const c = controls();
    show(<NotetakerConsentPanel participants={people('waiting', 'waiting')} controls={c} />);
    expect(screen.getByText('Not recording')).toBeInTheDocument();
    expect(screen.getByText('Recording starts only after every participant consents.', { exact: false })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'I consent' }));
    expect(c.onConsent).toHaveBeenLastCalledWith('me', 'given');
    await ue.click(screen.getByRole('button', { name: 'Candidate declined' }));
    expect(c.onConsent).toHaveBeenLastCalledWith('candidate', 'declined');
    expect((await screen.findAllByText('The candidate declined: no recording')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button').filter((b) => /Karthik/.test(b.textContent ?? ''))).toHaveLength(0);
  });

  it('someone declined: no recording, said plainly; no transcript upload', () => {
    show(<NotetakerConsentPanel participants={people('given', 'given', 'declined')} controls={controls()} />);
    expect(screen.getByText(/Karthik S declined\. No recording or transcript/)).toBeInTheDocument();
    expect(screen.queryByText('No recording provider is connected')).not.toBeInTheDocument();
  });

  it('withdrawing consent asks first and says the transcript and drafts are deleted', async () => {
    const c = controls();
    show(<NotetakerConsentPanel participants={people('given', 'given')} controls={c} />);
    await ue.click(screen.getByRole('button', { name: 'Withdraw my consent' }));
    expect(screen.getByText(/The transcript and every draft scorecard for this interview are deleted now/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Withdraw consent' }));
    await waitFor(() => expect(c.onConsent).toHaveBeenCalledWith('me', 'declined'));
  });

  it('everyone consented, no provider: the transcript is added as a text file; a refusal shows', async () => {
    const c = controls();
    show(<NotetakerConsentPanel participants={people('given', 'given')} controls={c} />);
    expect(screen.getByText('No recording provider is connected')).toBeInTheDocument();
    expect(screen.getByText('Not recording')).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await ue.upload(input, new File(['Candidate: I start with payment failures.'], 'call.txt', { type: 'text/plain' }));
    await waitFor(() => expect(c.onTranscript).toHaveBeenCalledWith('Candidate: I start with payment failures.'));
  });

  it('transcript added: Draft with AI; with AI off it says to fill the scorecard yourself; an AI failure shows the reason', async () => {
    const t = { addedAt: new Date(2026, 10, 12), addedBy: 'Joseph Mathew' };
    const c = controls({ transcript: t, onDraft: vi.fn().mockRejectedValue(new Error('The AI draft did not work. Try again, or fill the scorecard yourself.')) });
    const { unmount } = show(<NotetakerConsentPanel participants={people('given', 'given')} controls={c} />);
    expect(screen.getByText('Transcript added 12 Nov 2026 by Joseph Mathew.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Draft my scorecard from the transcript' }));
    expect(await screen.findByText('The AI draft did not work. Try again, or fill the scorecard yourself.')).toBeInTheDocument();
    unmount();
    show(<NotetakerConsentPanel participants={people('given', 'given')} controls={controls({ transcript: t, aiDraft: false })} />);
    expect(screen.getByText('AI drafting is off for your company. Fill the scorecard yourself.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Draft my scorecard/ })).not.toBeInTheDocument();
  });

  it('after submitting there is nothing to draft or upload', () => {
    show(<NotetakerConsentPanel participants={people('given', 'given')} controls={controls({ submitted: true, transcript: { addedAt: new Date(), addedBy: 'x' } })} />);
    expect(screen.queryByRole('button', { name: /Draft my scorecard/ })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});

const DRAFTS: DraftRating[] = [
  { itemId: 'i1', skill: 'Test design', aiRating: 4, aiNote: 'Prioritised by risk.', quote: 'Payment failures first.' },
  { itemId: 'i2', skill: 'Communication', aiRating: 3, aiNote: 'Clear.', quote: 'Web or mobile?' },
];
const review = (over: Partial<LiveDraftReview> = {}): LiveDraftReview => ({ state: 'ready', onRetry: vi.fn(), scaleMax: 4, onSubmit: vi.fn().mockResolvedValue(undefined), onBack: vi.fn(), ...over });

describe('HIR-25 draft scorecard review (live)', () => {
  it('Submit pressed too early says what is missing and sends nothing (never disabled); the scale is the scorecard’s', async () => {
    const l = review();
    show(<DraftScorecardReview candidate="Ananya Iyer" drafts={DRAFTS} live={l} />);
    expect(screen.queryAllByRole('radio', { name: '5' })).toHaveLength(0);
    const submit = screen.getByRole('button', { name: 'Submit scorecard' });
    expect(submit).toBeEnabled();
    await ue.click(submit);
    expect(await screen.findByText('Confirm or change every rating first.')).toBeInTheDocument();
    expect(screen.getByText('Choose your recommendation.')).toBeInTheDocument();
    expect(l.onSubmit).not.toHaveBeenCalled();
  });

  it('the panellist confirms one, changes the other, chooses a recommendation and submits: their own ratings go', async () => {
    const l = review();
    show(<DraftScorecardReview candidate="Ananya Iyer" drafts={DRAFTS} live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Confirm 4' }));
    await ue.click(screen.getAllByRole('radio', { name: '2' })[1]!);
    expect(screen.getByText('Changed from 3')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Yes' }));
    await ue.click(screen.getByRole('button', { name: 'Submit scorecard' }));
    await waitFor(() => expect(l.onSubmit).toHaveBeenCalledWith({ ratings: [{ itemId: 'i1', rating: 4, notes: 'Prioritised by risk.' }, { itemId: 'i2', rating: 2, notes: 'Clear.' }], recommendation: 'yes' }));
    expect((await screen.findAllByText('Scorecard submitted')).length).toBeGreaterThan(0);
    expect(l.onBack).toHaveBeenCalled();
  });

  it('a refusal stays on the page; no draft and error states', async () => {
    const l = review({ onSubmit: vi.fn().mockRejectedValue(new Error('You already submitted this scorecard; it cannot change.')) });
    const { unmount } = show(<DraftScorecardReview candidate="A" drafts={DRAFTS} defaultConfirmed={[0, 1]} live={l} />);
    await ue.click(screen.getByRole('radio', { name: 'No' }));
    await ue.click(screen.getByRole('button', { name: 'Submit scorecard' }));
    expect(await screen.findByText('You already submitted this scorecard; it cannot change.')).toBeInTheDocument();
    unmount();
    const { unmount: u2 } = show(<DraftScorecardReview candidate="A" drafts={[]} live={review({ state: 'not-found' })} />);
    expect(screen.getByText('There is no draft for you on this interview.')).toBeInTheDocument();
    u2();
    const onRetry = vi.fn();
    show(<DraftScorecardReview candidate="A" drafts={[]} live={review({ state: 'error', onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
