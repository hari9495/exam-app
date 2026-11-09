import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScorecardTemplatesScreen } from './interviews';
import { templates } from './job-workspace.stories';

// Recruitment batch AT5 (M10-BUILD-DESIGN §9): scorecard templates. The interview and scorecard tests are in
// ../hir-06-07-live.test.tsx with the designed screens.

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Scorecard templates (AT5)', () => {
  it('a used scorecard is copied, never edited', async () => {
    const onSave = vi.fn(async () => ({}));
    render(<ScorecardTemplatesScreen {...templates} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Copy Engineer round 1' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Save scorecard' }));
    expect(onSave).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Engineer round 1 (copy)', passBar: 2.5 }));
  });
});
