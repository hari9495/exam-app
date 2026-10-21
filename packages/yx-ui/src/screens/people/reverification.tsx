// PPL-42 Re-verification cycles (M01 §3.11; founder 20 Oct 2026). HR sets dated rules per legal entity: which document
// is checked again, every how many months, for which departments or designations, and whether a move into those roles
// makes it due at once. The due list comes from the documents engine (last verification, or the joining day); asking
// for a fresh copy re-opens the person's document, and the copy is checked in the usual verification queue (PPL-27).
// The person and their manager see only "Re-verification due" on the record (PPL-03); this page is HR's.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Switch } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { MultiSelect, Select } from '../../components/select';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { dayKey } from '../../lib/dates';
import { formatDate } from '../../lib/format';
import { ListSkeleton, PeopleFrame } from './people-kit';

export type ReverifStatus = 'overdue' | 'due soon' | 'not due';
export type ReverifRequest = 'not asked' | 'asked' | 'uploaded' | 'rejected';

export interface ReverifRule {
  id: string;
  typeName: string;
  everyMonths: number;
  legalEntity: string | null;
  departments: string[];
  designations: string[];
  onRoleChange: boolean;
  validFrom: string;
  validTo: string | null;
  active: boolean;
  canManage: boolean;
}

export interface ReverifRow {
  id: string;
  ruleId: string;
  employeeId: string;
  name: string;
  typeName: string;
  why: string;
  lastVerified: string | null;
  due: string;
  status: ReverifStatus;
  request: ReverifRequest;
  askedAt: string | null;
  documentId: string | null;
}

type Choice = { value: string; label: string };

export interface ReverifData {
  rules: ReverifRule[];
  rows: ReverifRow[];
  types: Choice[];
  entities: Choice[];
  departments: Choice[];
  designations: Choice[];
  canManageCompany: boolean;
}

export interface ReverifRuleInput {
  typeKey: string;
  everyMonths: number;
  legalEntityId: string | null;
  departmentIds: string[];
  designationIds: string[];
  onRoleChange: boolean;
  validFrom: string;
}

export interface ReverificationProps {
  today: string;
  data: ReverifData | null;
  state?: 'loading' | 'ready' | 'error';
  onRetry?: () => void;
  onAddRule?: (input: ReverifRuleInput) => Promise<unknown>;
  onEndRule?: (rule: ReverifRule) => Promise<unknown>;
  onAsk?: (row: ReverifRow) => Promise<unknown>;
  onOpenQueue?: (row: ReverifRow) => void;
  /** Story only: open on this tab, or with the add-rule dialog open. */
  tab?: 'due' | 'rules';
  startAdding?: boolean;
  startAsking?: string;
}

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const STATUS_TONE = { overdue: 'danger', 'due soon': 'warning', 'not due': 'neutral' } as const;
const REQUEST_TEXT = (r: ReverifRow) =>
  r.request === 'not asked' ? 'Not yet asked' : r.request === 'uploaded' ? 'Uploaded, waiting for the check' : r.request === 'rejected' ? 'Not accepted, asked again' : `Asked ${formatDate(day(r.askedAt!.slice(0, 10)))}`;
const whoText = (r: ReverifRule) => [r.legalEntity ?? 'Whole company', r.departments.join(', '), r.designations.join(', ')].filter(Boolean).join(' · ');

// PPL-42
export function ReverificationCycles({ today, data, state = 'ready', onRetry, onAddRule, onEndRule, onAsk, onOpenQueue, tab = 'due', startAdding = false, startAsking }: ReverificationProps) {
  const [t, setT] = useState<'due' | 'rules'>(tab);
  const [show, setShow] = useState<'due' | 'all'>('due');
  const [adding, setAdding] = useState(startAdding);
  const [ending, setEnding] = useState<ReverifRule | null>(null);
  const [asking, setAsking] = useState<ReverifRow | null>(data?.rows.find((r) => r.id === startAsking) ?? null);
  const rows = (data?.rows ?? []).filter((r) => show === 'all' || r.status !== 'not due');
  const dueCount = (data?.rows ?? []).filter((r) => r.status !== 'not due').length;
  const canAdd = Boolean(data && (data.canManageCompany || data.entities.length));

  // Most needed first: the table hides the last columns when the screen is narrow.
  const cols: TableColumn<ReverifRow>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name }), width: 190 },
    { key: 'doc', header: 'Document', value: (r) => r.typeName, width: 170 },
    { key: 'due', header: 'Due', type: 'date', value: (r) => day(r.due), width: 120 },
    { key: 'status', header: 'Due status', type: 'status', value: (r) => r.status, statusTone: (v) => STATUS_TONE[v as ReverifStatus] ?? 'neutral', width: 120 },
    { key: 'request', header: 'Request', value: REQUEST_TEXT, width: 200 },
    { key: 'why', header: 'Why', value: (r) => r.why, width: 200 },
    { key: 'last', header: 'Last verified', type: 'date', value: (r) => (r.lastVerified ? day(r.lastVerified) : null), width: 130 },
  ];
  const ruleCols: TableColumn<ReverifRule>[] = [
    { key: 'doc', header: 'Document', value: (r) => r.typeName, width: 170 },
    { key: 'every', header: 'Every', value: (r) => `${r.everyMonths} months`, width: 100 },
    { key: 'who', header: 'For', value: whoText, width: 260 },
    { key: 'state', header: 'Status', value: (r) => (r.active ? 'In force' : r.validTo && r.validTo < today ? 'Ended' : 'Not started'), render: (r) => <Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? (r.validTo ? `Until ${formatDate(day(r.validTo))}` : 'In force') : r.validTo && r.validTo < today ? `Ended ${formatDate(day(r.validTo))}` : 'Not started'}</Badge>, width: 160 },
    { key: 'move', header: 'On a role move', value: (r) => (r.onRoleChange ? 'Due at once' : 'No'), width: 130 },
    { key: 'from', header: 'From', type: 'date', value: (r) => day(r.validFrom), width: 110 },
  ];

  return (
    <PeopleFrame active="Re-verification">
      <PageHeader
        title="Re-verification"
        description="Documents checked again by company rule. Asking for a fresh copy tells the person; the copy is checked in the verification queue and nothing changes on its own."
        actions={
          canAdd ? (
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              Add rule
            </Button>
          ) : undefined
        }
      />
      {state === 'error' ? (
        <ErrorState title="We couldn't load re-verification" description="Check your connection and try again." onRetry={onRetry} />
      ) : !data ? (
        <ListSkeleton label="Loading re-verification" />
      ) : (
        <Tabs value={t} onValueChange={(v) => setT(v as typeof t)}>
          <TabsList aria-label="Re-verification">
            <TabsTrigger value="due" count={dueCount || undefined}>
              Due list
            </TabsTrigger>
            <TabsTrigger value="rules" count={data.rules.length || undefined}>
              Rules
            </TabsTrigger>
          </TabsList>
          <TabsContent value="due">
            <DataTable
              label="Re-verification due list"
              columns={cols}
              rows={rows}
              getRowId={(r) => r.id}
              toolbar={
                <Segment
                  label="Show"
                  value={show}
                  onChange={setShow}
                  options={[
                    { value: 'due', label: 'Due and overdue' },
                    { value: 'all', label: 'All' },
                  ]}
                />
              }
              rowButtons={(r) =>
                r.request === 'not asked' && r.status !== 'not due' ? (
                  <Button size="sm" onClick={() => setAsking(r)}>
                    Ask for a fresh copy
                  </Button>
                ) : r.request === 'uploaded' ? (
                  <Button size="sm" onClick={() => onOpenQueue?.(r)}>
                    Open in queue
                  </Button>
                ) : null
              }
              empty={
                data.rules.length ? (
                  <EmptyState title={show === 'due' ? 'Nobody is due' : 'Nobody under these rules'} description={show === 'due' ? 'People appear here 30 days before their re-check is due.' : 'The rules reach nobody you manage yet.'} />
                ) : (
                  <EmptyState title="No rules yet" description="Add a rule to say which document is checked again and how often." action={canAdd ? <Button onClick={() => setAdding(true)}>Add rule</Button> : undefined} />
                )
              }
            />
          </TabsContent>
          <TabsContent value="rules">
            <DataTable
              label="Re-verification rules"
              columns={ruleCols}
              rows={data.rules}
              getRowId={(r) => r.id}
              rowButtons={(r) =>
                r.canManage && (!r.validTo || r.validTo >= today) ? (
                  <Button size="sm" onClick={() => setEnding(r)}>
                    End rule
                  </Button>
                ) : null
              }
              empty={<EmptyState title="No rules yet" description="A rule says which document is checked again, how often and for whom. Rules are dated; ending one keeps its history." />}
            />
          </TabsContent>
        </Tabs>
      )}
      {adding && data && <RuleDialog data={data} today={today} onClose={() => setAdding(false)} onAdd={onAddRule} />}
      {ending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setEnding(null)}
          title={`End the ${ending.typeName} rule?`}
          consequence="Today is its last day. It stays in the list with its dates, and nobody becomes due under it from tomorrow."
          confirmLabel="End rule"
          onConfirm={async () => {
            await onEndRule?.(ending);
            setEnding(null);
          }}
        />
      )}
      {asking && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAsking(null)}
          title={`Ask ${asking.name} for a fresh ${asking.typeName}?`}
          consequence={`${asking.name} is told to upload it, and reminded weekly once it is due. You check it in the verification queue.`}
          confirmLabel="Ask for a fresh copy"
          onConfirm={async () => {
            await onAsk?.(asking);
            setAsking(null);
          }}
        />
      )}
    </PeopleFrame>
  );
}

function RuleDialog({ data, today, onClose, onAdd }: { data: ReverifData; today: string; onClose: () => void; onAdd?: ReverificationProps['onAddRule'] }) {
  const [type, setType] = useState<string | null>(null);
  const [every, setEvery] = useState('36');
  const [entity, setEntity] = useState<string | null>(data.canManageCompany ? null : (data.entities[0]?.value ?? null));
  const [depts, setDepts] = useState<string[]>([]);
  const [desigs, setDesigs] = useState<string[]>([]);
  const [onMove, setOnMove] = useState(false);
  const [from, setFrom] = useState<Date | null>(day(today));
  const months = Number(every);
  const roles = depts.length + desigs.length > 0;
  const ready = Boolean(type && from && /^\d{1,3}$/.test(every) && months >= 1 && months <= 120 && (data.canManageCompany || entity));
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Add a re-verification rule"
      confirmLabel="Add rule"
      confirmDisabled={!ready}
      onConfirm={async () => {
        await onAdd?.({ typeKey: type!, everyMonths: months, legalEntityId: entity, departmentIds: depts, designationIds: desigs, onRoleChange: roles && onMove, validFrom: dayKey(from!) });
        onClose();
      }}
    >
      <div className="yx-lif-grid">
        <FormField id="rv-type" label="Document" required>
          <Select aria-label="Document" value={type} onChange={setType} options={data.types} />
        </FormField>
        <FormField id="rv-every" label="Every (months)" required helper="1 to 120.">
          <TextField value={every} onChange={setEvery} inputMode="numeric" maxLength={3} />
        </FormField>
        <FormField id="rv-entity" label="Legal entity" required={!data.canManageCompany} optional={data.canManageCompany} helper={data.canManageCompany ? 'Blank: the whole company.' : undefined}>
          <Select aria-label="Legal entity" value={entity} onChange={setEntity} options={data.entities} clearable={data.canManageCompany} />
        </FormField>
        <FormField id="rv-from" label="From" required>
          <DatePicker value={from} onChange={setFrom} aria-label="From" />
        </FormField>
        <FormField id="rv-depts" label="Departments" optional helper="Blank: all.">
          <MultiSelect aria-label="Departments" value={depts} onChange={setDepts} options={data.departments} searchable />
        </FormField>
        <FormField id="rv-desigs" label="Designations" optional helper="Blank: all.">
          <MultiSelect aria-label="Designations" value={desigs} onChange={setDesigs} options={data.designations} searchable />
        </FormField>
      </div>
      <Switch label="Due at once when someone moves into these roles" description={roles ? 'Unless the document was checked after the move.' : 'Choose departments or designations first.'} checked={roles && onMove} onChange={setOnMove} disabled={!roles} />
      <Text size="sm" tone="secondary" as="p">
        Due is counted from the last verification, or from the joining day if it was never verified, and never before the rule starts.
      </Text>
    </ConfirmDialog>
  );
}
