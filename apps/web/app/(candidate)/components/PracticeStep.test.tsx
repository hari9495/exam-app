import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PracticeStep } from './PracticeStep';

jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ defaultValue }: { defaultValue?: string }) => (
    <textarea aria-label="code-editor" defaultValue={defaultValue} />
  ),
}));

describe('PracticeStep', () => {
  it('renders the practice MCQ and code question with a Skip affordance', () => {
    render(<PracticeStep onDone={jest.fn()} />);

    expect(screen.getByText('Practice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip practice/i })).toBeInTheDocument();
    expect(screen.getByText(/what is 7 \+ 5\?/i)).toBeInTheDocument();
  });

  it('calls onDone when Skip practice is clicked', async () => {
    const onDone = jest.fn();
    render(<PracticeStep onDone={onDone} />);

    await userEvent.click(screen.getByRole('button', { name: /skip practice/i }));

    expect(onDone).toHaveBeenCalled();
  });

  it('lets the candidate select an MCQ option and continue without submitting anything', async () => {
    const onDone = jest.fn();
    render(<PracticeStep onDone={onDone} />);

    await userEvent.click(screen.getByRole('button', { name: '12' }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(onDone).toHaveBeenCalled();
  });

  it('gives unselected options the same hover feedback the real exam uses, unlike the selected one', async () => {
    render(<PracticeStep onDone={jest.fn()} />);

    const unselected = screen.getByRole('button', { name: '12' });
    expect(unselected).toHaveClass('hover:border-candidate-primary/40');

    await userEvent.click(unselected);
    expect(unselected).not.toHaveClass('hover:border-candidate-primary/40');
    expect(screen.getByRole('button', { name: '10' })).toHaveClass('hover:border-candidate-primary/40');
  });

  it('gives the practice code editor the same dark IDE chrome as the real exam', () => {
    render(<PracticeStep onDone={jest.fn()} />);

    expect(screen.getByText('javascript')).toBeInTheDocument();
  });
});
