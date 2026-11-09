import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InterviewScreen, MyInterviewsScreen, ScorecardTemplatesScreen } from './interviews';
import { interview, mine, templates } from './job-workspace.stories';

// Recruitment batch AT5 (M10-BUILD-DESIGN §8, §9; D7).

const ue = userEvent.setup({ pointerEventsCheck: 0 });

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
