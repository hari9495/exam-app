import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { useToast } from '../../components/notify';
import { Card } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { errorText } from '../org/org-kit';

// Settings › Roles & access, the two hiring pieces that lived on /v2 (answers 2426, 2430): how much of each governed
// candidate and job field each hiring role may see, and the named staff groups that hiring work is routed to.

export type FieldEntity = 'candidate' | 'job';
export type FieldLevel = 'readonly' | 'hidden';
/** entity → role → field → level; a field not listed is editable. */
export type FieldPermissionConfig = Partial<Record<FieldEntity, Record<string, Record<string, FieldLevel>>>>;

export interface HiringFieldAccessProps {
  config: FieldPermissionConfig;
  /** The governed fields of each record, in order. */
  fields: Record<FieldEntity, string[]>;
  /** The hiring roles the rules apply to (System Admins and HR always see everything). */
  roles: string[];
  onSave: (config: FieldPermissionConfig) => Promise<unknown>;
}

const ENTITY_TITLE: Record<FieldEntity, string> = { candidate: 'Candidate fields', job: 'Job fields' };
const ROLE_LABEL: Record<string, string> = { recruiter: 'Recruiter', panel: 'Interview panel', hiring_manager: 'Hiring manager' };
const FIELD_LABEL: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
  salaryMin: 'Pay from',
  salaryMax: 'Pay up to',
  salaryCurrency: 'Pay currency',
  headcount: 'Openings',
  department: 'Department',
  fitCriteria: 'Fit criteria',
  fitRubric: 'Fit rubric',
};
const LEVELS = [
  { value: 'edit', label: 'Can change' },
  { value: 'readonly', label: 'Can see' },
  { value: 'hidden', label: 'Hidden' },
] as const;

const clone = (c: FieldPermissionConfig): FieldPermissionConfig => JSON.parse(JSON.stringify(c)) as FieldPermissionConfig;

/** The matrix: a row per field, a column per hiring role; Save keeps the whole matrix (the API validates it). */
export function HiringFieldAccess({ config, fields, roles, onSave }: HiringFieldAccessProps) {
  const [draft, setDraft] = useState<FieldPermissionConfig>(() => clone(config));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  useEffect(() => setDraft(clone(config)), [config]);
  const level = (e: FieldEntity, role: string, field: string) => draft[e]?.[role]?.[field] ?? 'edit';
  const set = (e: FieldEntity, role: string, field: string, v: string) =>
    setDraft((d) => {
      const next = clone(d);
      const byRole = (next[e] ??= {});
      const row = (byRole[role] ??= {});
      if (v === 'edit') delete row[field];
      else row[field] = v as FieldLevel;
      if (!Object.keys(row).length) delete byRole[role];
      if (!Object.keys(byRole).length) delete next[e];
      return next;
    });
  const changed = JSON.stringify(draft) !== JSON.stringify(config);
  const save = async () => {
    setSaving(true);
    setFailed(null);
    try {
      await onSave(draft);
      toast({ tone: 'success', title: 'Field access saved.' });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="yx-auth__stack">
      <Text tone="secondary">
        What each hiring role may do with these fields. Hidden fields are blanked out for them on screen and in exports; System Admins and HR always see everything.
      </Text>
      {(Object.keys(ENTITY_TITLE) as FieldEntity[]).map((e) => {
        const columns: TableColumn<string>[] = [
          { key: 'field', header: 'Field', value: (f) => FIELD_LABEL[f] ?? f, width: 180, hideable: false },
          ...roles.map((role) => ({
            key: role,
            header: ROLE_LABEL[role] ?? role,
            value: (f: string) => level(e, role, f),
            render: (f: string) => (
              <Select
                aria-label={`${FIELD_LABEL[f] ?? f} for ${ROLE_LABEL[role] ?? role}`}
                value={level(e, role, f)}
                onChange={(v) => set(e, role, f, v ?? 'edit')}
                options={LEVELS.map((l) => ({ value: l.value, label: l.label }))}
              />
            ),
            width: 170,
          })),
        ];
        return (
          <Card key={e} title={ENTITY_TITLE[e]}>
            <DataTable label={ENTITY_TITLE[e]} columns={columns} rows={fields[e]} getRowId={(f) => f} rowNoun={['field', 'fields']} />
          </Card>
        );
      })}
      {failed && <Text tone="danger">{failed}</Text>}
      <div className="yx-ppl2__row">
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          Save field access
        </Button>
        {changed && (
          <Button onClick={() => setDraft(clone(config))}>
            Discard changes
          </Button>
        )}
      </div>
    </div>
  );
}

/** T2-G 42 (answer 2745): what a rule group's members are worked out from; each a list (any of them), all must match. */
export const GROUP_RULE_KINDS = [
  ['legalEntityIds', 'Legal entities'],
  ['locationIds', 'Locations'],
  ['departmentIds', 'Departments (with their sub-departments)'],
  ['gradeIds', 'Grades'],
  ['employmentTypeIds', 'Employment types'],
  // T2-G 2903: HR's tags on the person (any of them).
  ['tagIds', 'Tags'],
] as const;
export type GroupRuleKind = (typeof GROUP_RULE_KINDS)[number][0];
export type GroupRules = Record<GroupRuleKind, string[]>;
export type GroupRuleChoices = Record<GroupRuleKind, { value: string; label: string }[]>;
const NO_RULES: GroupRules = { legalEntityIds: [], locationIds: [], departmentIds: [], gradeIds: [], employmentTypeIds: [], tagIds: [] };

export interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  /** T2-G 42: null or absent for a hand-picked group. */
  rules?: GroupRules | null;
  members: { userId: string; name: string | null; email: string }[];
}

export interface UserGroupsPanelProps {
  groups: UserGroup[];
  /** Who can be a member: the company's staff. */
  people: { value: string; label: string }[];
  onCreate: (input: { name: string; description?: string; rules?: GroupRules }) => Promise<unknown>;
  onUpdate: (id: string, input: { name: string; description: string; rules?: GroupRules }) => Promise<unknown>;
  /** T2-G 42: the choices for rule groups (absent: hand-picked groups only, as before). */
  ruleChoices?: GroupRuleChoices;
  onMembers: (id: string, userIds: string[]) => Promise<unknown>;
  /** Answer 2439: the group goes to the recycle bin; work assigned to it is unassigned. */
  onDelete: (id: string) => Promise<unknown>;
}

type GroupDialog = { kind: 'new' } | { kind: 'edit'; group: UserGroup } | { kind: 'members'; group: UserGroup } | { kind: 'delete'; group: UserGroup };

/** Named staff groups (answer 2430): hiring work can be assigned to a group, and a group can follow a job. */
export function UserGroupsPanel({ groups, people, onCreate, onUpdate, onMembers, onDelete, ruleChoices }: UserGroupsPanelProps) {
  const [dialog, setDialog] = useState<GroupDialog | null>(null);
  const { toast } = useToast();
  const columns: TableColumn<UserGroup>[] = [
    { key: 'name', header: 'Group', value: (g) => g.name, render: (g) => <span className="yx-auth__item-main"><Text>{g.name}</Text>{g.description && <Text tone="secondary" size="sm">{g.description}</Text>}</span>, width: 280, hideable: false },
    {
      key: 'members',
      header: 'Members',
      value: (g) => g.members.length,
      render: (g) => (g.rules ? `${g.members.length} ${g.members.length === 1 ? 'person' : 'people'} today · from rules: ${ruleWords(g.rules, ruleChoices)}` : g.members.length ? g.members.map((m) => m.name ?? m.email).join(', ') : 'No members yet'),
      width: 320,
    },
  ];
  return (
    <div className="yx-auth__stack">
      <div className="yx-ppl2__row">
        <Text tone="secondary">{ruleChoices ? 'Groups choose who gets announcements, surveys, learning and approvals. A group from rules updates itself every night. Hiring work goes to hand-picked groups only.' : 'Hiring work can go to a group instead of one person; everyone in it sees it.'}</Text>
        <Button onClick={() => setDialog({ kind: 'new' })}>New group</Button>
      </div>
      <DataTable
        label="Groups"
        columns={columns}
        rows={groups}
        getRowId={(g) => g.id}
        rowNoun={['group', 'groups']}
        cardSummary
        empty={<EmptyState compact title="No groups yet." description="Make one for a team that shares hiring work, for example Plant recruiters." action={<Button onClick={() => setDialog({ kind: 'new' })}>New group</Button>} />}
        rowButtons={(g) => (
          <>
            {!g.rules && (
              <Button size="sm" onClick={() => setDialog({ kind: 'members', group: g })}>
                Members
              </Button>
            )}
            <Button size="sm" onClick={() => setDialog({ kind: 'edit', group: g })}>
              Edit
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'delete', group: g })}>
              Delete
            </Button>
          </>
        )}
      />
      {(dialog?.kind === 'new' || dialog?.kind === 'edit') && (
        <GroupDetailsDialog
          group={dialog.kind === 'edit' ? dialog.group : null}
          taken={groups.filter((g) => dialog.kind === 'new' || g.id !== dialog.group.id).map((g) => g.name.toLowerCase())}
          ruleChoices={ruleChoices}
          onClose={() => setDialog(null)}
          onSave={async (name, description, rules) => {
            if (dialog.kind === 'new') await onCreate({ name, ...(description ? { description } : {}), ...(rules ? { rules } : {}) });
            else await onUpdate(dialog.group.id, { name, description, ...(rules ? { rules } : {}) });
            toast({ tone: 'success', title: dialog.kind === 'new' ? `Group "${name}" made.` : 'Group saved.' });
          }}
        />
      )}
      {dialog?.kind === 'members' && (
        <MembersDialog
          group={dialog.group}
          people={people}
          onClose={() => setDialog(null)}
          onSave={async (ids) => {
            await onMembers(dialog.group.id, ids);
            toast({ tone: 'success', title: `Members of ${dialog.group.name} saved.` });
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Delete ${dialog.group.name}?`}
          consequence="It goes to the recycle bin with its members. Hiring work assigned to it is left unassigned."
          confirmLabel="Delete group"
          destructive
          onConfirm={async () => {
            await onDelete(dialog.group.id);
            toast({ tone: 'success', title: `Group "${dialog.group.name}" deleted.` });
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

/** "Hosur plant, Chennai office · Grade M1" (the rule lists in words, by the choices' names). */
export function ruleWords(rules: GroupRules, choices?: GroupRuleChoices): string {
  const parts = GROUP_RULE_KINDS.filter(([k]) => rules[k]?.length).map(([k]) => rules[k].map((id) => choices?.[k].find((o) => o.value === id)?.label ?? 'Removed').join(', '));
  return parts.join(' · ') || 'none';
}

function GroupDetailsDialog({ group, taken, ruleChoices, onClose, onSave }: { group: UserGroup | null; taken: string[]; ruleChoices?: GroupRuleChoices; onClose: () => void; onSave: (name: string, description: string, rules?: GroupRules) => Promise<void> }) {
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  // T2-G 42: a new group is hand-picked or worked out from rules; an existing group keeps how its members come.
  const [how, setHow] = useState<'hand' | 'rules'>(group?.rules ? 'rules' : 'hand');
  const [rules, setRules] = useState<GroupRules>({ ...NO_RULES, ...(group?.rules ?? {}) });
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const nameError = !name.trim() ? 'Enter a name.' : taken.includes(name.trim().toLowerCase()) ? 'Another group has this name.' : null;
  const fromRules = how === 'rules' && Boolean(ruleChoices);
  const rulesError = fromRules && GROUP_RULE_KINDS.every(([k]) => !rules[k].length) ? 'Add at least one rule.' : null;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={group ? `Edit ${group.name}` : 'New group'}
      confirmLabel={group ? 'Save group' : 'Make group'}
      onConfirm={async () => {
        setTried(true);
        if (nameError || rulesError) return false;
        setFailed(null);
        try {
          await onSave(name.trim(), description.trim(), fromRules ? rules : undefined);
        } catch (e) {
          setFailed(errorText(e));
          return false;
        }
        onClose();
      }}
    >
      <FormField id="ug-name" label="Name" required error={tried ? nameError : null}>
        <TextField value={name} onChange={setName} maxLength={120} />
      </FormField>
      <FormField id="ug-description" label="What it is for" optional>
        <TextArea value={description} onChange={setDescription} rows={2} maxLength={500} />
      </FormField>
      {ruleChoices && !group && (
        <FormField id="ug-how" label="Members">
          <Segment label="Members" value={how} onChange={setHow} options={[{ value: 'hand', label: 'Picked by hand' }, { value: 'rules', label: 'Worked out from rules' }]} />
        </FormField>
      )}
      {fromRules && (
        <>
          <Text tone="secondary" size="sm">
            People whose job today matches every rule you fill in. Worked out on save and every night.
          </Text>
          {GROUP_RULE_KINDS.map(([k, label]) => (
            <FormField key={k} id={`ug-${k}`} label={label} optional>
              <MultiSelect aria-label={label} value={rules[k]} onChange={(v) => setRules({ ...rules, [k]: v })} options={ruleChoices![k]} searchable placeholder="Any" />
            </FormField>
          ))}
          {tried && rulesError && <Text tone="danger">{rulesError}</Text>}
        </>
      )}
      {failed && <Text tone="danger">{failed}</Text>}
    </ConfirmDialog>
  );
}

function MembersDialog({ group, people, onClose, onSave }: { group: UserGroup; people: { value: string; label: string }[]; onClose: () => void; onSave: (ids: string[]) => Promise<void> }) {
  const [ids, setIds] = useState<string[]>(group.members.map((m) => m.userId));
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Members of ${group.name}`}
      confirmLabel="Save members"
      onConfirm={async () => {
        setFailed(null);
        try {
          await onSave(ids);
        } catch (e) {
          setFailed(errorText(e));
          return false;
        }
        onClose();
      }}
    >
      <FormField id="ug-members" label="Members" helper={`${ids.length} chosen`}>
        <MultiSelect aria-label="Members" value={ids} onChange={setIds} options={people} searchable />
      </FormField>
      {failed && <Text tone="danger">{failed}</Text>}
    </ConfirmDialog>
  );
}
