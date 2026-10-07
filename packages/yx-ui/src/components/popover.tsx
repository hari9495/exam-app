import { createContext, forwardRef, useContext, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as RP from '@radix-ui/react-popover';
import { cx } from '../lib/cx';

export const Popover = RP.Root;
export const PopoverTrigger = RP.Trigger;
export const PopoverAnchor = RP.Anchor;
export const PopoverClose = RP.Close;

/**
 * Set by a drawer or dialog to its own panel. A popover opened inside one (a Select's list, a date picker) is portalled
 * into that panel, not <body>, so the panel's focus trap, outside-click and pointer rules count it as inside: options can
 * be clicked and searched, and picking one doesn't close the drawer.
 */
export const PopoverPortalContext = createContext<HTMLElement | null>(null);

export const PopoverContent = forwardRef<ElementRef<typeof RP.Content>, ComponentPropsWithoutRef<typeof RP.Content>>(
  function PopoverContent({ className, sideOffset = 4, collisionPadding = 8, align = 'start', ...rest }, ref) {
    const container = useContext(PopoverPortalContext);
    return (
      <RP.Portal container={container ?? undefined}>
        <RP.Content ref={ref} className={cx('yx-popover', className)} sideOffset={sideOffset} collisionPadding={collisionPadding} align={align} {...rest} />
      </RP.Portal>
    );
  },
);

/** A popover is open in this panel: Escape or a click outside closes that popover first, not the drawer or dialog. */
export const hasOpenPopover = (panel: HTMLElement | null) => Boolean(panel?.querySelector('.yx-popover'));
/**
 * Escape closes the list even inside a drawer or dialog: the drawer's Escape handler (a separate Radix copy) runs first
 * and marks the key handled, so the popover's own Escape never fires.
 */
export const closeOnEscape = (setOpen: (open: boolean) => void) => (e: { key: string }) => {
  if (e.key === 'Escape') setOpen(false);
};
