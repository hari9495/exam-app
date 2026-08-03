'use client';

import * as RadixSelect from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  required?: boolean;
}

export function Select({ label, value, onChange, options, required }: SelectProps) {
  const selected = options.find((option) => option.value === value);
  return (
    <div className="flex flex-col gap-1">
      <span
        className={clsx(
          'text-sm font-medium text-gray-700',
          // CSS-generated content, not real text -- a real "*" character here would break any
          // getByText(label)-style exact-text query the moment a field is marked required.
          required && "after:ml-0.5 after:text-status-danger after:content-['*']",
        )}
      >
        {label}
      </span>
      <RadixSelect.Root value={value} onValueChange={onChange}>
        <RadixSelect.Trigger
          aria-label={label}
          className="flex items-center justify-between rounded border border-recruiter-border px-3 py-2 text-sm"
        >
          <RadixSelect.Value>{selected?.label ?? ''}</RadixSelect.Value>
          <RadixSelect.Icon><ChevronDown size={14} /></RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className="rounded border border-recruiter-border bg-white shadow-md">
            <RadixSelect.Viewport>
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  className="cursor-pointer px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100"
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}
