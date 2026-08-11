'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { ReactNode } from 'react';
import clsx from 'clsx';

type ModalSize = 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional Salesforce-style footer bar: a light, top-bordered strip with
   *  right-aligned actions. Consumers that render their own buttons inside
   *  `children` can ignore this and nothing changes for them. */
  footer?: ReactNode;
  size?: ModalSize;
}

// Height is bundled into the same map (rather than left as a shared base class)
// so 'full' can grow past the other sizes' 85vh cap without fighting it on
// Tailwind class order, which isn't guaranteed to match source order.
const SIZE_CLASSES: Record<ModalSize, string> = {
  md: 'max-w-lg max-h-[85vh]',
  lg: 'max-w-2xl max-h-[85vh]',
  xl: 'max-w-5xl max-h-[85vh]',
  full: 'max-w-[96vw] max-h-[96vh]',
};

export function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content
          className={clsx(
            'fixed left-1/2 top-1/2 flex w-full -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-white shadow-xl',
            SIZE_CLASSES[size],
          )}
        >
          <div className="flex items-center justify-between gap-4 border-b border-recruiter-border px-6 py-4">
            <Dialog.Title className="text-lg font-bold text-recruiter-text">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="rounded p-1 text-recruiter-text-tertiary transition-colors hover:bg-recruiter-bg-subtle hover:text-recruiter-text"
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-recruiter-border bg-recruiter-bg-subtle px-6 py-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
