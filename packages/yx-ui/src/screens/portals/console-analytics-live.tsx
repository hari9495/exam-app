// YX-09 Product analytics, live (YukthiX console C-8): the designed ProductAnalyticsScreen with the parts the API has
// data for: which features companies use, counts only, by feature (and size band) and by company. Groups of fewer than
// the minimum (never under 5 companies) arrive hidden (null) and say so; never a name or HR content.
import { Card } from '../../components/shell';
import { InlineAlert } from '../../components/feedback';
import { BarChart } from '../../components/charts';
import { formatDate } from '../../lib/format';
import { ConsolePage } from '../console/console-kit';
import type { LoadState } from '../console/types';
import { FilteredTable, opts } from './list-kit';

export interface LiveAnalytics {
  state: LoadState;
  onRetry: () => void;
  windowDays: number;
  minCompanies: number;
  totalCompanies: number;
  areas: { key: string; label: string }[];
  byFeature: { area: string; label: string; companies: number | null; actions: number | null }[];
  bySize: { bands: { label: string; companies: number | null }[]; adoption: { area: string; label: string; pct: (number | null)[] }[] };
  byCompany: { id: string; company: string; band: string; areas: Record<string, number>; lastActive: string }[];
}

const shown = (v: number | null, min: number) => (v === null ? `Fewer than ${min}` : v.toLocaleString('en-IN'));

export function LiveAnalyticsScreen({ live }: { live: LiveAnalytics }) {
  const bands = live.bySize.bands.map((b, i) => ({ ...b, i })).filter((b) => b.companies !== null);
  const hiddenBands = live.bySize.bands.filter((b) => b.companies === null);
  return (
    <ConsolePage
      crumb="Product analytics"
      title="Product analytics"
      description={`Which features companies use, from counts of actions only: no names, no HR content. Any group of fewer than ${live.minCompanies} companies is hidden.`}
      state={live.state}
      onRetry={live.onRetry}
      what="product analytics"
    >
      <div className="yx-ps-stack">
        <p className="yx-ps-muted">
          Last {live.windowDays} days · {live.totalCompanies.toLocaleString('en-IN')} companies · the window and the minimum are Platform settings.
        </p>
        <Card title="By feature">
          <FilteredTable
            label="Features"
            rows={live.byFeature}
            getRowId={(r) => r.area}
            searchText={(r) => r.label}
            fields={[]}
            columns={[
              { key: 'label', header: 'Feature', value: (r) => r.label, width: 200 },
              { key: 'companies', header: 'Companies using it', value: (r) => r.companies ?? -1, render: (r) => shown(r.companies, live.minCompanies), width: 170 },
              { key: 'actions', header: 'Actions', value: (r) => r.actions ?? -1, render: (r) => shown(r.actions === null ? null : r.actions, live.minCompanies).replace(/^Fewer.*/, 'Hidden'), width: 140 },
            ]}
          />
        </Card>
        <Card>
          {bands.length ? (
            <BarChart
              title="Feature adoption by size band (% of companies)"
              xLabel="Feature"
              categories={live.bySize.adoption.map((a) => a.label)}
              series={bands.map((b) => ({ name: `${b.label} (${b.companies})`, values: live.bySize.adoption.map((a) => a.pct[b.i] ?? null) }))}
            />
          ) : (
            <InlineAlert tone="info" title={`Every size band has fewer than ${live.minCompanies} companies, so none is shown.`} />
          )}
          {hiddenBands.length > 0 && bands.length > 0 && <p className="yx-ps-muted">Hidden (fewer than {live.minCompanies} companies): {hiddenBands.map((b) => b.label).join(', ')}. A bar left out means fewer than {live.minCompanies} companies in that band use it.</p>}
        </Card>
        <Card title="By company">
          <FilteredTable
            label="Companies"
            rows={live.byCompany}
            getRowId={(r) => r.id}
            searchText={(r) => r.company}
            fields={[{ key: 'band', label: 'Size band', type: 'multi', options: opts(['Under 200 employees', '200+ employees']) }]}
            columns={[
              { key: 'company', header: 'Company', value: (r) => r.company, width: 220 },
              { key: 'band', header: 'Size band', value: (r) => r.band, width: 160 },
              ...live.areas.map((a) => ({ key: a.key, header: a.label, type: 'number' as const, value: (r: LiveAnalytics['byCompany'][number]) => r.areas[a.key] ?? 0, width: 110 })),
              { key: 'last', header: 'Last active', value: (r) => r.lastActive, render: (r) => formatDate(new Date(r.lastActive)), width: 130 },
            ]}
          />
        </Card>
      </div>
    </ConsolePage>
  );
}
