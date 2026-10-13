import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JobWorkspaceScreen } from './job-workspace';
import { ApplicationPanel } from './application';
import { InterviewScreen, MyInterviewsScreen, ScorecardTemplatesScreen } from './interviews';
import { interview, mine, panel, templates, workspace } from './job-workspace.stories';

// Recruitment batch AT5 (M10-BUILD-DESIGN §8, §9; D7).

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Job workspace (AT5)', () => {
  it('shows the board with scorecard results, and undoes a waiting rejection', async () => {
    const onUndo = vi.fn(async () => ({}));
    render(<JobWorkspaceScreen {...workspace} onUndo={onUndo} />);
    expect(screen.getByText('Passes the bar (3.1)')).toBeInTheDocument();
    expect(screen.getByText(/Meena Iyer was rejected/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Undo rejection of Meena Iyer' }));
    expect(onUndo).toHaveBeenCalledWith('e3');
  });

  it('rejecting asks for a reason and the message, which waits 24 hours by default', async () => {
    const onReject = vi.fn(async () => ({}));
    render(<JobWorkspaceScreen {...workspace} onReject={onReject} />);
    await ue.click(screen.getByRole('radio', { name: 'List' }));
    await ue.click(screen.getByRole('checkbox', { name: /Arun Kumar/ }));
    await ue.click(screen.getByRole('button', { name: 'Reject' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('button', { name: 'Reject' })).toBeDisabled();
    await ue.type(within(d).getByLabelText(/^Reason/), 'Needs night-shift experience');
    await ue.click(within(d).getByRole('combobox', { name: 'Template' }));
    await ue.click(screen.getByRole('option', { name: 'Regret' }));
    await ue.click(within(d).getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledWith(['e2'], { reason: 'Needs night-shift experience', delayHours: 24, message: { templateId: 't1', subject: 'Your application', body: 'Thank you, {{candidateName}}.' } });
  });

  it('settings: a linked test is sent when entering a stage; the scorecard is chosen per job', async () => {
    const onSendOn = vi.fn(async () => ({}));
    render(<JobWorkspaceScreen {...workspace} onSendOn={onSendOn} />);
    await ue.click(screen.getByRole('tab', { name: 'Job settings' }));
    await ue.click(screen.getByRole('combobox', { name: 'Send Plant aptitude when entering' }));
    await ue.click(screen.getByRole('option', { name: 'Applied' }));
    expect(onSendOn).toHaveBeenCalledWith('x1', 's1');
  });
});

describe('Application panel (AT5)', () => {
  it('schedules an interview with the panel and the scorecard', async () => {
    const onSchedule = vi.fn(async () => ({}));
    render(<ApplicationPanel {...panel} onSchedule={onSchedule} />);
    await ue.click(screen.getByRole('tab', { name: /Interviews/ }));
    await ue.click(screen.getByRole('button', { name: 'Schedule an interview' }));
    const d = screen.getAllByRole('dialog').at(-1)!;
    await ue.click(within(d).getByRole('radio', { name: 'Candidate books' }));
    await ue.click(within(d).getByRole('combobox', { name: 'Panel' }));
    await ue.click(screen.getByRole('option', { name: 'Kavya' }));
    await ue.keyboard('{Escape}');
    await ue.type(within(d).getByLabelText(/^Where/), 'Video call');
    expect(within(d).getByRole('button', { name: 'Schedule' })).toBeDisabled(); // no booking window yet
  });

  it('offers go for approval when the company asks for it', async () => {
    const onOffer = vi.fn(async () => ({}));
    render(<ApplicationPanel {...panel} onOffer={onOffer} />);
    await ue.click(screen.getByRole('tab', { name: /Offers/ }));
    await ue.click(screen.getByRole('button', { name: 'Create an offer' }));
    const d = screen.getAllByRole('dialog').at(-1)!;
    expect(within(d).getByRole('radio', { name: 'Send for approval' })).toBeInTheDocument();
    expect(within(d).queryByRole('radio', { name: 'Send to candidate' })).not.toBeInTheDocument();
  });
});

describe('Interviews and scorecards (AT5, D7)', () => {
  it('a panellist rates every item and recommends before submitting; colleagues stay hidden until then', async () => {
    const onSubmit = vi.fn(async () => ({}));
    render(<InterviewScreen {...interview} onSubmit={onSubmit} />);
    expect(screen.getByText(/appear here after you submit yours/)).toBeInTheDocument();
    expect(screen.queryByText(/Anil’s scorecard/)).not.toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Submit scorecard' });
    expect(submit).toBeDisabled();
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Communication' })).getByRole('radio', { name: '2' }));
    await ue.click(screen.getByRole('radio', { name: 'Yes' }));
    await ue.click(submit);
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit scorecard' }));
    expect(onSubmit).toHaveBeenCalledWith({ ratings: [{ itemId: 'a', rating: 3, notes: null }, { itemId: 'b', rating: 2, notes: null }], recommendation: 'yes', summary: null });
  });

  it('my interviews shows the scorecards still to do', () => {
    render(<MyInterviewsScreen {...mine} />);
    expect(screen.getByText('Priya Raman')).toBeInTheDocument();
    expect(screen.getByText('Arun Kumar')).toBeInTheDocument();
    expect(screen.queryByText('Divya S')).not.toBeInTheDocument();
  });

  it('a used scorecard is copied, never edited', async () => {
    const onSave = vi.fn(async () => ({}));
    render(<ScorecardTemplatesScreen {...templates} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Copy Engineer round 1' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Save scorecard' }));
    expect(onSave).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Engineer round 1 (copy)', passBar: 2.5 }));
  });
});
