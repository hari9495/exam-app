import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskDialog, TaskForm } from './lifecycle';
import type { FormDef, JourneyTask } from './types';

// Founder 23 Oct 2026: after choosing a file the Upload button stayed off (the upload box cleared the file while it was
// still "uploading"). Upload without a file says what is missing; with the chosen file it sends that file.
describe('task upload dialog', () => {
  it('Upload asks for a file until one is chosen and sends that file', async () => {
    const ue = userEvent.setup({ pointerEventsCheck: 0 });
    const onUpload = vi.fn(async () => undefined);
    const task = { id: 't1', title: 'Collect the PAN card', kind: 'document' } as unknown as JourneyTask;
    render(<TaskDialog ask={{ kind: 'upload', task }} actions={{ onComplete: vi.fn(), onSkip: vi.fn(), onUpload }} onClose={vi.fn()} />);
    const send = screen.getByRole('button', { name: 'Upload' });
    await ue.click(send);
    expect(screen.getByText('Choose a file to upload.')).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
    const file = new File(['x'], 'pan.png', { type: 'image/png' });
    await ue.upload(screen.getByLabelText(/^File/), file);
    await ue.click(screen.getByRole('button', { name: 'Remove pan.png' }));
    await ue.click(send);
    expect(onUpload).not.toHaveBeenCalled();
    await ue.upload(screen.getByLabelText(/^File/), file);
    await ue.click(send);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(task, file));
  });
});

// Founder 24 Oct 2026: a 1 to 5 rating is clicked, not typed.
describe('task form rating', () => {
  it('a short whole-number scale is a row of choices', async () => {
    const ue = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = vi.fn();
    render(<TaskForm form={{ sections: [{ title: 'S', fields: [{ key: 'rating', label: 'How was working here?', type: 'number', min: 1, max: 5, required: true }] }] } as unknown as FormDef} answers={{}} onChange={onChange} errors={{}} />);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    await ue.click(screen.getByRole('radio', { name: '4' }));
    expect(onChange).toHaveBeenCalledWith({ rating: 4 });
  });
});
