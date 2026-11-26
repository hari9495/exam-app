// E2 approval rules editor: a route's steps as tiles (PLT-12 shape) and the drawer that edits one step. Used by the policy
// editor (PLT-12, the "otherwise" route) and the rule builder (PLT-32, a rule's own route).
import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { FormField, useTooEarly } from '../../components/field';
import { NumberField, TextField } from '../../components/inputs';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Tile } from './platform-kit';
import type { Choice, PolicyApprover, PolicyStepInput, PolicyTypeRow } from './approval-rules-types';

export const APPROVER_LABEL: Record<PolicyApprover, string> = {
  manager: 'Manager',
  manager_2: "Manager's manager",
  hr: 'HR Admins',
  users: 'Named people',
  group: 'A group',
  key_holders: 'Holders of a key',
  chain_grade: 'Up the chain to a grade',
  chain_limit: 'Up the chain to the approval limit',
  hiring_manager: 'Hiring manager',
};
const SCOPE_LABEL = { entity: 'legal entity', department: 'department', location: 'location' } as const;
/** Kinds that can be several people, so "All" or a number makes sense. */
const MANY: PolicyApprover[] = ['users', 'group', 'key_holders', 'hr'];
export const MAX_STEPS = 5;

/** The approver kinds a request type offers (pay types: only people who can be checked for the pay key now). */
export function kindsFor(row: Pick<PolicyTypeRow, 'key' | 'payKey' | 'family' | 'fields'>): PolicyApprover[] {
  if (row.payKey) return ['users', 'group', 'hr', 'key_holders'];
  const out: PolicyApprover[] = ['manager', 'manager_2', 'hr', 'users', 'group', 'key_holders', 'chain_grade'];
  if (row.family && row.fields?.some((f) => f.key === 'amount')) out.push('chain_limit');
  if (row.key === 'ats.requisition' || row.key === 'ats.offer') out.push('hiring_manager');
  return out;
}

export interface StepChoices {
  people?: Choice[];
  groups?: Choice[];
  grades?: Choice[];
}
const nameIn = (list: Choice[] | undefined, id: string | undefined) => list?.find((c) => c.value === id)?.label ?? 'someone no longer listed';

/** One step in words: who approves, and how many must. */
export function stepWords(s: PolicyStepInput, c: StepChoices): string {
  const who =
    s.approver === 'users'
      ? (s.userIds ?? []).map((u) => nameIn(c.people, u)).join(', ')
      : s.approver === 'group'
        ? `The group ${nameIn(c.groups, s.groupId)}`
        : s.approver === 'key_holders'
          ? `Holders of ${s.key} in the request's ${SCOPE_LABEL[s.scope ?? 'entity']}`
          : s.approver === 'chain_grade'
            ? `Up the manager chain to grade ${nameIn(c.grades, s.gradeId)}`
            : s.approver === 'chain_limit'
              ? 'Up the manager chain until the approval limit covers the amount'
              : APPROVER_LABEL[s.approver];
  return `${who}${s.mode === 'all' ? ' (all of them)' : s.mode === 'count' ? ` (${s.count} of them)` : ''}`;
}
const modeBadge = (s: PolicyStepInput) => (s.mode === 'all' ? 'All' : s.mode === 'count' ? `${s.count} must` : 'Any one');

/** A route's steps as tiles, with edit, move and remove, and "Add step". */
export function StepTiles({ steps, choices, canEdit, onChange, onEdit, label }: { steps: PolicyStepInput[]; choices: StepChoices; canEdit: boolean; onChange: (steps: PolicyStepInput[]) => void; onEdit: (index: number | null) => void; label: string }) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="yx-plt-grid" aria-label={label} role="list">
      {steps.map((s, i) => (
        <div role="listitem" key={i}>
          <Tile
            title={`Step ${i + 1} · ${s.name}`}
            badge={<Badge>{modeBadge(s)}</Badge>}
            actions={
              canEdit ? (
                <>
                  <IconButton icon={Pencil} label={`Change ${label.toLowerCase()} step ${i + 1}`} onClick={() => onEdit(i)} />
                  <IconButton icon={ArrowUp} label={`Move ${label.toLowerCase()} step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label={`Move ${label.toLowerCase()} step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)} />
                  <IconButton icon={Trash2} label={`Remove ${label.toLowerCase()} step ${i + 1}`} onClick={() => onChange(steps.filter((_, k) => k !== i))} />
                </>
              ) : undefined
            }
          >
            <span>{stepWords(s, choices)}</span>
          </Tile>
        </div>
      ))}
      {canEdit && steps.length < MAX_STEPS && (
        <div role="listitem">
          <Button icon={Plus} onClick={() => onEdit(null)}>
            Add step
          </Button>
        </div>
      )}
    </div>
  );
}

/** The drawer that adds or changes one step. */
export function StepDrawer({ open, step, kinds, choices, onClose, onDone }: { open: boolean; step: PolicyStepInput | null; kinds: PolicyApprover[]; choices: StepChoices; onClose: () => void; onDone: (s: PolicyStepInput) => void }) {
  const [s, setS] = useState<PolicyStepInput>(step ?? { name: '', approver: kinds[0]!, mode: 'any' });
  const set = (patch: Partial<PolicyStepInput>) => setS((x) => ({ ...x, ...patch }));
  const many = MANY.includes(s.approver);
  const early = useTooEarly(
    [
      (s.name.trim().length < 2 || s.name.trim().length > 60 || /[<>]/.test(s.name)) && { fieldId: 'sd-name', message: 'Give the step a name of 2 to 60 characters, without < or >.' },
      s.approver === 'users' && !(s.userIds ?? []).length && { fieldId: 'sd-people', message: 'Choose at least one person.' },
      s.approver === 'group' && !s.groupId && { fieldId: 'sd-group', message: 'Choose a group.' },
      s.approver === 'key_holders' && !/^[a-z][a-z_]*(\.[a-z_]+){1,4}$/.test(s.key ?? '') && { fieldId: 'sd-key', message: 'Enter a key, such as payroll.run.approve.' },
      s.approver === 'chain_grade' && !s.gradeId && { fieldId: 'sd-grade', message: 'Choose the grade the chain goes up to.' },
      many && s.mode === 'count' && !(s.count && s.count >= 1 && s.count <= 25) && { fieldId: 'sd-count', message: 'Enter how many must approve (1 to 25).' },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const done = () => {
    if (early.stop()) return;
    const clean: PolicyStepInput = { name: s.name.trim(), approver: s.approver, mode: many ? s.mode : 'any' };
    if (clean.mode === 'count') clean.count = s.count;
    if (s.approver === 'users') clean.userIds = s.userIds;
    if (s.approver === 'group') clean.groupId = s.groupId;
    if (s.approver === 'key_holders') Object.assign(clean, { key: s.key!.trim(), scope: s.scope ?? 'entity' });
    if (s.approver === 'chain_grade') clean.gradeId = s.gradeId;
    onDone(clean);
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={step ? `Change step: ${step.name}` : 'Add a step'}
      subtitle="Who approves at this step. The person who asked never approves their own request."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={done}>
            {step ? 'Keep changes' : 'Add step'}
          </Button>
        </>
      }
    >
      <div className="yx-plt-stack">
        <FormField id="sd-name" label="Step name" required error={early.errorOf('sd-name')}>
          <TextField value={s.name} onChange={(v) => set({ name: v })} maxLength={60} placeholder="For example, Finance" />
        </FormField>
        <FormField label="Who approves">
          <Select value={s.approver} onChange={(v) => v && set({ approver: v as PolicyApprover, mode: MANY.includes(v as PolicyApprover) ? s.mode : 'any' })} options={kinds.map((k) => ({ value: k, label: APPROVER_LABEL[k] }))} />
        </FormField>
        {s.approver === 'users' && (
          <FormField id="sd-people" label="People" required error={early.errorOf('sd-people')}>
            <MultiSelect options={choices.people ?? []} value={s.userIds ?? []} onChange={(v) => set({ userIds: v.slice(0, 25) })} />
          </FormField>
        )}
        {s.approver === 'group' && (
          <FormField id="sd-group" label="Group" required error={early.errorOf('sd-group')}>
            <Select value={s.groupId ?? null} onChange={(v) => set({ groupId: v ?? undefined })} options={choices.groups ?? []} />
          </FormField>
        )}
        {s.approver === 'key_holders' && (
          <>
            <FormField id="sd-key" label="Key they hold" required error={early.errorOf('sd-key')} helper="People who hold this key for the request's place. Grants for that place come first; company-wide holders only when there are none.">
              <TextField value={s.key ?? ''} onChange={(v) => set({ key: v })} placeholder="payroll.run.approve" />
            </FormField>
            <FormField label="Where they hold it">
              <Segment label="Where they hold it" options={[{ value: 'entity', label: 'Legal entity' }, { value: 'department', label: 'Department' }, { value: 'location', label: 'Location' }]} value={s.scope ?? 'entity'} onChange={(v) => set({ scope: v as PolicyStepInput['scope'] })} />
            </FormField>
          </>
        )}
        {s.approver === 'chain_grade' && (
          <FormField id="sd-grade" label="Up to grade" required error={early.errorOf('sd-grade')} helper="The first manager up the chain whose grade ranks at least this high approves.">
            <Select value={s.gradeId ?? null} onChange={(v) => set({ gradeId: v ?? undefined })} options={choices.grades ?? []} />
          </FormField>
        )}
        {s.approver === 'chain_limit' && <p className="yx-plt-muted">The first manager up the chain whose grade's approval limit covers the amount approves. Set the limits under Approval limits first.</p>}
        <FormField label="Who must decide" helper={many ? undefined : 'One person approves this step.'}>
          <Segment
            label="Who must decide"
            disabled={!many}
            options={[{ value: 'any', label: 'Any one' }, { value: 'all', label: 'All' }, { value: 'count', label: 'A number' }]}
            value={many ? s.mode : 'any'}
            onChange={(v) => set({ mode: v as PolicyStepInput['mode'], ...(v === 'count' && !s.count ? { count: 2 } : {}) })}
          />
        </FormField>
        {many && s.mode === 'count' && (
          <FormField id="sd-count" label="How many must approve" required error={early.errorOf('sd-count')}>
            <NumberField value={s.count ?? null} onChange={(v) => set({ count: v ?? undefined })} min={1} max={25} />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}
