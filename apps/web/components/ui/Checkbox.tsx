'use client';

import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { useId } from 'react';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  // ponytail: table row-select checkboxes need the accessible name (for
  // getByRole('checkbox', {name})) but not a second visible copy of text
  // already shown in an adjacent column -- hideLabel drops the <label>
  // element entirely; aria-label on the control still carries the a11y name.
  hideLabel?: boolean;
  // For a checkbox that sits outside a `<fieldset disabled>` (e.g. an "always
  // editable" slot that must still lock under some other condition) -- everywhere
  // else, wrap in a disabled fieldset instead of using this.
  disabled?: boolean;
}

export function Checkbox({ label, checked, onChange, hideLabel, disabled }: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(state) => onChange(state === true)}
        aria-label={label}
        disabled={disabled}
        // mt-0.5 lines the box up with the label's first line of text -- items-start
        // alone puts its top edge flush with the label block, which sits a couple of
        // pixels above where a single line of text actually starts.
        className="mt-0.5 h-4 w-4 shrink-0 rounded border border-gray-400 data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RadixCheckbox.Indicator className="flex items-center justify-center text-white text-xs">✓</RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      {!hideLabel && (
        <label htmlFor={id} className={disabled ? 'text-sm text-gray-400' : 'text-sm text-gray-700'}>
          {label}
        </label>
      )}
    </div>
  );
}
