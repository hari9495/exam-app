import type { HTMLAttributes, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '../lib/cx';
import { initials } from '../lib/format';
import { Tooltip } from './tooltip';
import { Icon } from './foundations';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'ai';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** success = done / paid / approved; warning = pending / attention; danger = rejected / error; ai = AI suggestion only (§3). */
  tone?: BadgeTone;
  children: ReactNode;
}

/** Status badge: always text, never a dot alone (§24). */
export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return <span className={cx('yx-badge', className)} data-tone={tone} {...rest} />;
}

/** The only AI marker in the product (§8, §45). No sparkle icons. */
export function AiBadge() {
  return <Badge tone="ai">AI</Badge>;
}

export interface TagProps {
  children: ReactNode;
  /** Shows a remove button. */
  onRemove?: () => void;
  removeLabel?: string;
}

/** Neutral, user-defined label (§24). */
export function Tag({ children, onRemove, removeLabel }: TagProps) {
  return (
    <span className="yx-tag">
      <span>{children}</span>
      {onRemove && (
        <Tooltip content={removeLabel ?? `Remove ${typeof children === 'string' ? children : ''}`.trim()}>
          <button type="button" className="yx-tag__remove" onClick={onRemove} aria-label={removeLabel ?? `Remove ${typeof children === 'string' ? children : ''}`.trim()}>
            <Icon icon={X} />
          </button>
        </Tooltip>
      )}
    </span>
  );
}

export type AvatarSize = 20 | 24 | 32 | 40 | 64;

export interface AvatarProps {
  name: string;
  /** Real photo only (§9). Falls back to initials. */
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

const TINTS = 6;
function tintFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (h % TINTS) + 1;
}

/** Photo or initials on a muted tint derived from the name (§24). */
export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  return (
    <span className={cx('yx-avatar', className)} data-size={size} data-tint={tintFor(name)} role="img" aria-label={name}>
      {src ? <img src={src} alt="" /> : <span aria-hidden="true">{initials(name)}</span>}
    </span>
  );
}

/** Shows up to `max` avatars then "+N" (§24). */
export function AvatarGroup({ people, max = 3, size = 24 }: { people: { name: string; src?: string | null }[]; max?: number; size?: AvatarSize }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="yx-avatar-group" aria-label={people.map((p) => p.name).join(', ')} role="group">
      {shown.map((p) => (
        <Avatar key={p.name} name={p.name} src={p.src} size={size} />
      ))}
      {extra > 0 && (
        <span className="yx-avatar" data-size={size} data-tint="0" aria-hidden="true">
          +{extra}
        </span>
      )}
    </span>
  );
}

/** Avatar + name (+ secondary line), the standard way to show a person in tables and pickers (§20). */
export function PersonLabel({ name, src, secondary, size = 24 }: { name: string; src?: string | null; secondary?: ReactNode; size?: AvatarSize }) {
  return (
    <span className="yx-person">
      <Avatar name={name} src={src} size={size} />
      <span className="yx-person__text">
        <span className="yx-person__name">{name}</span>
        {secondary && <span className="yx-person__sub">{secondary}</span>}
      </span>
    </span>
  );
}
