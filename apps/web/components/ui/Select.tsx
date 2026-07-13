'use client';

import * as RadixSelect from '@radix-ui/react-select';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}

export function Select({ label, value, onChange, options }: SelectProps) {
  const selected = options.find((option) => option.value === value);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <RadixSelect.Root value={value} onValueChange={onChange}>
        <RadixSelect.Trigger
          aria-label={label}
          className="flex items-center justify-between rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <RadixSelect.Value>{selected?.label ?? ''}</RadixSelect.Value>
          <RadixSelect.Icon>▾</RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className="rounded border border-gray-200 bg-white shadow-md">
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
