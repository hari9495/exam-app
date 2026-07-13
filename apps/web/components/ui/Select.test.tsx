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
});
