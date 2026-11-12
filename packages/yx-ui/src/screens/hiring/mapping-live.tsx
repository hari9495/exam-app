// Projects P-3 (PRJ-08, founder answers 1409, 1410): the live timesheet mapping rules in the API's shapes, and the
// rule drawer, drawn in the kit first (stories in prj-08-mapping-rules.stories.tsx).
import { useState } from 'react';
import { Checkbox } from '../../components/choice';
import { FormField, FormSection, useSaveErrors, type FormErrorItem } from '../../components/field';
import { NumberField, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { EditorDrawer, useRun } from '../org/org-kit';

export type RuleSource = 'calendar' | 'issues' | 'code';

export interface LiveMappingRule {
  id: string;
  source: RuleSource;
  pattern: string;
  projectId: string;
  project: string;
  taskId: string | null;
  task: string | null;
  priority: number;
  enabled: boolean;
  version: number;
  /** Why a saved rule does not apply now (its project is not active, or its task not in use). */
  problem: string | null;
}

/** GET /projects/mapping-rules. */
export interface MappingRulesData {
  canEdit: boolean;
  /** Only a System Admin switches pre-fill (it reads people's own tools, answer 1409). */
  canSwitchPrefill: boolean;
  prefillOn: boolean;
  sources: { value: RuleSource; label: string }[];
  rules: LiveMappingRule[];
  projects: { id: string; code: string; name: string; tasks: { id: string; name: string }[] }[];
}

export interface MappingRuleInput {
  source: RuleSource;
  pattern: string;
  projectId: string;
  taskId: string | null;
  priority: number;
  enabled: boolean;
}

/** POST /projects/mapping-rules/test: the saved rules over the editor's own items from last week. */
export interface MappingTestResult {
  week: string;
  prefillOn: boolean;
  connected: boolean;
  items: { id: string; source: RuleSource; text: string; hours: number; ruleId: string | null; priority: number | null; project: string | null; task: string | null }[];
}

/** The checks the rule form runs before saving (the API checks them again). */
export function ruleProblems(v: { pattern: string; projectId: string | null; priority: number | null }): FormErrorItem[] {
  return [
    ...(!v.pattern.replace(/\*/g, '').trim() ? [{ fieldId: 'rule-pattern', message: 'Write a pattern with some text, such as NRPWEB-* or *Nilgiri*.' }] : []),
    ...((v.pattern.match(/\*/g)?.length ?? 0) > 5 ? [{ fieldId: 'rule-pattern', message: 'Use at most 5 * in a pattern.' }] : []),
    ...(!v.projectId ? [{ fieldId: 'rule-project', message: 'Choose the project.' }] : []),
    ...(!v.priority || v.priority < 1 || v.priority > 999 || !Number.isInteger(v.priority) ? [{ fieldId: 'rule-priority', message: 'Give a priority from 1 to 999.' }] : []),
  ];
}

/** Add or change a rule: the tool, the pattern, the project and task it maps to, and its priority. */
export function MappingRuleDrawer({ rule, data, nextPriority, onClose, onSave }: { rule: LiveMappingRule | null; data: MappingRulesData; nextPriority: number; onClose: () => void; onSave: (input: MappingRuleInput) => Promise<void> }) {
  const [v, setV] = useState<{ source: RuleSource; pattern: string; projectId: string | null; taskId: string | null; priority: number | null; enabled: boolean }>(
    rule ? { source: rule.source, pattern: rule.pattern, projectId: rule.projectId, taskId: rule.taskId, priority: rule.priority, enabled: rule.enabled } : { source: 'issues', pattern: '', projectId: null, taskId: null, priority: nextPriority, enabled: true },
  );
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const errors = ruleProblems(v);
  const save = useSaveErrors(errors);
  const set = (p: Partial<typeof v>) => {
    setV((x) => ({ ...x, ...p }));
    setDirty(true);
  };
  const tasks = data.projects.find((p) => p.id === v.projectId)?.tasks ?? [];
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title={rule ? `Change rule ${rule.priority}` : 'Add mapping rule'}
      subtitle="A matching item becomes a suggested line; the person always reviews and submits. Lower priorities are tried first."
      errors={save.shownErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel="Save rule"
      onSave={() => {
        if (errors.length) return save.reveal();
        void run('save', () => onSave({ source: v.source, pattern: v.pattern.trim(), projectId: v.projectId!, taskId: v.taskId, priority: v.priority!, enabled: v.enabled })).then((ok) => ok && onClose());
      }}
    >
      <FormSection title="What it matches">
        <FormField id="rule-source" label="Tool" required>
          <Segment label="Tool" options={data.sources} value={v.source} onChange={(source) => set({ source })} />
        </FormField>
        <FormField id="rule-pattern" label="Pattern" required helper="Use * for any text, e.g. NRPWEB-* or *Nilgiri*. Matching ignores capitals." error={save.errorOf('rule-pattern')}>
          <TextField value={v.pattern} onChange={(pattern) => set({ pattern })} maxLength={120} />
        </FormField>
      </FormSection>
      <FormSection title="Where it goes">
        <FormField id="rule-project" label="Project" required error={save.errorOf('rule-project')} helper="Never a closed project. A person not allocated to it gets no suggestion from this rule.">
          <Select value={v.projectId} onChange={(projectId) => set({ projectId, taskId: null })} options={data.projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
        </FormField>
        <FormField id="rule-task" label="Task" optional helper={v.projectId && !tasks.length ? 'This project has no tasks in use.' : undefined}>
          <Select value={v.taskId} onChange={(taskId) => set({ taskId })} options={tasks.map((t) => ({ value: t.id, label: t.name }))} clearable />
        </FormField>
        <FormField id="rule-priority" label="Priority" required helper="Lower numbers win when two rules match." error={save.errorOf('rule-priority')}>
          <NumberField value={v.priority} onChange={(priority) => set({ priority })} min={1} max={999} />
        </FormField>
        <Checkbox checked={v.enabled} onChange={(enabled) => set({ enabled })} label="On (used for suggestions)" />
      </FormSection>
    </EditorDrawer>
  );
}

/** Sample live data in the API's shapes, for the PRJ-08 live stories and tests. */
export const LIVE_MAPPING_DATA: MappingRulesData = {
  canEdit: true,
  canSwitchPrefill: true,
  prefillOn: true,
  sources: [
    { value: 'calendar', label: 'Work calendar' },
    { value: 'issues', label: 'Issue tracker' },
    { value: 'code', label: 'Code host' },
  ],
  rules: [
    { id: 'r1', source: 'issues', pattern: 'NRPWEB-*', projectId: 'p1', project: 'NRP-WEB', taskId: 't1', task: 'Build', priority: 1, enabled: true, version: 1, problem: null },
    { id: 'r2', source: 'calendar', pattern: '*Nilgiri*', projectId: 'p1', project: 'NRP-WEB', taskId: null, task: null, priority: 2, enabled: true, version: 2, problem: null },
    { id: 'r3', source: 'calendar', pattern: '*stand-up*', projectId: 'p3', project: 'INT-ADM', taskId: null, task: null, priority: 3, enabled: false, version: 1, problem: null },
    { id: 'r4', source: 'issues', pattern: 'WMS-*', projectId: 'p4', project: 'CLL-WMS', taskId: null, task: null, priority: 4, enabled: true, version: 1, problem: 'CLL-WMS is not active' },
  ],
  projects: [
    { id: 'p1', code: 'NRP-WEB', name: 'Nilgiri Retail web rebuild', tasks: [{ id: 't1', name: 'Build' }, { id: 't2', name: 'Testing' }] },
    { id: 'p3', code: 'INT-ADM', name: 'Internal administration', tasks: [] },
  ],
};

export const LIVE_MAPPING_TEST: MappingTestResult = {
  week: '2026-11-02',
  prefillOn: true,
  connected: true,
  items: [
    { id: 'i1', source: 'issues', text: 'NRPWEB-412', hours: 6, ruleId: 'r1', priority: 1, project: 'NRP-WEB', task: 'Build' },
    { id: 'i2', source: 'calendar', text: 'Weekly review with Nilgiri Retail', hours: 1, ruleId: 'r2', priority: 2, project: 'NRP-WEB', task: null },
    { id: 'i3', source: 'calendar', text: 'Dentist appointment', hours: 1.5, ruleId: null, priority: null, project: null, task: null },
  ],
};
