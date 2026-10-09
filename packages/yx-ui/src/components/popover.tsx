import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as RP from '@radix-ui/react-popover';
import { cx } from '../lib/cx';

export const Popover = RP.Root;
export const PopoverTrigger = RP.Trigger;
export const PopoverAnchor = RP.Anchor;
export const PopoverClose = RP.Close;

export const PopoverContent = forwardRef<ElementRef<typeof RP.Content>, ComponentPropsWithoutRef<typeof RP.Content>>(
  function PopoverContent({ className, sideOffset = 4, collisionPadding = 8, align = 'start', ...rest }, ref) {
    return (
      <RP.Portal>
        <RP.Content ref={ref} className={cx('yx-popover', className)} sideOffset={sideOffset} collisionPadding={collisionPadding} align={align} {...rest} />
      </RP.Portal>
    );
  },
);
