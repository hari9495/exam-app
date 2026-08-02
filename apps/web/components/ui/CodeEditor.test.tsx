import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeEditor } from './CodeEditor';

jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, onChange, language, wrapperProps }: { value?: string; onChange?: (value: string | undefined) => void; language?: string; wrapperProps?: Record<string, string> }) => (
    <textarea aria-label={wrapperProps?.['aria-label']} data-language={language} value={value} onChange={(event) => onChange?.(event.target.value)} />
  ),
  loader: { config: jest.fn() },
}));

describe('CodeEditor', () => {
  it('shows the language badge and forwards edits as plain strings', async () => {
    const onChange = jest.fn();
    render(<CodeEditor ariaLabel="Code Snippet" language="python" value="" onChange={onChange} />);

    expect(screen.getByText('python')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Code Snippet'), 'x');
    expect(onChange).toHaveBeenCalledWith('x');
  });
});
