import { useState, type ReactNode } from 'react';
import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { IconButton, Button } from './button';
import { InlineAlert } from './feedback';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Line under the title: role, department, status… */
  subtitle?: ReactNode;
  /** Chips or avatar row under the title. */
  meta?: ReactNode;
  children: ReactNode;
  /** Buttons, right-aligned: secondary Cancel first, primary last (§15). */
  footer?: ReactNode;
  /** md 480 px (quick view, short edit) · lg 720 px (up to ~12 fields) · full (§18). */
  size?: 'md' | 'lg' | 'full';
  /** When true, closing asks to discard changes first (§18). */
  dirty?: boolean;
  /** Plain description for screen readers when there is no subtitle. */
  description?: string;
}

/** Slide-over from the right (§18). The list behind stays visible on wide screens. */
export function Drawer({ open, onOpenChange, title, subtitle, meta, children, footer, size = 'md', dirty, description }: DrawerProps) {
  const [confirming, setConfirming] = useState(false);
  const requestClose = (next: boolean) => {
    if (!next && dirty) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onOpenChange(next);
  };

  return (
    <RD.Root open={open} onOpenChange={requestClose}>
      <RD.Portal>
        <RD.Overlay className="yx-drawer__scrim" />
        <RD.Content
          className="yx-drawer"
          data-size={size}
          tabIndex={-1}
          // Focus the panel, not the Close button, so its tooltip doesn't pop up on open.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
        >
          <header className="yx-drawer__head">
            <div className="yx-drawer__titles">
              <RD.Title className="yx-drawer__title">{title}</RD.Title>
              {subtitle ? (
                <RD.Description className="yx-drawer__subtitle">{subtitle}</RD.Description>
              ) : (
                <RD.Description className="yx-visually-hidden">{description ?? ''}</RD.Description>
              )}
              {meta && <div className="yx-drawer__meta">{meta}</div>}
            </div>
            <IconButton icon={X} label="Close" onClick={() => requestClose(false)} />
          </header>
          <div className="yx-drawer__body" tabIndex={0}>{children}</div>
          {(footer || confirming) && (
            <footer className="yx-drawer__foot">
              {confirming ? (
                <InlineAlert
                  tone="warning"
                  title="Discard your changes?"
                  actions={
                    <>
                      <Button size="sm" onClick={() => setConfirming(false)}>
                        Keep editing
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setConfirming(false);
                          onOpenChange(false);
                        }}
                      >
                        Discard changes
                      </Button>
                    </>
                  }
                />
              ) : (
                footer
              )}
            </footer>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
