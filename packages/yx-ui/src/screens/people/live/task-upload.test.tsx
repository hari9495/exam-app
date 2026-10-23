import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskDialog } from './lifecycle';
import type { JourneyTask } from './types';

// Founder 23 Oct 2026: after choosing a file the Upload button stayed off (the upload box cleared the file while it was
// still "uploading"). Choosing a file turns Upload on; removing it turns it off again.
describe('task upload dialog', () => {
  it('Upload turns on once a file is chosen and sends that file', async () => {
    const ue = userEvent.setup({ pointerEventsCheck: 0 });
    const onUpload = vi.fn(async () => undefined);
    const task = { id: 't1', title: 'Collect the PAN card', kind: 'document' } as unknown as JourneyTask;
    render(<TaskDialog ask={{ kind: 'upload', task }} actions={{ onComplete: vi.fn(), onSkip: vi.fn(), onUpload }} onClose={vi.fn()} />);
    const send = screen.getByRole('button', { name: 'Upload' });
    expect(send).toBeDisabled();
    const file = new File(['x'], 'pan.png', { type: 'image/png' });
    await ue.upload(screen.getByLabelText(/^File/), file);
    await waitFor(() => expect(send).toBeEnabled());
    await ue.click(screen.getByRole('button', { name: 'Remove pan.png' }));
    expect(send).toBeDisabled();
    await ue.upload(screen.getByLabelText(/^File/), file);
    await waitFor(() => expect(send).toBeEnabled());
    await ue.click(send);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(task, file));
  });
});
