import { StatusBadge, type StatusTone } from './StatusBadge';

export type IntegrityLevel = 'clear' | 'review' | 'high_concern';

const LEVEL_TONE: Record<IntegrityLevel, StatusTone> = {
  clear: 'success',
  review: 'warning',
  high_concern: 'danger',
};

const LEVEL_LABEL: Record<IntegrityLevel, string> = {
  clear: 'Integrity: Clear',
  review: 'Integrity: Review recommended',
  high_concern: 'Integrity: High concern',
};

function isIntegrityLevel(level: string): level is IntegrityLevel {
  return level in LEVEL_TONE;
}

export function IntegrityBadge({ level }: { level: string | null | undefined }) {
  if (level && isIntegrityLevel(level)) {
    return <StatusBadge tone={LEVEL_TONE[level]}>{LEVEL_LABEL[level]}</StatusBadge>;
  }
  return <StatusBadge tone="neutral">Integrity: —</StatusBadge>;
}
