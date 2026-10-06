import { useId, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  ACTION_LABELS,
  emptyAction,
  emptyCondition,
  emptyGroup,
  isGroup,
  operatorLabel,
  operatorsFor,
  summariseRule,
  validateConditions,
  validateRule,
  type RuleAction,
  type RuleActionType,
  type RuleCondition,
  type RuleErrors,
  type RuleField,
  type RuleGroup,
  type Rule,
  type RuleOperator,
  type RuleSchema,
  type Scalar,
} from '../lib/rules';
import { Button, ButtonGroup, IconButton } from './button';
import { FormField } from './field';
import { CurrencyField, NumberField, TextField } from './inputs';
import { MultiSelect, Select } from './select';
import { DatePicker } from './date';
import { useControllable } from './overlay';

type Part = 'when' | 'if' | 'then';

export interface ConditionBuilderProps {
  schema: RuleSchema;
  value?: Rule;
  defaultValue?: Rule;
  onChange?: (rule: Rule) => void;
  /** Show validation messages on each row (turn on after the first save attempt, §16). */
  showErrors?: boolean;
  /** Only the summary sentence, for people who can view but not edit. */
  readOnly?: boolean;
  /** Which parts to show. The workflow canvas uses ['if'] for a condition step. Default: all three. */
  parts?: Part[];
  /** Plain-English summary under the builder. Default true. */
  showSummary?: boolean;
}

export const emptyRule = (): Rule => ({ trigger: null, conditions: { ...emptyGroup(), items: [] }, actions: [] });

/** P19 rule builder as plain "When / If / Then" form rows (§46: the text alternative to the canvas). */
export function ConditionBuilder({ schema, value, defaultValue, onChange, showErrors, readOnly, parts = ['when', 'if', 'then'], showSummary = true }: ConditionBuilderProps) {
  const [rule, setRule] = useControllable(value, defaultValue ?? emptyRule(), onChange);
  const summary = summariseRule(rule, schema);

  if (readOnly) {
    return (
      <div className="yx-rule" data-readonly>
        <p className="yx-rule__summary">{summary}</p>
      </div>
    );
  }

  const all = parts.length === 3;
  const errors: RuleErrors = !showErrors ? {} : all ? validateRule(rule, schema) : validateConditions(rule.conditions, schema.fields);
  const set = (patch: Partial<Rule>) => setRule({ ...rule, ...patch });

  return (
    <div className="yx-rule">
      {parts.includes('when') && (
        <RuleSection keyword="When">
          <FormField label="Trigger" hideLabel error={errors.trigger}>
            <Select
              options={schema.triggers}
              value={rule.trigger}
              onChange={(trigger) => set({ trigger })}
              placeholder="Trigger"
            />
          </FormField>
        </RuleSection>
      )}
      {parts.includes('if') && (
        <RuleSection keyword="If">
          <GroupEditor group={rule.conditions} onChange={(conditions) => set({ conditions })} fields={schema.fields} errors={errors} top />
        </RuleSection>
      )}
      {parts.includes('then') && (
        <RuleSection keyword="Then">
          <ActionList actions={rule.actions} onChange={(actions) => set({ actions })} schema={schema} errors={errors} />
        </RuleSection>
      )}
      {showSummary && (
        <p className="yx-rule__summary" aria-live="polite">
          <span className="yx-rule__summary-label">Summary</span> {parts.includes('when') ? summary : summaryOfIf(summary)}
        </p>
      )}
    </div>
  );
}

// For a condition step: show only the "if" clause of the sentence.
function summaryOfIf(s: string) {
  const m = /, if (.*), then /.exec(s);
  return m ? `If ${m[1]}.` : 'No conditions yet. Every record takes the Yes branch.';
}

function RuleSection({ keyword, children }: { keyword: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="yx-rule__section" aria-labelledby={id}>
      <h3 id={id} className="yx-rule__keyword">
        {keyword}
      </h3>
      <div className="yx-rule__body">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ conditions */

interface GroupEditorProps {
  group: RuleGroup;
  onChange: (g: RuleGroup) => void;
  fields: RuleField[];
  errors: RuleErrors;
  top?: boolean;
  onRemove?: () => void;
}

function GroupEditor({ group, onChange, fields, errors, top, onRemove }: GroupEditorProps) {
  const joinId = useId();
  const setItem = (i: number, it: RuleCondition | RuleGroup) => onChange({ ...group, items: group.items.map((x, j) => (j === i ? it : x)) });
  const removeItem = (i: number) => onChange({ ...group, items: group.items.filter((_, j) => j !== i) });
  const word = group.join === 'and' ? 'and' : 'or';
  let n = 0;

  return (
    <div className="yx-rule__group" data-nested={!top || undefined} role={top ? undefined : 'group'} aria-label={top ? undefined : 'Condition group'}>
      {(group.items.length > 1 || !top) && (
        <div className="yx-rule__join">
          <span id={joinId} className="yx-rule__join-label">
            {top ? 'Match' : 'In this group, match'}
          </span>
          <ButtonGroup aria-labelledby={joinId}>
            <Button size="sm" aria-pressed={group.join === 'and'} onClick={() => onChange({ ...group, join: 'and' })}>
              All (and)
            </Button>
            <Button size="sm" aria-pressed={group.join === 'or'} onClick={() => onChange({ ...group, join: 'or' })}>
              Any (or)
            </Button>
          </ButtonGroup>
          {!top && <IconButton icon={Trash2} label="Remove group" onClick={onRemove} className="yx-rule__remove" />}
        </div>
      )}
      {group.items.length === 0 && top && <p className="yx-rule__empty">No conditions. The rule applies every time the trigger happens.</p>}
      <ol className="yx-rule__rows">
        {group.items.map((it, i) => (
          <li key={it.id} className="yx-rule__item">
            {i > 0 && <span className="yx-rule__joiner">{word}</span>}
            {isGroup(it) ? (
              <GroupEditor group={it} onChange={(g) => setItem(i, g)} fields={fields} errors={errors} onRemove={() => removeItem(i)} />
            ) : (
              <ConditionRow
                n={++n}
                prefix={top ? '' : 'Group '}
                condition={it}
                fields={fields}
                errors={errors}
                onChange={(c) => setItem(i, c)}
                onRemove={() => removeItem(i)}
              />
            )}
          </li>
        ))}
      </ol>
      {errors[group.id] && (
        <p className="yx-rule__error" role="alert">
          {errors[group.id]}
        </p>
      )}
      <div className="yx-rule__adds">
        <Button size="sm" icon={Plus} onClick={() => onChange({ ...group, items: [...group.items, emptyCondition()] })}>
          Add condition
        </Button>
        {top && (
          <Button size="sm" icon={Plus} onClick={() => onChange({ ...group, items: [...group.items, emptyGroup()] })}>
            Add group
          </Button>
        )}
      </div>
    </div>
  );
}

function valueForOperator(op: RuleOperator, prev: RuleCondition['value']): RuleCondition['value'] {
  if (op === 'between') return Array.isArray(prev) && prev.length === 2 ? prev : [null, null];
  if (op === 'one_of') return Array.isArray(prev) ? (prev.filter((x) => typeof x === 'string') as string[]) : typeof prev === 'string' ? [prev] : [];
  if (op === 'empty') return null;
  return Array.isArray(prev) ? null : prev;
}

interface ConditionRowProps {
  n: number;
  prefix: string;
  condition: RuleCondition;
  fields: RuleField[];
  errors: RuleErrors;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
}

function ConditionRow({ n, prefix, condition: c, fields, errors, onChange, onRemove }: ConditionRowProps) {
  const field = fields.find((f) => f.key === c.field);
  const name = `${prefix}condition ${n}`.replace(/^c/, 'C');
  const ops = field ? operatorsFor(field.type) : [];
  return (
    <div className="yx-rule__row" role="group" aria-label={name}>
      <FormField label={`${name} field`} hideLabel error={errors[`${c.id}.field`]}>
        <Select
          options={fields.map((f) => ({ value: f.key, label: f.label }))}
          value={c.field}
          placeholder="Field"
          onChange={(key) => onChange({ ...c, field: key, operator: key ? 'is' : null, value: null })}
        />
      </FormField>
      <FormField label={`${name} operator`} hideLabel error={errors[`${c.id}.operator`]} disabled={!field}>
        <Select
          options={ops.map((o) => ({ value: o, label: operatorLabel(o, field?.type) }))}
          value={c.operator}
          placeholder="Compare"
          onChange={(op) => op && onChange({ ...c, operator: op, value: valueForOperator(op, c.value) })}
        />
      </FormField>
      <div className="yx-rule__value">
        {field && c.operator && c.operator !== 'empty' && (
          <FormField label={`${name} value`} hideLabel error={errors[`${c.id}.value`]}>
            <ValueInput field={field} condition={c} onChange={(value) => onChange({ ...c, value })} />
          </FormField>
        )}
      </div>
      <IconButton icon={Trash2} label={`Remove ${name.toLowerCase()}`} onClick={onRemove} className="yx-rule__remove" />
    </div>
  );
}

function ScalarInput({ field, value, onChange, id, label }: { field: RuleField; value: Scalar; onChange: (v: Scalar) => void; id?: string; label?: string }) {
  const num = typeof value === 'number' ? value : null;
  switch (field.type) {
    case 'number':
      return <NumberField id={id} aria-label={label} value={num} onChange={onChange} decimals />;
    case 'money':
      return <CurrencyField id={id} aria-label={label} value={num} onChange={onChange} />;
    case 'date':
      return <DatePicker id={id} aria-label={label} value={value instanceof Date ? value : null} onChange={onChange} />;
    case 'choice':
      return (
        <Select
          id={id}
          aria-label={label}
          options={field.options ?? []}
          value={typeof value === 'string' ? value : null}
          onChange={onChange}
          placeholder="Value"
        />
      );
    default:
      return <TextField id={id} aria-label={label} value={typeof value === 'string' ? value : ''} onChange={onChange} />;
  }
}

function ValueInput({ field, condition: c, onChange }: { field: RuleField; condition: RuleCondition; onChange: (v: RuleCondition['value']) => void }) {
  if (c.operator === 'one_of') {
    return <MultiSelect options={field.options ?? []} value={Array.isArray(c.value) ? (c.value as string[]) : []} onChange={onChange} placeholder="Values" />;
  }
  if (c.operator === 'between') {
    const [a, b] = Array.isArray(c.value) ? (c.value as [Scalar, Scalar]) : [null, null];
    return (
      <span className="yx-rule__between">
        <ScalarInput field={field} value={a} onChange={(v) => onChange([v, b])} />
        <span className="yx-rule__and">and</span>
        <ScalarInput field={field} value={b} onChange={(v) => onChange([a, v])} id={`${c.id}-to`} label={`${field.label}, upper value`} />
      </span>
    );
  }
  return <ScalarInput field={field} value={Array.isArray(c.value) ? null : c.value} onChange={onChange} />;
}

/* ------------------------------------------------------------------ actions */

const ACTION_OPTIONS = (Object.keys(ACTION_LABELS) as RuleActionType[]).map((k) => ({ value: k, label: ACTION_LABELS[k] }));

function ActionList({ actions, onChange, schema, errors }: { actions: RuleAction[]; onChange: (a: RuleAction[]) => void; schema: RuleSchema; errors: RuleErrors }) {
  const setAt = (i: number, a: RuleAction) => onChange(actions.map((x, j) => (j === i ? a : x)));
  return (
    <div className="yx-rule__group">
      {actions.length === 0 && <p className="yx-rule__empty">No actions yet.</p>}
      <ol className="yx-rule__rows">
        {actions.map((a, i) => {
          const name = `Action ${i + 1}`;
          return (
            <li key={a.id} className="yx-rule__item">
              {i > 0 && <span className="yx-rule__joiner">and</span>}
              <div className="yx-rule__row" role="group" aria-label={name} data-kind={a.type ?? undefined}>
                <FormField label={name} hideLabel error={errors[`${a.id}.type`]}>
                  <Select
                    options={ACTION_OPTIONS}
                    value={a.type}
                    placeholder="Action"
                    onChange={(type) => setAt(i, { ...a, type, target: null, field: null, text: '' })}
                  />
                </FormField>
                {(a.type === 'notify' || a.type === 'approval') && (
                  <FormField label={`${name} ${a.type === 'notify' ? 'recipient' : 'approver'}`} hideLabel error={errors[`${a.id}.target`]}>
                    <Select
                      options={schema.recipients}
                      value={a.target ?? null}
                      placeholder={a.type === 'notify' ? 'Person or role' : 'Approver'}
                      onChange={(target) => setAt(i, { ...a, target })}
                    />
                  </FormField>
                )}
                {a.type === 'set_field' && (
                  <>
                    <FormField label={`${name} field`} hideLabel error={errors[`${a.id}.field`]}>
                      <Select
                        options={schema.fields.map((f) => ({ value: f.key, label: f.label }))}
                        value={a.field ?? null}
                        placeholder="Field"
                        onChange={(field) => setAt(i, { ...a, field })}
                      />
                    </FormField>
                    <FormField label={`${name} new value`} hideLabel error={errors[`${a.id}.text`]}>
                      <TextField value={a.text ?? ''} placeholder="New value" onChange={(text) => setAt(i, { ...a, text })} />
                    </FormField>
                  </>
                )}
                {a.type === 'block' && (
                  <FormField label={`${name} message`} hideLabel error={errors[`${a.id}.text`]} className="yx-rule__wide">
                    <TextField value={a.text ?? ''} placeholder="Message people will see" onChange={(text) => setAt(i, { ...a, text })} />
                  </FormField>
                )}
                {(!a.type || a.type === 'notify' || a.type === 'approval') && <span className="yx-rule__spacer" />}
                {!a.type && <span className="yx-rule__spacer" />}
                <IconButton icon={Trash2} label={`Remove action ${i + 1}`} onClick={() => onChange(actions.filter((_, j) => j !== i))} className="yx-rule__remove" />
              </div>
            </li>
          );
        })}
      </ol>
      {errors.actions && (
        <p className="yx-rule__error" role="alert">
          {errors.actions}
        </p>
      )}
      <div className="yx-rule__adds">
        <Button size="sm" icon={Plus} onClick={() => onChange([...actions, emptyAction()])}>
          Add action
        </Button>
      </div>
    </div>
  );
}
