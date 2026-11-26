import type { ReactNode } from 'react';
import { Badge } from '../../components/display';
import { Text } from '../../components/foundations';
import { EmptyState, ErrorState, Skeleton } from '../../components/feedback';
import { Select } from '../../components/select';
import { Card, PageHeader } from '../../components/shell';
import { GrowthFrame } from './growth-kit';
import type { LoadState } from './perf-live-data';

/** GET /performance/expectations (T2-C item 68, answer 2842). */
export interface Expectations {
  employee: { id: string; name: string; designation: string | null; mine: boolean };
  competencies: { id: string; name: string; group: string; description: string | null; expectedLevel: number; levelLabel: string | null; behaviours: string | null; levels: number }[];
  values: string[];
  /** The viewer's direct reports, to open the same page for one of them. */
  reports: { value: string; label: string }[];
}

const GROUP: Record<string, string> = { core: 'Core', functional: 'Functional', leadership: 'Leadership' };
const ME = 'me';

/**
 * Performance › What is expected of me (T2-C item 68, answer 2842): read-only. The competencies set for the person's
 * designation (the expected level and its behaviours), then the company's core values. No ratings. A manager picks a
 * report to see the same page for them (`onPerson`, null for their own).
 */
export function ExpectationsScreen({ state, onRetry, data, onPerson }: { state: LoadState; onRetry: () => void; data: Expectations | null; onPerson: (employeeId: string | null) => void }) {
  const frame = (children: ReactNode) => (
    <GrowthFrame area="performance" active="Skills & competencies" persona={data?.reports.length ? 'mgr' : 'emp'}>
      {children}
    </GrowthFrame>
  );
  const title = data && !data.employee.mine ? `What is expected of ${data.employee.name}` : 'What is expected of me';
  if (state === 'error') return frame(<><PageHeader title={title} /><ErrorState title="This page didn’t load" onRetry={onRetry} /></>);
  if (state === 'loading' || !data) return frame(<><PageHeader title={title} /><Skeleton height={320} /></>);
  const who = data.reports.length > 0 && <Select aria-label="Show the page for" value={data.employee.mine ? ME : data.employee.id} onChange={(v) => onPerson(!v || v === ME ? null : v)} options={[{ value: ME, label: 'Me' }, ...data.reports]} searchable />;
  return frame(
    <>
      <PageHeader title={title} description={`${data.employee.designation ? `${data.employee.designation}. ` : ''}What your company expects in this job, and the values everyone shares. Nothing here is a rating.`} actions={who || undefined} />
      <Card title={data.employee.designation ? `Competencies for ${data.employee.designation}` : 'Competencies'}>
        {data.competencies.length === 0 ? (
          <EmptyState compact title="No competencies are set for this job yet." description="HR sets them in Performance › Competencies." />
        ) : (
          <ul className="yx-growth-list">
            {data.competencies.map((c) => (
              <li key={c.id} className="yx-growth-list__item">
                <div className="yx-growth-grow">
                  <Text as="p" weight="semibold">{c.name}</Text>
                  {c.description && <span className="yx-growth-meta">{c.description}</span>}
                  {c.behaviours && <Text as="p">{c.behaviours}</Text>}
                </div>
                <Badge tone="neutral">{GROUP[c.group] ?? c.group}</Badge>
                <Badge tone="info">{`Expected: level ${c.expectedLevel} of ${c.levels}${c.levelLabel ? ` · ${c.levelLabel}` : ''}`}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Our core values">
        {data.values.length === 0 ? (
          <EmptyState compact title="No company values are set." />
        ) : (
          <ul className="yx-growth-list">
            {data.values.map((v) => (
              <li key={v} className="yx-growth-list__item">
                <Badge tone="success">{v}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>,
  );
}
