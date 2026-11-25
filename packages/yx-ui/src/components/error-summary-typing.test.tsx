import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ErrorSummary, FormField, type FormErrorItem } from './field';
import { NumberField, TextField } from './inputs';
import { Button } from './button';

// Guard (founder 29 Oct 2026): after a failed Save, a key typed while the error list grows (clearing a field, an
// in-between value like "2.") was lost because the error summary took the focus. Every form uses ErrorSummary.
function Form() {
  const [hours, setHours] = useState<number | null>(3);
  const [rate, setRate] = useState('');
  const [shown, setShown] = useState(false);
  const errors: FormErrorItem[] = [
    ...(hours == null ? [{ fieldId: 'hours', message: 'Enter the hours' }] : []),
    ...(!/^\d+(\.\d+)?$/.test(rate) ? [{ fieldId: 'rate', message: 'Enter the rate, like 2.5' }] : []),
  ];
  return (
    <div>
      {shown && <ErrorSummary errors={errors} />}
      <FormField label="Hours" id="hours">
        <NumberField value={hours} onChange={setHours} decimals />
      </FormField>
      <FormField label="Rate" id="rate">
        <TextField value={rate} onChange={setRate} />
      </FormField>
      <Button onClick={() => setShown(true)}>Save</Button>
    </div>
  );
}

describe('ErrorSummary while typing', () => {
  it('a failed Save still moves focus to the summary (positive)', async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveFocus();
  });

  it('types "1.5" into a NumberField after an error shows, even when clearing it adds an error', async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const hours = screen.getByLabelText('Hours');
    await user.clear(hours); // the list grows: "Enter the hours"
    await user.type(hours, '1.5', { skipClick: true });
    expect(hours).toHaveValue('1.5');
    expect(hours).toHaveFocus();
  });

  it('types "2.5" into a text field through the invalid "2." (negative: no key lost)', async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const rate = screen.getByLabelText('Rate');
    await user.type(rate, '2.5');
    expect(rate).toHaveValue('2.5');
    expect(rate).toHaveFocus();
  });
});
