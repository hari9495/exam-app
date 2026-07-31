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
});
