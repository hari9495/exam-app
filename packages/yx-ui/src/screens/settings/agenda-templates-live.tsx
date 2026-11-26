import { useState } from 'react';
import { Button } from '../../components/button';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { errorText } from '../org/org-kit';

/** GET /performance/one-on-one-templates (T2-C item 70, answer 2843): company templates, then the viewer's own. */
export interface AgendaTemplate {
  id: string;
  name: string;
  items: string[];
  company: boolean;
  mine: boolean;
  updatedAt: string;
}
export type AgendaTemplateInput = { name: string; items: string[] };

/** The agenda lines typed one a line: blanks dropped, repeats once. */
export const agendaLines = (text: string) => [...new Set(text.split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean))];

/**
 * Settings › Performance (6.3), Competencies and 1:1s: add or change a company 1:1 agenda template (HR), or delete it.
 * Picking a template on a 1:1 adds its lines to the agenda, which stays editable.
 */
export function AgendaTemplateSheet({ template, onClose, onSave, onDelete }: { template: AgendaTemplate | null; onClose: () => void; onSave: (input: AgendaTemplateInput) => Promise<unknown>; onDelete: () => Promise<unknown> }) {
  const toast = useToastIfAny();
  const [name, setName] = useState(template?.name ?? '');
  const [text, setText] = useState(template?.items.join('\n') ?? '');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lines = agendaLines(text);
  const errors = [
    ...(name.trim().length >= 2 ? [] : [{ fieldId: 'at-name', message: 'Name the template.' }]),
    ...(lines.length === 0 ? [{ fieldId: 'at-items', message: 'Write at least one agenda line.' }] : lines.length > 20 ? [{ fieldId: 'at-items', message: 'Keep it to 20 lines or fewer.' }] : []),
    ...(lines.some((l) => l.length < 2 || l.length > 500) ? [{ fieldId: 'at-items', message: 'Each line is 2 to 500 characters.' }] : []),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ name: name.trim(), items: lines });
      toast?.toast({ tone: 'success', title: '1:1 template saved' });
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
      title={template ? template.name : 'Add a 1:1 template'}
      subtitle="Managers pick it when they plan a 1:1. Its lines are added to the agenda, which both people can still change."
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
      <FormField id="at-name" label="Name" required error={v.errorOf('at-name')}>
        <TextField value={name} onChange={setName} maxLength={80} />
      </FormField>
      <FormField id="at-items" label="Agenda lines" required helper={`One a line, up to 20. ${lines.length} now.`} error={v.errorOf('at-items')}>
        <TextArea value={text} onChange={setText} rows={8} />
      </FormField>
      {deleting && template && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(false)}
          size="sm"
          title={`Delete ${template.name}?`}
          consequence="Managers no longer see it. Agendas it already filled keep their lines."
          confirmLabel="Delete template"
          destructive
          onConfirm={async () => {
            await onDelete();
            toast?.toast({ tone: 'success', title: '1:1 template deleted' });
            onClose();
          }}
        />
      )}
    </Drawer>
  );
}
