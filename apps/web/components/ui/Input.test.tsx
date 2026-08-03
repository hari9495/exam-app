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

  it('marks the label with a CSS-generated asterisk and sets the native required attribute when required', () => {
    render(<Input label="Email" value="" onChange={() => {}} required />);
    // getByLabelText must still resolve by "Email" alone: the asterisk is CSS ::after content,
    // not real text, specifically so it never joins the label's textContent -- a real "*"
    // character there would break every getByLabelText('Email')-style exact-text query the
    // moment a field is marked required.
    const input = screen.getByLabelText('Email');
    expect(input).toBeRequired();
    expect(screen.getByText('Email').className).toEqual(expect.stringContaining("after:content-['*']"));
  });

  it('does not add the asterisk class when not required', () => {
    render(<Input label="Email" value="" onChange={() => {}} />);
    expect(screen.getByText('Email').className).not.toEqual(expect.stringContaining('content-'));
  });
});
