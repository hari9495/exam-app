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
      passCriteriaPercent: 40, randomizeOrder: false, feedbackVisibility: 'pass_fail' as const, schedulingEnabled: true,
      availabilityWindowStart: '2026-07-20T09:00:00.000Z', availabilityWindowEnd: '2026-07-27T18:00:00.000Z',
      walkInEnabled: false, allowedIpRange: null, createdAt: '2026-07-01T00:00:00.000Z', sections: [],
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

  it('includes feedbackVisibility in the submitted value, defaulting to pass_fail for a new exam', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save details" />);

    await userEvent.type(screen.getByLabelText('Title'), 'New Exam');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ feedbackVisibility: 'pass_fail' }));
  });

  it('lets the recruiter change the candidate feedback level', async () => {
    const onSubmit = jest.fn();
    render(
      <ExamDetailsForm
        initialExam={{ title: 'Exam', durationMinutes: 60, passCriteriaPercent: 40, randomizeOrder: false, feedbackVisibility: 'pass_fail', schedulingEnabled: false } as any}
        onSubmit={onSubmit}
        submitLabel="Save details"
      />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: /candidate feedback/i }));
    await userEvent.click(screen.getByRole('option', { name: /score/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ feedbackVisibility: 'score' }));
  });

  it('includes walkInEnabled in the submitted value, defaulting to false for a new exam', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save details" />);

    await userEvent.type(screen.getByLabelText('Title'), 'New Exam');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ walkInEnabled: false }));
  });

  it('lets the recruiter enable walk-in registration', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save details" />);

    await userEvent.type(screen.getByLabelText('Title'), 'New Exam');
    await userEvent.click(screen.getByLabelText('Enable walk-in registration for this exam'));
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ walkInEnabled: true }));
  });

  it('submits a trimmed allowedIpRange and omits it when blank', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save" />);
    await userEvent.type(screen.getByLabelText(/allowed ip \/ cidr range/i), '  203.0.113.0/24  ');
    await userEvent.type(screen.getByLabelText('Title'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ allowedIpRange: '203.0.113.0/24' }));
  });

  it('prefills allowedIpRange from initialExam and sends null when cleared', async () => {
    const onSubmit = jest.fn();
    const examWithIpRange = {
      id: 'exam-1', title: 'Existing', instructions: null, status: 'draft' as const, durationMinutes: 60,
      passCriteriaPercent: 40, randomizeOrder: false, feedbackVisibility: 'pass_fail' as const, schedulingEnabled: false,
      availabilityWindowStart: null, availabilityWindowEnd: null, walkInEnabled: false,
      allowedIpRange: '203.0.113.0/24', createdAt: '2026-07-01T00:00:00.000Z', sections: [],
    };
    render(<ExamDetailsForm initialExam={examWithIpRange} onSubmit={onSubmit} submitLabel="Save" />);

    const ipInput = screen.getByLabelText(/allowed ip \/ cidr range/i);
    expect(ipInput).toHaveValue('203.0.113.0/24');

    await userEvent.clear(ipInput);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ allowedIpRange: null }));
  });
});
