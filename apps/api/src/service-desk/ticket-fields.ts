import { Prisma } from '@prisma/client';
import { Tx } from '../org-structure/org-structure.service';
import { RuleError } from '../rules-engine/conditions';
import { FormDef, FormField, checkAnswers, parseForm } from '../rules-engine/forms';

// Answers 1641, 1650: a desk's own ticket fields. They are checked by the shared forms engine (rules-engine/forms.ts):
// the fields of a ticket become one form section, so a drop-down that depends on another refuses a value outside its
// parent's list exactly as a catalogue form does. Who sees a field: everyone on the ticket ('all'), the desk's staff
// only ('agents', hidden from the requester) or its team leads only ('leads'). Values live in sd_tickets.field_values.

export type FieldRow = Prisma.SdTicketFieldGetPayload<object>;
export type Viewer = 'requester' | 'agent' | 'lead';
export const FIELD_KINDS = ['text', 'number', 'date', 'choice'] as const;
export const VISIBILITIES = ['all', 'agents', 'leads'] as const;
export type FieldValue = string | number;

/** May this viewer see (and so read or set) the field? */
export const sees = (f: Pick<FieldRow, 'visibility'>, who: Viewer) => f.visibility === 'all' || (f.visibility === 'agents' && who !== 'requester') || (f.visibility === 'leads' && who === 'lead');

const options = (f: FieldRow) => (Array.isArray(f.options) ? (f.options as { value: string; label: string }[]) : []);

/** The fields as one form of the forms engine. */
export function formOf(fields: FieldRow[]): FormDef {
  const asField = (f: FieldRow): FormField => ({
    key: f.key,
    type: f.fieldType as FormField['type'],
    label: f.label,
    ...(f.fieldType === 'choice' ? { options: options(f) } : {}),
    ...(f.dependsOn ? { dependsOn: f.dependsOn, optionsBy: (f.optionsBy ?? {}) as Record<string, string[]> } : {}),
  });
  return { sections: [{ id: 'fields', columns: 1, fields: fields.map(asField) }], rules: [] };
}

/** Checks a desk's whole set of fields (dependent lists point at a pick-list on the same set), as an admin saves one. */
export function checkFieldSet(fields: FieldRow[]): void {
  parseForm(formOf(fields));
}

/** The active fields of a desk that apply to tickets of this type (fields for every type, and the type's own). */
export function fieldsFor(tx: Tx, org: string, deskId: string, typeId: string | null) {
  return tx.sdTicketField.findMany({ where: { organizationId: org, deskId, active: true, OR: [{ ticketTypeId: null }, ...(typeId ? [{ ticketTypeId: typeId }] : [])] }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
}

const stored = (v: Prisma.JsonValue): Record<string, FieldValue> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, FieldValue>) : {});

/**
 * Answer 1842: the fields a requester fills on the raise form, per desk: active, shown to everyone, for every type or
 * the desk's first type (the one a raise without a type gets). `firstType` maps a desk to that type.
 */
export async function raiseFieldsOf(tx: Tx, org: string, firstType: Map<string, string | undefined>) {
  const rows = await tx.sdTicketField.findMany({ where: { organizationId: org, deskId: { in: [...firstType.keys()] }, active: true, visibility: 'all' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return (deskId: string) => shownFields(rows.filter((f) => f.deskId === deskId && (!f.ticketTypeId || f.ticketTypeId === firstType.get(deskId))), {}, 'requester');
}

/** What a viewer sees of a ticket's fields: only the fields they may see, with the value and (drop-downs) its label. */
export function shownFields(fields: FieldRow[], values: Prisma.JsonValue, who: Viewer, onlyFilled = false) {
  const v = stored(values);
  return fields
    .filter((f) => sees(f, who) && (!onlyFilled || v[f.key] !== undefined))
    .map((f) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      type: f.fieldType,
      visibility: f.visibility,
      options: options(f),
      dependsOn: f.dependsOn,
      optionsBy: (f.optionsBy ?? null) as Record<string, string[]> | null,
      value: v[f.key] ?? null,
      display: v[f.key] === undefined ? null : f.fieldType === 'choice' ? (options(f).find((o) => o.value === v[f.key])?.label ?? String(v[f.key])) : String(v[f.key]),
    }));
}

/**
 * Applies a change to a ticket's field values: the keys must be fields this viewer may see; the result is checked by the
 * forms engine. A dependent value the change no longer allows (its parent changed) is cleared, unless it is part of the
 * change itself (then it is refused).
 */
export function applyFieldChange(fields: FieldRow[], current: Prisma.JsonValue, change: Record<string, unknown>, who: Viewer): { values: Record<string, FieldValue>; errors: Record<string, string>; forbidden: string[]; unknown: string[] } {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const unknown = Object.keys(change).filter((k) => !byKey.has(k));
  const forbidden = Object.keys(change).filter((k) => byKey.has(k) && !sees(byKey.get(k)!, who));
  const merged: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(stored(current))) if (byKey.has(k)) merged[k] = v;
  for (const [k, v] of Object.entries(change)) {
    if (v === null || v === '') delete merged[k];
    else merged[k] = v;
  }
  const def = formOf(fields);
  let res = checkAnswers(def, merged);
  for (let i = 0; i < fields.length && Object.keys(res.errors).some((k) => !(k in change) && byKey.get(k)?.dependsOn); i++) {
    for (const k of Object.keys(res.errors)) if (!(k in change) && byKey.get(k)?.dependsOn) delete merged[k];
    res = checkAnswers(def, merged);
  }
  return { values: res.values as Record<string, FieldValue>, errors: res.errors, forbidden, unknown };
}

export { RuleError };
