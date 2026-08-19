import { render, screen } from '@testing-library/react';
import { RequiredFieldsNote } from './RequiredFieldsNote';

describe('RequiredFieldsNote', () => {
  it('explains what the red asterisk means', () => {
    render(<RequiredFieldsNote />);
    expect(screen.getByText('= Required field')).toBeInTheDocument();
  });

  it('uses the slate muted token, not raw gray', () => {
    render(<RequiredFieldsNote />);
    const note = screen.getByText('= Required field');
    expect(note.className).toContain('text-muted');
    expect(note.className).not.toContain('text-gray-500');
  });
});
