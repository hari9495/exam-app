import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExitInterview, type LiveExitInterview } from './exits';
import type { FormDef } from './live/types';

// PPL-21 live: the leaver answers the designed exit interview from the API's form; HR reads the answers on the
// designed HR page and keeps notes.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const FORM: FormDef = {
  sections: [{ id: 'why', fields: [{ key: 'would_return', type: 'choice', label: 'Would you work here again?', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] }, { key: 'change', type: 'textarea', label: 'What should we change?' }] }],
  rules: [],
};

describe('Me › Exit interview (PPL-21)', () => {
  const mine = (over: Partial<Extract<LiveExitInterview, { kind: 'mine' }>> = {}) => {
    const live: Extract<LiveExitInterview, { kind: 'mine' }> = { kind: 'mine', state: 'ready', onRetry: vi.fn(), data: { form: FORM, status: 'sent', lastDay: '2026-10-31' }, onSubmit: vi.fn(async () => ({})), ...over };
    render(<ExitInterview live={live} />);
    return live;
  };

  it('Send explains a missing answer, then sends the answers', async () => {
    const live = mine();
    await ue.click(screen.getByRole('button', { name: 'Send answers' }));
    expect(screen.getByText('Answer this question.')).toBeInTheDocument();
    expect(live.onSubmit).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: 'Would you work here again?' }));
    await ue.click(screen.getByRole('option', { name: 'Yes' }));
    await ue.click(screen.getByRole('button', { name: 'Send answers' }));
    expect(live.onSubmit).toHaveBeenCalledWith({ would_return: 'yes' });
  });

  it("the server's refusal shows on the form", async () => {
    mine({ onSubmit: vi.fn(async () => Promise.reject(Object.assign(new Error('The interview is closed.'), { body: { fieldErrors: {} } }))) });
    await ue.click(screen.getByRole('combobox', { name: 'Would you work here again?' }));
    await ue.click(screen.getByRole('option', { name: 'No' }));
    await ue.click(screen.getByRole('button', { name: 'Send answers' }));
    expect(await screen.findByText('The interview is closed.')).toBeInTheDocument();
  });

  it('answered, or none to answer: says so, no form', () => {
    const { unmount } = render(<ExitInterview live={{ kind: 'mine', state: 'ready', onRetry: vi.fn(), data: { form: FORM, status: 'submitted', lastDay: null }, onSubmit: vi.fn() }} />);
    expect(screen.getByText('Your answers are in. Thank you.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send answers' })).toBeNull();
    unmount();
    mine({ data: { form: FORM, status: null, lastDay: null } });
    expect(screen.getByText('You have no exit interview to answer.')).toBeInTheDocument();
  });
});

describe('HR › Exit interview (PPL-21)', () => {
  const hr = (over: Partial<Extract<LiveExitInterview, { kind: 'hr' }>> = {}) => {
    const live: Extract<LiveExitInterview, { kind: 'hr' }> = { kind: 'hr', state: 'ready', onRetry: vi.fn(), name: 'Ravi Kumar', data: { form: FORM, status: 'submitted', submittedAt: '2026-10-20T10:00:00Z', answers: { would_return: 'no' }, hrNotes: 'Met him.' }, onNotes: vi.fn(async () => ({})), onBack: vi.fn(), ...over };
    render(<ExitInterview live={live} />);
    return live;
  };

  it('shows the answers in words and saves the notes', async () => {
    const live = hr();
    expect(screen.getByText('Exit interview · Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText('Answered 20 Oct 2026 · confidential')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByText('Not answered')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Notes/ }), ' Rehire.');
    await ue.click(screen.getByRole('button', { name: 'Save notes' }));
    expect(live.onNotes).toHaveBeenCalledWith('Met him. Rehire.');
    await ue.click(screen.getByRole('button', { name: 'Back to the exit' }));
    expect(live.onBack).toHaveBeenCalled();
  });

  it('without the confidential key: no answers', () => {
    hr({ state: 'no-access', data: null });
    expect(screen.queryByRole('button', { name: 'Save notes' })).toBeNull();
    expect(screen.getByText(/confidential exit key/)).toBeInTheDocument();
  });
});
