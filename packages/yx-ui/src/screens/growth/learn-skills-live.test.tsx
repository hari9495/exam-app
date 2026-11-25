import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SkillsProfileScreen, SkillSuggestionsScreen } from './learn-me';
import { TeamSkillsMatrixScreen, TrainingNeedsScreen } from './learn-admin';
import { PoshCountsCard } from './learn-skills-live';
import { POSH_COUNTS, SKILL_PROFILE, liveSkillSuggestions, liveSkillsProfile, liveTeamSkills, liveTrainingNeeds } from './learn-skills-samples';

// G3d with real records: positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('LRN-10 and LRN-15 skills (live)', () => {
  it('my skills: levels, gaps for the job title, and the suggestions banner; no Set a level for myself', async () => {
    const onSuggestions = vi.fn();
    show(<SkillsProfileScreen live={liveSkillsProfile({ onSuggestions })} />);
    expect(screen.getByRole('heading', { name: 'My skills' })).toBeInTheDocument();
    expect(screen.getByText('1 below')).toBeInTheDocument();
    expect(screen.getAllByText('Not assessed').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Set a level' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Review suggestions' }));
    expect(onSuggestions).toHaveBeenCalled();
  });

  it('the manager sets a level: skill and level are required', async () => {
    const onAssess = vi.fn().mockResolvedValue({ ok: true });
    show(<SkillsProfileScreen live={liveSkillsProfile({ onAssess, data: { ...SKILL_PROFILE, self: false, canAssess: true } })} />);
    await ue.click(screen.getByRole('button', { name: 'Set a level' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Save level' }));
    expect(await within(d).findByText('Choose the skill.')).toBeInTheDocument();
    expect(onAssess).not.toHaveBeenCalled();
  });

  it('suggestions: confirm or reject; a refusal shows; no buttons for someone who may not decide', async () => {
    const onDecide = vi.fn().mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('This suggestion was decided already.'));
    const { unmount } = show(<SkillSuggestionsScreen live={liveSkillSuggestions({ onDecide })} />);
    await ue.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onDecide).toHaveBeenCalledWith('g1', true);
    await ue.click(screen.getByRole('button', { name: 'Reject' }));
    expect((await screen.findAllByText('This suggestion was decided already.')).length).toBeGreaterThan(0);
    unmount();
    show(<SkillSuggestionsScreen live={liveSkillSuggestions({ data: { ...SKILL_PROFILE, self: false, canDecide: false } })} />);
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });
});

describe('LRN-09 team skills (live)', () => {
  it('shows levels against the job title, gaps counted; a skill the job does not need says so', async () => {
    const onPerson = vi.fn();
    show(<TeamSkillsMatrixScreen live={liveTeamSkills({ onPerson })} />);
    expect(screen.getByText('2 people · 2 gaps')).toBeInTheDocument();
    expect(screen.getByText('Not needed')).toBeInTheDocument();
    await ue.click(screen.getByRole('link', { name: 'Arjun Nair' }));
    expect(onPerson).toHaveBeenCalledWith('p1');
  });

  it('nobody reporting shows an empty state', () => {
    show(<TeamSkillsMatrixScreen live={liveTeamSkills({ data: { skills: [], people: [] } })} />);
    expect(screen.getByText('No one reports to you')).toBeInTheDocument();
  });
});

describe('LRN-11 needs and budgets (live)', () => {
  it('adding a need checks the name and who it is for', async () => {
    const onAdd = vi.fn().mockResolvedValue({ id: 'n3' });
    show(<TrainingNeedsScreen live={liveTrainingNeeds({ onAdd })} />);
    await ue.click(screen.getByRole('button', { name: 'Add need' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Add need' }));
    expect(await within(d).findByText('Name the need (3 letters or more).')).toBeInTheDocument();
    expect(within(d).getByText('Choose the person.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('budgets: over budget says by how much', async () => {
    show(<TrainingNeedsScreen live={liveTrainingNeeds()} />);
    await ue.click(screen.getByRole('tab', { name: 'Budgets' }));
    expect(screen.getByText(/Over by/)).toBeInTheDocument();
  });
});

describe('Answer 2620: committee counts', () => {
  it('shows counts only at or above the minimum', () => {
    show(<PoshCountsCard counts={POSH_COUNTS} />);
    expect(screen.getByText('Fewer than 5')).toBeInTheDocument();
    expect(screen.getByText('41')).toBeInTheDocument();
  });
});
