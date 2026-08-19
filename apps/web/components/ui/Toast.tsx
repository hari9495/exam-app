'use client';

import * as RadixToast from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import clsx from 'clsx';

type Variant = 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  variant: Variant;
}

interface ToastContextValue {
  toast: (message: string, variant?: Variant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: Variant = 'success') => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, variant }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {items.map((item) => (
          <RadixToast.Root
            key={item.id}
            duration={4000}
            onOpenChange={(open) => !open && dismiss(item.id)}
            className={clsx(
              'rounded-lg px-4 py-3 font-body text-sm shadow-md',
              item.variant === 'success' ? 'bg-status-success text-white' : 'bg-status-danger text-white',
            )}
          >
            <RadixToast.Description>{item.message}</RadixToast.Description>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed top-4 right-4 flex flex-col gap-2" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
