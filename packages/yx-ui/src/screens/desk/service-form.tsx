import { useEffect, useState } from 'react';
import { Badge } from '../../components/display';
import { Checkbox } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { MultiSelect, Select } from '../../components/select';
import { COLOUR_TONE, inLang, resolveForm, type AnswerValue, type Answers, type FormDef, type FormFieldDef, type FormLang } from '../../lib/forms';
import type { PickKind, PickOption } from './esm-types';

// A P18 form filled in by a requester (SD-2.01, SD-2.02, US-G-063, US-G-224): sections in one or two columns, fields
// shown, hidden, required, locked or limited by form rules as the answers change, dependent pick-lists, live-data
// pickers, read-only formula fields, coloured choices (always with their text) and labels in the reader's language.

const PICK_OF: Record<string, PickKind> = { person: 'people', location: 'locations', cost_centre: 'cost-centres' };
const pad = (n: number) => String(n).padStart(2, '0');
const toDay = (d: Date | null) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null);
const fromDay = (s: AnswerValue) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : null);

export interface ServiceFormProps {
  form: FormDef;
  values: Answers;
  onChange: (values: Answers) => void;
  /** The requester's profile (department, location …) that form rules may read. */
  requester?: Record<string, string | null>;
  lang?: FormLang;
  errors?: Record<string, string>;
  onPick: (kind: PickKind, q: string) => Promise<PickOption[]>;
  /** Names of ids already chosen (when the form is shown again). */
  names?: Record<string, string>;
  disabled?: boolean;
}

/** Search a live list (people, locations, cost centres) and choose one. */
export function LivePicker({ kind, value, onChange, label, onPick, names, disabled }: { kind: PickKind; value: string | null; onChange: (v: string | null) => void; label: string; onPick: ServiceFormProps['onPick']; names?: Record<string, string>; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PickOption[]>([]);
  const [chosen, setChosen] = useState<PickOption | null>(value && names?.[value] ? { id: value, label: names[value], detail: null } : null);
  useEffect(() => {
    const h = setTimeout(() => void onPick(kind, q.trim()).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(h);
  }, [kind, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = [...(chosen && !found.some((f) => f.id === chosen.id) ? [chosen] : []), ...found].map((o) => ({ value: o.id, label: o.label, description: o.detail ?? undefined }));
  return (
    <div className="yx-ops-row yx-esm-picker">
      <TextField aria-label={`Search ${label.toLowerCase()}`} placeholder="Type to search" value={q} onChange={setQ} disabled={disabled} size="sm" />
      <Select
        aria-label={label}
        options={options}
        value={value}
        placeholder={found.length ? 'Choose' : 'No matches yet'}
        clearable
        disabled={disabled}
        onChange={(v) => {
          setChosen(found.find((f) => f.id === v) ?? (v === chosen?.id ? chosen : null));
          onChange(v);
        }}
      />
    </div>
  );
}

function FieldInput({ f, value, set, options, locked, props }: { f: FormFieldDef; value: AnswerValue; set: (v: AnswerValue) => void; options?: string[]; locked: boolean; props: ServiceFormProps }) {
  const lang = props.lang ?? 'en';
  const disabled = props.disabled || locked;
  const opts = (f.options ?? []).filter((o) => !options || options.includes(o.value)).map((o) => ({ value: o.value, label: inLang(o, lang) }));
  const label = inLang(f, lang);
  switch (f.type) {
    case 'textarea':
      return <TextArea value={typeof value === 'string' ? value : ''} onChange={set} rows={3} maxLength={f.max ?? 4000} disabled={disabled} />;
    case 'number':
      return <NumberField value={typeof value === 'number' ? value : null} onChange={(n) => set(n)} min={f.min} max={f.max} decimals disabled={disabled} />;
    case 'date':
      return <DatePicker value={fromDay(value)} onChange={(d) => set(toDay(d))} disabled={disabled} />;
    case 'checkbox':
      return <Checkbox checked={value === true} onChange={(c) => set(c)} label={label} disabled={disabled} />;
    case 'choice':
      return (
        <Select
          options={opts}
          value={typeof value === 'string' ? value : null}
          onChange={(v) => set(v)}
          placeholder={f.dependsOn && !options?.length ? 'Answer the question above first' : 'Choose'}
          clearable={!f.required}
          disabled={disabled}
          renderOption={(o) => <ChoiceLabel field={f} value={o.value} lang={lang} />}
          renderValue={(o) => <ChoiceLabel field={f} value={o.value} lang={lang} />}
        />
      );
    case 'multi_choice':
      return <MultiSelect options={opts} value={Array.isArray(value) ? value : []} onChange={(v) => set(v)} placeholder="Choose any" disabled={disabled} />;
    case 'person':
    case 'location':
    case 'cost_centre':
      return <LivePicker kind={PICK_OF[f.type]} value={typeof value === 'string' ? value : null} onChange={set} label={label} onPick={props.onPick} names={props.names} disabled={disabled} />;
    case 'formula':
      return <output className="yx-esm-formula">{value === null || value === undefined || value === '' ? 'Worked out from your answers' : String(value)}</output>;
    case 'email':
    case 'phone':
    case 'url':
      return <TextField type={f.type === 'phone' ? 'tel' : f.type} value={typeof value === 'string' ? value : ''} onChange={set} disabled={disabled} maxLength={f.type === 'url' ? 500 : 254} />;
    default:
      return <TextField value={typeof value === 'string' ? value : ''} onChange={set} maxLength={f.max ?? 300} disabled={disabled} />;
  }
}

/** A choice with its colour shown as a badge next to the text (never colour alone, US-G-224). */
export function ChoiceLabel({ field, value, lang = 'en' }: { field: FormFieldDef; value: string; lang?: FormLang }) {
  const o = field.options?.find((x) => x.value === value);
  if (!o) return <span>{value}</span>;
  return o.colour ? <Badge tone={COLOUR_TONE[o.colour]}>{inLang(o, lang)}</Badge> : <span>{inLang(o, lang)}</span>;
}

export function ServiceForm(props: ServiceFormProps) {
  const lang = props.lang ?? 'en';
  const { state, values } = resolveForm(props.form, props.values, props.requester ?? {});
  const set = (key: string, v: AnswerValue) => {
    const next = { ...props.values, [key]: v };
    // A dependent list loses its answer when the answer it depends on changes.
    for (const f of props.form.sections.flatMap((s) => s.fields)) if (f.dependsOn === key) next[f.key] = null;
    props.onChange(next);
  };
  if (!props.form.sections.length) return <p className="yx-ops-muted">Nothing to fill in. Add it to your cart.</p>;
  return (
    <div className="yx-ops-stack">
      {props.form.sections.map((s) => {
        const shown = s.fields.filter((f) => state[f.key]?.visible || f.type === 'separator');
        if (!shown.some((f) => f.type !== 'separator')) return null;
        return (
          <fieldset key={s.id} className="yx-esm-section" data-columns={s.columns}>
            {s.title && <legend className="yx-esm-section__title">{inLang(s, lang)}</legend>}
            <div className="yx-esm-grid">
              {shown.map((f) =>
                f.type === 'separator' ? (
                  <h4 key={f.key} className="yx-esm-separator">
                    {inLang(f, lang)}
                  </h4>
                ) : (
                  <div key={f.key} className="yx-esm-cell" data-wide={f.width === 'full' || f.type === 'textarea' || undefined}>
                    {f.type === 'checkbox' ? (
                      <FormField label={inLang(f, lang)} hideLabel error={props.errors?.[f.key]} helper={f.help}>
                        <FieldInput f={f} value={values[f.key] ?? null} set={(v) => set(f.key, v)} options={state[f.key]?.options} locked={state[f.key]?.locked ?? false} props={props} />
                      </FormField>
                    ) : (
                      <FormField label={inLang(f, lang)} required={state[f.key]?.required} optional={!state[f.key]?.required && f.type !== 'formula'} error={props.errors?.[f.key]} helper={f.type === 'formula' ? 'Worked out for you' : f.help}>
                        <FieldInput f={f} value={values[f.key] ?? null} set={(v) => set(f.key, v)} options={state[f.key]?.options} locked={state[f.key]?.locked ?? false} props={props} />
                      </FormField>
                    )}
                  </div>
                ),
              )}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
