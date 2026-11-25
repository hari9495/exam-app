// G4 (item 14, ANL-06): the report library with real entries, in the designed layout. The designed ReportLibraryScreen
// (analytics.tsx) renders this when given `live`. "New report" (the ANL-05 builder) is not built yet (question 2694).
import { useMemo, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { Icon } from '../../components/foundations';
import { EmptyState, ErrorState, Skeleton } from '../../components/feedback';
import { Card, PageHeader } from '../../components/shell';
import { TextField } from '../../components/inputs';
import { Switch } from '../../components/choice';
import { useToast } from '../../components/notify';
import { AnlFrame } from './proctoring-shared';

export interface LiveReportRow {
  id: string;
  name: string;
  question: string;
  area: string;
  href: string;
  format: string;
  sensitivity: 'Internal' | 'Confidential';
  favourite: boolean;
}
export interface LiveReportLibrary {
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  reports: LiveReportRow[];
  onFavourite: (id: string, on: boolean) => Promise<unknown>;
  onOpen: (href: string) => void;
}

export function LiveReportLibraryScreen({ live }: { live: LiveReportLibrary }) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [fav, setFav] = useState(false);
  const rows = live.reports.filter((r) => (!q || `${r.name} ${r.area}`.toLowerCase().includes(q.toLowerCase())) && (!fav || r.favourite));
  const groups = useMemo(() => Array.from(new Set(rows.map((r) => r.question))), [rows]);
  const star = async (r: LiveReportRow) => {
    try {
      await live.onFavourite(r.id, !r.favourite);
    } catch (e) {
      toast({ tone: 'error', title: e instanceof Error ? e.message : 'That did not work. Try again.' });
    }
  };
  return (
    <AnlFrame page="Reports">
      <PageHeader title="Report library" description="The reports you may open, grouped by the question they answer. Each opens in its own area." />
      <div className="yx-prc-row">
        <TextField value={q} onChange={setQ} prefix={<Icon icon={Search} />} placeholder="Search reports" aria-label="Search reports" />
        <Switch label="Favourites only" checked={fav} onChange={setFav} />
      </div>
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the reports." description="Try again in a moment." onRetry={live.onRetry} />
      ) : live.state === 'loading' ? (
        <Skeleton height={300} />
      ) : live.reports.length === 0 ? (
        <EmptyState title="No reports for you yet" description="Reports appear here when your role gives you one, or when people report to you." />
      ) : rows.length === 0 ? (
        <EmptyState title={q ? `No reports match "${q}".` : 'No favourites yet.'} description={q ? 'Try another word.' : 'Mark a report with the star to keep it here.'} action={<Button onClick={() => (setQ(''), setFav(false))}>Show all reports</Button>} />
      ) : (
        groups.map((g) => (
          <Card key={g} title={g === 'Statutory registers' ? 'Compliance · statutory registers' : g}>
            <ul className="yx-prc-plain">
              {rows
                .filter((r) => r.question === g)
                .map((r) => (
                  <li key={r.id}>
                    <span className="yx-prc-stack" data-gap="sm">
                      <strong className="yx-prc-row">{r.name}</strong>
                      <span className="yx-prc-small yx-prc-muted">
                        {r.area} · {r.format}
                      </span>
                    </span>
                    <span className="yx-prc-row">
                      <Badge tone={r.sensitivity === 'Confidential' ? 'warning' : 'neutral'}>{r.sensitivity}</Badge>
                      <IconButton icon={Star} label={r.favourite ? `Remove ${r.name} from favourites` : `Add ${r.name} to favourites`} aria-pressed={r.favourite} onClick={() => void star(r)} size="sm" />
                      <Button size="sm" onClick={() => live.onOpen(r.href)}>
                        Open
                      </Button>
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        ))
      )}
    </AnlFrame>
  );
}
