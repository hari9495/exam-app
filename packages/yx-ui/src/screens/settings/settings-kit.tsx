// Settings kit (APX-D §3): one control per SettingDef with starter / law / scope chips, legal-floor hint,
// master tables, links to bespoke editors, audit line with history, and the settings search box.
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, History, MapPin, Pencil, Plus, RotateCcw, Scale, Search, TriangleAlert, X } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button, IconButton } from '../../components/button';
import { Checkbox, RadioGroup } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { FormField } from '../../components/field';
import { Icon } from '../../components/foundations';
import { CurrencyField, NumberField, TextArea, TextField, TimeField } from '../../components/inputs';
import { MultiSelect, Select } from '../../components/select';
import { Timeline, type TimelineItem } from '../../components/timeline';
import { formatDate } from '../../lib/format';
import { TODAY } from '../_kit/data';
import { LIST_CHECKS, ON_BRAND, belowMinimum, refExample, contrastOnWhite, swatchValue, formatStamp, formatValue, highlightParts, legalHint, parseIso, showsStarter, type SearchEntry } from './settings-logic';
import type { LastChange, SettingDef, SettingValue } from './settings-types';

const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = { Active: 'success', Complete: 'success', On: 'success', Off: 'neutral', Default: 'info', Inactive: 'neutral', Archived: 'neutral' };
import './settings.css';

/** Up to 3 options, or up to 5 short ones, sit on one line. */
const radioRow = (def: SettingDef) => {
  const labels = (def.options ?? []).map((o) => def.optionLabels?.[o] ?? o);
  return labels.length <= 3 || (labels.length <= 5 && labels.every((l) => l.length <= 14));
};
const opts = (xs: string[] = [], labels?: Record<string, string>) => xs.map((x) => ({ value: x, label: labels?.[x] ?? x }));
const toIso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);

/* ---------------- Chips ---------------- */

/** Paid add-ons are available today (billed through Plan & add-ons); anything else with availability is not released yet. */
export const isAddOn = (def: SettingDef) => /add-on/i.test(def.availability ?? '') && !/wave|proposed/i.test(def.availability ?? '');

/** Starter default (D17) · Set by law (P07) · source scope · valid from (P06). Always text, never colour alone. */
export function SettingChips({ def, current }: { def: SettingDef; current: SettingValue }) {
  const chips: ReactNode[] = [];
  if (def.kind === 'law') chips.push(def.builtIn ? <Badge key="law" tone="neutral">Built-in rule</Badge> : <Badge key="law" tone="info">Set by law</Badge>);
  if (showsStarter(def, current)) chips.push(<Badge key="starter" tone="neutral" title="YukthiX starter — edit for your company">Starter default</Badge>);
  if (def.scope && def.scope !== 'Company') chips.push(<span key="scope" className="yx-set-chip">{def.scope}</span>);
  if (def.dated) chips.push(<span key="dated" className="yx-set-chip">Valid from {formatDate(parseIso(def.dated.validFrom))}</span>);
  if (def.availability) chips.push(isAddOn(def) ? <Badge key="avail" tone="info">Add-on</Badge> : <Badge key="avail" tone="neutral">Coming soon</Badge>);
  if (def.status) chips.push(<Badge key="status" tone={def.status.tone}>{def.status.text}</Badge>);
  if (!chips.length) return null;
  return <span className="yx-set-chips">{chips}</span>;
}

/** Legal floor hint, shown under every setting a statute limits (law is a floor, D17). */
export function LegalHint({ def }: { def: SettingDef }) {
  const text = legalHint(def);
  if (!text) return null;
  return (
    <span className="yx-set-legal">
      <Icon icon={Scale} />
      {text}
    </span>
  );
}

/* ---------------- One setting ---------------- */

export interface SettingFieldProps {
  def: SettingDef;
  value: SettingValue;
  onChange: (v: SettingValue) => void;
  error?: string | null;
  readOnly?: boolean;
  /** Deep link from settings search: the field is outlined and scrolled to. */
  highlighted?: boolean;
  /** Offered for settings overridden at a lower scope. */
  onResetScope?: () => void;
  /** list kind: current rows (draft). */
  rows?: string[][];
  onRowsChange?: (rows: string[][]) => void;
  /** link kind: opens the owning screen. */
  onOpenLink?: (screenId: string) => void;
  /** "Different for: …" chip chosen: switch the page to that scope. */
  onPickOverride?: (scope: string) => void;
}

export function SettingField({ def, value, onChange, error, readOnly, highlighted, onResetScope, rows, onRowsChange, onOpenLink, onPickOverride }: SettingFieldProps) {
  const wrap = (children: ReactNode) => (
    <div className="yx-set-field" id={`setting-${def.key}`} data-highlight={highlighted || undefined} data-kind={def.kind}>
      {children}
    </div>
  );

  if (def.kind === 'list') return wrap(<MasterList def={def} rows={rows ?? def.rows ?? []} onRowsChange={onRowsChange} readOnly={readOnly} />);
  if (def.kind === 'link') return wrap(<LinkedEditor def={def} onOpen={onOpenLink} />);

  const helper = (
    <>
      {def.helper && <span className="yx-set-helper">{def.helper}</span>}
      {isAddOn(def) && <span className="yx-set-helper">Paid add-on, billed through Plan & add-ons.</span>}
      {def.refPattern && typeof value === 'string' && <span className="yx-set-helper">Next number: <strong>{refExample(value)}</strong></span>}
      <LegalHint def={def} />
      {def.overrides && def.overrides.length > 0 && (
        <span className="yx-set-overrides">
          Different for:
          {def.overrides.map((o) => (
            <button key={o.scope} type="button" className="yx-set-overrides__item" onClick={() => onPickOverride?.(o.scope)}>
              {o.scope}: {formatValue(def, o.value)}
            </button>
          ))}
        </span>
      )}
      {(def.warning || def.blocked) && (
        <span className="yx-set-warn">
          <Icon icon={TriangleAlert} />
          {def.blocked ?? def.warning}
        </span>
      )}
    </>
  );
  const label = (
    <span className="yx-set-label">
      {def.label}
      <SettingChips def={def} current={value} />
    </span>
  );

  if (def.kind === 'usage') {
    const used = typeof value === 'number' ? value : 0;
    const max = def.max ?? 0;
    return wrap(
      <div className="yx-set-read">
        <span className="yx-set-read__label">{label}</span>
        <span className="yx-set-usage">
          <meter className="yx-set-usage__bar" min={0} max={max} value={used} low={max * 0.8} high={max * 0.95} optimum={0} aria-label={def.label} />
          <span className="yx-set-read__value">
            {formatValue(def, used)} · {max ? Math.round((used / max) * 100) : 0} %
          </span>
        </span>
        {def.helper && <span className="yx-set-helper">{def.helper}</span>}
      </div>,
    );
  }

  if (readOnly || def.kind === 'law' || def.locked) {
    return wrap(
      <div className="yx-set-read">
        <span className="yx-set-read__label">{label}</span>
        <span className="yx-set-read__value">{formatValue(def, value)}</span>
        {def.kind === 'law' && def.law && (
          <span className="yx-set-helper">{def.builtIn ? `${def.law}. This is how YukthiX works and can't be turned off.` : `${def.law}. Legal values change only through the rules browser.`}</span>
        )}
        {def.locked && <span className="yx-set-helper">{def.locked}</span>}
        {def.lockedAction && (
          <span>
            <Button size="sm" icon={ArrowUpRight} onClick={() => onOpenLink?.(def.lockedAction!.screenId)}>
              {def.lockedAction.label}
            </Button>
          </span>
        )}
        {(def.helper || def.legal) && def.kind !== 'law' && <span className="yx-set-read__help">{helper}</span>}
      </div>,
    );
  }

  const hasHelper = Boolean(def.helper || def.legal || def.warning || def.blocked || def.overrides?.length || def.refPattern || isAddOn(def));
  const reset = onResetScope && def.scope?.startsWith('Overridden') && (
    <IconButton icon={RotateCcw} label={`Reset ${def.label.toLowerCase()} to inherited value`} size="sm" onClick={onResetScope} />
  );

  const off = Boolean((def.availability && !isAddOn(def)) || def.blocked);
  if (def.kind === 'toggle') {
    return wrap(
      <div className="yx-set-toggle">
        <Checkbox checked={value === true} onChange={(c) => onChange(c)} label={label} description={hasHelper ? helper : undefined} disabled={off} />
        {reset}
      </div>,
    );
  }

  let control: ReactNode;
  switch (def.kind) {
    case 'number':
      control = <NumberField value={typeof value === 'number' ? value : null} onChange={onChange} suffix={def.unit} />;
      break;
    case 'percent':
      control = <NumberField value={typeof value === 'number' ? value : null} onChange={onChange} suffix="%" decimals />;
      break;
    case 'money':
      control = <CurrencyField value={typeof value === 'number' ? value : null} onChange={onChange} />;
      break;
    case 'textarea':
      control = <TextArea value={typeof value === 'string' ? value : ''} onChange={onChange} rows={3} />;
      break;
    case 'time':
      control = <TimeField value={typeof value === 'string' ? value : null} onChange={onChange} />;
      break;
    case 'date':
      control = <DatePicker value={typeof value === 'string' ? parseIso(value) : null} onChange={(d) => onChange(toIso(d))} />;
      break;
    case 'select':
      control = <Select value={typeof value === 'string' ? value : null} onChange={onChange} options={opts(def.options, def.optionLabels)} disabled={off} />;
      break;
    case 'multiselect':
      // Every choice stays visible, no "+2" (founder review 1 Oct 2026).
      control = <MultiSelect value={Array.isArray(value) ? value : []} onChange={onChange} options={opts(def.options, def.optionLabels)} maxChips={Infinity} disabled={off} />;
      break;
    case 'offsets':
      control = <OffsetsField value={Array.isArray(value) ? value : []} onChange={onChange} unit={def.unit ?? ''} label={def.label} />;
      break;
    case 'radio':
      control = <RadioGroup aria-label={def.label} value={typeof value === 'string' ? value : undefined} onChange={onChange} options={opts(def.options, def.optionLabels)} orientation={radioRow(def) ? 'horizontal' : 'vertical'} disabled={off} />;
      break;
    case 'image':
      control = <ImageField value={typeof value === 'string' ? value : null} onChange={onChange} />;
      break;
    case 'colour':
      control = <ColourField value={typeof value === 'string' ? value : ''} onChange={onChange} />;
      break;
    default:
      control = <TextField value={typeof value === 'string' ? value : ''} onChange={onChange} disabled={off} />;
  }
  const statusAction = def.status?.action && !off && (
    <span className="yx-set-control__act">
      <Button size="sm">{def.status.action}</Button>
    </span>
  );
  return wrap(
    <div className="yx-set-control">
      <FormField label={label} helper={hasHelper ? helper : undefined} error={error ?? undefined}>
        {control}
      </FormField>
      {statusAction}
      {reset}
    </div>,
  );
}

/* ---------------- Master list (departments, leave types…) ---------------- */

/** Health words in status cells: good is green, broken is red, needs attention is yellow. */
function toneFor(t: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (/fail|disabled|error|expired/i.test(t)) return 'danger';
  if (/offline|needs|pending|awaited|review|draft|manual/i.test(t)) return 'warning';
  if (/healthy|online|connected|active|complete|approved|registered|verified|signed/i.test(t)) return 'success';
  return 'neutral';
}

/** Status cells ("Active · default") become badges; "missing" is flagged, so gaps are never hidden in text. */
function Cell({ col, text }: { col: string; text: string }) {
  if ((col === 'Status' || col === 'Health') && text && !/^Due /.test(text))
    return (
      <span className="yx-set-chips">
        {text.split(' · ').map((t) => {
          const w = t.charAt(0).toUpperCase() + t.slice(1);
          return (
            <Badge key={t} tone={STATUS_TONE[w] ?? toneFor(w)}>
              {w}
            </Badge>
          );
        })}
      </span>
    );
  if (/\bmissing\b/i.test(text) || (col === 'Status' && /^Due /.test(text))) return <Badge tone="warning">{text}</Badge>;
  if (text === 'On file') return <Badge tone="success">{text}</Badge>;
  return <>{text}</>;
}

export function MasterList({ def, rows, onRowsChange, readOnly: pageReadOnly, defaultEditing }: { def: SettingDef; rows: string[][]; onRowsChange?: (rows: string[][]) => void; readOnly?: boolean; defaultEditing?: number | 'new' }) {
  const readOnly = pageReadOnly || def.readOnlyList;
  const cols = def.columns ?? ['Name'];
  const [editing, setEditing] = useState<number | 'new' | null>(defaultEditing ?? null);
  const [form, setForm] = useState<string[]>(() => (typeof defaultEditing === 'number' ? rows[defaultEditing] : cols.map(() => '')));
  const [err, setErr] = useState<string | null>(null);
  const open = (i: number | 'new') => {
    setForm(i === 'new' ? cols.map(() => '') : [...rows[i]]);
    setErr(null);
    setEditing(i);
  };
  const minErr = (() => {
    const m = def.minColumn;
    if (!m) return null;
    const vi = cols.indexOf(m.value);
    const mi = cols.indexOf(m.min);
    const v = form[vi] ?? '';
    const min = form[mi] ?? '';
    return belowMinimum(v, min, def.columnOptions?.[m.value]) ? `Can't be lower than the ${m.min.toLowerCase()} (${min}).` : null;
  })();
  const checks = LIST_CHECKS[def.key]?.(rows);
  const save = () => {
    if (!form[0]?.trim()) {
      setErr(`Enter ${cols[0].toLowerCase()}`);
      return;
    }
    if (minErr) return;
    const next = editing === 'new' ? [...rows, form] : rows.map((r, i) => (i === editing ? form : r));
    onRowsChange?.(next);
    setEditing(null);
  };
  const noun = def.addLabel?.replace(/^Add /, '') ?? 'entry';
  return (
    <div className="yx-set-list">
      <div className="yx-set-list__head">
        <span className="yx-set-label">
          {def.label}
          <SettingChips def={def} current={def.value ?? null} />
        </span>
        {!readOnly && (
          <Button size="sm" icon={Plus} onClick={() => open('new')}>
            {def.addLabel ?? 'Add'}
          </Button>
        )}
      </div>
      {def.helper && <p className="yx-set-helper">{def.helper}</p>}
      <LegalHint def={def} />
      <div className="yx-set-list__scroll">
        <table className="yx-set-list__table">
          <caption className="yx-visually-hidden">{def.label}</caption>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
              {(!readOnly || def.rowAction) && (
                <th scope="col">
                  <span className="yx-visually-hidden">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="yx-set-list__empty">
                  None yet. {!readOnly && `Use ${def.addLabel ?? 'Add'} to create the first ${noun.toLowerCase()}.`}
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c, j) => (
                  <td key={j}>
                    <Cell col={c} text={r[j] ?? ''} />
                  </td>
                ))}
                {(!readOnly || def.rowAction) && (
                  <td className="yx-set-list__act">
                    <span className="yx-set-list__btns">
                      {def.rowAction && (
                        <Button size="sm" icon={MapPin}>
                          {def.rowAction}
                          <span className="yx-visually-hidden">: {r.slice(0, 2).join(', ')}</span>
                        </Button>
                      )}
                      {!readOnly && <IconButton icon={Pencil} size="sm" label={`Edit ${r[0]}`} onClick={() => open(i)} />}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {checks && (
        <ul className="yx-set-checks" aria-label={`${def.label}: legal check`}>
          {checks.map((c) => (
            <li key={c.label}>
              <span>{c.label}</span>
              <Badge tone={c.ok ? 'success' : /nearly/.test(c.text) ? 'warning' : 'danger'}>{c.ok ? `✓ ${c.text}` : c.text}</Badge>
            </li>
          ))}
        </ul>
      )}
      <Drawer
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? def.addLabel ?? 'Add' : `Edit ${rows[editing as number]?.[0] ?? noun}`}
        subtitle={def.label}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={save}>
              {editing === 'new' ? def.addLabel ?? 'Add' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="yx-set-drawer-form">
          {cols.map((c, j) => {
            const set = (v: string | null) => setForm((f) => f.map((x, k) => (k === j ? v ?? '' : x)));
            const locked = editing !== 'new' && def.lockedColumns?.includes(c);
            return (
              <FormField key={c} label={c} required={j === 0} error={j === 0 ? err : c === def.minColumn?.value ? minErr : undefined}>
                {locked ? (
                  <span className="yx-set-read__value">{form[j] || '—'}</span>
                ) : def.columnOptions?.[c] ? (
                  <Select value={form[j] || null} onChange={set} options={opts(def.columnOptions[c])} />
                ) : (
                  <TextField value={form[j] ?? ''} onChange={set} />
                )}
              </FormField>
            );
          })}
          <p className="yx-set-helper">Changes apply when you save the page. They are recorded in the audit log.</p>
        </div>
      </Drawer>
    </div>
  );
}

/* ---------------- Link to a bespoke editor owned by another screen ---------------- */

export function LinkedEditor({ def, onOpen }: { def: SettingDef; onOpen?: (screenId: string) => void }) {
  return (
    <div className="yx-set-link">
      <div className="yx-set-link__text">
        <span className="yx-set-label">
          {def.label}
          <SettingChips def={def} current={null} />
        </span>
        {def.helper && <span className="yx-set-helper">{def.helper}</span>}
      </div>
      <Button size="sm" icon={ArrowUpRight} disabled={Boolean(def.availability)} onClick={() => def.linkScreenId && onOpen?.(def.linkScreenId)}>
        {def.linkLabel ?? 'Open editor'}
      </Button>
    </div>
  );
}

/* ---------------- Logo and brand colour ---------------- */

/** A few numbers as removable chips, e.g. "30, 7 days before", instead of free text that a typo breaks. */
function OffsetsField({ value, onChange, unit, label }: { value: string[]; onChange: (v: string[]) => void; unit: string; label: string }) {
  const [next, setNext] = useState<number | null>(null);
  const add = () => {
    if (next == null || next <= 0 || value.includes(String(next))) return;
    onChange([...value, String(next)].sort((a, b) => Number(b) - Number(a)));
    setNext(null);
  };
  return (
    <div className="yx-set-offsets">
      {value.map((v) => (
        <span key={v} className="yx-set-offsets__chip">
          {v} {v === '1' ? unit.replace(/^(\w+)s\b/, '$1') : unit}
          <IconButton icon={X} size="sm" label={`Remove ${v} ${unit} from ${label.toLowerCase()}`} onClick={() => onChange(value.filter((x) => x !== v))} />
        </span>
      ))}
      <span className="yx-set-offsets__add">
        <NumberField value={next} onChange={setNext} suffix={unit} aria-label={`Add to ${label.toLowerCase()}`} />
        <Button size="sm" icon={Plus} onClick={add}>
          Add
        </Button>
      </span>
    </div>
  );
}

/** Logo: a preview with Replace and Remove, not a filename in a text box. */
function ImageField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="yx-set-image">
      <span className="yx-set-image__preview" aria-hidden="true">
        {value ? 'KF' : ''}
      </span>
      <span className="yx-set-image__name">{value ?? 'No logo yet'}</span>
      <span className="yx-set-image__acts">
        <Button size="sm" onClick={() => input.current?.click()}>
          {value ? 'Replace' : 'Upload logo'}
        </Button>
        {value && (
          <Button size="sm" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </span>
      <input ref={input} type="file" accept="image/svg+xml,image/png" hidden onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0].name)} />
    </div>
  );
}

/** Brand colour: swatch picker + hex, a live button preview and the contrast check against white text. */
function ColourField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ratio = contrastOnWhite(value);
  const ok = ratio != null && ratio >= 4.5;
  return (
    <div className="yx-set-colour">
      <span className="yx-set-colour__row">
        <input type="color" className="yx-set-colour__swatch" value={swatchValue(value)} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label="Pick brand colour" />
        <TextField value={value} onChange={onChange} />
        {ratio != null && (
          // The customer's own colour, so it can't be a token.
          <span className="yx-set-colour__preview" style={{ background: value, color: ON_BRAND }} aria-hidden="true">
            Button
          </span>
        )}
      </span>
      <Badge tone={ok ? 'success' : 'warning'}>
        {ratio == null ? 'Enter a 6-digit colour code' : ok ? `Readable: contrast ${ratio.toFixed(1)} : 1` : `Too light for white text: contrast ${ratio.toFixed(1)} : 1, needs 4.5`}
      </Badge>
    </div>
  );
}

/* ---------------- Several legal values in a row: one compact table ---------------- */

/** Three or more read-only legal values together read as one table (Rule · Value · Law), not a screen of blocks. */
export function LawTable({ defs, highlightKey }: { defs: SettingDef[]; highlightKey?: string }) {
  return (
    <div className="yx-set-list__scroll">
      <table className="yx-set-list__table">
        <caption className="yx-visually-hidden">Values set by law</caption>
        <thead>
          <tr>
            <th scope="col">Rule</th>
            <th scope="col">Value</th>
            <th scope="col">Law</th>
          </tr>
        </thead>
        <tbody>
          {defs.map((d) => (
            <tr key={d.key} id={`setting-${d.key}`} className="yx-set-field" data-highlight={highlightKey === d.key || undefined}>
              <th scope="row" className="yx-set-lawtable__rule">
                {d.label}
              </th>
              <td>{formatValue(d, d.value ?? null)}</td>
              <td className="yx-set-helper">{d.law}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Audit: last changed by + history ---------------- */

export interface HistoryEntry extends LastChange {
  id: string;
}

/** compact: the "Last changed by" line under the page title, with its View history button (shown once per page). */
export function AuditLine({ change, history = [], defaultHistoryOpen = false, compact }: { change: LastChange; history?: HistoryEntry[]; defaultHistoryOpen?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(defaultHistoryOpen);
  const all: HistoryEntry[] = [{ ...change, id: 'latest' }, ...history];
  const items: TimelineItem[] = all.map((h) => ({
    id: h.id,
    at: parseIso(h.at),
    actor: { name: h.by },
    action: `(${h.role}) ${h.what.charAt(0).toLowerCase()}${h.what.slice(1)}`,
  }));
  const drawer = (
    <Drawer open={open} onOpenChange={setOpen} title="Change history" subtitle="Every change is recorded with before and after values.">
      <Timeline items={items} today={TODAY} aria-label="Change history" />
    </Drawer>
  );
  if (compact)
    return (
      <span className="yx-set-audit">
        Last changed by {change.by} on {formatStamp(change.at)}
        <Button size="sm" icon={History} onClick={() => setOpen(true)}>
          View history
        </Button>
        {drawer}
      </span>
    );
  return (
    <div className="yx-set-audit">
      <Icon icon={History} />
      <span>
        Last changed by <strong>{change.by}</strong> ({change.role}) on {formatStamp(change.at)}. {change.what}.
      </span>
      <Button size="sm" onClick={() => setOpen(true)}>
        View history
      </Button>
      {drawer}
    </div>
  );
}

/* ---------------- Settings search ---------------- */

export function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((p, i) => (p.hit ? <mark key={i} className="yx-set-mark">{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>))}
    </>
  );
}

export function SettingsSearchBox({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="yx-set-search" role="search">
      <FormField label="Search settings" hideLabel>
        <TextField
          value={value}
          onChange={onChange}
          prefix={<Icon icon={Search} />}
          placeholder="Search settings, e.g. probation, late coming, PF ceiling"
          autoFocus={autoFocus}
          type="search"
        />
      </FormField>
    </div>
  );
}

export function SearchResults({ results, query, onOpen, onClear }: { results: SearchEntry[]; query: string; onOpen?: (e: SearchEntry) => void; onClear?: () => void }) {
  if (!query.trim()) return null;
  return (
    <section className="yx-set-results" aria-label="Search results">
      <p className="yx-set-results__count" aria-live="polite">
        {results.length ? `${results.length} ${results.length === 1 ? 'result' : 'results'} for "${query}". Only settings you can manage are shown.` : ''}
      </p>
      {results.length === 0 ? (
        <div className="yx-set-results__empty">
          <p className="yx-set-results__title">No settings match "{query}"</p>
          <p className="yx-set-helper">Try a task word such as "probation" or "PF ceiling". Some settings may be on pages you can't manage.</p>
          {onClear && <Button onClick={onClear}>Clear search</Button>}
        </div>
      ) : (
        <ul className="yx-set-results__list">
          {results.map((r) => (
            <li key={r.key}>
              <a
                href={`#settings/${r.pageId}${r.isPage ? '' : `/${r.key}`}`}
                className="yx-set-result"
                onClick={(e) => {
                  e.preventDefault();
                  onOpen?.(r);
                }}
              >
                <span className="yx-set-result__label">
                  <span>
                    <Highlight text={r.label} query={query} />
                  </span>
                  {r.isPage && <Badge tone="neutral">Page</Badge>}
                </span>
                <span className="yx-set-result__meta">
                  {r.groupTitle} › {r.pageTitle}
                  {r.section && ` › ${r.section}`}
                </span>
                <span className="yx-set-result__value">
                  {r.isPage ? r.valueText : `${r.valueText} · ${r.scope}`}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
