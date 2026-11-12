import { EmptyState, InlineAlert } from '../../components/feedback';
import { Text } from '../../components/foundations';
import { Card } from '../../components/shell';
import { PlainTable } from '../../components/plain-table';
import { formatDate } from '../../lib/format';
import { dateLabel } from './org-kit';
import type { ErasureCounts, ErasurePerson, ErasureReport } from './types';

// The erasure dry run for Special data, on Settings › 2.2 Directory & privacy (moved here when Company rules and Access
// and privacy were retired, answer 1781).
const ERASED: { key: keyof ErasureCounts; what: string }[] = [
  { key: 'people', what: 'People past the period (left, or never joined)' },
  { key: 'aadhaar', what: 'Aadhaar numbers on their records and joining forms' },
  { key: 'documents', what: 'Aadhaar copies, background check reports and disability certificates' },
  { key: 'backgroundChecks', what: 'Background check notes' },
  { key: 'disability', what: 'Disability details (the yes or no answer stays)' },
];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Follow-up 12 and the founder's answers (30 Oct 2026): what the nightly job would delete today and from whom (name,
 * employee code, last day or the day the joining was cancelled; never a value), what it keeps, and its last run.
 */
export function ErasureCard({ report }: { report: ErasureReport }) {
  const last = report.lastRun;
  const due = report.enabled ? 'Due at the next run' : 'If it ran today, it would delete';
  return (
    <Card title="Deleting Special data" className="yx-org__group">
      <Text as="p" tone="secondary" size="sm" className="yx-org__group-desc">
        {report.enabled
          ? 'On. Every night, Special data past its period is deleted for good, and each deletion is recorded with counts only.'
          : 'Off. Nothing is deleted. Check what it would delete today, then turn it on above.'}
      </Text>
      <PlainTable
        label={due}
        caption={due}
        columns={[
          { key: 'what', header: 'What', rowHeader: true, cell: (r: (typeof ERASED)[number]) => r.what },
          { key: 'count', header: 'How many', cell: (r: (typeof ERASED)[number]) => report.due[r.key] },
        ]}
        rows={ERASED}
        getRowId={(r) => r.key}
      />
      {report.who.length ? (
        <PlainTable
          label="Whose data"
          caption="Whose data"
          columns={[
            { key: 'name', header: 'Name', rowHeader: true, cell: (p: ErasurePerson) => p.name },
            { key: 'code', header: 'Employee code', cell: (p: ErasurePerson) => p.employeeCode ?? 'None (never joined)' },
            { key: 'day', header: 'Last day', date: true, cell: (p: ErasurePerson) => (p.neverJoined ? `Joining cancelled ${dateLabel(p.day)}` : dateLabel(p.day)) },
          ]}
          rows={report.who}
          getRowId={(p) => `${p.name}-${p.employeeCode ?? ''}-${p.day}`}
        />
      ) : (
        <EmptyState compact title="No one's data is due." description="People appear here once their period has passed." />
      )}
      <Text as="p" tone="secondary" size="sm">
        Kept: consent records, background check results (clear or discrepancy), and pay records and filings, Aadhaar included (they follow the payroll period).
      </Text>
      <Text as="p" size="sm">
        {last
          ? `Last run ${formatDate(new Date(last.at))}: ${plural(last.people, 'person', 'people')}, ${plural(last.aadhaar, 'Aadhaar number', 'Aadhaar numbers')}, ${plural(last.documents, 'document', 'documents')}, ${plural(last.backgroundChecks, 'check note', 'check notes')}, ${plural(last.disability, 'disability declaration', 'disability declarations')}.`
          : 'It has not run yet.'}
      </Text>
      {last && last.failed > 0 && (
        <InlineAlert tone="warning" title={`${plural(last.failed, 'person was', 'people were')} not done`}>
          It tries again tomorrow night. If it keeps failing, contact YukthiX support.
        </InlineAlert>
      )}
    </Card>
  );
}
