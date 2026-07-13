import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionForm } from './QuestionForm';

describe('QuestionForm', () => {
  it('submits a single_mcq question with the marked correct option', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[{ id: 'tag-1', name: 'Backend' }]} onSubmit={onSubmit} submitLabel="Create question" />);

    await userEvent.type(screen.getByLabelText('Question text'), 'What is 2+2?');
    // Marks defaults to "1" for a new question, and userEvent.type appends at
    // the cursor rather than replacing -- clear it first or "5" becomes "15".
    await userEvent.clear(screen.getByLabelText('Marks'));
    await userEvent.type(screen.getByLabelText('Marks'), '5');
    const optionInputs = screen.getAllByLabelText(/Option \d text/);
    await userEvent.type(optionInputs[0], '4');
    await userEvent.type(optionInputs[1], '5');
    await userEvent.click(screen.getAllByRole('radio')[0]); // mark option 1 correct (single_mcq uses radio)
    await userEvent.click(screen.getByRole('button', { name: 'Create question' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'single_mcq',
        text: 'What is 2+2?',
        marks: 5,
        options: [
          { text: '4', isCorrect: true },
          { text: '5', isCorrect: false },
        ],
      }),
    );
  });

  it('pre-fills every field from an initial question for editing', () => {
    render(
      <QuestionForm
        initialQuestion={{
          id: 'q-1',
          type: 'true_false',
          text: 'The sky is blue.',
          topic: null,
          category: null,
          difficulty: 'easy',
          marks: 2,
          negativeMarks: 0,
          status: 'active',
          aiGenerated: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          options: [
            { id: 'o-1', text: 'True', isCorrect: true },
            { id: 'o-2', text: 'False', isCorrect: false },
          ],
        }}
        tags={[]}
        onSubmit={jest.fn()}
        submitLabel="Save"
      />,
    );
    expect(screen.getByLabelText('Question text')).toHaveValue('The sky is blue.');
    expect(screen.getByLabelText('Marks')).toHaveValue(2);
  });
});
