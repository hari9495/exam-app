// G4 (answers 2690-2692): ANL-08 Schedules and exports with real records. The designed SchedulesScreen (analytics.tsx)
// renders this when given `library`: schedules of report-library reports (each recipient's own copy; confidential ones
// are a link, never an attachment) and the export log for its key holders.
import { useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { MultiSelect, Select } from '../../components/select';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable } from '../../components/table';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { AnlFrame } from './proctoring-shared';

export type ScheduleFrequency = 'daily' | 'weekdays' | 'weekly' | 'monthly';
export interface LiveScheduleRow {
  id: string;
  target: string;
  frequency: ScheduleFrequency;
  recipients: string[];
  delivery: string;
  sensitivity: 'Internal' | 'Confidential';
  nextRunAt: string;
  lastRunAt: string | null;
  lastResult: string | null;
}
export interface LiveExportRow {
  id: string;
  at: string;
  who: string;
  what: string;
  detail: string | null;
  rows: number | null;
  sensitivity: 'Internal' | 'Confidential';
}
/** T2-G 46: one import of a file: rows that went in and rows that did not. */
export interface LiveImportRow {
  id: string;
  at: string;
  who: string;
  what: string;
  detail: string | null;
  ok: number;
  failed: number;
}
export interface LiveReportSchedules {
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  schedules: LiveScheduleRow[];
  reports: { id: string; name: string; sensitivity: 'Internal' | 'Confidential' }[];
  people: { id: string; name: string }[];
  onCreate: (input: { reportId: string; frequency: ScheduleFrequency; recipientIds: string[] }) => Promise<unknown>;
  onEnd: (id: string) => Promise<unknown>;
  /** Only for holders of the export-log key. */
  exportLog?: { rows: LiveExportRow[]; onDownload: () => Promise<unknown> } | null;
  /** T2-G 46: the import log next to it, for the same key holders. */
  importLog?: { rows: LiveImportRow[] } | null;
}

const FREQ: { value: ScheduleFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily, 7:00 am' },
  { value: 'weekdays', label: 'Weekdays, 7:00 am' },
  { value: 'weekly', label: 'Weekly, Monday 7:00 am' },
  { value: 'monthly', label: 'Monthly, the 1st, 7:00 am' },
];
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not work. Try again.');

export function LiveReportSchedulesScreen({ live }: { live: LiveReportSchedules }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const canSchedule = live.reports.length > 0;
  const body =
    live.state === 'error' ? (
      <ErrorState title="We couldn't load the schedules." description="Try again in a moment." onRetry={live.onRetry} />
    ) : live.state === 'loading' ? (
      <Skeleton height={300} />
    ) : (
      <Tabs defaultValue={canSchedule ? 'schedules' : 'exports'}>
        <TabsList aria-label="Schedules and exports">
          {canSchedule && (
            <TabsTrigger value="schedules" count={live.schedules.length}>
              Schedules
            </TabsTrigger>
          )}
          {live.exportLog && (
            <TabsTrigger value="exports" count={live.exportLog.rows.length}>
              Export log
            </TabsTrigger>
          )}
          {live.importLog && (
            <TabsTrigger value="imports" count={live.importLog.rows.length}>
              Import log
            </TabsTrigger>
          )}
        </TabsList>
        {canSchedule && (
          <TabsContent value="schedules">
            <DataTable
              label="Schedules"
              rows={live.schedules}
              getRowId={(r) => r.id}
              columns={[
                { key: 'target', header: 'Report', value: (r) => r.target, width: 260 },
                { key: 'frequency', header: 'When', value: (r) => FREQ.find((f) => f.value === r.frequency)?.label ?? r.frequency, width: 200 },
                { key: 'recipients', header: 'Recipients', value: (r) => r.recipients.join(', '), width: 220 },
                { key: 'delivery', header: 'Delivery', value: (r) => r.delivery, width: 190 },
                { key: 'next', header: 'Next', type: 'date', value: (r) => new Date(r.nextRunAt), width: 120 },
                { key: 'last', header: 'Last run', value: (r) => r.lastResult ?? '', render: (r) => (r.lastRunAt ? `${formatDate(new Date(r.lastRunAt))} · ${r.lastResult ?? ''}` : 'Not yet'), width: 200 },
              ]}
              rowButtons={(r) => (
                <ConfirmDialog
                  trigger={<Button size="sm">Stop</Button>}
                  title={`Stop the ${r.target} schedule?`}
                  consequence="No more emails are sent for it."
                  confirmLabel="Stop schedule"
                  onConfirm={async () => {
                    await live.onEnd(r.id);
                    toast({ tone: 'success', title: 'Schedule stopped.' });
                  }}
                />
              )}
              empty={<EmptyState compact title="No schedules yet" description="Schedule a report to arrive by email." />}
            />
          </TabsContent>
        )}
        {live.exportLog && (
          <TabsContent value="exports">
            <DataTable
              label="Export log"
              rows={live.exportLog.rows}
              getRowId={(r) => r.id}
              columns={[
                { key: 'at', header: 'When', type: 'date', value: (r) => new Date(r.at), width: 120 },
                { key: 'who', header: 'Who', value: (r) => r.who, width: 200 },
                { key: 'what', header: 'What', value: (r) => r.what + (r.detail ? ` · ${r.detail}` : ''), width: 260 },
                { key: 'rows', header: 'Rows', type: 'number', value: (r) => r.rows ?? 0, render: (r) => (r.rows == null ? '—' : String(r.rows)), width: 80 },
                { key: 'sens', header: 'Sensitivity', type: 'status', value: (r) => r.sensitivity, statusTone: (v) => (v === 'Confidential' ? 'warning' : 'neutral'), width: 130 },
              ]}
              empty={<EmptyState compact title="No exports yet" />}
            />
          </TabsContent>
        )}
        {live.importLog && (
          <TabsContent value="imports">
            <DataTable
              label="Import log"
              rows={live.importLog.rows}
              getRowId={(r) => r.id}
              columns={[
                { key: 'at', header: 'When', type: 'date', value: (r) => new Date(r.at), width: 120 },
                { key: 'who', header: 'Who', value: (r) => r.who, width: 200 },
                { key: 'what', header: 'What', value: (r) => r.what + (r.detail ? ` · ${r.detail}` : ''), width: 260 },
                { key: 'ok', header: 'Rows in', type: 'number', value: (r) => r.ok, width: 90 },
                { key: 'failed', header: 'Rows not in', type: 'number', value: (r) => r.failed, width: 110 },
              ]}
              empty={<EmptyState compact title="No imports yet" />}
            />
          </TabsContent>
        )}
      </Tabs>
    );
  return (
    <AnlFrame page="Schedules">
      <PageHeader
        title={canSchedule ? 'Schedules and exports' : live.importLog ? 'Export and import log' : 'Export log'}
        description="Each recipient gets only what their own access allows. Every export is audited."
        actions={
          <>
            {live.exportLog && (
              <Button icon={Download} onClick={() => void live.exportLog!.onDownload().catch((e: unknown) => toast({ tone: 'error', title: errorText(e) }))}>
                Download log
              </Button>
            )}
            {canSchedule && (
              <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
                New schedule
              </Button>
            )}
          </>
        }
      />
      {body}
      {open && <ScheduleDialog live={live} onClose={() => setOpen(false)} />}
    </AnlFrame>
  );
}

function ScheduleDialog({ live, onClose }: { live: LiveReportSchedules; onClose: () => void }) {
  const { toast } = useToast();
  const [report, setReport] = useState<string | null>(null);
  const [freq, setFreq] = useState<ScheduleFrequency>('weekly');
  const [who, setWho] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const chosen = live.reports.find((r) => r.id === report);
  const save = async () => {
    setTried(true);
    if (!report || !who.length) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onCreate({ reportId: report, frequency: freq, recipientIds: who });
      toast({ tone: 'success', title: 'Schedule saved.' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New schedule"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save schedule
          </Button>
        </>
      }
    >
      <div className="yx-prc-stack">
        {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
        <FormField label="Report" required error={tried && !report ? 'Choose the report.' : null}>
          <Select value={report} onChange={setReport} options={live.reports.map((r) => ({ value: r.id, label: r.name }))} />
        </FormField>
        <FormField label="How often">
          <Select<ScheduleFrequency> value={freq} onChange={(v) => v && setFreq(v)} options={FREQ} />
        </FormField>
        <FormField label="Recipients" required helper="Only people who may open this report; anyone who loses it stops getting it." error={tried && !who.length ? 'Choose at least one person.' : null}>
          <MultiSelect value={who} onChange={setWho} options={live.people.map((p) => ({ value: p.id, label: p.name }))} />
        </FormField>
        {chosen && (
          <InlineAlert tone="info">
            {chosen.sensitivity === 'Confidential' ? (
              <>
                This report has <Badge tone="warning">Confidential</Badge> data, so the email holds a link to sign in, not an attachment.
              </>
            ) : (
              'The email carries a CSV built for each recipient, with only what they may see.'
            )}
          </InlineAlert>
        )}
      </div>
    </Dialog>
  );
}
