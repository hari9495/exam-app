import Link from 'next/link';
import { History } from 'lucide-react';

interface AuditHistoryLinkProps {
  entityType: string;
  entityId: string;
  /** Shown as the audit page's "Filtered by" chip label. */
  entityName?: string;
  className?: string;
}

// Turns the global audit feed into a per-record trail: drop this on an exam,
// question, or candidate page to jump straight to that entity's history.
export function AuditHistoryLink({ entityType, entityId, entityName, className }: AuditHistoryLinkProps) {
  const params = new URLSearchParams({ entityType, entityId });
  if (entityName) params.set('entityName', entityName);
  return (
    <Link
      href={`/audit-log?${params.toString()}`}
      className={className ?? 'inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline'}
    >
      <History size={14} aria-hidden="true" />
      View history
    </Link>
  );
}
