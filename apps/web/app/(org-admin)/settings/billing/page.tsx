'use client';

import clsx from 'clsx';
import { useOrgUsage } from '../../../../lib/hooks/useBilling';
import { Card } from '../../../../components/ui';
import { DimensionUsage } from '../../../../lib/types';

function UsageBar({ label, used, limit }: { label: string } & DimensionUsage) {
  const pct = limit > 0 ? (used / limit) * 100 : used > 0 ? 100 : 0;
  const width = Math.min(100, pct);
  const over = used >= limit;
  const barColor = pct >= 100 ? 'bg-status-danger' : pct >= 80 ? 'bg-status-warning' : 'bg-status-success';

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-recruiter-text">{label}</span>
        <span className="text-recruiter-text-secondary">
          {used} / {limit}
          {over && (
            <span aria-label="over limit" className="ml-1 text-status-danger">
              ⚠
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ground">
        <div className={clsx('h-full rounded-full', barColor)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

// The org's usage resets on a calendar-month cycle -- the next reset is always the first of the
// month after periodStart, regardless of which day of the month periodStart itself falls on.
function nextResetDate(periodStart: string): Date {
  const start = new Date(periodStart);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export default function BillingSettingsPage() {
  const { data: usage } = useOrgUsage();

  if (!usage) {
    return <p className="p-8 text-sm text-recruiter-text-tertiary">Loading…</p>;
  }

  const resetDate = nextResetDate(usage.periodStart);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-center text-2xl font-semibold text-recruiter-text">Billing</h1>

      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-recruiter-text-secondary">Current plan</p>
          <p className="font-display text-xl font-semibold capitalize text-recruiter-text">{usage.planName}</p>
        </div>

        <div className="flex flex-col gap-4">
          <UsageBar label="Seats" used={usage.seats.used} limit={usage.seats.limit} />
          <UsageBar label="Candidates" used={usage.candidates.used} limit={usage.candidates.limit} />
          <UsageBar label="AI Credits" used={usage.aiCredits.used} limit={usage.aiCredits.limit} />
          <UsageBar label="Proctoring Minutes" used={usage.proctoringMinutes.used} limit={usage.proctoringMinutes.limit} />
        </div>

        <p className="text-sm text-recruiter-text-tertiary">
          Usage resets on {resetDate.toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })}.
        </p>
      </Card>

      <p className="text-center text-sm text-recruiter-text-secondary">Need a different plan? Contact us.</p>
    </div>
  );
}
