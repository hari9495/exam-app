import { useEffect, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField, useTooEarly } from '../../../components/field';
import { TextArea, TextField } from '../../../components/inputs';
import { Checkbox } from '../../../components/choice';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { monthText } from './periods';
import type { LoadState } from './types';
import type {
  EmployeeHit,
  GoLiveCheck,
  ImportBatch,
  ImportKind,
  LegalOption,
  LegalOptionKey,
  PayCalendarMonth,
  PayGroup,
  PayGroupMember,
  Registration,
  RegistrationStatus,
  Registrations,
  RuleSetView,
  SetupEntity,
  SetupState,
} from './types-5b';

// Payroll set-up, batch 5b (M03 §14.2): the set-up checklist with statutory registrations and legal options (PAY-16,
// CMP-02), pay groups and calendars, the payslip layout (PAY-15), the statutory rules browser (CMP-08), the coverage
// monitor (PAY-30) and imports from the old system. Presentational: the API checks every call (keys, entity scope,
// step-up, the pay guard).

export function EntityPicker({ entities, value, onChange, id = 'pay-entity', error }: { entities: SetupEntity[]; value: string | null; onChange: (id: string | null) => void; id?: string; error?: string }) {
  return (
    <FormField id={id} label="Legal entity" error={error}>
      <Select value={value} onChange={onChange} placeholder="Choose a legal entity" options={entities.map((e) => ({ value: e.id, label: e.name }))} />
    </FormField>
  );
}

const STATUTE: Record<string, string> = {
  'IN.PF': 'Provident fund',
  'IN.ESI': 'ESI',
  'IN.PT': 'Professional tax',
  'IN.LWF': 'Labour welfare fund',
  'IN.TDS': 'Income tax (TDS)',
};
export const statuteText = (s: string) => STATUTE[s] ?? s;

// ------------------------------------------------------------------------------------------ rules browser (CMP-08)

export interface StatutoryRulesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  rules: RuleSetView[] | null;
}

export function StatutoryRulesScreen(p: StatutoryRulesScreenProps) {
  const [open, setOpen] = useState<RuleSetView | null>(null);
  return (
    <LivePage
      title="Statutory rules"
      description="The rates, slabs and limits payroll uses, with their sources. YukthiX publishes them after a second review; they cannot be edited here."
      state={p.state}
      onRetry={p.onRetry}
      what="statutory rules"
      grantedBy="your payroll admin"
    >
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
      <Card className="yx-pay-card" title={p.entityId ? 'Rules for this entity’s states' : 'All published rules'}>
        <table className="yx-tim-table" aria-label="Statutory rules">
          <thead>
            <tr>
              <th scope="col">Statute</th>
              <th scope="col">Where</th>
              <th scope="col">Version</th>
              <th scope="col">In force</th>
              <th scope="col">Check</th>
              <th scope="col">
                <span className="yx-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(p.rules ?? []).map((r) => (
              <tr key={r.id}>
                <th scope="row">{statuteText(r.statute)}</th>
                <td>{r.jurisdiction === 'IN' ? 'India' : r.jurisdiction}</td>
                <td className="yx-tim-note">{r.version}</td>
                <td>
                  {dateText(r.validFrom)} – {r.validTo ? dateText(r.validTo) : 'now'}
                </td>
                <td>{r.verify ? <Badge tone="warning">Verify</Badge> : <Badge tone="success">Confirmed</Badge>}</td>
                <td>
                  <Button size="sm" onClick={() => setOpen(r)}>
                    Source and values
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open ? `${statuteText(open.statute)} · ${open.version}` : ''} size="lg">
        {open && (
          <div className="yx-tim-stack">
            {open.verify && <InlineAlert tone="warning" title="Marked verify: figures from it are flagged until the compliance owner and the partner CA confirm it." />}
            <p>{open.source}</p>
            <pre className="yx-pay-json">{JSON.stringify(open.values, null, 2)}</pre>
          </div>
        )}
      </Drawer>
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ imports (PAY-2.12)

/** Comma-separated text with a header row (no commas inside values) into rows. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}
