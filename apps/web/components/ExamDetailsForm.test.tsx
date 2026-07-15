import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExamDetailsForm } from './ExamDetailsForm';

describe('ExamDetailsForm', () => {
  it('submits title, duration, and pass criteria', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create exam" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Backend Round');
    await userEvent.clear(screen.getByLabelText('Duration (minutes)'));
    await userEvent.type(screen.getByLabelText('Duration (minutes)'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Create exam' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Backend Round', durationMinutes: 45 }),
    );
  });

  it('submits schedulingEnabled and both window datetimes when scheduling is turned on', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Scheduled Exam');
    await userEvent.click(screen.getByLabelText('Enable scheduling'));
    const startInput = screen.getByLabelText('Window opens') as HTMLInputElement;
    const endInput = screen.getByLabelText('Window closes') as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '2026-07-20T09:00' } });
    fireEvent.change(endInput, { target: { value: '2026-07-27T18:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        schedulingEnabled: true,
        availabilityWindowStart: new Date('2026-07-20T09:00').toISOString(),
        availabilityWindowEnd: new Date('2026-07-27T18:00').toISOString(),
      }),
    );
  });

  it('shows a validation error and does not submit when scheduling is on but a window field is missing', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Bad Exam');
    await userEvent.click(screen.getByLabelText('Enable scheduling'));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Both a window open and close time are required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a validation error and does not submit when the window close time is not after the open time', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Backwards Window Exam');
    await userEvent.click(screen.getByLabelText('Enable scheduling'));
    const startInput = screen.getByLabelText('Window opens') as HTMLInputElement;
    const endInput = screen.getByLabelText('Window closes') as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '2026-07-27T18:00' } });
    fireEvent.change(endInput, { target: { value: '2026-07-20T09:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('The window close time must be after its open time.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not include scheduling window fields when scheduling is off', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Normal Exam');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ schedulingEnabled: false }));
    const call = onSubmit.mock.calls[0][0];
    expect(call.availabilityWindowStart).toBeUndefined();
    expect(call.availabilityWindowEnd).toBeUndefined();
  });

  it('pre-fills the window inputs from an existing scheduled exam', () => {
    const scheduledExam = {
      id: 'exam-1', title: 'Existing', instructions: null, status: 'draft' as const, durationMinutes: 60,
      passCriteriaPercent: 40, randomizeOrder: false, schedulingEnabled: true,
      availabilityWindowStart: '2026-07-20T09:00:00.000Z', availabilityWindowEnd: '2026-07-27T18:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z', sections: [],
    };
    render(<ExamDetailsForm initialExam={scheduledExam} onSubmit={jest.fn()} submitLabel="Save" />);

    // Derived the same way the component derives it (local date/time components from the ISO
    // string), rather than hardcoding a UTC-only expectation — this suite runs outside UTC.
    const expected = new Date(scheduledExam.availabilityWindowStart);
    const pad = (n: number) => String(n).padStart(2, '0');
    const expectedValue = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}T${pad(expected.getHours())}:${pad(expected.getMinutes())}`;

    expect(screen.getByLabelText('Enable scheduling')).toBeChecked();
    expect(screen.getByLabelText('Window opens')).toHaveValue(expectedValue);
  });
});
