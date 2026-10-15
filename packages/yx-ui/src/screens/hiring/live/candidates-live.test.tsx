import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HiringCandidatesScreen } from './candidates';
import { CandidateProfileScreen } from './profile';
import { CandidateRetentionScreen, DuplicatesScreen, TalentPoolsScreen } from './talent';
import { duplicates, list, pools, profile, retention } from './candidates.stories';

// Recruitment batch AT4 (M10-BUILD-DESIGN §7, §13).

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Candidates list (AT4)', () => {
  it('adds a candidate with an email check', async () => {
    const onCreate = vi.fn(async () => ({}));
    render(<HiringCandidatesScreen {...list} onCreate={onCreate} />);
    await ue.click(screen.getByRole('button', { name: 'Add candidate' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByLabelText(/^Name/), 'Divya S');
    await ue.type(within(d).getByLabelText(/^Email/), 'divya@');
    expect(within(d).getByRole('button', { name: 'Add candidate' })).toBeDisabled();
    await ue.type(within(d).getByLabelText(/^Email/), 'example.com');
    await ue.click(within(d).getByRole('button', { name: 'Add candidate' }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Divya S', email: 'divya@example.com', phone: undefined, customFields: undefined });
  });

  it('bulk: invite to an assessment and email the selected candidates', async () => {
    const onInvite = vi.fn(async () => ({ invited: 2, skipped: 0 }));
    const onEmail = vi.fn(async () => ({ total: 2 }));
    render(<HiringCandidatesScreen {...list} onInvite={onInvite} onEmail={onEmail} />);
    await ue.click(screen.getByRole('checkbox', { name: /Priya Raman/ }));
    await ue.click(screen.getByRole('checkbox', { name: /Arun Kumar/ }));
    await ue.click(screen.getByRole('button', { name: 'Invite to an assessment' }));
    let d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('combobox', { name: 'Assessment' }));
    await ue.click(screen.getByRole('option', { name: 'Accounts aptitude' }));
    await ue.click(within(d).getByRole('button', { name: 'Send invitations' }));
    expect(onInvite).toHaveBeenCalledWith('e1', ['c1', 'c2']);
    expect(await screen.findByText(/Invited 2/)).toBeInTheDocument();

    await ue.click(screen.getByRole('checkbox', { name: /Priya Raman/ }));
    await ue.click(screen.getByRole('button', { name: 'Email selected' }));
    d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('combobox', { name: 'Template' }));
    await ue.click(screen.getByRole('option', { name: 'Thank you' }));
    await ue.click(within(d).getByRole('button', { name: 'Send' }));
    expect(onEmail).toHaveBeenCalledWith(['c1'], { templateId: 't1', subject: 'Thank you, {{candidateName}}', body: 'Thank you for applying to {{orgName}}.' });
  });
});

describe('Candidate profile (AT4)', () => {
  it('shows consents with versions and the retention date; places a hold with a reason', async () => {
    const onHold = vi.fn(async () => ({}));
    render(<CandidateProfileScreen {...profile} onHold={onHold} />);
    expect(screen.getByText('Kept for other roles')).toBeInTheDocument();
    expect(screen.getByText(/Kept until/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Place legal hold' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('button', { name: 'Place hold' })).toBeDisabled();
    await ue.type(within(d).getByLabelText(/Reason/), 'Labour court case');
    await ue.click(within(d).getByRole('button', { name: 'Place hold' }));
    expect(onHold).toHaveBeenCalledWith(true, 'Labour court case');
  });

  it('merges a duplicate in with a field-by-field choice', async () => {
    const onMerge = vi.fn(async () => ({}));
    render(<CandidateProfileScreen {...profile} onMerge={onMerge} />);
    await ue.click(screen.getByRole('button', { name: 'Merge a duplicate into this one' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('combobox', { name: 'Duplicate to merge in' }));
    await ue.click(screen.getByRole('option', { name: /Priya R ·/ }));
    await ue.click(await within(d).findByRole('radio', { name: 'Priya R' }));
    await ue.click(within(d).getByRole('button', { name: 'Merge' }));
    expect(onMerge).toHaveBeenCalledWith('c9', { name: 'merged', phone: 'kept', resume: 'kept' });
  });
});

describe('Duplicates, pools and retention (AT4)', () => {
  it('merges a pair keeping the chosen candidate', async () => {
    const onMerge = vi.fn(async () => ({}));
    render(<DuplicatesScreen {...duplicates} onMerge={onMerge} />);
    expect(screen.getByText(/Same phone, Similar résumé/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Compare and merge' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('radio', { name: 'priya.r@example.com' }));
    await ue.click(within(d).getByRole('button', { name: 'Merge' }));
    expect(onMerge).toHaveBeenCalledWith('c9', 'c1', { name: 'kept', phone: 'kept', resume: 'kept' });
  });

  it('creates a hotlist', async () => {
    const onCreate = vi.fn(async () => ({}));
    render(<TalentPoolsScreen {...pools} onCreate={onCreate} />);
    await ue.click(screen.getByRole('button', { name: 'New list' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('radio', { name: 'Hotlist' }));
    await ue.type(within(d).getByLabelText(/^Name/), 'Drivers');
    await ue.click(within(d).getByRole('button', { name: 'Create list' }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Drivers', kind: 'hotlist', description: null });
  });

  it('previews without changing anything, and a real run needs confirming', async () => {
    const onRun = vi.fn(retention.onRun);
    render(<CandidateRetentionScreen {...retention} onRun={onRun} />);
    await ue.click(screen.getByRole('button', { name: 'Preview (changes nothing)' }));
    expect(await screen.findByText(/2 renewal emails, 1 anonymised/)).toBeInTheDocument();
    expect(onRun).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Run now' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Run now' }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });
});
