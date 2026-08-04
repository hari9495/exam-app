import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('toggles checked state via onChange', async () => {
    const onChange = jest.fn();
    render(<Checkbox label="Correct Answer" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Correct Answer' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('anchors the box to the top of the label instead of centering against its full (possibly multi-line) height', () => {
    render(<Checkbox label="A long question label that wraps across several lines in a narrow list item" checked={false} onChange={jest.fn()} />);
    expect(screen.getByRole('checkbox').parentElement).toHaveClass('items-start');
  });

  it('is not disabled by default', () => {
    render(<Checkbox label="Correct Answer" checked={false} onChange={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Correct Answer' })).not.toBeDisabled();
  });

  it('disables the control and blocks onChange when disabled is set', async () => {
    const onChange = jest.fn();
    render(<Checkbox label="Correct Answer" checked={false} onChange={onChange} disabled />);

    const checkbox = screen.getByRole('checkbox', { name: 'Correct Answer' });
    expect(checkbox).toBeDisabled();

    await userEvent.click(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });
});
