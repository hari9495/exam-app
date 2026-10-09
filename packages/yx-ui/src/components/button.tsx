import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { ChevronDown } from 'lucide-react';
import { cx } from '../lib/cx';
import { Icon, Spinner, type IconComponent } from './foundations';
import { Tooltip } from './tooltip';
import { Menu, MenuContent, MenuTrigger } from './menu';

/** Buttons with a text label always have a border or fill. There is no borderless text button (founder review, 29 Sep 2026). */
/** approve (green) and review (blue) are tinted row actions: Approve / Review / View (founder review 30 Sep 2026). */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'approve' | 'review';
/** Icon-only buttons may be borderless (ghost) inside toolbars and table rows. */
export type IconButtonVariant = 'ghost' | 'secondary';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * secondary (bordered) is the default (§15) and is used for Cancel, Back and every other action next to a primary.
   * primary: once per view. danger: irreversible actions only, always confirmed.
   * There is no borderless text button; for a low-emphasis text action inside a sentence use <Link>.
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. */
  icon?: IconComponent;
  /** Shows a spinner, keeps the button's width, blocks repeat clicks. */
  loading?: boolean;
  /** Render as the child element (e.g. a router link) with button styling. */
  asChild?: boolean;
  fullWidth?: boolean;
}

/** Verb-first, sentence-case labels: "Run payroll", never "Submit" or "OK" (§15, §34). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading = false, asChild, fullWidth, className, children, disabled, type, onClick, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      className={cx('yx-button', className)}
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      data-full={fullWidth || undefined}
      disabled={asChild ? undefined : disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {asChild ? (
        children
      ) : (
        <>
          {icon && !loading && <Icon icon={icon} />}
          {loading && icon && <Spinner />}
          <span className="yx-button__label" data-hidden={(loading && !icon) || undefined}>{children}</span>
          {loading && !icon && <span className="yx-button__overlay"><Spinner /></span>}
        </>
      )}
    </Comp>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconComponent;
  /** Required: becomes the accessible name and the tooltip (§15, §33). */
  label: string;
  variant?: IconButtonVariant;
  size?: ButtonSize;
  /** Hide the tooltip when the label is already visible nearby. */
  noTooltip?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', noTooltip, className, type, ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      className={cx('yx-button', className)}
      data-variant={variant}
      data-size={size}
      data-icon-only
      {...rest}
    >
      <Icon icon={icon} size={size === 'lg' ? 'md' : 'sm'} />
    </button>
  );
  return noTooltip ? btn : <Tooltip content={label}>{btn}</Tooltip>;
});

/** Joins related buttons, e.g. a toolbar or segmented choice. */
export function ButtonGroup({ className, ...rest }: HTMLAttributes<HTMLDivElement> & { 'aria-label'?: string }) {
  return <div role="group" className={cx('yx-button-group', className)} {...rest} />;
}

export interface SplitButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Accessible name for the menu arrow, e.g. "More approve options". */
  menuLabel: string;
  /** <MenuItem> elements. */
  menu: ReactNode;
}

/** Main action plus related options, e.g. "Approve" + "Approve with note" (§15). */
export function SplitButton({ children, onClick, variant = 'secondary', size = 'md', loading, disabled, menuLabel, menu }: SplitButtonProps) {
  return (
    <div className="yx-split-button" data-variant={variant}>
      <Button variant={variant} size={size} loading={loading} disabled={disabled} onClick={onClick}>
        {children}
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <button type="button" className="yx-button" data-variant={variant} data-size={size} data-icon-only aria-label={menuLabel} disabled={disabled || loading}>
            <Icon icon={ChevronDown} />
          </button>
        </MenuTrigger>
        <MenuContent align="end">{menu}</MenuContent>
      </Menu>
    </div>
  );
}

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  asChild?: boolean;
  /** Muted links for secondary navigation inside text. */
  tone?: 'default' | 'muted';
}

/** Inline text link. Wrap a router link with asChild. */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ asChild, tone, className, ...rest }, ref) {
  const Comp = asChild ? Slot : 'a';
  return <Comp ref={ref} className={cx('yx-link', className)} data-tone={tone} {...rest} />;
});
