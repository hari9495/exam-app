// PLT-12 Approval policy editor, live (Settings S-6, answer 1330): the company's approval steps for each request type, on
// the shared approvals engine. Who approves each step (the person's manager, their manager's manager, or the HR Admins)
// and whether any one or all decide. The reminder and escalation hours are on 2.4. A change applies to new requests
// only; the person who asked never approves their own request (the engine's rule).
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, PageHeader } from '../../components/shell';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { useToastIfAny } from '../../components/notify';
import { formatDate } from '../../lib/format';

export type PolicyApprover = 'manager' | 'manager_2' | 'hr';
export interface PolicyStepInput {
  name: string;
  approver: PolicyApprover;
  mode: 'any' | 'all';
}
export interface PolicyTypeRow {
  key: string;
  label: string;
  /** null: the module's built-in steps. */
  steps: PolicyStepInput[] | null;
  approvers: string;
  version: number;
  updatedBy: string | null;
  updatedAt: string | null;
}
export interface LivePolicyEditor {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  types: PolicyTypeRow[];
  remindHours: number;
  escalateHours: number;
  canEdit: boolean;
  onSave: (type: string, steps: PolicyStepInput[], version: number) => Promise<unknown>;
  onReset: (type: string, version: number) => Promise<unknown>;
  /** Stories: open on this request type. */
  defaultType?: string;
}

export const APPROVER_LABEL: Record<PolicyApprover, string> = { manager: 'Manager', manager_2: "Manager's manager", hr: 'HR Admins' };
const APPROVERS = (Object.keys(APPROVER_LABEL) as PolicyApprover[]).map((v) => ({ value: v, label: APPROVER_LABEL[v] }));
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');

export function LivePolicyEditorScreen({ live }: { live: LivePolicyEditor }) {
  const [chosen, setType] = useState<string>(live.defaultType ?? '');
  // Until one is chosen, the first type (the list may arrive after the first render).
  const type = chosen || live.types[0]?.key || '';
  if (live.state === 'no-access') return <NoAccessState grantedBy="your System Admin" what="approval policies" />;
  if (live.state === 'error') return <ErrorState title="We couldn't load the approval policies." description="Retry in a moment. Nothing has changed." onRetry={live.onRetry} />;
  const row = live.types.find((t) => t.key === type);
  return (
    <div className="yx-plt-stack">
      <PageHeader
        title="Approval policies"
        description={`Who approves each request type, step by step. The approver is reminded after ${live.remindHours} hours and it goes to their manager too after ${live.escalateHours} hours (Settings › Approvals). Changes apply to new requests only.`}
        status={!live.canEdit ? <Badge tone="neutral">View only</Badge> : undefined}
      />
      <FormField label="Request type">
        <Select value={type || null} onChange={(v) => v && setType(v)} options={live.types.map((t) => ({ value: t.key, label: t.label }))} />
      </FormField>
      {live.state === 'loading' && <p className="yx-plt-muted">Loading…</p>}
      {row && <Steps key={`${row.key}:${row.version}`} live={live} row={row} />}
    </div>
  );
}

function Steps({ live, row }: { live: LivePolicyEditor; row: PolicyTypeRow }) {
  const toaster = useToastIfAny();
  const [steps, setSteps] = useState<PolicyStepInput[]>(row.steps ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const early = useTooEarly(
    [
      !steps.length && { fieldId: 'pe-add', message: 'Add at least one step, or keep the built-in steps.' },
      ...steps.map((s, i) => (s.name.trim().length < 2 || /[<>]/.test(s.name) ? { fieldId: `pe-name-${i}`, message: 'Give the step a name of 2 to 60 characters, without < or >.' } : null)),
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const set = (i: number, patch: Partial<PolicyStepInput>) => setSteps((xs) => xs.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) =>
    setSteps((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setFailed(null);
    try {
      await fn();
      toaster?.toast({ tone: 'success', title: done });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card
      title={`${row.label} approvals`}
      actions={
        live.canEdit ? (
          <>
            {row.steps && (
              <Button loading={busy === 'reset'} onClick={() => void act('reset', () => live.onReset(row.key, row.version), 'Back to the built-in steps')}>
                Use the built-in steps
              </Button>
            )}
            <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void act('save', () => live.onSave(row.key, steps.map((s) => ({ ...s, name: s.name.trim() })), row.version), `${row.label} approvals saved`)}>
              Save as version {row.version + 1}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="yx-plt-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <p className="yx-plt-muted">
          {row.steps ? `Version ${row.version}${row.updatedBy ? `, by ${row.updatedBy}` : ''}${row.updatedAt ? ` on ${formatDate(new Date(row.updatedAt))}` : ''}.` : 'Built in: the module decides who approves (usually the manager). Add steps to set your own.'}
        </p>
        {steps.length === 0 && !live.canEdit && <EmptyState compact title="Built-in steps" description="This request type uses the steps its module sets." />}
        {steps.map((s, i) => (
          <FieldRow key={i}>
            <FormField id={`pe-name-${i}`} label={`Step ${i + 1}`} required error={early.errorOf(`pe-name-${i}`)}>
              <TextField value={s.name} onChange={(v) => set(i, { name: v })} maxLength={60} readOnly={!live.canEdit} />
            </FormField>
            <FormField label="Who approves">
              <Select value={s.approver} onChange={(v) => v && set(i, { approver: v as PolicyApprover })} options={APPROVERS} disabled={!live.canEdit} />
            </FormField>
            <FormField label="Who must decide">
              <Segment label={`Step ${i + 1}: who must decide`} options={[{ value: 'any', label: 'Any one' }, { value: 'all', label: 'All' }]} value={s.mode} onChange={(v) => live.canEdit && set(i, { mode: v as 'any' | 'all' })} />
            </FormField>
            {live.canEdit && (
              <span className="yx-plt-row">
                <IconButton icon={ArrowUp} label={`Move step ${i + 1} up`} onClick={() => move(i, -1)} />
                <IconButton icon={ArrowDown} label={`Move step ${i + 1} down`} onClick={() => move(i, 1)} />
                <IconButton icon={Trash2} label={`Remove step ${i + 1}`} onClick={() => setSteps((xs) => xs.filter((_, k) => k !== i))} />
              </span>
            )}
          </FieldRow>
        ))}
        {live.canEdit && (
          <FormField id="pe-add" label="Add a step" hideLabel error={early.errorOf('pe-add')}>
            <Button icon={Plus} onClick={() => steps.length < 5 && setSteps((xs) => [...xs, { name: xs.length ? 'HR' : 'Manager', approver: xs.length ? 'hr' : 'manager', mode: 'any' }])}>
              {steps.length >= 5 ? 'At most 5 steps' : 'Add step'}
            </Button>
          </FormField>
        )}
      </div>
    </Card>
  );
}
