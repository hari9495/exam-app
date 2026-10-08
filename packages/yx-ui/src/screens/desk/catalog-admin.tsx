import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { ConditionBuilder } from '../../components/condition';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { RichTextEditor } from '../../components/editor';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextField } from '../../components/inputs';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { EMPTY_FORM, fromServerGroup, toServerGroup, type FormDef, type FormEffect, type FormFieldDef, type FormFieldType, type FormSectionDef, type OptionColour } from '../../lib/forms';
import { emptyRule } from '../../components/condition';
import type { Rule, RuleField } from '../../lib/rules';
import { useRun } from '../org/org-kit';
import type { ApprovalStepDef, ApproverDef, CatalogItemAdmin, CatalogItemInput, CatalogSchema, FulfilmentTaskDef, ItemDraft, ItemMedia, PickKind, PickOption } from './esm-types';
import { LivePicker, ServiceForm } from './service-form';

// Catalogue set-up for a desk (SD-2.01 … SD-2.05): items with their page, who may order them (P19 audience), the
// form (P18: sections, columns, field types, choices with colours and translations, dependent lists, formulas and
// form rules), approval steps (P03: manager, cost-centre owner, named people or a group; quorum, reminders, what
// happens when time runs out) and the fulfilment tasks for each team with its time (OLA). Save keeps a draft; Publish
// makes the next version (orders already made keep theirs).

export interface CatalogAdminProps {
  items: CatalogItemAdmin[];
  schema: CatalogSchema | null;
  onLoad: (id: string) => Promise<CatalogItemAdmin>;
  onCreate: (input: CatalogItemInput & { name: string }) => Promise<CatalogItemAdmin>;
  onSave: (item: CatalogItemAdmin, input: CatalogItemInput) => Promise<CatalogItemAdmin>;
  onPublish: (item: CatalogItemAdmin) => Promise<unknown>;
  onRetire: (item: CatalogItemAdmin) => Promise<unknown>;
  /** Colleagues by name (named approvers). */
  onFindPeople: (q: string) => Promise<PickOption[]>;
  onPick: (kind: PickKind, q: string) => Promise<PickOption[]>;
}

const STATE_TONE = { draft: 'neutral', published: 'success', retired: 'warning' } as const;
const TYPE_OPTIONS: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number (with a range)' },
  { value: 'date', label: 'Date' },
  { value: 'choice', label: 'Pick one' },
  { value: 'multi_choice', label: 'Pick any' },
  { value: 'checkbox', label: 'Tick box' },
  { value: 'email', label: 'Email address' },
  { value: 'phone', label: 'Phone number' },
  { value: 'url', label: 'Web address' },
  { value: 'person', label: 'A colleague (live list)' },
  { value: 'location', label: 'A location (live list)' },
  { value: 'cost_centre', label: 'A cost centre (live list)' },
  { value: 'formula', label: 'Worked out (formula)' },
  { value: 'separator', label: 'Heading between fields' },
];
const COLOURS: { value: OptionColour; label: string }[] = [
  { value: 'grey', label: 'Grey' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'red', label: 'Red' },
  { value: 'purple', label: 'Purple' },
];
const keyOf = (label: string, taken: Set<string>) => {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 36) || 'field';
  let k = /^[a-z]/.test(base) ? base : `f_${base}`;
  for (let i = 2; taken.has(k); i++) k = `${base.slice(0, 34)}_${i}`;
  return k;
};
let seq = 0;
const nid = (p: string) => `${p}${Date.now().toString(36)}${++seq}`;

/** The P19 fields a form offers its rules (answers), as the ConditionBuilder wants them. */
function formRuleFields(form: FormDef, extra: RuleField[] = []): RuleField[] {
  const out: RuleField[] = [];
  for (const f of form.sections.flatMap((s) => s.fields)) {
    if (f.type === 'separator') continue;
    if (f.type === 'number' || f.type === 'formula') out.push({ key: f.key, label: f.label, type: 'number' });
    else if (f.type === 'date') out.push({ key: f.key, label: f.label, type: 'date' });
    else if (f.type === 'checkbox') out.push({ key: f.key, label: f.label, type: 'choice', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] });
    else if (f.type === 'choice' || f.type === 'multi_choice') out.push({ key: f.key, label: f.label, type: 'choice', options: f.options?.map((o) => ({ value: o.value, label: o.label })) ?? [] });
    else if (f.type !== 'person' && f.type !== 'location' && f.type !== 'cost_centre') out.push({ key: f.key, label: f.label, type: 'text' });
  }
  return [...out, ...extra];
}

export function CatalogAdmin(props: CatalogAdminProps) {
  const [editing, setEditing] = useState<CatalogItemAdmin | null>(null);
  const [newName, setNewName] = useState('');
  const { busy, error, run } = useRun();
  return (
    <div className="yx-ops-stack">
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      {props.schema && props.schema.costCentresWithoutOwner.length > 0 && (
        <InlineAlert tone="info" title="Some cost centres have no owner">
          A cost-centre owner approval falls back to the desk's leads for: {props.schema.costCentresWithoutOwner.join(', ')}. Set owners under Organisation › Cost centres.
        </InlineAlert>
      )}
      <Card title="Catalogue items">
        <div className="yx-ops-row">
          <FormField label="New item name" hideLabel>
            <TextField placeholder="New item, e.g. New laptop" value={newName} onChange={setNewName} maxLength={100} />
          </FormField>
          <Button
            icon={Plus}
            disabled={!newName.trim() || busy === 'create'}
            onClick={() =>
              void run('create', async () => {
                setEditing(await props.onCreate({ name: newName.trim(), draft: { form: EMPTY_FORM, approval: [], fulfilment: [] } }));
                setNewName('');
              })
            }
          >
            Add item
          </Button>
        </div>
        {props.items.length === 0 ? (
          <EmptyState compact title="No items yet." description="Add the first thing people can order from this desk." />
        ) : (
          <ul className="yx-esm-cart">
            {props.items.map((i) => (
              <li key={i.id} className="yx-ops-row">
                <span className="yx-esm-cart__name">{i.name}</span>
                <Badge tone={STATE_TONE[i.state]}>{i.state === 'draft' ? 'Draft' : i.state === 'published' ? `Published · version ${i.currentVersion}` : 'Retired'}</Badge>
                <Button size="sm" onClick={() => void run(`load-${i.id}`, async () => setEditing(await props.onLoad(i.id)))}>
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <ItemEditor key={`${editing.id}-${editing.version}`} item={editing} {...props} onClose={() => setEditing(null)} onSaved={setEditing} />}
    </div>
  );
}

function ItemEditor(props: CatalogAdminProps & { item: CatalogItemAdmin; onClose: () => void; onSaved: (i: CatalogItemAdmin) => void }) {
  const it = props.item;
  const [name, setName] = useState(it.name);
  const [shortText, setShortText] = useState(it.shortText ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(it.categoryId);
  const [cost, setCost] = useState<number | null>(it.cost);
  const [days, setDays] = useState<number | null>(it.deliveryDays);
  const [everyone, setEveryone] = useState(!it.audience);
  const audienceFields: RuleField[] = (props.schema?.requesterFields ?? []).map((f) => ({ key: f.key, label: f.label, type: 'choice', options: f.options }));
  const [audience, setAudience] = useState<Rule>({ ...emptyRule(), conditions: fromServerGroup(it.audience, audienceFields) });
  const [draft, setDraft] = useState<ItemDraft>({ bodyHtml: it.draft.bodyHtml ?? '', media: it.draft.media ?? [], form: it.draft.form ?? EMPTY_FORM, approval: it.draft.approval ?? [], fulfilment: it.draft.fulfilment ?? [] });
  const [tab, setTab] = useState('page');
  const [preview, setPreview] = useState<Record<string, never> | null>(null);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<ItemDraft>) => setDraft({ ...draft, ...patch });
  const input = (): CatalogItemInput => ({ name: name.trim(), shortText: shortText.trim(), categoryId, cost, deliveryDays: days, ...(everyone ? { everyone: true } : { audience: toServerGroup(audience.conditions) }), draft });
  const save = () => run('save', async () => props.onSaved(await props.onSave(it, input())));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && props.onClose()}
      title={`Edit ${it.name}`}
      subtitle={it.state === 'published' ? `Published version ${it.currentVersion}. Your changes are a draft until you publish them.` : 'Draft: requesters do not see it yet.'}
      size="full"
      footer={
        <>
          <Button onClick={props.onClose}>Close</Button>
          {it.state !== 'retired' && it.state === 'published' && (
            <Button variant="danger" disabled={Boolean(busy)} onClick={() => void run('retire', async () => props.onSaved(((await props.onRetire(it)) as CatalogItemAdmin) ?? it))}>
              Retire
            </Button>
          )}
          <Button disabled={Boolean(busy)} onClick={() => void save()}>
            Save draft
          </Button>
          <Button
            variant="primary"
            disabled={Boolean(busy)}
            onClick={() =>
              void run('publish', async () => {
                const saved = await props.onSave(it, input());
                props.onSaved(((await props.onPublish(saved)) as CatalogItemAdmin) ?? saved);
              })
            }
          >
            Save and publish
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && (
          <InlineAlert tone="danger" title="Fix this first">
            {error}
          </InlineAlert>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Item set-up">
            <TabsTrigger value="page">Page</TabsTrigger>
            <TabsTrigger value="audience">Who can order</TabsTrigger>
            <TabsTrigger value="form">Form</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="fulfil">Tasks for teams</TabsTrigger>
          </TabsList>
          <TabsContent value="page">
            <div className="yx-ops-stack">
              <FormField label="Name" required>
                <TextField value={name} onChange={setName} maxLength={100} />
              </FormField>
              <FormField label="One line about it" optional>
                <TextField value={shortText} onChange={setShortText} maxLength={300} />
              </FormField>
              <div className="yx-ops-row">
                <FormField label="Category" optional>
                  <Select options={(props.schema?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))} value={categoryId} onChange={setCategoryId} clearable />
                </FormField>
                <FormField label="Cost (₹)" optional>
                  <NumberField value={cost} onChange={setCost} min={0} decimals />
                </FormField>
                <FormField label="Working days to deliver" optional>
                  <NumberField value={days} onChange={setDays} min={0} max={365} />
                </FormField>
              </div>
              <FormField label="What it is and how it works">
                <RichTextEditor value={draft.bodyHtml ?? ''} onChange={(bodyHtml) => set({ bodyHtml })} mergeFields={[]} placeholder="Describe the item" />
              </FormField>
              <MediaEditor media={draft.media ?? []} onChange={(media) => set({ media })} />
            </div>
          </TabsContent>
          <TabsContent value="audience">
            <div className="yx-ops-stack">
              <Segment label="Who can order it" options={[{ value: 'all', label: 'Everyone' }, { value: 'some', label: 'Only some people' }]} value={everyone ? 'all' : 'some'} onChange={(v) => setEveryone(v === 'all')} />
              {!everyone && <ConditionBuilder schema={{ triggers: [], fields: audienceFields, recipients: [] }} value={audience} onChange={setAudience} parts={['if']} />}
            </div>
          </TabsContent>
          <TabsContent value="form">
            <div className="yx-ops-stack">
              <FormBuilder form={draft.form ?? EMPTY_FORM} onChange={(form) => set({ form })} questionnaires={props.schema?.questionnaires ?? []} />
              <Button onClick={() => setPreview(preview ? null : {})}>{preview ? 'Hide the preview' : 'Preview the form'}</Button>
              {preview && (
                <Card title="Preview">
                  <ServiceForm form={draft.form ?? EMPTY_FORM} values={preview} onChange={(v) => setPreview(v as Record<string, never>)} onPick={props.onPick} />
                </Card>
              )}
            </div>
          </TabsContent>
          <TabsContent value="approvals">
            <StepsEditor steps={draft.approval ?? []} onChange={(approval) => set({ approval })} form={draft.form ?? EMPTY_FORM} schema={props.schema} onFindPeople={props.onFindPeople} />
          </TabsContent>
          <TabsContent value="fulfil">
            <TasksEditor tasks={draft.fulfilment ?? []} onChange={(fulfilment) => set({ fulfilment })} groups={props.schema?.groups ?? []} />
          </TabsContent>
        </Tabs>
      </div>
    </Drawer>
  );
}

function MediaEditor({ media, onChange }: { media: ItemMedia[]; onChange: (m: ItemMedia[]) => void }) {
  const setAt = (i: number, patch: Partial<ItemMedia>) => onChange(media.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <Card title="Pictures, videos and documents (links)">
      {media.map((m, i) => (
        <div key={i} className="yx-ops-row">
          <Select aria-label={`Link ${i + 1} kind`} options={[{ value: 'image', label: 'Picture' }, { value: 'video', label: 'Video' }, { value: 'document', label: 'Document' }]} value={m.kind} onChange={(kind) => kind && setAt(i, { kind: kind as ItemMedia['kind'] })} />
          <TextField aria-label={`Link ${i + 1} title`} placeholder="Title" value={m.title} onChange={(title) => setAt(i, { title })} maxLength={100} />
          <TextField aria-label={`Link ${i + 1} address`} placeholder="https://" value={m.url} onChange={(url) => setAt(i, { url })} maxLength={500} />
          <IconButton icon={Trash2} label={`Remove link ${i + 1}`} onClick={() => onChange(media.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="sm" icon={Plus} disabled={media.length >= 12} onClick={() => onChange([...media, { kind: 'document', title: '', url: '' }])}>
        Add a link
      </Button>
    </Card>
  );
}

// ------------------------------------------------------------------ the form builder (P18)

export function FormBuilder({ form, onChange, questionnaires = [] }: { form: FormDef; onChange: (f: FormDef) => void; questionnaires?: { id: string; name: string }[] }) {
  const [lib, setLib] = useState<string | null>(null);
  const keys = useMemo(() => new Set(form.sections.flatMap((s) => s.fields.map((f) => f.key))), [form]);
  const setSection = (i: number, s: FormSectionDef) => onChange({ ...form, sections: form.sections.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, d: -1 | 1) => {
    const next = [...form.sections];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange({ ...form, sections: next });
  };
  return (
    <div className="yx-ops-stack">
      {form.sections.map((s, i) => (
        <Card
          key={s.id}
          title={s.questionnaireId ? `From the question library: ${questionnaires.find((q) => q.id === s.questionnaireId)?.name ?? 'a question set'}` : s.title || `Section ${i + 1}`}
          actions={
            <span className="yx-ops-row">
              <IconButton icon={ArrowUp} label={`Move section ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon={ArrowDown} label={`Move section ${i + 1} down`} disabled={i === form.sections.length - 1} onClick={() => move(i, 1)} />
              <IconButton icon={Trash2} label={`Remove section ${i + 1}`} onClick={() => onChange({ ...form, sections: form.sections.filter((_, j) => j !== i) })} />
            </span>
          }
        >
          {s.questionnaireId ? (
            <p className="yx-ops-muted">Its questions are copied in when you publish, so later changes to the set reach new versions only.</p>
          ) : (
            <SectionEditor section={s} onChange={(x) => setSection(i, x)} taken={keys} form={form} />
          )}
        </Card>
      ))}
      <div className="yx-ops-row">
        <Button icon={Plus} onClick={() => onChange({ ...form, sections: [...form.sections, { id: nid('s'), title: '', columns: 1, fields: [] }] })}>
          Add a section
        </Button>
        {questionnaires.length > 0 && (
          <>
            <Select aria-label="Question set" options={questionnaires.map((q) => ({ value: q.id, label: q.name }))} value={lib} onChange={setLib} placeholder="From the question library" />
            <Button disabled={!lib} onClick={() => lib && (onChange({ ...form, sections: [...form.sections, { id: nid('s'), columns: 1, fields: [], questionnaireId: lib }] }), setLib(null))}>
              Add the set
            </Button>
          </>
        )}
      </div>
      <FormRulesEditor form={form} onChange={onChange} />
    </div>
  );
}

function SectionEditor({ section: s, onChange, taken, form }: { section: FormSectionDef; onChange: (s: FormSectionDef) => void; taken: Set<string>; form: FormDef }) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FormFieldType>('text');
  const setField = (i: number, f: FormFieldDef) => onChange({ ...s, fields: s.fields.map((x, j) => (j === i ? f : x)) });
  return (
    <div className="yx-ops-stack">
      <div className="yx-ops-row">
        <FormField label="Section title" optional>
          <TextField value={s.title ?? ''} onChange={(title) => onChange({ ...s, title })} maxLength={120} />
        </FormField>
        <Segment label="Columns" options={[{ value: 1, label: 'One column' }, { value: 2, label: 'Two columns' }]} value={s.columns} onChange={(columns) => onChange({ ...s, columns })} />
      </div>
      {s.fields.map((f, i) => (
        <FieldEditor key={f.key} field={f} onChange={(x) => setField(i, x)} onRemove={() => onChange({ ...s, fields: s.fields.filter((_, j) => j !== i) })} form={form} />
      ))}
      <div className="yx-ops-row">
        <FormField label="New question" hideLabel>
          <TextField placeholder="New question, e.g. Which model?" value={label} onChange={setLabel} maxLength={120} />
        </FormField>
        <Select aria-label="Kind of answer" options={TYPE_OPTIONS} value={type} onChange={(v) => v && setType(v)} />
        <Button
          icon={Plus}
          disabled={!label.trim()}
          onClick={() => {
            const f: FormFieldDef = { key: keyOf(label, taken), type, label: label.trim(), ...(type === 'choice' || type === 'multi_choice' ? { options: [{ value: 'option_1', label: 'Option 1' }] } : {}), ...(type === 'formula' ? { formula: { op: 'add', args: [] } } : {}) };
            onChange({ ...s, fields: [...s.fields, f] });
            setLabel('');
          }}
        >
          Add question
        </Button>
      </div>
    </div>
  );
}

function FieldEditor({ field: f, onChange, onRemove, form }: { field: FormFieldDef; onChange: (f: FormFieldDef) => void; onRemove: () => void; form: FormDef }) {
  const all = form.sections.flatMap((s) => s.fields);
  const parents = all.filter((x) => x.type === 'choice' && x.key !== f.key);
  const numeric = all.filter((x) => x.key !== f.key && (x.type === 'number' || x.type === 'date'));
  const choice = f.type === 'choice' || f.type === 'multi_choice';
  const setOption = (i: number, patch: Partial<NonNullable<FormFieldDef['options']>[number]>) => onChange({ ...f, options: (f.options ?? []).map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  return (
    <fieldset className="yx-esm-field-editor">
      <legend>
        {f.label} <span className="yx-ops-muted">({TYPE_OPTIONS.find((t) => t.value === f.type)?.label}, key {f.key})</span>
      </legend>
      <div className="yx-ops-row">
        <FormField label="Question">
          <TextField value={f.label} onChange={(label) => onChange({ ...f, label })} maxLength={120} />
        </FormField>
        <FormField label="In Hindi" optional>
          <TextField value={f.labels?.hi ?? ''} onChange={(hi) => onChange({ ...f, labels: { ...f.labels, hi: hi || undefined } })} maxLength={120} />
        </FormField>
        <FormField label="In Tamil" optional>
          <TextField value={f.labels?.ta ?? ''} onChange={(ta) => onChange({ ...f, labels: { ...f.labels, ta: ta || undefined } })} maxLength={120} />
        </FormField>
        <FormField label="In Telugu" optional>
          <TextField value={f.labels?.te ?? ''} onChange={(te) => onChange({ ...f, labels: { ...f.labels, te: te || undefined } })} maxLength={120} />
        </FormField>
        <IconButton icon={Trash2} label={`Remove ${f.label}`} onClick={onRemove} />
      </div>
      <div className="yx-ops-row">
        {f.type !== 'separator' && f.type !== 'formula' && <Checkbox label="Must be answered" checked={Boolean(f.required)} onChange={(required) => onChange({ ...f, required: required || undefined })} />}
        {f.type !== 'separator' && <Checkbox label="Sensitive (approvers do not see it)" checked={Boolean(f.sensitive)} onChange={(sensitive) => onChange({ ...f, sensitive: sensitive || undefined })} />}
        <Checkbox label="Full width" checked={f.width === 'full'} onChange={(w) => onChange({ ...f, width: w ? 'full' : undefined })} />
        {(f.type === 'number' || f.type === 'text') && (
          <>
            <FormField label={f.type === 'number' ? 'Smallest' : 'Fewest letters'} optional>
              <NumberField value={f.min ?? null} onChange={(min) => onChange({ ...f, min: min ?? undefined })} decimals={f.type === 'number'} />
            </FormField>
            <FormField label={f.type === 'number' ? 'Largest' : 'Most letters'} optional>
              <NumberField value={f.max ?? null} onChange={(max) => onChange({ ...f, max: max ?? undefined })} decimals={f.type === 'number'} />
            </FormField>
          </>
        )}
      </div>
      {f.type !== 'separator' && f.type !== 'formula' && (
        <FormField label="Help under the question" optional>
          <TextField value={f.help ?? ''} onChange={(help) => onChange({ ...f, help: help || undefined })} maxLength={300} />
        </FormField>
      )}
      {choice && (
        <div className="yx-ops-stack">
          {(f.options ?? []).map((o, i) => (
            <div key={i} className="yx-ops-row">
              <TextField aria-label={`Choice ${i + 1}`} value={o.label} onChange={(label) => setOption(i, { label, value: o.value.startsWith('option_') ? keyOf(label, new Set((f.options ?? []).filter((_, j) => j !== i).map((x) => x.value))) : o.value })} maxLength={120} />
              <Select aria-label={`Choice ${i + 1} colour`} options={COLOURS} value={o.colour ?? null} onChange={(colour) => setOption(i, { colour: (colour ?? undefined) as OptionColour | undefined })} placeholder="No colour" clearable />
              <IconButton icon={Trash2} label={`Remove choice ${o.label}`} disabled={(f.options ?? []).length <= 1} onClick={() => onChange({ ...f, options: (f.options ?? []).filter((_, j) => j !== i) })} />
            </div>
          ))}
          <Button size="sm" icon={Plus} onClick={() => onChange({ ...f, options: [...(f.options ?? []), { value: `option_${(f.options?.length ?? 0) + 1}_${seq++}`, label: `Option ${(f.options?.length ?? 0) + 1}` }] })}>
            Add a choice
          </Button>
        </div>
      )}
      {f.type === 'choice' && parents.length > 0 && (
        <div className="yx-ops-stack">
          <FormField label="Choices depend on the answer to" optional>
            <Select options={parents.map((p) => ({ value: p.key, label: p.label }))} value={f.dependsOn ?? null} onChange={(dependsOn) => onChange({ ...f, dependsOn: dependsOn ?? undefined, optionsBy: dependsOn ? {} : undefined })} clearable />
          </FormField>
          {f.dependsOn &&
            (parents.find((p) => p.key === f.dependsOn)?.options ?? []).map((po) => (
              <FormField key={po.value} label={`When "${po.label}" is chosen, offer`}>
                <MultiSelect options={(f.options ?? []).map((o) => ({ value: o.value, label: o.label }))} value={f.optionsBy?.[po.value] ?? []} onChange={(v) => onChange({ ...f, optionsBy: { ...f.optionsBy, [po.value]: v } })} />
              </FormField>
            ))}
        </div>
      )}
      {f.type === 'formula' && (
        <div className="yx-ops-row">
          <Select
            aria-label="What the formula does"
            options={[
              { value: 'add', label: 'Add up' },
              { value: 'mul', label: 'Multiply' },
              { value: 'sub', label: 'Take away' },
              { value: 'div', label: 'Divide' },
              { value: 'days_between', label: 'Days between two dates' },
            ]}
            value={f.formula?.op ?? 'add'}
            onChange={(op) => op && onChange({ ...f, formula: { op: op as 'add', args: f.formula?.args ?? [] } })}
          />
          <MultiSelect aria-label="From these answers" options={numeric.map((x) => ({ value: x.key, label: x.label }))} value={(f.formula?.args ?? []).flatMap((a) => ('field' in a ? [a.field] : []))} onChange={(v) => onChange({ ...f, formula: { op: f.formula?.op ?? 'add', args: v.map((field) => ({ field })) } })} placeholder="From these answers" />
        </div>
      )}
    </fieldset>
  );
}

function FormRulesEditor({ form, onChange }: { form: FormDef; onChange: (f: FormDef) => void }) {
  const fields = formRuleFields(form);
  const targets = form.sections.flatMap((s) => s.fields).map((f) => ({ value: f.key, label: f.label }));
  const setRule = (i: number, r: FormDef['rules'][number]) => onChange({ ...form, rules: form.rules.map((x, j) => (j === i ? r : x)) });
  return (
    <Card title="Form rules (show, hide or require questions by earlier answers)">
      {form.rules.length === 0 && <p className="yx-ops-muted">No rules. Every question shows.</p>}
      {form.rules.map((r, i) => (
        <div key={r.id} className="yx-ops-stack yx-esm-rule">
          <ConditionBuilder schema={{ triggers: [], fields, recipients: [] }} value={{ ...emptyRule(), conditions: fromServerGroup(r.when, fields) }} onChange={(x) => setRule(i, { ...r, when: toServerGroup(x.conditions) })} parts={['if']} showSummary={false} />
          {r.then.map((e, k) => (
            <div key={k} className="yx-ops-row">
              <span>Then</span>
              <Select
                aria-label={`Rule ${i + 1} step ${k + 1}`}
                options={[
                  { value: 'show', label: 'Show' },
                  { value: 'hide', label: 'Hide' },
                  { value: 'require', label: 'Make it a must' },
                  { value: 'lock', label: 'Lock' },
                  { value: 'set', label: 'Fill in' },
                ]}
                value={e.action}
                onChange={(action) => action && setRule(i, { ...r, then: r.then.map((x, j) => (j === k ? { ...x, action: action as FormEffect['action'] } : x)) })}
              />
              <Select aria-label={`Rule ${i + 1} step ${k + 1} question`} options={targets} value={e.field} onChange={(field) => field && setRule(i, { ...r, then: r.then.map((x, j) => (j === k ? { ...x, field } : x)) })} />
              {e.action === 'set' && <TextField aria-label={`Rule ${i + 1} step ${k + 1} value`} value={String(e.value ?? '')} onChange={(value) => setRule(i, { ...r, then: r.then.map((x, j) => (j === k ? { ...x, value } : x)) })} />}
              <IconButton icon={Trash2} label={`Remove rule ${i + 1} step ${k + 1}`} onClick={() => setRule(i, { ...r, then: r.then.filter((_, j) => j !== k) })} />
            </div>
          ))}
          <div className="yx-ops-row">
            <Button size="sm" icon={Plus} disabled={!targets.length} onClick={() => setRule(i, { ...r, then: [...r.then, { action: 'show', field: targets[0].value }] })}>
              Add a step
            </Button>
            <Button size="sm" onClick={() => onChange({ ...form, rules: form.rules.filter((_, j) => j !== i) })}>
              Remove this rule
            </Button>
          </div>
        </div>
      ))}
      <Button size="sm" icon={Plus} disabled={!targets.length} onClick={() => onChange({ ...form, rules: [...form.rules, { id: nid('r'), when: { id: nid('g'), join: 'and', items: [] }, then: [{ action: 'show', field: targets[0].value }] }] })}>
        Add a form rule
      </Button>
    </Card>
  );
}

// ------------------------------------------------------------------ approval steps (P03)

function StepsEditor({ steps, onChange, form, schema, onFindPeople }: { steps: ApprovalStepDef[]; onChange: (s: ApprovalStepDef[]) => void; form: FormDef; schema: CatalogSchema | null; onFindPeople: CatalogAdminProps['onFindPeople'] }) {
  const ccFields = form.sections.flatMap((s) => s.fields).filter((f) => f.type === 'cost_centre');
  const setAt = (i: number, patch: Partial<ApprovalStepDef>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const pick = (_k: PickKind, q: string) => onFindPeople(q);
  return (
    <div className="yx-ops-stack">
      {steps.length === 0 && <EmptyState compact title="No approval needed." description="Add a step if someone must say yes first." />}
      {steps.map((s, i) => {
        const a = s.approvers[0] as ApproverDef | undefined;
        return (
          <Card key={i} title={`Step ${i + 1}: ${s.name || 'unnamed'}`} actions={<IconButton icon={Trash2} label={`Remove step ${i + 1}`} onClick={() => onChange(steps.filter((_, j) => j !== i))} />}>
            <div className="yx-ops-stack">
              <FormField label="Name of the step">
                <TextField value={s.name} onChange={(name) => setAt(i, { name })} maxLength={80} />
              </FormField>
              <FormField label="Who approves">
                <Select
                  options={[
                    { value: 'manager', label: "The requester's manager" },
                    { value: 'cost_centre_owner', label: 'The owner of the cost centre in the form' },
                    { value: 'users', label: 'Named people' },
                    { value: 'user_group', label: 'A group' },
                  ]}
                  value={a?.kind ?? null}
                  onChange={(kind) =>
                    setAt(i, {
                      approvers: [kind === 'manager' ? { kind: 'manager', level: 1 } : kind === 'cost_centre_owner' ? { kind: 'cost_centre_owner', field: ccFields[0]?.key ?? '' } : kind === 'users' ? { kind: 'users', userIds: [] } : { kind: 'user_group', groupId: schema?.userGroups[0]?.id ?? '' }],
                    })
                  }
                />
              </FormField>
              {a?.kind === 'manager' && <Segment label="Which manager" options={[{ value: 1, label: 'Their manager' }, { value: 2, label: "Manager's manager" }]} value={a.level ?? 1} onChange={(level) => setAt(i, { approvers: [{ kind: 'manager', level }] })} />}
              {a?.kind === 'cost_centre_owner' &&
                (ccFields.length ? (
                  <FormField label="Cost centre question">
                    <Select options={ccFields.map((f) => ({ value: f.key, label: f.label }))} value={a.field} onChange={(field) => field && setAt(i, { approvers: [{ kind: 'cost_centre_owner', field }] })} />
                  </FormField>
                ) : (
                  <InlineAlert tone="warning" title="Add a cost centre question to the form first" />
                ))}
              {a?.kind === 'users' && <NamedPeople ids={a.userIds} onChange={(userIds) => setAt(i, { approvers: [{ kind: 'users', userIds }] })} onPick={pick} />}
              {a?.kind === 'user_group' && (
                <FormField label="Group">
                  <Select options={(schema?.userGroups ?? []).map((g) => ({ value: g.id, label: g.name }))} value={a.groupId || null} onChange={(groupId) => groupId && setAt(i, { approvers: [{ kind: 'user_group', groupId }] })} />
                </FormField>
              )}
              <Segment
                label="How many must approve"
                options={[
                  { value: 'any', label: 'Any one' },
                  { value: 'all', label: 'All' },
                  { value: 'count', label: 'At least' },
                  { value: 'percent', label: 'A share' },
                ]}
                value={s.mode}
                onChange={(mode) => setAt(i, { mode, count: mode === 'count' ? (s.count ?? 2) : undefined, percent: mode === 'percent' ? (s.percent ?? 50) : undefined })}
              />
              {s.mode === 'count' && (
                <FormField label="How many">
                  <NumberField value={s.count ?? 2} onChange={(n) => setAt(i, { count: n ?? 1 })} min={1} max={25} />
                </FormField>
              )}
              {s.mode === 'percent' && (
                <FormField label="Share (%)">
                  <NumberField value={s.percent ?? 50} onChange={(n) => setAt(i, { percent: n ?? 50 })} min={1} max={100} />
                </FormField>
              )}
              <div className="yx-ops-row">
                <FormField label="Remind after (hours)" optional>
                  <NumberField value={s.remindAfterHours ?? null} onChange={(n) => setAt(i, { remindAfterHours: n ?? undefined })} min={1} max={720} />
                </FormField>
                <FormField label="Time to answer (hours)" optional>
                  <NumberField value={s.timeoutHours ?? null} onChange={(n) => setAt(i, { timeoutHours: n ?? undefined, onTimeout: n ? (s.onTimeout ?? 'escalate') : undefined })} min={1} max={720} />
                </FormField>
              </div>
              {s.timeoutHours ? (
                <Segment
                  label="When time runs out"
                  options={[
                    { value: 'escalate', label: 'Send to their manager' },
                    { value: 'approve', label: 'Approve' },
                    { value: 'reject', label: 'Do not approve' },
                  ]}
                  value={s.onTimeout ?? 'escalate'}
                  onChange={(onTimeout) => setAt(i, { onTimeout })}
                />
              ) : null}
              <Checkbox label="One reject stops the request" checked={(s.rejectOn ?? 'one') === 'one'} onChange={(c) => setAt(i, { rejectOn: c ? 'one' : 'quorum_lost' })} />
              <Checkbox label="The requester may approve their own request (it is recorded)" checked={s.selfApproval === 'allowed'} onChange={(c) => setAt(i, { selfApproval: c ? 'allowed' : 'never' })} />
            </div>
          </Card>
        );
      })}
      <Button icon={Plus} disabled={steps.length >= 6} onClick={() => onChange([...steps, { name: steps.length ? 'Next approval' : 'Manager', approvers: [{ kind: 'manager', level: 1 }], mode: 'any' }])}>
        Add an approval step
      </Button>
    </div>
  );
}

function NamedPeople({ ids, onChange, onPick }: { ids: string[]; onChange: (ids: string[]) => void; onPick: (k: PickKind, q: string) => Promise<PickOption[]> }) {
  const [names, setNames] = useState<Record<string, string>>({});
  return (
    <div className="yx-ops-stack">
      {ids.map((id) => (
        <div key={id} className="yx-ops-row">
          <span>{names[id] ?? 'Chosen colleague'}</span>
          <IconButton icon={Trash2} label={`Remove ${names[id] ?? 'colleague'}`} onClick={() => onChange(ids.filter((x) => x !== id))} />
        </div>
      ))}
      <FormField label="Add a colleague">
        <LivePicker
          kind="people"
          value={null}
          label="Colleague"
          onPick={async (k, q) => {
            const found = await onPick(k, q);
            setNames((n) => ({ ...n, ...Object.fromEntries(found.map((f) => [f.id, f.label])) }));
            return found;
          }}
          onChange={(id) => id && !ids.includes(id) && onChange([...ids, id].slice(0, 25))}
        />
      </FormField>
    </div>
  );
}

function TasksEditor({ tasks, onChange, groups }: { tasks: FulfilmentTaskDef[]; onChange: (t: FulfilmentTaskDef[]) => void; groups: { id: string; name: string }[] }) {
  const setAt = (i: number, patch: Partial<FulfilmentTaskDef>) => onChange(tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div className="yx-ops-stack">
      <p className="yx-ops-muted">After approval, each line becomes a task for its team, due within its time. When all are done, the item is delivered.</p>
      {tasks.map((t, i) => (
        <div key={i} className="yx-ops-row">
          <FormField label={`Task ${i + 1}`}>
            <TextField value={t.title} onChange={(title) => setAt(i, { title })} maxLength={200} />
          </FormField>
          <FormField label="Team">
            <Select options={groups.map((g) => ({ value: g.id, label: g.name }))} value={t.groupId || null} onChange={(groupId) => groupId && setAt(i, { groupId })} />
          </FormField>
          <FormField label="Time (hours)" optional>
            <NumberField value={t.olaHours ?? null} onChange={(n) => setAt(i, { olaHours: n ?? undefined })} min={1} max={720} />
          </FormField>
          <IconButton icon={Trash2} label={`Remove task ${i + 1}`} onClick={() => onChange(tasks.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button icon={Plus} disabled={tasks.length >= 10 || !groups.length} onClick={() => onChange([...tasks, { title: '', groupId: groups[0]?.id ?? '' }])}>
        Add a task
      </Button>
    </div>
  );
}
