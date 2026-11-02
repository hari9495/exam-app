import { useState, type DragEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { MultiSelect, Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable } from '../../../components/table';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { CalibrationBoard, CalibrationRow, CalibrationSession, Choice, LoadState, PerfReport } from './types';

// Performance batch PM6, wired (M06-BUILD-DESIGN §11, §13; PRF-09 calibration, reports). The guide is a guide only:
// it never blocks sign-off and never moves anyone. Every change needs a reason. No pay is shown here.

// ------------------------------------------------------------------------------------------ sessions on the cycle

export function CalibrationSessions({ sessions, departments, facilitators, bands, onOpen, onCreate }: { sessions: CalibrationSession[]; departments: Choice[]; facilitators: Choice[]; bands: string[]; onOpen: (id: string) => void; onCreate?: (input: { name: string; facilitatorUserId: string; departmentIds: string[]; guide: { bands: { label: string; share: number }[]; tolerance: number } | null }) => Promise<unknown> }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [fac, setFac] = useState<string | null>(null);
  const [depts, setDepts] = useState<string[]>([]);
  const [withGuide, setWithGuide] = useState<'no' | 'yes'>('no');
  const [shares, setShares] = useState<Record<string, number | null>>({});
  const [tolerance, setTolerance] = useState<number | null>(10);
  const total = bands.reduce((t, b) => t + (shares[b] ?? 0), 0);
  const ok = name.trim().length >= 2 && fac && (withGuide === 'no' || (Math.round(total * 10) === 1000 && tolerance !== null));
  const [tried, setTried] = useState(false);
  return (
    <Card title="Calibration" actions={onCreate && <Button icon={Plus} onClick={() => (setTried(false), setAdding(true))}>Open a session</Button>}>
      {sessions.length === 0 ? (
        <EmptyState compact title="No calibration sessions." description="Open one when managers have finished their reviews." />
      ) : (
        <ul className="yx-lif-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <Text>{`${s.name} · ${s.facilitator} · ${s.people} people`}</Text> <Badge tone={s.status === 'open' ? 'info' : 'success'}>{s.status === 'open' ? 'Open' : 'Signed off'}</Badge>{' '}
              <Button size="sm" onClick={() => onOpen(s.id)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <ConfirmDialog open onOpenChange={(o) => !o && setAdding(false)} size="md" title="Open a calibration session" confirmLabel="Open" onConfirm={async () => {
          setTried(true);
          if (!ok) return false;
          await onCreate!({ name: name.trim(), facilitatorUserId: fac!, departmentIds: depts, guide: withGuide === 'yes' ? { bands: bands.map((b) => ({ label: b, share: shares[b] ?? 0 })), tolerance: tolerance! } : null });
          setAdding(false);
        }}>
          <FormField id="cs-name" label="Name" required error={tried && name.trim().length < 2 ? 'Enter a name of at least 2 characters.' : null}>
            <TextField value={name} onChange={setName} maxLength={100} />
          </FormField>
          <FormField id="cs-fac" label="Facilitator" required error={tried && !fac ? 'Choose the facilitator.' : null}>
            <Select aria-label="Facilitator" value={fac} onChange={setFac} options={facilitators} searchable />
          </FormField>
          <FormField id="cs-dept" label="Departments" optional helper="Leave empty for every finished review of the cycle.">
            <MultiSelect aria-label="Departments in the session" value={depts} onChange={setDepts} options={departments} placeholder="Everyone finished" />
          </FormField>
          <FormField id="cs-guide" label="Distribution guide">
            <Segment label="Distribution guide" value={withGuide} onChange={setWithGuide} options={[{ value: 'no', label: 'None' }, { value: 'yes', label: 'Use a guide' }]} />
          </FormField>
          {withGuide === 'yes' && (
            <>
              {bands.map((b) => (
                <FormField key={b} id={`cs-${b}`} label={`${b} (%)`}>
                  <NumberField value={shares[b] ?? null} onChange={(x) => setShares((s) => ({ ...s, [b]: x }))} min={0} max={100} decimals />
                </FormField>
              ))}
              <Text as="p" tone={Math.round(total * 10) === 1000 ? 'secondary' : 'danger'} size="sm">{tried && Math.round(total * 10) !== 1000 ? `Make the shares add up to 100 (now ${total}).` : `Shares add up to ${total} of 100. A guide only: it never blocks sign-off.`}</Text>
              <FormField id="cs-tol" label="Tolerance (points)" error={tried && tolerance === null ? 'Enter the tolerance.' : null}>
                <NumberField value={tolerance} onChange={setTolerance} min={0} max={50} />
              </FormField>
            </>
          )}
        </ConfirmDialog>
      )}
    </Card>
  );
}

/** My calibration sessions across cycles (facilitators), or every session (HR). */
export function CalibrationListScreen({ state, onRetry, sessions, onOpen }: { state: LoadState; onRetry?: () => void; sessions: CalibrationSession[]; onOpen: (id: string) => void }) {
  return (
    <LivePage title="Calibration" description="Sessions you run, or every session for HR." state={state} onRetry={onRetry} what="calibration sessions">
      <CalibrationSessions sessions={sessions} departments={[]} facilitators={[]} bands={[]} onOpen={onOpen} />
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ the board (PRF-09)

export type ReportKind = 'completion' | 'distribution' | 'calibration-changes' | 'goal-alignment' | 'pip-status';
const REPORTS: { value: ReportKind; label: string }[] = [
  { value: 'completion', label: 'Completion' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'calibration-changes', label: 'Calibration changes' },
  { value: 'goal-alignment', label: 'Goal alignment' },
  { value: 'pip-status', label: 'Improvement plans' },
];

export interface PerformanceReportsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  cycles: Choice[];
  cycleId: string | null;
  onCycle: (id: string) => void;
  kind: ReportKind;
  onKind: (k: ReportKind) => void;
  report: PerfReport | null;
  onDownload?: () => Promise<unknown>;
}

export function PerformanceReportsScreen(p: PerformanceReportsScreenProps) {
  const { busy, run } = useRun();
  return (
    <LivePage title="Performance reports" description="People in your scope. Groups smaller than the company's minimum are not shown, so no one is singled out." state={p.state} onRetry={p.onRetry} what="performance reports">
      <div className="yx-lif-row">
        <FormField id="pr-cycle" label="Cycle">
          <Select aria-label="Cycle" value={p.cycleId} onChange={(x) => x && p.onCycle(x)} options={p.cycles} />
        </FormField>
        <FormField id="pr-kind" label="Report">
          <Select aria-label="Report" value={p.kind} onChange={(x) => x && p.onKind(x as ReportKind)} options={REPORTS} />
        </FormField>
        {p.report && p.onDownload && (
          <Button loading={busy === 'csv'} onClick={() => void run('csv', p.onDownload!)}>
            Download CSV
          </Button>
        )}
      </div>
      {!p.report ? (
        <EmptyState compact title="Choose a cycle." />
      ) : (
        <DataTable
          label={REPORTS.find((r) => r.value === p.kind)!.label}
          columns={p.report.header.map((h, i) => ({ key: String(i), header: h, value: (row: unknown[]) => (row[i] === null ? 'Hidden (small group)' : String(row[i] ?? '')), width: i === 0 ? 220 : 140, hideable: i !== 0 }))}
          rows={p.report.rows}
          getRowId={(row) => p.report!.rows.indexOf(row).toString()}
          rowNoun={['row', 'rows']}
          empty={<EmptyState compact title="Nothing to show for this cycle." />}
        />
      )}
    </LivePage>
  );
}
