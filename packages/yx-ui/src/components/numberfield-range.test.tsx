import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormField } from './field';
import { NumberField } from './inputs';

function Harness() {
  const [v, setV] = useState<number | null>(12);
  return (
    <>
      <FormField label="Minimum password length">
        <NumberField value={v} onChange={setV} min={12} max={128} />
      </FormField>
      <button type="button" onClick={() => setV(12)}>Discard changes</button>
    </>
  );
}

// Security settings: 8 was refused, Discard put 12 back, but "Enter a value between 12 and 128" stayed under the field;
// it vanished on the next blur, so the page jumped and the first click on Save landed on nothing.
describe('NumberField range message', () => {
  it('goes away as soon as the value is back in range, without waiting for a blur', async () => {
    render(<Harness />);
    const box = screen.getByRole('textbox', { name: 'Minimum password length' });
    await userEvent.clear(box);
    await userEvent.type(box, '8');
    await userEvent.tab();
    expect(screen.getByText(/between 12 and 128/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByText(/between 12 and 128/)).toBeNull();
  });
});
