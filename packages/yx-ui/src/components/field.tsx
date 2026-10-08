import {
  forwardRef,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { AlertCircle } from 'lucide-react';
import { cx } from '../lib/cx';
import { Icon } from './foundations';
import { Heading } from './foundations';

interface FieldCtx {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  /** Lets self-validating inputs (MaskedField, DatePicker…) report their own error. */
  setInternalError: (msg: string | null) => void;
}

const FieldContext = createContext<FieldCtx | null>(null);

/** Props an input spreads onto its native control to join the surrounding FormField. */
export function useFieldControl(own: { id?: string; 'aria-describedby'?: string; required?: boolean; disabled?: boolean } = {}) {
  const ctx = useContext(FieldContext);
  const fallbackId = useId();
  return {
    ctx,
    controlProps: {
      id: own.id ?? ctx?.id ?? fallbackId,
      'aria-describedby': cx(own['aria-describedby'], ctx?.describedBy) || undefined,
      'aria-invalid': ctx?.invalid || undefined,
      'aria-required': (own.required ?? ctx?.required) || undefined,
      disabled: own.disabled ?? ctx?.disabled,
    },
  };
}

export interface FormFieldProps {
  label: ReactNode;
  children: ReactNode;
  /** Shows the word "Required" next to the label (§16). No lone asterisk. */
  required?: boolean;
  /** Shows "Optional"; use only when most fields in the form are required. */
  optional?: boolean;
  /** Helper text below the control. */
  helper?: ReactNode;
  /** Error text: say what to do, e.g. "Enter a 10-character PAN like ABCDE1234F". */
  error?: string | null;
  disabled?: boolean;
  /** Visually hide the label (it stays for screen readers). Use only when the context makes it obvious. */
  hideLabel?: boolean;
  id?: string;
  className?: string;
}

export function FormField({ label, children, required = false, optional, helper, error, disabled = false, hideLabel, id, className }: FormFieldProps) {
  const autoId = useId();
  const fieldId = id ?? `yx-field-${autoId}`;
  const [internalError, setInternalError] = useState<string | null>(null);
  // No error under a field while the person is typing in it (founder review 8 Oct 2026): it shows again when they
  // leave the field or press Save. One rule for every field, whatever set the error.
  const [typing, setTyping] = useState(false);
  const shownError = typing ? null : error ?? internalError;
  const helperId = helper ? `${fieldId}-helper` : undefined;
  const errorId = shownError ? `${fieldId}-error` : undefined;

  return (
    <FieldContext.Provider
      value={{
        id: fieldId,
        describedBy: cx(errorId, helperId) || undefined,
        invalid: Boolean(shownError),
        required,
        disabled,
        setInternalError,
      }}
    >
      <div
        className={cx('yx-field', className)}
        data-invalid={shownError ? true : undefined}
        data-disabled={disabled || undefined}
        // Bubble phase, never capture: React flushes a capture-phase state update before it runs the
        // input's own onChange, so the controlled input re-rendered with its old value and the browser's
        // first keystroke (or a pasted value) was wiped (validation 8 Oct 2026). In the bubble phase this
        // update and the input's onChange are one batch.
        onInput={(e) => {
          const t = e.target as HTMLElement;
          if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !['checkbox', 'radio'].includes(t.type))) setTyping(true);
        }}
        onBlur={() => setTyping(false)}
      >
        <label htmlFor={fieldId} className="yx-field__label" data-hidden={hideLabel || undefined}>
          <span>{label}</span>
          {required && <span className="yx-field__req">Required</span>}
          {!required && optional && <span className="yx-field__req">Optional</span>}
        </label>
        {children}
        {shownError && (
          <p id={errorId} className="yx-field__error">
            <Icon icon={AlertCircle} />
            <span>{shownError}</span>
          </p>
        )}
        {helper && (
          <p id={helperId} className="yx-field__helper">
            {helper}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

/** Groups fields under a 16 px section heading (§11). Forms stay one column, max 640 px (§16). */
export function FormSection({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  const hid = useId();
  return (
    <section className={cx('yx-form-section', className)} aria-labelledby={hid}>
      <div className="yx-form-section__head">
        <Heading level={3} as="h2" id={hid}>
          {title}
        </Heading>
        {description && <p className="yx-form-section__desc">{description}</p>}
      </div>
      <div className="yx-form-section__body">{children}</div>
    </section>
  );
}

/** Puts two short related fields on one row, e.g. From / To (§16). Stacks on mobile. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="yx-field-row">{children}</div>;
}

export interface FormErrorItem {
  /** id of the field control to jump to. */
  fieldId: string;
  message: string;
}

/**
 * "Reward early, punish late": errors show only for fields that were invalid at the last Save
 * (`reveal`), and each one disappears as soon as it becomes valid. A field that was fine at Save
 * never shows an error while typing; the next `reveal` re-snapshots. `reset` on Cancel / saved.
 */
export function useSaveErrors(errors: FormErrorItem[], initiallyShown = false) {
  const [flagged, setFlagged] = useState<Set<string> | null>(() => (initiallyShown ? new Set(errors.map((e) => e.fieldId)) : null));
  const shownErrors = flagged ? errors.filter((e) => flagged.has(e.fieldId)) : [];
  return {
    errorOf: (id: string) => shownErrors.find((e) => e.fieldId === id)?.message,
    shownErrors,
    showErrors: shownErrors.length > 0,
    reveal: () => setFlagged(new Set(errors.map((e) => e.fieldId))),
    reset: () => setFlagged(null),
  };
}

/** Top-of-form summary for long forms; each item links to its field (§16). Receives focus when it appears. */
export function ErrorSummary({ errors, title = 'Fix these before saving' }: { errors: FormErrorItem[]; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(0);
  // Focus only when the list grows (a Save that failed), never when fixing a field shrinks it mid-typing.
  useEffect(() => {
    if (errors.length > prev.current) ref.current?.focus();
    prev.current = errors.length;
  }, [errors.length]);
  if (!errors.length) return null;
  return (
    <div ref={ref} className="yx-error-summary" role="alert" tabIndex={-1}>
      <p className="yx-error-summary__title">
        <Icon icon={AlertCircle} /> {title}
      </p>
      <ul>
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a
              href={`#${e.fieldId}`}
              onClick={(ev) => {
                ev.preventDefault();
                document.getElementById(e.fieldId)?.focus();
              }}
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface StickySaveBarProps extends HTMLAttributes<HTMLDivElement> {
  /** Shows "Unsaved changes" when true. */
  dirty?: boolean;
  children: ReactNode;
}

/** Bottom bar for long forms: Cancel + Save on the right (§16). Put <Button>s inside. */
export const StickySaveBar = forwardRef<HTMLDivElement, StickySaveBarProps>(function StickySaveBar({ dirty, children, className, ...rest }, ref) {
  return (
    <div ref={ref} className={cx('yx-save-bar', className)} {...rest}>
      <span className="yx-save-bar__status" aria-live="polite">
        {dirty ? 'Unsaved changes' : ''}
      </span>
      <div className="yx-save-bar__actions">{children}</div>
    </div>
  );
});

/** Warns before the tab closes or reloads while a form has unsaved changes (§16, §18). */
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}

/** A <form> that never uses browser-native validation bubbles; we show our own (§16). */
export function Form({ onSubmit, className, ...rest }: Omit<HTMLAttributes<HTMLFormElement>, 'onSubmit'> & { onSubmit?: (e: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form
      noValidate
      className={cx('yx-form', className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(e);
      }}
      {...rest}
    />
  );
}

/** A control inside a field that is not that field (e.g. the calendar's month / year pickers): no label, id or error from it. */
export function NoField({ children }: { children: ReactNode }) {
  return <FieldContext.Provider value={null}>{children}</FieldContext.Provider>;
}
