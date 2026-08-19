'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { ReactNode } from 'react';
import clsx from 'clsx';

type ModalSize = 'md' | 'lg' | 'xl';

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
  /** Override the dialog's own X-button label. Only needed when a caller's own footer
   *  button is also labelled "Close" -- default "Close" would then give two controls the
   *  same accessible name. Defaults to "Close". */
  closeAriaLabel?: string;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
};

export function Modal({ open, title, onClose, children, footer, size = 'md', closeAriaLabel = 'Close' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        {/* Content lives INSIDE Overlay so flex centering + padding guarantees a gap on
         *  every side -- including below the staff shells' sticky 64px StaffTopBar --
         *  at any modal size, instead of a percentage-of-viewport max-height that only
         *  left a gap by accident. pt-24 clears that header with room to spare; px-6/pb-6
         *  cover the other sides without colliding with pt on the same property (Tailwind
         *  class order in JSX doesn't control which utility wins in the generated CSS).
         *  Radix's outside-click dismissal is ref-based on Content itself, not
         *  DOM-sibling-based on Overlay, so this nesting doesn't change it. */}
        <Dialog.Overlay className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-black/40 px-6 pb-6 pt-24">
          <Dialog.Content
            // Floating layer over the scrim: a deliberate shadow-xl + a rule hairline. The
            // "no drop-shadow" rule is for cards sitting on the page, not true overlays.
            className={clsx('flex max-h-full w-full flex-col overflow-hidden rounded-lg border border-rule bg-paper shadow-xl', SIZE_CLASSES[size])}
          >
            <div className="flex items-center justify-between gap-4 border-b border-rule px-6 py-4">
              <Dialog.Title className="font-display text-lg font-bold text-ink">{title}</Dialog.Title>
              <Dialog.Close
                aria-label={closeAriaLabel}
                className="rounded p-1 text-muted transition-colors hover:bg-ground hover:text-ink"
              >
                <X size={18} />
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <div className="flex justify-end gap-2 border-t border-rule bg-ground px-6 py-3">
                {footer}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
