import { render, screen, fireEvent } from '@testing-library/react';
import { PasswordField } from './PasswordField';

it('toggles password visibility', () => {
  render(<PasswordField id="pw" label="Password" value="secret" onChange={() => {}} />);
  const input = screen.getByLabelText('Password') as HTMLInputElement;
  expect(input.type).toBe('password');
  fireEvent.click(screen.getByRole('button', { name: /show/i }));
  expect(input.type).toBe('text');
  fireEvent.click(screen.getByRole('button', { name: /hide/i }));
  expect(input.type).toBe('password');
});
