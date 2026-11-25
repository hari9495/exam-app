import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JobBoardsScreen } from './boards';
import { boards } from './careers.stories';

// Recruitment batch AT3 (M10-BUILD-DESIGN §6, §13).

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Job boards (AT3)', () => {
  it('copies a feed link, and a push board asks for its account details', async () => {
    const onCopy = vi.fn(async () => ({}));
    const onSave = vi.fn(async () => ({}));
    render(<JobBoardsScreen {...boards} onCopy={onCopy} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Copy feed link' }));
    expect(onCopy).toHaveBeenCalledWith(boards.boards[0].feedUrl);
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();

    await ue.click(screen.getByRole('button', { name: 'Set up LinkedIn' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Save board' }));
    expect(within(d).getAllByText(/^Enter the /)).toHaveLength(2);
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/Access token/), 'secret-token');
    await ue.type(within(d).getByLabelText(/Organisation URN/), 'urn:li:organization:9');
    await ue.click(within(d).getByRole('button', { name: 'Save board' }));
    expect(onSave).toHaveBeenCalledWith(boards.boards[1], { name: 'LinkedIn', provider: 'linkedin', config: { accessToken: 'secret-token', organizationUrn: 'urn:li:organization:9' } });
  });
});
