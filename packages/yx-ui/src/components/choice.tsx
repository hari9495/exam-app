import { forwardRef, useId, type ReactNode } from 'react';
import * as RC from '@radix-ui/react-checkbox';
import * as RR from '@radix-ui/react-radio-group';
import * as RS from '@radix-ui/react-switch';
import { Check, Minus } from 'lucide-react';
import { cx } from '../lib/cx';
import { Icon } from './foundations';

export interface CheckboxProps {
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Visible label. Omit only inside tables, and then pass aria-label. */
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { checked, defaultChecked, onChange, label, description, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const cid = id ?? autoId;
  const box = (
    <RC.Root
      ref={ref}
      id={cid}
      className="yx-checkbox"
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={(c) => onChange?.(c === true)}
      aria-describedby={description ? `${cid}-desc` : undefined}
      {...rest}
    >
      <RC.Indicator className="yx-checkbox__mark">
        <Icon icon={checked === 'indeterminate' ? Minus : Check} />
      </RC.Indicator>
    </RC.Root>
  );
  if (!label) return box;
  return (
    <div className={cx('yx-choice', className)}>
      {box}
      <div className="yx-choice__text">
        <label htmlFor={cid}>{label}</label>
        {description && <p id={`${cid}-desc`} className="yx-choice__desc">{description}</p>}
      </div>
    </div>
  );
});

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Group label; required for accessibility unless inside a FormField with its own label. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  orientation?: 'vertical' | 'horizontal';
  disabled?: boolean;
  name?: string;
  className?: string;
}

/** Use radios for 2–5 visible choices; use Select for more. */
export function RadioGroup({ options, onChange, orientation = 'vertical', className, ...rest }: RadioGroupProps) {
  const gid = useId();
  return (
    <RR.Root className={cx('yx-radio-group', className)} data-orientation={orientation} orientation={orientation} onValueChange={onChange} {...rest}>
      {options.map((o, i) => {
        const id = `${gid}-${i}`;
        return (
          <div key={o.value} className="yx-choice">
            <RR.Item id={id} value={o.value} disabled={o.disabled} className="yx-radio" aria-describedby={o.description ? `${id}-desc` : undefined}>
              <RR.Indicator className="yx-radio__dot" />
            </RR.Item>
            <div className="yx-choice__text">
              <label htmlFor={id}>{o.label}</label>
              {o.description && <p id={`${id}-desc`} className="yx-choice__desc">{o.description}</p>}
            </div>
          </div>
        );
      })}
    </RR.Root>
  );
}

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** Only for settings that take effect immediately, with no Save button (§16). */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, defaultChecked, onChange, label, description, disabled, id, className },
  ref,
) {
  const autoId = useId();
  const sid = id ?? autoId;
  return (
    <div className={cx('yx-choice', 'yx-choice--switch', className)}>
      <div className="yx-choice__text">
        <label htmlFor={sid}>{label}</label>
        {description && <p id={`${sid}-desc`} className="yx-choice__desc">{description}</p>}
      </div>
      <RS.Root
        ref={ref}
        id={sid}
        className="yx-switch"
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-describedby={description ? `${sid}-desc` : undefined}
      >
        <RS.Thumb className="yx-switch__thumb" />
      </RS.Root>
    </div>
  );
});
