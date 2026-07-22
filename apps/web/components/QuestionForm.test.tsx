import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionForm } from './QuestionForm';
import { useUploadQuestionImage, useCodeLanguages } from '../lib/hooks/useQuestions';

jest.mock('../lib/hooks/useQuestions', () => ({
  useUploadQuestionImage: jest.fn(),
  useCodeLanguages: jest.fn(),
}));

describe('QuestionForm', () => {
  beforeEach(() => {
    (useUploadQuestionImage as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useCodeLanguages as jest.Mock).mockReturnValue({
      data: [
        { language: 'python', version: '3.10.0' },
        { language: 'java', version: '15.0.2' },
      ],
      isLoading: false,
    });
  });

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
          languageMode: 'fixed',
          allowedLanguages: [],
          starterCode: null,
          allowStdin: false,
          snippetCode: null,
          snippetLanguage: null,
          imageUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          options: [
            { id: 'o-1', text: 'True', isCorrect: true, imageUrl: null },
            { id: 'o-2', text: 'False', isCorrect: false, imageUrl: null },
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

  it('submits a code question with languageMode, allowedLanguages, and zero options when type is code', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Question type' }));
    await userEvent.click(screen.getByRole('option', { name: 'Code' }));
    await userEvent.type(screen.getByLabelText('Question text'), 'Reverse a string');
    await userEvent.click(await screen.findByLabelText('python'));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'code', languageMode: 'fixed', allowedLanguages: ['python'], options: [] }),
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

  it('lets the recruiter enter a code snippet and language for a single_mcq question', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Question text'), 'What does this print?');
    await userEvent.type(screen.getByLabelText('Code snippet'), 'print(1+1)');
    const optionInputs = screen.getAllByLabelText(/Option \d text/);
    await userEvent.type(optionInputs[0], 'A');
    await userEvent.type(optionInputs[1], 'B');
    await userEvent.click(screen.getByLabelText('Option 1 correct'));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ snippetCode: 'print(1+1)', snippetLanguage: 'javascript' }),
    );
  });

  it('omits snippetCode/snippetLanguage/imageUrl for a code (execution) question', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Question type' }));
    await userEvent.click(screen.getByRole('option', { name: 'Code' }));
    await userEvent.type(screen.getByLabelText('Question text'), 'Reverse a string');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ snippetCode: undefined, snippetLanguage: undefined, imageUrl: undefined }),
    );
  });

  it('lets the recruiter pick Fixed mode with specific languages for a code question', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Question type' }));
    await userEvent.click(screen.getByRole('option', { name: 'Code' }));
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Reverse a string' } });
    fireEvent.click(await screen.findByLabelText('python'));
    fireEvent.click(screen.getByText('Create'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ languageMode: 'fixed', allowedLanguages: ['python'] }),
    );
  });

  it('shows the starter code field only when exactly one fixed language is selected', async () => {
    render(<QuestionForm tags={[]} onSubmit={jest.fn()} submitLabel="Create" />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Question type' }));
    await userEvent.click(screen.getByRole('option', { name: 'Code' }));

    expect(screen.queryByLabelText('Starter code')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByLabelText('python'));
    expect(screen.getByLabelText('Starter code')).toBeInTheDocument();

    fireEvent.click(await screen.findByLabelText('java'));
    expect(screen.queryByLabelText('Starter code')).not.toBeInTheDocument();
  });

  it('lets the recruiter pick Any mode with no language selection required', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Question type' }));
    await userEvent.click(screen.getByRole('option', { name: 'Code' }));
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Solve in any language' } });
    await userEvent.click(screen.getByRole('combobox', { name: 'Language mode' }));
    await userEvent.click(screen.getByRole('option', { name: 'Any — every language the sandbox supports' }));
    fireEvent.click(screen.getByText('Create'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ languageMode: 'any', allowedLanguages: undefined }));
  });
});
