import { useState } from 'react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Badge } from '../../components/display';
import { FormField, FormSection, type FormErrorItem, useSaveErrors } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { MenuItem } from '../../components/menu';
import { useToast } from '../../components/notify';
import { Card } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { EditorDrawer, useConfirm, useRun } from '../org/org-kit';
import { ConsolePage, day } from './console-kit';
import type { LoadState } from './types';

/** Who an entry is for (answer 943; the tours' roles, answer 944). */
export const NEWS_AUDIENCES = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'employee', label: 'Employees' },
  { value: 'manager', label: 'Managers' },
  { value: 'hr', label: 'HR' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'admin', label: 'System Admins' },
] as const;
export type NewsAudience = (typeof NEWS_AUDIENCES)[number]['value'];

export interface NewsEntryRow {
  id: string;
  title: string;
  body: string;
  products: string[];
  audiences: string[];
  publishOn: string;
  state: 'published' | 'scheduled' | 'withdrawn';
  version: number;
}
export interface NewsInput {
  title: string;
  body: string;
  products: string[];
  audiences: string[];
  publishOn: string;
}

const STATE: Record<NewsEntryRow['state'], { label: string; tone: 'success' | 'info' | 'neutral' }> = { published: { label: 'Published', tone: 'success' }, scheduled: { label: 'Planned', tone: 'info' }, withdrawn: { label: 'Withdrawn', tone: 'neutral' } };
const realDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** The request body, or what to fix (the API checks again). */
export function newsInput(d: NewsInput): { input: NewsInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  const title = d.title.trim();
  const body = d.body.trim();
  if (title.length < 3) errors.push({ fieldId: 'wn-title', message: 'Write a title of at least 3 characters' });
  else if (/[<>]/.test(title)) errors.push({ fieldId: 'wn-title', message: 'Write the title without < or >' });
  if (!body) errors.push({ fieldId: 'wn-body', message: 'Write what changed' });
  else if (/[<>]/.test(body)) errors.push({ fieldId: 'wn-body', message: 'Write the text without < or >' });
  if (!d.products.length) errors.push({ fieldId: 'wn-products', message: 'Choose at least one product' });
  if (!d.audiences.length) errors.push({ fieldId: 'wn-for', message: 'Choose who it is for' });
  if (!realDate(d.publishOn)) errors.push({ fieldId: 'wn-on', message: 'Give the date as YYYY-MM-DD' });
  return errors.length ? { input: null, errors } : { input: { title, body, products: d.products, audiences: d.audiences, publishOn: d.publishOn }, errors };
}

/** A tick list; the group carries the field id, so the error summary's link lands on it. */
function Ticks({ id, label, options, value, onChange }: { id: string; label: string; options: readonly { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div id={id} tabIndex={-1} className="yx-auth__stack" role="group" aria-label={label}>
      {options.map((o) => (
        <Checkbox key={o.value} id={`${id}-${o.value}`} label={o.label} checked={value.includes(o.value)} onChange={(on) => onChange(on ? [...value, o.value] : value.filter((v) => v !== o.value))} />
      ))}
    </div>
  );
}

function EntryDrawer({ entry, products, today, onClose, onSave }: { entry: NewsEntryRow | null; products: { code: string; name: string }[]; today: string; onClose: () => void; onSave: (input: NewsInput) => Promise<void> }) {
  const [draft, setDraft] = useState<NewsInput>(entry ? { title: entry.title, body: entry.body, products: entry.products, audiences: entry.audiences, publishOn: entry.publishOn } : { title: '', body: '', products: products.length === 1 ? [products[0]!.code] : [], audiences: [], publishOn: today });
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<NewsInput>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const { input, errors } = newsInput(draft);
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title={entry ? 'Change entry' : "New What's new entry"}
      subtitle="People see it in Help › What's new from the publish date."
      errors={saveErrors.shownErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel={entry ? 'Save changes' : 'Add entry'}
      onSave={() => {
        if (!input) return saveErrors.reveal();
        void run('save', () => onSave(input)).then((ok) => ok && onClose());
      }}
    >
      <FormSection title="What changed" description="Plain words for the people who use it. No links or formatting.">
        <FormField id="wn-title" label="Title" required error={errorOf('wn-title')}>
          <TextField value={draft.title} onChange={(title) => set({ title })} maxLength={120} />
        </FormField>
        <FormField id="wn-body" label="Text" required helper="Up to 1,000 characters." error={errorOf('wn-body')}>
          <TextArea value={draft.body} onChange={(body) => set({ body })} rows={4} maxLength={1000} />
        </FormField>
      </FormSection>
      <FormSection title="Who sees it" description="Only companies that use one of the products, and only the people in the chosen groups.">
        <FormField id="wn-products" label="Products" required error={errorOf('wn-products')}>
          <Ticks id="wn-products" label="Products" options={products.map((p) => ({ value: p.code, label: p.name }))} value={draft.products} onChange={(products) => set({ products })} />
        </FormField>
        <FormField id="wn-for" label="For" required error={errorOf('wn-for')}>
          <Ticks id="wn-for" label="For" options={NEWS_AUDIENCES} value={draft.audiences} onChange={(audiences) => set({ audiences })} />
        </FormField>
        <FormField id="wn-on" label="Publish on" required helper="Format: YYYY-MM-DD. A later date keeps it planned until then." error={errorOf('wn-on')}>
          <TextField value={draft.publishOn} onChange={(publishOn) => set({ publishOn: publishOn.trim() })} maxLength={10} inputMode="numeric" />
        </FormField>
      </FormSection>
    </EditorDrawer>
  );
}

export interface WhatsNewConsoleScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entries: NewsEntryRow[];
  products: { code: string; name: string }[];
  /** Today in India (YYYY-MM-DD). */
  today: string;
  canManage: boolean;
  onCreate: (input: NewsInput) => Promise<void>;
  onUpdate: (id: string, input: NewsInput & { version: number }) => Promise<void>;
  onWithdraw: (id: string) => Promise<void>;
  /** Story: the new-entry drawer open. */
  defaultNew?: boolean;
}

/** Console › What's new (answer 943): YukthiX staff write the entries people see in Help › What's new. */
export function WhatsNewConsoleScreen(props: WhatsNewConsoleScreenProps) {
  const [editing, setEditing] = useState<{ entry: NewsEntryRow | null; key: number } | null>(props.defaultNew ? { entry: null, key: 0 } : null);
  const [dialog, ask] = useConfirm();
  const { toast } = useToast();
  const names = new Map(props.products.map((p) => [p.code, p.name]));
  const audience = new Map<string, string>(NEWS_AUDIENCES.map((a) => [a.value, a.label]));
  const columns: TableColumn<NewsEntryRow>[] = [
    { key: 'title', header: 'Title', value: (e) => e.title, width: 280, hideable: false },
    { key: 'products', header: 'Products', value: (e) => e.products.map((p) => names.get(p) ?? p).join(', '), width: 180 },
    { key: 'for', header: 'For', value: (e) => e.audiences.map((a) => audience.get(a) ?? a).join(', '), width: 200 },
    { key: 'on', header: 'Publish on', value: (e) => e.publishOn, render: (e) => day(e.publishOn), width: 130 },
    { key: 'state', header: 'State', value: (e) => e.state, render: (e) => <Badge tone={STATE[e.state].tone}>{STATE[e.state].label}</Badge>, width: 120 },
  ];
  const save = async (input: NewsInput) => {
    const entry = editing?.entry;
    if (entry) await props.onUpdate(entry.id, { ...input, version: entry.version });
    else await props.onCreate(input);
    toast({ tone: 'success', title: entry ? 'Entry changed' : 'Entry added', description: input.publishOn > props.today ? `People see it from ${day(input.publishOn)}.` : 'People see it in Help now.' });
  };
  return (
    <ConsolePage crumb="What's new" title="What's new" description="Updates people see in Help › What's new, for their role and the products their company uses." state={props.state} onRetry={props.onRetry} what="the entries">
      <Card title="Entries" actions={props.canManage ? <Button onClick={() => setEditing({ entry: null, key: Date.now() })}>New entry</Button> : undefined}>
        <div className="yx-auth__stack">
          <Text tone="secondary">Every change is kept in the platform audit log. A withdrawn entry leaves Help at once.</Text>
          <DataTable
            label="What's new entries"
            columns={columns}
            rows={props.entries}
            getRowId={(e) => e.id}
            rowNoun={['entry', 'entries']}
            cardSummary
            rowActions={
              props.canManage
                ? (e) =>
                    e.state === 'withdrawn' ? null : (
                      <>
                        <MenuItem onSelect={() => setEditing({ entry: e, key: Date.now() })}>Change entry</MenuItem>
                        <MenuItem destructive onSelect={() => ask({ title: `Withdraw "${e.title}"?`, consequence: 'It leaves Help › What’s new for everyone at once. It cannot be published again; write a new entry instead.', confirmLabel: 'Withdraw entry', destructive: true, action: async () => {
                            await props.onWithdraw(e.id);
                            toast({ tone: 'success', title: 'Entry withdrawn' });
                          } })}>
                          Withdraw entry
                        </MenuItem>
                      </>
                    )
                : undefined
            }
          />
        </div>
      </Card>
      {dialog}
      {editing && <EntryDrawer key={editing.key} entry={editing.entry} products={props.products} today={props.today} onClose={() => setEditing(null)} onSave={save} />}
    </ConsolePage>
  );
}
