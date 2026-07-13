'use client';

import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import { ReactNode } from 'react';

export function DropdownMenu({ children }: { children: ReactNode }) {
  return <RadixDropdown.Root>{children}</RadixDropdown.Root>;
}

export function DropdownMenuTrigger({ children }: { children: ReactNode }) {
  return (
    <RadixDropdown.Trigger asChild={false} className="rounded border border-gray-300 px-3 py-2 text-sm">
      {children}
    </RadixDropdown.Trigger>
  );
}

export function DropdownMenuContent({ children }: { children: ReactNode }) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content className="rounded border border-gray-200 bg-white p-1 shadow-md" sideOffset={4}>
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

export function DropdownMenuItem({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <RadixDropdown.Item
      onSelect={onSelect}
      className="cursor-pointer rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100"
    >
      {children}
    </RadixDropdown.Item>
  );
}
