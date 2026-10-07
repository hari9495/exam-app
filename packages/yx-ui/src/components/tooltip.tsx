import type { ReactElement, ReactNode } from 'react';
import * as RT from '@radix-ui/react-tooltip';

export interface TooltipProps {
  /** Short text. Never put required information only in a tooltip (§33). */
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** §33: 500 ms. */
  delay?: number;
  /** Force open (docs and screenshot tests). Normally leave unset. */
  open?: boolean;
}

/** Tooltip for icon-only buttons and truncated text only (§33). */
export function Tooltip({ content, children, side = 'top', delay = 500, open }: TooltipProps) {
  return (
    <RT.Provider delayDuration={delay} skipDelayDuration={200}>
      <RT.Root open={open}>
        <RT.Trigger asChild data-yx-tooltip="">{children}</RT.Trigger>
        <RT.Portal>
          <RT.Content className="yx-tooltip" side={side} sideOffset={6} collisionPadding={8}>
            {content}
          </RT.Content>
        </RT.Portal>
      </RT.Root>
    </RT.Provider>
  );
}
