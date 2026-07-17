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

  it('renders an icon inside the field when provided', () => {
    render(<Input label="Email" value="" onChange={() => {}} icon={<span data-testid="input-icon">@</span>} />);
    expect(screen.getByTestId('input-icon')).toBeInTheDocument();
  });

  it('does not add left padding when no icon is provided', () => {
    render(<Input label="Email" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Email')).not.toHaveClass('pl-9');
  });
});
