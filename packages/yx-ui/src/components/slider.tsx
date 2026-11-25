import { useId, type ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  step?: number;
  /** The value as people read it ("₹12,000"): shown beside the label and read out instead of the bare number. */
  valueText?: (value: number) => string;
  /** A line under the slider (a limit, what the value means). */
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Picks a number in a range by dragging or with the arrow keys (what-if estimates). The label and the current value sit
 * above; the value is read out as text. For an exact figure people type, use NumberField or CurrencyField.
 */
export function Slider({ label, value, onChange, min = 0, max, step = 1, valueText = String, hint, disabled, className }: SliderProps) {
  const id = useId();
  const text = valueText(value);
  return (
    <div className={cx('yx-slider', className)}>
      <div className="yx-slider__head">
        <label htmlFor={id}>{label}</label>
        <strong aria-hidden="true">{text}</strong>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={text}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && (
        <p id={`${id}-hint`} className="yx-slider__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
