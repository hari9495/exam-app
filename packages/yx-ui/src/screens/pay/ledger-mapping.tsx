// PAY-62 Ledger mapping (Enterprise E4, Oracle O19-O20; GP-PAY-1): which ledger account each pay line goes to, as a
// company default with overrides for a legal entity or a cost centre, and the suspense account that holds lines with none.
// The API checks every change again (the pay line exists, the scope is the person's); this screen only lays them out.
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, PageHeader } from '../../components/shell';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Drawer } from '../../components/drawer';
import { MenuItem } from '../../components/menu';
import { ConfirmDialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { useToastIfAny } from '../../components/notify';
import { PayFrame } from './pay-kit';

export const NET_PAY_LINE = '_net_pay';
export const SUSPENSE_LINE = '_suspense';
export type LedgerScope = 'company' | 'legal_entity' | 'cost_centre';
export interface LedgerMappingRow {
  id: string;
  scopeType: LedgerScope;
  scopeId: string | null;
  componentCode: string;
  side: 'expense' | 'payable';
  accountCode: string;
  accountName: string;
  updatedAt: string;
}
export interface LedgerMappingInput {
  scopeType: LedgerScope;
  scopeId?: string | null;
  componentCode: string;
  side: 'expense' | 'payable';
  accountCode: string;
  accountName: string;
}
type Option = { value: string; label: string };
export interface LedgerMappingOptions {
  /** Pay lines: the company's components (code → name). Net pay and the suspense account are added by the screen. */
  lines: Option[];
  entities: Option[];
  costCentres: Option[];
}
export interface LedgerMappingScreenProps {
  state: 'loading' | 'ready' | 'error' | 'forbidden';
  onRetry: () => void;
  rows: LedgerMappingRow[] | null;
  options: LedgerMappingOptions;
  /** Holds payroll.ledger.manage (else read only). */
  canEdit: boolean;
  onSave: (input: LedgerMappingInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

const SIDE: Record<LedgerMappingRow['side'], string> = { expense: 'Expense (debit)', payable: 'Payable (credit)' };
const EMPTY: LedgerMappingInput = { scopeType: 'company', scopeId: null, componentCode: '', side: 'expense', accountCode: '', accountName: '' };

function MappingDrawer({ start, options, onClose, onSave }: { start: LedgerMappingInput; options: LedgerMappingOptions; onClose: () => void; onSave: LedgerMappingScreenProps['onSave'] }) {
  const [v, setV] = useState<LedgerMappingInput>(start);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const toast = useToastIfAny();
  const suspense = v.componentCode === SUSPENSE_LINE;
  const lines: Option[] = [{ value: NET_PAY_LINE, label: 'Net pay' }, { value: SUSPENSE_LINE, label: 'Suspense account' }, ...options.lines];
  const errors = {
    line: !v.componentCode ? 'Choose the pay line.' : null,
    where: v.scopeType !== 'company' && !v.scopeId ? 'Choose which one.' : null,
    code: !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(v.accountCode.trim()) ? 'Give the account code (letters, digits, . _ / -).' : null,
    name: v.accountName.trim().length < 2 ? 'Give the account name.' : null,
  };
  const save = async () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setFailed(null);
    try {
      await onSave({ ...v, accountCode: v.accountCode.trim(), accountName: v.accountName.trim(), scopeId: v.scopeType === 'company' ? null : v.scopeId, side: suspense ? 'payable' : v.side });
      toast?.toast({ title: 'Ledger mapping saved' });
      onClose();
    } catch (e) {
      setFailed((e as Error).message || 'It could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const err = (k: keyof typeof errors) => (tried && errors[k]) || undefined;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={start.componentCode ? 'Change ledger mapping' : 'Add ledger mapping'}
      subtitle="The journal uses the most specific mapping: the cost centre's, else the legal entity's, else the company's."
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save mapping
          </Button>
        </>
      }
    >
      <FormField label="Pay line" required error={err('line')}>
        <Select searchable options={lines} value={v.componentCode || null} onChange={(x) => setV((o) => ({ ...o, componentCode: x ?? '' }))} />
      </FormField>
      {suspense ? (
        <InlineAlert tone="info" title="Pay lines with no account go here while the company's suspense setting is on, so the journal can still go to the books." />
      ) : (
        <FormField label="Side">
          <Segment label="Side" options={[{ value: 'expense', label: SIDE.expense }, { value: 'payable', label: SIDE.payable }]} value={v.side} onChange={(x) => setV((o) => ({ ...o, side: x as 'expense' | 'payable' }))} />
        </FormField>
      )}
      <FormField label="For">
        <Segment
          label="For"
          options={[
            { value: 'company', label: 'The company' },
            { value: 'legal_entity', label: 'A legal entity' },
            ...(suspense ? [] : [{ value: 'cost_centre', label: 'A cost centre' }]),
          ]}
          value={v.scopeType}
          onChange={(x) => setV((o) => ({ ...o, scopeType: x as LedgerScope, scopeId: null }))}
        />
      </FormField>
      {v.scopeType !== 'company' && (
        <FormField label={v.scopeType === 'legal_entity' ? 'Legal entity' : 'Cost centre'} required error={err('where')}>
          <Select searchable options={v.scopeType === 'legal_entity' ? options.entities : options.costCentres} value={v.scopeId ?? null} onChange={(x) => setV((o) => ({ ...o, scopeId: x }))} />
        </FormField>
      )}
      <FieldRow>
        <FormField label="Account code" required error={err('code')}>
          <TextField value={v.accountCode} onChange={(x) => setV((o) => ({ ...o, accountCode: x }))} />
        </FormField>
        <FormField label="Account name" required error={err('name')}>
          <TextField value={v.accountName} onChange={(x) => setV((o) => ({ ...o, accountName: x }))} />
        </FormField>
      </FieldRow>
    </Drawer>
  );
}

/** PAY-62: the company's ledger mapping, with the suspense account first. */
export function LedgerMappingScreen({ state, onRetry, rows, options, canEdit, onSave, onRemove }: LedgerMappingScreenProps) {
  const [show, setShow] = useState<'all' | 'company' | 'overrides'>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<LedgerMappingInput | null>(null);
  const [removing, setRemoving] = useState<LedgerMappingRow | null>(null);
  const toast = useToastIfAny();
  const nameOf = useMemo(() => {
    const lines = new Map([[NET_PAY_LINE, 'Net pay'], [SUSPENSE_LINE, 'Suspense account'], ...options.lines.map((o) => [o.value, o.label] as [string, string])]);
    const places = new Map([...options.entities, ...options.costCentres].map((o) => [o.value, o.label] as [string, string]));
    return { line: (c: string) => lines.get(c) ?? c, place: (r: LedgerMappingRow) => (r.scopeType === 'company' ? 'Company' : (places.get(r.scopeId ?? '') ?? (r.scopeType === 'legal_entity' ? 'A legal entity' : 'A cost centre'))) };
  }, [options]);
  const suspense = (rows ?? []).filter((r) => r.componentCode === SUSPENSE_LINE);
  const list = (rows ?? [])
    .filter((r) => r.componentCode !== SUSPENSE_LINE)
    .filter((r) => show === 'all' || (show === 'company' ? r.scopeType === 'company' : r.scopeType !== 'company'))
    .filter((r) => !q.trim() || `${nameOf.line(r.componentCode)} ${r.componentCode} ${r.accountCode} ${r.accountName}`.toLowerCase().includes(q.trim().toLowerCase()));
  const columns: TableColumn<LedgerMappingRow>[] = [
    { key: 'line', header: 'Pay line', value: (r) => nameOf.line(r.componentCode), width: 220 },
    { key: 'side', header: 'Side', value: (r) => SIDE[r.side] },
    { key: 'where', header: 'For', value: (r) => nameOf.place(r), render: (r) => (r.scopeType === 'company' ? 'Company' : <Badge tone="info">{nameOf.place(r)}</Badge>) },
    { key: 'account', header: 'Account', value: (r) => `${r.accountCode} · ${r.accountName}`, width: 260 },
  ];
  const edit = (r: LedgerMappingRow) => setEditing({ scopeType: r.scopeType, scopeId: r.scopeId, componentCode: r.componentCode, side: r.side, accountCode: r.accountCode, accountName: r.accountName });
  return (
    <PayFrame page="payments">
      <PageHeader
        title="Ledger mapping"
        description="Which account each pay line goes to in the payroll journal. A legal entity or a cost centre can have its own account; the company default covers the rest."
        actions={
          canEdit && state === 'ready' ? (
            <Button variant="primary" icon={Plus} onClick={() => setEditing(EMPTY)}>
              Add mapping
            </Button>
          ) : undefined
        }
      />
      {state === 'error' ? (
        <ErrorState title="We couldn't load the ledger mapping" description="Check your connection and try again." onRetry={onRetry} />
      ) : state === 'forbidden' ? (
        <NoAccessState what="the ledger mapping" grantedBy="your payroll admin" />
      ) : (
        <>
          <Card
            title="Suspense account"
            actions={
              canEdit ? (
                <Button size="sm" onClick={() => (suspense[0] ? edit(suspense[0]) : setEditing({ ...EMPTY, componentCode: SUSPENSE_LINE, side: 'payable' }))}>
                  {suspense.length ? 'Change' : 'Set suspense account'}
                </Button>
              ) : undefined
            }
          >
            <p className="yx-pay-muted">
              {suspense.length
                ? suspense.map((r) => `${nameOf.place(r)}: ${r.accountCode} · ${r.accountName}`).join(' · ')
                : 'None yet. Without one, a journal with an unmapped pay line cannot be exported until it is mapped.'}
            </p>
          </Card>
          <DataTable
            label="Ledger mapping"
            columns={columns}
            rows={list}
            state={state === 'loading' ? 'loading' : 'ready'}
            getRowId={(r) => r.id}
            rowNoun={['mapping', 'mappings']}
            filtered={show !== 'all' || q !== ''}
            onClearFilters={() => {
              setShow('all');
              setQ('');
            }}
            empty={<EmptyState title="No ledger mapping yet" description="Map net pay and each pay line to an account, so the payroll journal can go to the books." />}
            onRowClick={canEdit ? edit : undefined}
            rowActions={
              canEdit
                ? (r) => (
                    <>
                      <MenuItem onSelect={() => edit(r)}>Change</MenuItem>
                      <MenuItem onSelect={() => setRemoving(r)}>Remove</MenuItem>
                    </>
                  )
                : undefined
            }
            toolbar={
              <div className="yx-pay-row">
                <Segment
                  label="Show"
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'company', label: 'Company defaults' },
                    { value: 'overrides', label: 'Overrides' },
                  ]}
                  value={show}
                  onChange={(x) => setShow(x as typeof show)}
                />
                <TextField aria-label="Search the mapping" placeholder="Search lines, accounts" value={q} onChange={setQ} />
              </div>
            }
          />
        </>
      )}
      {editing && <MappingDrawer key={`${editing.componentCode}-${editing.scopeType}-${editing.scopeId ?? ''}`} start={editing} options={options} onClose={() => setEditing(null)} onSave={onSave} />}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={`Remove the mapping of ${nameOf.line(removing.componentCode)} for ${nameOf.place(removing)}?`}
          consequence={removing.scopeType === 'company' ? 'Journals then show this line as unmapped (or in suspense) until it is mapped again.' : 'The company default (or the legal entity’s) is used instead.'}
          confirmLabel="Remove mapping"
          destructive
          onConfirm={async () => {
            await onRemove(removing.id);
            toast?.toast({ title: 'Mapping removed' });
            setRemoving(null);
          }}
        />
      )}
    </PayFrame>
  );
}

/* ------------------------------------------------------------------ sample data (stories, tests) */

export const LEDGER_OPTIONS: LedgerMappingOptions = {
  lines: [
    { value: 'basic', label: 'Basic salary' },
    { value: 'hra', label: 'House rent allowance' },
    { value: 'pf_employee', label: 'PF (employee)' },
    { value: 'pf_employer', label: 'PF (employer)' },
  ],
  entities: [{ value: 'kfpl', label: 'Kaveri Foods Pvt Ltd' }],
  costCentres: [{ value: 'cc-blr', label: 'Stores BLR' }],
};
const row = (id: string, componentCode: string, side: LedgerMappingRow['side'], accountCode: string, accountName: string, scopeType: LedgerScope = 'company', scopeId: string | null = null): LedgerMappingRow => ({ id, scopeType, scopeId, componentCode, side, accountCode, accountName, updatedAt: '2026-11-20T10:00:00Z' });
export const LEDGER_ROWS: LedgerMappingRow[] = [
  row('m0', SUSPENSE_LINE, 'payable', '9999', 'Payroll suspense'),
  row('m1', NET_PAY_LINE, 'payable', '2100', 'Net salary payable'),
  row('m2', 'basic', 'expense', '5100', 'Salaries and wages'),
  row('m3', 'basic', 'expense', '5110', 'Salaries · stores', 'cost_centre', 'cc-blr'),
  row('m4', 'pf_employee', 'payable', '2200', 'PF payable'),
  row('m5', 'pf_employer', 'expense', '5200', 'Employer PF'),
  row('m6', 'pf_employer', 'payable', '2200', 'PF payable', 'legal_entity', 'kfpl'),
];
