'use client';

import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import { ComponentPropsWithoutRef, ReactNode } from 'react';
import clsx from 'clsx';

export function DropdownMenu({ children }: { children: ReactNode }) {
  return <RadixDropdown.Root>{children}</RadixDropdown.Root>;
}

type DropdownMenuTriggerProps = { children: ReactNode } & ComponentPropsWithoutRef<typeof RadixDropdown.Trigger>;

export function DropdownMenuTrigger({ children, className, ...props }: DropdownMenuTriggerProps) {
  return (
    <RadixDropdown.Trigger
      asChild={false}
      className={className ?? 'rounded-lg border border-rule bg-paper px-3 py-2 font-body text-sm text-ink'}
      {...props}
    >
      {children}
    </RadixDropdown.Trigger>
  );
}

export function DropdownMenuContent({ children }: { children: ReactNode }) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content className="rounded-lg border border-rule bg-paper p-1 shadow-md" sideOffset={4}>
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
  className,
}: {
  children: ReactNode;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <RadixDropdown.Item
      onSelect={onSelect}
      className={clsx('cursor-pointer rounded px-3 py-2 font-body text-sm text-ink outline-none data-[highlighted]:bg-ground', className)}
    >
      {children}
    </RadixDropdown.Item>
  );
}
