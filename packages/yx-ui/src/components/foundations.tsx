import { forwardRef, type ComponentPropsWithoutRef, type ComponentType, type HTMLAttributes, type ReactNode, type SVGProps } from 'react';
import { VisuallyHidden as RadixVisuallyHidden } from '@radix-ui/react-visually-hidden';
import { cx } from '../lib/cx';

/** Radix VisuallyHidden pinned to the top-left of its box, so hidden text inside a scroller can't widen the page. */
export const VisuallyHidden = forwardRef<HTMLSpanElement, ComponentPropsWithoutRef<typeof RadixVisuallyHidden>>(function VisuallyHidden(props, ref) {
  return <RadixVisuallyHidden ref={ref} {...props} style={{ top: 0, left: 0, ...props.style }} />;
});

type TextSize = 'xs' | 'sm' | 'md' | 'lg';
type Tone = 'default' | 'secondary' | 'muted' | 'danger' | 'success' | 'warning';

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: 'span' | 'p' | 'div' | 'label' | 'strong';
  /** md = body. Only §2 scale steps exist. */
  size?: TextSize;
  weight?: 'regular' | 'medium' | 'semibold';
  tone?: Tone;
  mono?: boolean;
}

export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  { as: As = 'span', size, weight, tone, mono, className, ...rest },
  ref,
) {
  return (
    <As
      ref={ref as never}
      className={cx('yx-text', className)}
      data-size={size}
      data-weight={weight}
      data-tone={tone}
      data-mono={mono || undefined}
      {...rest}
    />
  );
});

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** 1 = page title (22 px, one per page), 2 = drawer / dialog title (18), 3 = section (16), 4 = sub-section (14). */
  level?: 1 | 2 | 3 | 4;
  /** Override the rendered tag when the visual level differs from the document outline. */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div';
}

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(function Heading(
  { level = 1, as, className, ...rest },
  ref,
) {
  const Tag = as ?? (`h${level}` as const);
  return <Tag ref={ref} className={cx('yx-heading', className)} data-level={level} {...rest} />;
});

/** Big figure for stat cards and totals (28 or 36 px, tabular). */
export function Figure({ size = 'lg', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { size?: 'md' | 'lg' }) {
  return <span className={cx('yx-figure', className)} data-size={size} {...rest} />;
}

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;

export interface IconProps {
  /** A Lucide icon today; a YukthiX icon later (§8). Same props either way. */
  icon: IconComponent;
  size?: 'sm' | 'md';
  /** Give a label only when the icon carries meaning on its own. Otherwise it is hidden from screen readers. */
  label?: string;
  className?: string;
}

export function Icon({ icon: Svg, size = 'sm', label, className }: IconProps) {
  const px = size === 'sm' ? 16 : 20;
  return (
    <Svg
      className={cx('yx-icon', className)}
      width={px}
      height={px}
      size={px}
      strokeWidth={1.5}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
    />
  );
}

/** Keyboard shortcut hint, e.g. <Kbd>Ctrl K</Kbd>. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="yx-kbd">{children}</kbd>;
}

/** Inline spinner. Only inside buttons and small areas (§25); pages use skeletons. */
export function Spinner({ label, size = 'sm' }: { label?: string; size?: 'sm' | 'md' }) {
  return (
    <span className="yx-spinner" data-size={size} role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
  );
}
