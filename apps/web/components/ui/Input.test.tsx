import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('reflects typed value via onChange', () => {
    const onChange = jest.fn();
    render(<Input label="Email" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@test.com' } });
    expect(onChange).toHaveBeenCalledWith('a@test.com');
  });

  it('shows an error message when provided', () => {
    render(<Input label="Email" value="" onChange={() => {}} error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});
