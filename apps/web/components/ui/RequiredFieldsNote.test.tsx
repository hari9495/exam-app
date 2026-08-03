import { render, screen } from '@testing-library/react';
import { RequiredFieldsNote } from './RequiredFieldsNote';

describe('RequiredFieldsNote', () => {
  it('explains what the red asterisk means', () => {
    render(<RequiredFieldsNote />);
    expect(screen.getByText('= Required field')).toBeInTheDocument();
  });
});
