'use client';

import clsx from 'clsx';
import { useOrgUsage } from '../../../../lib/hooks/useBilling';
import { PageHeader, PageSurface } from '../../../../components/PageChrome';
import { Skeleton } from '../../../../components/ui';
import { DimensionUsage } from '../../../../lib/types';

function UsageBar({ label, used, limit }: { label: string } & DimensionUsage) {
  const pct = limit > 0 ? (used / limit) * 100 : used > 0 ? 100 : 0;
  const width = Math.min(100, pct);
  const over = used >= limit;
  const barColor = pct >= 100 ? 'bg-status-danger' : pct >= 80 ? 'bg-status-warning' : 'bg-status-success';

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-muted">
          {used} / {limit}
          {over && (
            <span aria-label="over limit" className="ml-1 text-status-danger">
              ⚠
            </span>
          )}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded bg-ground">
        <div className={clsx('h-full rounded', barColor)} style={{ width: `${width}%` }} />
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
    return (
      <div>
        <PageHeader eyebrow="Settings" title="Billing" />
        <PageSurface className="p-6">
          <div aria-busy="true" className="flex flex-col gap-5">
            <Skeleton className="h-6 w-40" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        </PageSurface>
      </div>
    );
  }

  const resetDate = nextResetDate(usage.periodStart);

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Billing" subtitle="Your current plan and how much of it you have used this cycle." />

      <PageSurface className="p-6">
        <div className="flex flex-col gap-6">
          <div>
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Current plan</p>
            <p className="mt-1 font-display text-xl font-bold capitalize tracking-[-0.01em] text-ink">{usage.planName}</p>
          </div>

          <div className="flex flex-col gap-4 border-t border-rule pt-6">
            <UsageBar label="Seats" used={usage.seats.used} limit={usage.seats.limit} />
            <UsageBar label="Candidates" used={usage.candidates.used} limit={usage.candidates.limit} />
            <UsageBar label="AI Credits" used={usage.aiCredits.used} limit={usage.aiCredits.limit} />
            <UsageBar label="Proctoring Minutes" used={usage.proctoringMinutes.used} limit={usage.proctoringMinutes.limit} />
          </div>

          <p className="border-t border-rule pt-4 text-sm text-muted">
            Usage resets on{' '}
            {resetDate.toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })}. Need a
            different plan? Contact us.
          </p>
        </div>
      </PageSurface>
    </div>
  );
}
