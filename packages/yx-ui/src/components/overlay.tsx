import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button, IconButton } from './button';
import { InlineAlert } from './feedback';
import { FormField } from './field';
import { TextField } from './inputs';
import { Kbd } from './foundations';

/** Controlled `value` wins; otherwise internal state seeded from `defaultValue`. */
export function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void) {
  const [inner, setInner] = useState(defaultValue);
  const current = value === undefined ? inner : value;
  const set = useCallback(
    (v: T) => {
      if (value === undefined) setInner(v);
      onChange?.(v);
    },
    [value, onChange],
  );
  return [current, set] as const;
}

interface OpenProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens it (a Button). Focus returns here on close. */
  trigger?: ReactElement;
}

/* ---------- Dialog (§17) ---------- */

export interface DialogProps extends OpenProps {
  /** Names the action and object: "Delete leave type Casual?" */
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons in order: secondary Cancel first, primary / danger last (right-most, §15, §17). */
  footer?: ReactNode;
  /** sm 480 px (confirmations) · md 640 px (short decisions). */
  size?: 'sm' | 'md';
  /** Destructive dialogs ignore Esc and outside clicks so they are never dismissed by accident (§17). */
  destructive?: boolean;
  /** Blocks every close path, e.g. while a request is in flight. */
  preventClose?: boolean;
}

/** Centred dialog for short decisions only, never long forms (§17). */
export function Dialog({ open, defaultOpen = false, onOpenChange, trigger, title, description, children, footer, size = 'sm', destructive, preventClose }: DialogProps) {
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const returnTo = useRef<HTMLElement | null>(null);
  const block = (e: Event) => {
    if (destructive || preventClose) e.preventDefault();
  };
  return (
    <RD.Root open={isOpen} onOpenChange={(o) => (o || !preventClose) && setOpen(o)}>
      {trigger && <RD.Trigger asChild>{trigger}</RD.Trigger>}
      <RD.Portal>
        <RD.Overlay className="yx-dialog__scrim" />
        <RD.Content
          className="yx-dialog"
          data-size={size}
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
          onOpenAutoFocus={(e) => {
            // Still the element focused before opening; used when there is no trigger (controlled use).
            returnTo.current = document.activeElement as HTMLElement | null;
            // Focus the first field, else the first footer button (Cancel, the safe choice); never ✕ (founder review 30 Sep 2026).
            const root = e.currentTarget as HTMLElement;
            const target =
              root.querySelector<HTMLElement>('.yx-dialog__body :is(input, textarea, [role="combobox"]):not(:disabled)') ??
              root.querySelector<HTMLElement>('.yx-dialog__foot button:not(:disabled)');
            if (target) {
              e.preventDefault();
              target.focus();
            }
          }}
          onCloseAutoFocus={(e) => {
            if (!trigger && returnTo.current?.isConnected) {
              e.preventDefault();
              returnTo.current.focus();
            }
          }}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className="yx-dialog__head">
            <RD.Title className="yx-dialog__title">{title}</RD.Title>
            <RD.Close asChild disabled={preventClose}>
              <IconButton icon={X} label="Close" noTooltip />
            </RD.Close>
          </header>
          {description && <RD.Description className="yx-dialog__desc">{description}</RD.Description>}
          {children && <div className="yx-dialog__body">{children}</div>}
          {footer && <footer className="yx-dialog__foot">{footer}</footer>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/* ---------- ConfirmDialog ---------- */

export interface ConfirmDialogProps extends OpenProps {
  /** Action + object as a question: "Delete leave type Casual?" */
  title: ReactNode;
  /** What happens next: "12 employees lose this leave balance. You can't undo this." */
  consequence?: ReactNode;
  /** Verb-first: "Delete leave type". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button; Esc and outside click do nothing (§17). */
  destructive?: boolean;
  /** Confirm button colour. 'approve' is solid green for Approve / Award / Agree (R7). Defaults to 'danger' when destructive, else 'primary'. */
  confirmVariant?: 'primary' | 'approve' | 'danger';
  /** May be async. The dialog shows a loading button, closes on success and shows the error inline on failure. */
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
  /** Keeps the confirm button disabled (used by TypeToConfirmDialog). */
  confirmDisabled?: boolean;
  size?: 'sm' | 'md';
}

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : "We couldn't complete this. Check your connection and try again.";

export function ConfirmDialog({ open, defaultOpen = false, onOpenChange, trigger, title, consequence, confirmLabel, cancelLabel = 'Cancel', destructive, confirmVariant, onConfirm, children, confirmDisabled, size }: ConfirmDialogProps) {
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (o: boolean) => {
    if (!o) setError(null);
    setOpen(o);
  };
  const confirm = async () => {
    setError(null);
    setPending(true);
    try {
      await onConfirm();
      setPending(false);
      change(false);
    } catch (err) {
      setPending(false);
      setError(errorText(err));
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={change}
      trigger={trigger}
      title={title}
      description={consequence}
      size={size}
      destructive={destructive}
      preventClose={pending}
      footer={
        <>
          <Button onClick={() => change(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant ?? (destructive ? 'danger' : 'primary')} loading={pending} disabled={confirmDisabled} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {(children || error) && (
        <>
          {children}
          {error && <InlineAlert tone="danger" title={error} />}
        </>
      )}
    </Dialog>
  );
}

/* ---------- TypeToConfirmDialog ---------- */

export interface TypeToConfirmDialogProps extends Omit<ConfirmDialogProps, 'destructive' | 'confirmDisabled' | 'children'> {
  /** The exact text to type, e.g. the payroll run "Payroll Sep 2026". Case-sensitive. */
  objectName: string;
}

/** For large or irreversible deletions and payroll unlock: the danger button enables only when the name matches (§17). */
export function TypeToConfirmDialog({ objectName, onOpenChange, open, defaultOpen, ...rest }: TypeToConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [isOpen, setOpen] = useControllable(open, defaultOpen ?? false, onOpenChange);
  return (
    <ConfirmDialog
      {...rest}
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) setTyped('');
        setOpen(o);
      }}
      // An approval kept behind typed confirmation (e.g. "Approve lock") stays green, not red (R7).
      destructive={rest.confirmVariant !== 'approve'}
      confirmDisabled={typed !== objectName}
    >
      <FormField label={`Type "${objectName}" to confirm`} helper="This must match exactly, including capitals.">
        <TextField value={typed} onChange={setTyped} autoComplete="off" spellCheck={false} />
      </FormField>
    </ConfirmDialog>
  );
}

/* ---------- BottomSheet ---------- */

export interface BottomSheetProps extends OpenProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Full-width buttons, stacked on mobile. */
  footer?: ReactNode;
}

/** Mobile replacement for menus and drawers: slides up from the bottom, max 90 % of the screen height (§37). */
export function BottomSheet({ open, defaultOpen = false, onOpenChange, trigger, title, description, children, footer }: BottomSheetProps) {
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  return (
    <RD.Root open={isOpen} onOpenChange={setOpen}>
      {trigger && <RD.Trigger asChild>{trigger}</RD.Trigger>}
      <RD.Portal>
        <RD.Overlay className="yx-dialog__scrim" />
        <RD.Content
          className="yx-sheet"
          tabIndex={-1}
          // Focus the sheet, not the Close button: no ring on ✕ when it opens (founder review 30 Sep 2026).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          {/* ponytail: decorative handle; drag-to-dismiss not built (scrim tap, Esc and Close cover it) */}
          <span className="yx-sheet__handle" aria-hidden="true" />
          <header className="yx-dialog__head">
            <RD.Title className="yx-dialog__title">{title}</RD.Title>
            <RD.Close asChild>
              <IconButton icon={X} label="Close" noTooltip />
            </RD.Close>
          </header>
          {description && <RD.Description className="yx-dialog__desc">{description}</RD.Description>}
          <div className="yx-sheet__body">{children}</div>
          {footer && <footer className="yx-sheet__foot">{footer}</footer>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/* ---------- ShortcutHelp (§14) ---------- */

const SHORTCUT_GROUPS: { title: string; items: [keys: string[], what: string][] }[] = [
  {
    title: 'Lists and approvals',
    items: [
      [['J', 'K'], 'Move down or up the list'],
      [['Enter'], 'Open the selected item'],
      [['A'], 'Approve the selected request'],
      [['R'], 'Reject the selected request'],
    ],
  },
  {
    title: 'Go to',
    items: [
      [['G', 'P'], 'People'],
      [['G', 'T'], 'Time'],
      [['G', 'Y'], 'Pay'],
    ],
  },
  {
    title: 'Anywhere',
    items: [
      [['/'], 'Search this list'],
      [['Ctrl K'], 'Search everything and run actions'],
      [['Ctrl J'], 'Ask YukthiX'],
      [['N', 'L'], 'Apply for leave'],
      [['N', 'E'], 'Claim an expense'],
      [['?'], 'Show these shortcuts'],
    ],
  },
];

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Opens the shortcut list when "?" is pressed outside a text field. Spread the result onto <ShortcutHelp>. */
export function useShortcutHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return { open, onOpenChange: setOpen };
}

export function ShortcutHelp(props: Omit<OpenProps, 'trigger'> & { trigger?: ReactElement }) {
  return (
    <Dialog {...props} title="Keyboard shortcuts" size="sm">
      <div className="yx-shortcuts">
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.title} className="yx-shortcuts__group">
            <h3 className="yx-shortcuts__title">{g.title}</h3>
            <dl className="yx-shortcuts__list">
              {g.items.map(([keys, what]) => (
                <div key={what} className="yx-shortcuts__row">
                  <dt className="yx-shortcuts__keys">
                    {keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && <span className="yx-shortcuts__then">{keys[0] === 'J' ? 'or' : 'then'}</span>}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </dt>
                  <dd className="yx-shortcuts__what">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
