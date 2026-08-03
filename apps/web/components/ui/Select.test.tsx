import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

describe('Select', () => {
  it('calls onChange with the selected option value', async () => {
    const onChange = jest.fn();
    render(
      <Select
        label="Difficulty"
        value="easy"
        onChange={onChange}
        options={[
          { value: 'easy', label: 'Easy' },
          { value: 'hard', label: 'Hard' },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Difficulty' }));
    await userEvent.click(screen.getByRole('option', { name: 'Hard' }));
    expect(onChange).toHaveBeenCalledWith('hard');
  });

  it('marks the caption with a CSS-generated asterisk when required, without changing its text', () => {
    render(
      <Select label="Difficulty" value="easy" onChange={jest.fn()} required options={[{ value: 'easy', label: 'Easy' }]} />,
    );
    // getByRole('combobox', { name: 'Difficulty' }) must still resolve -- it matches the
    // trigger's aria-label, which is untouched, and the caption's own text must stay exactly
    // "Difficulty" so any getByText('Difficulty')-style query elsewhere keeps working too.
    expect(screen.getByRole('combobox', { name: 'Difficulty' })).toBeInTheDocument();
    expect(screen.getByText('Difficulty').className).toEqual(expect.stringContaining("after:content-['*']"));
  });
});
