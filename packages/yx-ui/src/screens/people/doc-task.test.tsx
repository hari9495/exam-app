import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { taskButtons, taskRow } from './checklists';
import type { JourneyTask } from './live/types';

// Founder 23 Oct 2026: after uploading the PAN card the task still said Pending with Upload. A document task stays
// open until HR verifies the file, so it now says so.
const task = (documentStatus: string | null) => ({ id: 't', title: 'Collect the PAN card', kind: 'document', status: 'open', dueOn: '2026-10-25', documentStatus, ownerLabel: 'HR' }) as unknown as JourneyTask;
const actions = { onComplete: vi.fn(), onSkip: vi.fn(), onUpload: vi.fn() };

describe('document task', () => {
  it('no file yet: Pending and Upload', () => {
    expect(taskRow(task(null), undefined, null).status).toBe('Pending');
    render(<>{taskButtons(task(null), vi.fn(), { manage: true, actions })}</>);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });
  it('file in: Pending verification, with a note, and Replace', () => {
    const row = taskRow(task('uploaded'), undefined, null);
    expect(row.status).toBe('Pending verification');
    expect(row.note).toMatch(/Done once HR verifies it/);
    render(<>{taskButtons(task('uploaded'), vi.fn(), { manage: true, actions })}</>);
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
  });
  it('file refused: Rejected and Upload again', () => {
    expect(taskRow(task('rejected'), undefined, null).status).toBe('Rejected');
    render(<>{taskButtons(task('rejected'), vi.fn(), { manage: true, actions })}</>);
    expect(screen.getByRole('button', { name: 'Upload again' })).toBeInTheDocument();
  });
});
