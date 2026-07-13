import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadioGroup, RadioGroupItem } from './Radio';

describe('RadioGroup', () => {
  it('calls onChange with the selected item value', async () => {
    const onChange = jest.fn();
    render(
      <RadioGroup value="easy" onChange={onChange}>
        <RadioGroupItem value="easy" label="Easy" />
        <RadioGroupItem value="hard" label="Hard" />
      </RadioGroup>,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Hard' }));
    expect(onChange).toHaveBeenCalledWith('hard');
  });
});
