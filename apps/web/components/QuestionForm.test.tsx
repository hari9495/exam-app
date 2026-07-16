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
          codeLanguage: null,
          starterCode: null,
          allowStdin: false,
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

  it('submits a code question with codeLanguage, starterCode, and zero options when type is code', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Question type' }));
    await userEvent.click(screen.getByRole('option', { name: 'Code' }));
    await userEvent.type(screen.getByLabelText('Question text'), 'Reverse a string');
    await userEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    await userEvent.click(screen.getByRole('option', { name: 'python' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'code', codeLanguage: 'python', options: [] }),
    );
  });

  it('does not show the options editor when type is code', async () => {
    render(<QuestionForm tags={[]} onSubmit={jest.fn()} submitLabel="Create" />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Question type' }));
    await userEvent.click(screen.getByRole('option', { name: 'Code' }));

    expect(screen.queryByText('Options')).not.toBeInTheDocument();
  });

  it('includes allowStdin in the submitted payload when checked, for code questions only', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} submitLabel="Create question" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Question type' }));
    await userEvent.click(screen.getByRole('option', { name: 'Code' }));
    await userEvent.click(screen.getByLabelText('Allow candidates to provide input (stdin)'));
    await userEvent.type(screen.getByLabelText('Question text'), 'Read a line and print it.');
    await userEvent.click(screen.getByRole('button', { name: 'Create question' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ allowStdin: true }));
  });
});
