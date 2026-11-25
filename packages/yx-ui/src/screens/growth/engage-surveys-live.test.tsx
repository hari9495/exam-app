import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ActionPlanScreen, SurveyBuilderScreen, SurveyResultsScreen, SurveysListScreen, TakeSurveyScreen } from './engage-surveys';
import { FeedScreen, PostComposerScreen } from './engage-feed';
import { POLL_UPDATE, liveActionPlan, liveFeedWithPosts, livePostComposer, liveSurveyBuilder, liveSurveyResults, liveSurveysList, liveTakeSurvey } from './engage-live-samples';

// Batch G2 items 74 and 75: ENG-04 to ENG-07 surveys, results and plans; polls in the feed. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('ENG-04 surveys (live)', () => {
  it('lists surveys with response rates; a draft opens to edit, others to results', async () => {
    const onOpen = vi.fn();
    show(<SurveysListScreen live={liveSurveysList({ onOpen })} />);
    expect(screen.getByText('131 of 248 · 53%')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }));
  });

  it('the builder: a named survey is only for onboarding and exit; Save without a name says so', async () => {
    const onSave = vi.fn();
    show(<SurveyBuilderScreen live={liveSurveyBuilder({ onSave })} />);
    await ue.click(screen.getByRole('button', { name: /Save and exit/ }));
    expect(await screen.findByText('Name the survey (at least 3 letters).')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('the builder saves a draft with the starter questions and the closing day', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 's3' });
    const onDone = vi.fn();
    show(<SurveyBuilderScreen live={liveSurveyBuilder({ onSave, onDone, initial: { id: 's3', name: 'Pulse', type: 'pulse', anonymous: true, minGroup: 5, questions: liveSurveyBuilder().options!.starters.pulse, locationIds: [], departmentIds: [], opensOn: '2026-10-01', closesOn: '2026-10-12', remind: true } })} />);
    await ue.click(screen.getByRole('button', { name: /Save and exit/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pulse', type: 'pulse', anonymous: true, closesOn: '2026-10-12', questions: expect.arrayContaining([expect.objectContaining({ id: 'enps' })]) }), 's3');
    expect(onDone).toHaveBeenCalled();
  });
});

describe('ENG-05 take a survey (live)', () => {
  it('says it is anonymous; Send with nothing answered says so; answers are sent', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    show(<TakeSurveyScreen live={liveTakeSurvey({ onSend })} />);
    expect(screen.getByText('This survey is anonymous')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send answers' }));
    expect(await screen.findByText('Answer at least one question.')).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
    await ue.click(within(screen.getByRole('radiogroup', { name: /recommend/ })).getByRole('radio', { name: '9' }));
    await ue.click(screen.getByRole('radio', { name: 'About right' }));
    await ue.click(screen.getByRole('button', { name: 'Send answers' }));
    expect(onSend).toHaveBeenCalledWith({ enps: 9, workload: 'About right' });
    expect(await screen.findByText('Thank you, your answers are in')).toBeInTheDocument();
  });

  it('answered already or closed: no Send', () => {
    const { unmount } = show(<TakeSurveyScreen live={liveTakeSurvey({ survey: { ...liveTakeSurvey().survey!, answered: true } })} />);
    expect(screen.queryByRole('button', { name: 'Send answers' })).toBeNull();
    unmount();
    show(<TakeSurveyScreen live={liveTakeSurvey({ survey: { ...liveTakeSurvey().survey!, closed: true } })} />);
    expect(screen.getByText('This survey has closed')).toBeInTheDocument();
  });
});

describe('ENG-06 results and ENG-07 plans (live)', () => {
  it('company results: departments below the smallest group cannot be chosen', async () => {
    show(<SurveyResultsScreen live={liveSurveyResults()} />);
    expect(screen.getByText('72%')).toBeInTheDocument();
    await ue.click(screen.getByRole('combobox', { name: 'Department' }));
    expect(await screen.findByRole('option', { name: /Quality \(fewer than 5\)/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('a manager team below the smallest group sees no numbers and no plan button', () => {
    show(<SurveyResultsScreen live={liveSurveyResults({ persona: 'mgr', onPlan: () => undefined, data: { ...liveSurveyResults().data!, responded: 3, invited: undefined, suppressed: true } })} />);
    expect(screen.queryByText('72%')).toBeNull();
    expect(screen.queryByRole('button', { name: /action plan/ })).toBeNull();
  });

  it('a plan needs a focus; then it is shared with the actions', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(<ActionPlanScreen live={liveActionPlan({ onSave })} />);
    await ue.click(screen.getByRole('button', { name: 'Share with team' }));
    expect(await screen.findByText('Choose the area to focus on.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /What to work on/ }));
    await ue.click(await screen.findByRole('option', { name: /Clarity/ }));
    await ue.click(screen.getByRole('button', { name: 'Share with team' }));
    expect(onSave).toHaveBeenCalledWith({ focus: 'Clarity', focusScore: '58% favourable', status: 'shared', items: [] });
  });
});

describe('polls (item 75)', () => {
  it('a poll in the feed: voting sends the option', async () => {
    const onVote = vi.fn().mockResolvedValue(undefined);
    show(<FeedScreen live={liveFeedWithPosts({ updates: [POLL_UPDATE], onVote })} />);
    await ue.click(screen.getByRole('button', { name: 'Pongal' }));
    expect(onVote).toHaveBeenCalledWith('p1', 1);
  });

  it('the composer: a poll needs 2 options and a closing day', async () => {
    const onPost = vi.fn().mockResolvedValue({ state: 'published' });
    show(<PostComposerScreen live={livePostComposer({ onPost, today: new Date(2026, 9, 1) })} />);
    await ue.click(screen.getByRole('radio', { name: 'Poll' }));
    await ue.type(screen.getByRole('textbox', { name: /Question/ }), 'Breakfast on Friday?');
    await ue.click(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByText('Add at least 2 options.')).toBeInTheDocument();
    expect(screen.getByText('Choose the day the poll closes.')).toBeInTheDocument();
    expect(onPost).not.toHaveBeenCalled();
  });
});
