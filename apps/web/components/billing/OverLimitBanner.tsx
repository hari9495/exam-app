'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useOrgUsage } from '../../lib/hooks/useBilling';
import { DimensionUsage } from '../../lib/types';

// Only the two hard-gated dimensions (see QuotaService) block work outright -- seats/candidates are
// soft-warned elsewhere at the point of use. Surfacing every dimension here would nag about limits
// that aren't actually stopping anything.
const HARD_DIMENSIONS: { key: 'aiCredits' | 'proctoringMinutes'; label: string }[] = [
  { key: 'aiCredits', label: 'AI credit' },
  { key: 'proctoringMinutes', label: 'proctoring minutes' },
];

function isOverLimit(dimension: DimensionUsage): boolean {
  return dimension.used >= dimension.limit;
}

export function OverLimitBanner() {
  const { data: usage, isLoading, isError } = useOrgUsage();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || isError || !usage || dismissed) return null;

  // Defensive on a missing dimension, not just an over/under check: some layout tests stub fetch
  // with a bare `{}` response for endpoints they don't care about, which reaches this component as
  // real react-query data with no dimensions at all.
  const over = HARD_DIMENSIONS.find((dim) => {
    const dimensionUsage = usage[dim.key];
    return dimensionUsage && isOverLimit(dimensionUsage);
  });
  if (!over) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 border-b border-status-danger bg-status-danger-bg px-6 py-3 font-body text-sm text-status-danger"
    >
      <span>You&apos;ve hit your {over.label} limit — contact us to upgrade.</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="rounded p-1 hover:bg-status-danger/10"
      >
        <X size={16} />
      </button>
    </div>
  );
}
