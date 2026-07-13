import { render, screen } from '@testing-library/react';
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
});
