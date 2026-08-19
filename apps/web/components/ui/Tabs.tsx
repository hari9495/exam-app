'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import { ReactNode } from 'react';
import clsx from 'clsx';

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <RadixTabs.Root defaultValue={defaultValue} value={value} onValueChange={onValueChange}>
      {children}
    </RadixTabs.Root>
  );
}

export function TabsList({ children }: { children: ReactNode }) {
  return <RadixTabs.List className="flex gap-1 border-b border-rule">{children}</RadixTabs.List>;
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={clsx(
        'px-3 py-2 text-sm font-medium text-muted data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary',
      )}
    >
      {children}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({ value, children }: { value: string; children: ReactNode }) {
  return <RadixTabs.Content value={value} className="py-4">{children}</RadixTabs.Content>;
}
