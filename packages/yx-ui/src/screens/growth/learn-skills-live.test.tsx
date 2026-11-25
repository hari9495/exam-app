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

describe('Answer 2673: a skill I add waits for my manager', () => {
  it('Add a skill needs the skill and level, then sends it to the manager', async () => {
    const onAddOwn = vi.fn().mockResolvedValue({ id: 'g9' });
    show(<SkillsProfileScreen live={liveSkillsProfile({ onAddOwn })} />);
    await ue.click(screen.getByRole('button', { name: 'Add a skill' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Send to my manager' }));
    expect(await within(d).findByText('Choose the skill.')).toBeInTheDocument();
    expect(onAddOwn).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('combobox', { name: /Skill/ }));
    await ue.click(await screen.findByRole('option', { name: 'Lockout tagout' }));
    await ue.click(within(d).getByRole('combobox', { name: /Level/ }));
    await ue.click(await screen.findByRole('option', { name: 'Level 3' }));
    await ue.type(within(d).getByRole('textbox', { name: /How you know it/ }), 'Two years on the line');
    await ue.click(within(d).getByRole('button', { name: 'Send to my manager' }));
    expect(onAddOwn).toHaveBeenCalledWith('s3', 3, 'Two years on the line');
    expect((await screen.findAllByText('Sent to your manager to confirm.')).length).toBeGreaterThan(0);
  });

  it('a manager has no Add a skill; a self-added suggestion has no Confirm for me', () => {
    const { unmount } = show(<SkillsProfileScreen live={liveSkillsProfile({ onAddOwn: vi.fn(), data: { ...SKILL_PROFILE, self: false, canAssess: true } })} />);
    expect(screen.queryByRole('button', { name: 'Add a skill' })).toBeNull();
    unmount();
    show(<SkillSuggestionsScreen live={liveSkillSuggestions({ data: { ...SKILL_PROFILE, suggestions: [{ id: 'g9', skillId: 's3', skill: 'Lockout tagout', level: 3, from: 'Added by the person', evidence: 'Two years', canDecide: false }] } })} />);
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(screen.getByText('Waiting for the manager')).toBeInTheDocument();
    expect(screen.getByText('Added by the person: Two years')).toBeInTheDocument();
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

  it('answer 2675: Raise need starts on the gap; a title is needed; it is sent for the person', async () => {
    const onRaiseNeed = vi.fn().mockResolvedValue({ id: 'n1' });
    show(<TeamSkillsMatrixScreen live={liveTeamSkills({ onRaiseNeed })} />);
    await ue.click(screen.getByRole('button', { name: 'Raise a training need for Arjun Nair' }));
    const d = await screen.findByRole('dialog');
    const title = within(d).getByRole('textbox', { name: /What training is needed/ });
    expect(title).toHaveValue('Food safety for Arjun Nair');
    await ue.clear(title);
    await ue.click(within(d).getByRole('button', { name: 'Send to L&D' }));
    expect(await within(d).findByText('Say what training is needed (at least 3 letters).')).toBeInTheDocument();
    expect(onRaiseNeed).not.toHaveBeenCalled();
    await ue.type(title, 'Food safety refresher');
    await ue.click(within(d).getByRole('radio', { name: 'High' }));
    await ue.click(within(d).getByRole('button', { name: 'Send to L&D' }));
    expect(onRaiseNeed).toHaveBeenCalledWith({ employeeId: 'p1', skillId: 'k1', title: 'Food safety refresher', priority: 'high' });
  });

  it('without the action there is no Raise need', () => {
    show(<TeamSkillsMatrixScreen live={liveTeamSkills({ onRaiseNeed: undefined })} />);
    expect(screen.queryByRole('button', { name: /Raise a training need/ })).toBeNull();
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
