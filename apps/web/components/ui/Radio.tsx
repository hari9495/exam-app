'use client';

import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { ReactNode, useId } from 'react';

interface RadioGroupProps {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}

export function RadioGroup({ value, onChange, children }: RadioGroupProps) {
  return (
    <RadixRadioGroup.Root value={value} onValueChange={onChange} className="flex flex-col gap-2">
      {children}
    </RadixRadioGroup.Root>
  );
}

interface RadioGroupItemProps {
  value: string;
  label: string;
}

export function RadioGroupItem({ value, label }: RadioGroupItemProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <RadixRadioGroup.Item
        id={id}
        value={value}
        aria-label={label}
        className="h-4 w-4 rounded-full border border-rule data-[state=checked]:border-primary"
      >
        <RadixRadioGroup.Indicator className="flex h-full w-full items-center justify-center after:h-2 after:w-2 after:rounded-full after:bg-primary" />
      </RadixRadioGroup.Item>
      <label htmlFor={id} className="font-body text-sm text-ink">
        {label}
      </label>
    </div>
  );
}
