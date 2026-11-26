import { useState } from 'react';
import { Button } from '../../components/button';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { errorText } from '../org/org-kit';
import { agendaLines } from './agenda-templates-live';

/** GET /performance/goal-templates (T2-C item 71, answer 2844). */
export interface GoalTemplate {
  id: string;
  title: string;
  description: string | null;
  kind: 'okr' | 'kpi';
  keyResults: string[];
  departmentId: string | null;
  department: string | null;
  designationId: string | null;
  designation: string | null;
}
export type GoalTemplateInput = Pick<GoalTemplate, 'title' | 'description' | 'kind' | 'keyResults' | 'departmentId' | 'designationId'>;
type Choice = { value: string; label: string };

/** Who a goal template is for, in words. */
export const goalTemplateFor = (t: Pick<GoalTemplate, 'department' | 'designation'>) => [t.department, t.designation].filter(Boolean).join(' · ') || 'Everyone';

/** Settings › Performance (6.3): add or change a goal template (for everyone, a department and/or a designation), or delete it. */
export function GoalTemplateSheet({ template, departments, designations, onClose, onSave, onDelete }: { template: GoalTemplate | null; departments: Choice[]; designations: Choice[]; onClose: () => void; onSave: (input: GoalTemplateInput) => Promise<unknown>; onDelete: () => Promise<unknown> }) {
  const toast = useToastIfAny();
  const [title, setTitle] = useState(template?.title ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [kind, setKind] = useState<'okr' | 'kpi'>(template?.kind ?? 'kpi');
  const [krs, setKrs] = useState(template?.keyResults.join('\n') ?? '');
  const [dept, setDept] = useState<string | null>(template?.departmentId ?? null);
  const [desig, setDesig] = useState<string | null>(template?.designationId ?? null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lines = agendaLines(krs);
  const errors = [
    ...(title.trim().length >= 3 ? [] : [{ fieldId: 'gt-title', message: 'Say what the goal is, in at least 3 characters.' }]),
    ...(kind === 'okr' && lines.length === 0 ? [{ fieldId: 'gt-krs', message: 'An objective needs at least one key result.' }] : []),
    ...(kind === 'okr' && lines.length > 10 ? [{ fieldId: 'gt-krs', message: 'Keep it to 10 key results or fewer.' }] : []),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ title: title.trim(), description: description.trim() || null, kind, keyResults: kind === 'okr' ? lines : [], departmentId: dept, designationId: desig });
      toast?.toast({ tone: 'success', title: 'Goal template saved' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={template ? template.title : 'Add a goal template'}
      subtitle="Anyone adding a goal can start from a template that fits them, then change it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {template && (
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          )}
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      <FormField id="gt-title" label="Goal" required error={v.errorOf('gt-title')}>
        <TextField value={title} onChange={setTitle} maxLength={200} />
      </FormField>
      <FormField id="gt-desc" label="Description" optional>
        <TextArea value={description} onChange={setDescription} rows={3} maxLength={1000} />
      </FormField>
      <FormField id="gt-kind" label="Kind">
        <Segment label="Kind" value={kind} onChange={setKind} options={[{ value: 'kpi', label: 'KPI' }, { value: 'okr', label: 'Objective with key results' }]} />
      </FormField>
      {kind === 'okr' && (
        <FormField id="gt-krs" label="Key results" required helper="One a line. The person fills in the start and target." error={v.errorOf('gt-krs')}>
          <TextArea value={krs} onChange={setKrs} rows={4} />
        </FormField>
      )}
      <FormField id="gt-dept" label="Department" optional helper="Leave empty for every department.">
        <Select aria-label="Department" value={dept} onChange={setDept} options={departments} clearable searchable />
      </FormField>
      <FormField id="gt-desig" label="Designation" optional helper="Leave empty for every designation.">
        <Select aria-label="Designation" value={desig} onChange={setDesig} options={designations} clearable searchable />
      </FormField>
      {deleting && template && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(false)}
          size="sm"
          title={`Delete ${template.title}?`}
          consequence="It is no longer offered. Goals started from it stay as they are."
          confirmLabel="Delete template"
          destructive
          onConfirm={async () => {
            await onDelete();
            toast?.toast({ tone: 'success', title: 'Goal template deleted' });
            onClose();
          }}
        />
      )}
    </Drawer>
  );
}
