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
  return (
    <Card title="Calibration" actions={onCreate && <Button icon={Plus} onClick={() => setAdding(true)}>Open a session</Button>}>
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
        <ConfirmDialog open onOpenChange={(o) => !o && setAdding(false)} size="md" title="Open a calibration session" confirmLabel="Open" confirmDisabled={!ok} onConfirm={async () => {
          await onCreate!({ name: name.trim(), facilitatorUserId: fac!, departmentIds: depts, guide: withGuide === 'yes' ? { bands: bands.map((b) => ({ label: b, share: shares[b] ?? 0 })), tolerance: tolerance! } : null });
          setAdding(false);
        }}>
          <FormField id="cs-name" label="Name" required>
            <TextField value={name} onChange={setName} maxLength={100} />
          </FormField>
          <FormField id="cs-fac" label="Facilitator" required>
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
              <Text as="p" tone={Math.round(total * 10) === 1000 ? 'secondary' : 'danger'} size="sm">{`Shares add up to ${total} of 100. A guide only: it never blocks sign-off.`}</Text>
              <FormField id="cs-tol" label="Tolerance (points)">
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

export interface CalibrationBoardScreenProps {
  state: LoadState;
  onRetry?: () => void;
  board: CalibrationBoard | null;
  onBack: () => void;
  onChange: (input: { reviewId: string; toBand?: string; toScore?: number; reason: string }) => Promise<unknown>;
  onSignOff: () => Promise<unknown>;
}

export function CalibrationBoardScreen(p: CalibrationBoardScreenProps) {
  const b = p.board;
  const { error, run } = useRun();
  const [moving, setMoving] = useState<{ row: CalibrationRow; band: string | null } | null>(null);
  const [signing, setSigning] = useState(false);
  const can = b?.can.change ?? false;
  const drop = (band: string) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const row = b?.rows.find((r) => r.reviewId === id);
    if (row && row.band !== band) setMoving({ row, band });
  };
  return (
    <LivePage
      title={b ? b.name : 'Calibration'}
      description={b ? `${b.cycle} · ${b.status === 'open' ? 'Open' : 'Signed off'}` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="this session"
      actions={
        <>
          <Button onClick={p.onBack}>Back</Button>
          {b?.can.signOff && (
            <Button variant="primary" onClick={() => setSigning(true)}>
              Sign off
            </Button>
          )}
        </>
      }
    >
      {b && (
        <>
          {error && (
            <InlineAlert tone="danger" title="That didn't work">
              {error}
            </InlineAlert>
          )}
          <Card title="Distribution">
            {b.distribution.bands === null ? (
              <Text as="p" tone="secondary">{`${b.distribution.counted} people: too few to show a distribution without pointing at someone.`}</Text>
            ) : (
              <ul className="yx-lif-list">
                {b.distribution.bands.map((d) => (
                  <li key={d.label}>
                    <Text>{`${d.label}: ${d.count} (${d.share}%)${d.target !== null ? ` · guide ${d.target}%` : ''}`}</Text> {d.outside && <Badge tone="warning">Outside the guide</Badge>}
                  </li>
                ))}
              </ul>
            )}
            {b.distribution.notes.length > 0 && <InlineAlert tone="info" title="A guide only">{`${b.distribution.notes.join(' ')} It does not block sign-off.`}</InlineAlert>}
            <Text as="p" tone="secondary" size="sm">People on protected leave are not counted.</Text>
          </Card>
          <div className="yx-lif-grid">
            {b.scale.bands.map((band) => (
              <div key={band.label} data-band={band.label} onDragOver={(e) => can && e.preventDefault()} onDrop={drop(band.label)}>
              <Card title={`${band.label} (${band.fromScore}–${band.toScore})`}>
                {b.rows.filter((r) => r.band === band.label).length === 0 && <Text as="p" tone="secondary" size="sm">No one</Text>}
                {b.rows.filter((r) => r.band === band.label).map((r) => (
                  <div key={r.reviewId} className="yx-tim-stack" draggable={can} onDragStart={(e) => e.dataTransfer.setData('text/plain', r.reviewId)} data-review={r.reviewId}>
                    <Text>{r.employee}</Text>
                    <Text tone="secondary" size="sm">{`${r.manager} · manager ${r.managerScore ?? '—'}${r.moved ? ` → ${r.score}` : ''}${r.selfIndication !== null ? ` · self ${r.selfIndication}` : ''}${r.skipAgreed ? ' · skip-level agreed' : ''}`}</Text>
                    {r.protectedLeave && <Badge tone="info">Protected leave</Badge>}
                    {can && (
                      <Button size="sm" onClick={() => setMoving({ row: r, band: null })}>
                        Move
                      </Button>
                    )}
                  </div>
                ))}
              </Card>
              </div>
            ))}
          </div>
          <Card title="Changes">
            {b.changes.length === 0 ? (
              <Text as="p" tone="secondary">No changes yet.</Text>
            ) : (
              <DataTable
                label="Changes"
                columns={[
                  { key: 'e', header: 'Employee', value: (c: CalibrationBoard['changes'][number]) => c.employee, width: 200, hideable: false },
                  { key: 'f', header: 'From', value: (c) => `${c.from ?? '—'} ${c.fromBand ?? ''}`, width: 180 },
                  { key: 't', header: 'To', value: (c) => `${c.to} ${c.toBand ?? ''}`, width: 180 },
                  { key: 'r', header: 'Reason', value: (c) => c.reason, width: 320 },
                  { key: 'a', header: 'When', value: (c) => c.at, render: (c) => <Text>{dateText(c.at.slice(0, 10))}</Text>, width: 130 },
                ]}
                rows={b.changes}
                getRowId={(c) => `${c.reviewId}-${c.at}`}
                rowNoun={['change', 'changes']}
              />
            )}
          </Card>
        </>
      )}
      {moving && b && <MoveDialog row={moving.row} band={moving.band} bands={b.scale.bands.map((x) => x.label)} min={b.scale.min} max={b.scale.max} onClose={() => setMoving(null)} onSave={(input) => p.onChange({ reviewId: moving.row.reviewId, ...input })} />}
      {signing && (
        <ConfirmDialog open onOpenChange={(o) => !o && setSigning(false)} title="Sign off this session?" confirmLabel="Sign off" onConfirm={async () => {
          await run('sign', p.onSignOff);
          setSigning(false);
        }}>
          <Text as="p">The reviews are then ready to release with the scores on the board. The guide does not block this.</Text>
        </ConfirmDialog>
      )}
    </LivePage>
  );
}

function MoveDialog({ row, band: initial, bands, min, max, onClose, onSave }: { row: CalibrationRow; band: string | null; bands: string[]; min: number; max: number; onClose: () => void; onSave: (input: { toBand?: string; toScore?: number; reason: string }) => Promise<unknown> }) {
  const [how, setHow] = useState<'band' | 'score'>('band');
  const [band, setBand] = useState<string | null>(initial ?? null);
  const [score, setScore] = useState<number | null>(row.score);
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= 3 && (how === 'band' ? Boolean(band) && band !== row.band : score !== null && score >= min && score <= max);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title={`Move ${row.employee}`} confirmLabel="Move" confirmDisabled={!ok} onConfirm={async () => {
      await onSave({ ...(how === 'band' ? { toBand: band! } : { toScore: score! }), reason: reason.trim() });
      onClose();
    }}>
      <Text as="p">{`Now ${row.score ?? '—'} (${row.band ?? 'no band'}); the manager gave ${row.managerScore ?? '—'}.`}</Text>
      <FormField id="mv-how" label="Move to">
        <Segment label="Move to" value={how} onChange={setHow} options={[{ value: 'band', label: 'A band' }, { value: 'score', label: 'A score' }]} />
      </FormField>
      {how === 'band' ? (
        <FormField id="mv-band" label="Band" required>
          <Select aria-label="Band" value={band} onChange={setBand} options={bands.map((x) => ({ value: x, label: x }))} />
        </FormField>
      ) : (
        <FormField id="mv-score" label="Score" required>
          <NumberField value={score} onChange={setScore} min={min} max={max} decimals />
        </FormField>
      )}
      <FormField id="mv-reason" label="Reason" required helper="Recorded with your name; HR and the reports see it.">
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ reports (§13)

export type ReportKind = 'completion' | 'distribution' | 'calibration-changes' | 'goal-alignment';
const REPORTS: { value: ReportKind; label: string }[] = [
  { value: 'completion', label: 'Completion' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'calibration-changes', label: 'Calibration changes' },
  { value: 'goal-alignment', label: 'Goal alignment' },
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
