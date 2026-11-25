// Batch B item 3 (admin B2, answers 2367-2369): Settings › Recycle bin. Records deleted anywhere the bin covers, newest
// first, each restorable with its own id until the company's "Keep deleted items for" passes; then they go for good.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { PageHeader } from '../../components/shell';
import { EmptyState, NoAccessState } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { ConfirmDialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { formatDate } from '../../lib/format';
import '../platform-a/platform.css';

export interface RecycleBinRow {
  id: string;
  /** 'bin': kept by the YukthiX bin; 'hiring': hiring's own soft delete (30 days). */
  source: 'bin' | 'hiring';
  kind: string;
  /** What it is, in words ("Department"). */
  what: string;
  area: string;
  label: string;
  deletedAt: string;
  deletedBy: string | null;
  /** The day it is deleted for good. */
  purgeOn: string;
}

export interface RecycleBinScreenProps {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  rows: RecycleBinRow[];
  keepDays: number;
  /** Saves "Keep deleted items for" (a company setting). Omitted: shown read-only. */
  onKeepDays?: (days: number) => Promise<void>;
  onRestore: (row: RecycleBinRow) => Promise<void>;
  /** Deletes for good (asks to confirm it's you). Omitted for rows that cannot be deleted from here. */
  onPurge?: (row: RecycleBinRow) => Promise<void>;
}

const KEEP = [30, 60, 90, 180, 365].map((d) => ({ value: String(d), label: `${d} days` }));

export function RecycleBinScreen(props: RecycleBinScreenProps) {
  const [area, setArea] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [savingKeep, setSavingKeep] = useState(false);
  if (props.state === 'no-access') return <NoAccessState grantedBy="your System Admin" what="the recycle bin" />;
  const areas = [...new Set(props.rows.map((r) => r.area))].sort().map((a) => ({ value: a, label: a }));
  const q = query.trim().toLowerCase();
  const rows = props.rows.filter((r) => (!area || r.area === area) && (!q || `${r.label} ${r.what}`.toLowerCase().includes(q)));
  const columns: TableColumn<RecycleBinRow>[] = [
    { key: 'label', header: 'Name', value: (r) => r.label, hideable: false },
    { key: 'what', header: 'What', value: (r) => r.what, width: 170 },
    { key: 'area', header: 'Area', value: (r) => r.area, render: (r) => <Badge>{r.area}</Badge>, width: 140 },
    { key: 'deleted', header: 'Deleted', type: 'date', value: (r) => r.deletedAt, render: (r) => `${formatDate(new Date(r.deletedAt))}${r.deletedBy ? ` by ${r.deletedBy}` : ''}`, width: 230 },
    { key: 'purge', header: 'Deleted for good on', type: 'date', value: (r) => r.purgeOn, render: (r) => formatDate(new Date(r.purgeOn)), width: 170 },
  ];
  return (
    <div className="yx-plt-stack">
      <PageHeader title="Recycle bin" description={`Deleted records stay here for ${props.keepDays} days. Restore puts a record back as it was; after that it is deleted for good.`} />
      <FieldRow>
        <FormField label="Area">
          <Select value={area} onChange={setArea} options={areas} placeholder="All areas" clearable />
        </FormField>
        <FormField label="Search">
          <TextField type="search" value={query} onChange={setQuery} placeholder="Name" maxLength={100} />
        </FormField>
        <FormField label="Keep deleted items for" helper={props.onKeepDays ? 'Shortening it also applies to items already here, from tonight.' : 'Your System Admin sets this.'}>
          <Select
            value={String(props.keepDays)}
            options={KEEP}
            disabled={!props.onKeepDays || savingKeep}
            onChange={async (v) => {
              if (!v || !props.onKeepDays || Number(v) === props.keepDays) return;
              setSavingKeep(true);
              try {
                await props.onKeepDays(Number(v));
              } finally {
                setSavingKeep(false);
              }
            }}
          />
        </FormField>
      </FieldRow>
      <DataTable
        label="Deleted records"
        columns={columns}
        rows={rows}
        getRowId={(r) => `${r.source}:${r.kind}:${r.id}`}
        state={props.state}
        onRetry={props.onRetry}
        errorTitle="We couldn't load the recycle bin."
        empty={<EmptyState compact title={props.rows.length ? 'Nothing matches these filters.' : 'The recycle bin is empty.'} description={props.rows.length ? undefined : 'Deleted records show here.'} />}
        rowButtons={(r) => (
          <>
            <ConfirmDialog
              trigger={<Button size="sm" aria-label={`Restore ${r.label}`}>Restore</Button>}
              title={`Restore ${r.label}?`}
              consequence={`The ${r.what.toLowerCase()} comes back as it was when it was deleted. This is recorded in the audit log.`}
              confirmLabel="Restore"
              onConfirm={() => props.onRestore(r)}
            />
            {props.onPurge && r.source === 'bin' && (
              <ConfirmDialog
                trigger={<Button size="sm" aria-label={`Delete ${r.label} for good`}>Delete for good</Button>}
                title={`Delete ${r.label} for good?`}
                consequence="It cannot be restored after this. You confirm it's you first. This is recorded in the audit log."
                confirmLabel="Delete for good"
                destructive
                onConfirm={() => props.onPurge!(r)}
              />
            )}
          </>
        )}
        cardSummary
      />
    </div>
  );
}
