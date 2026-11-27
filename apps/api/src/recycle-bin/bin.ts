import { Prisma } from '@prisma/client';

// Batch B item 3 (admin B2, answers 2367-2369): the YukthiX-wide recycle bin. A delete in a covered area calls toBin()
// in its own transaction, just before the row goes, so the row is kept as it was and can be restored with the same id.
// A new area joins by adding its kind here and one toBin() call in its delete.

export const BIN_KINDS = {
  department: { model: 'department', area: 'Organisation', what: 'Department' },
  designation: { model: 'designation', area: 'Organisation', what: 'Designation' },
  grade: { model: 'grade', area: 'Organisation', what: 'Grade' },
  employment_type: { model: 'employmentType', area: 'Organisation', what: 'Employment type' },
  cost_centre: { model: 'costCentre', area: 'Organisation', what: 'Cost centre' },
  person_tag: { model: 'personTag', area: 'Organisation', what: 'Person tag' },
  location: { model: 'location', area: 'Organisation', what: 'Location' },
  candidate_email_template: { model: 'candidateEmailTemplate', area: 'Hiring', what: 'Email template' },
  candidate_sms_template: { model: 'candidateSmsTemplate', area: 'Hiring', what: 'SMS template' },
  candidate_whatsapp_template: { model: 'candidateWhatsappTemplate', area: 'Hiring', what: 'WhatsApp template' },
  // Wave 2 (answer 2439): records with child rows keep them in the bin and get them back on restore.
  user_group: { model: 'userGroup', area: 'Access', what: 'User group', children: ['userGroupMember'] },
  survey: { model: 'surveyDefinition', area: 'Hiring', what: 'Candidate survey', children: ['surveyResponse'] },
  project_billing_draft: { model: 'staffingInvoice', area: 'Projects', what: 'Billing draft', children: ['staffingInvoiceLine', 'projectBilling', 'staffingReminder'] },
} as const satisfies Record<string, { model: string; area: string; what: string; children?: readonly string[] }>;
/** The key in a bin item's data that holds its child rows, by Prisma model (answer 2439). */
export const CHILDREN_KEY = '__children';
/** The child models a kind may bring back (restore never creates rows of any other model from stored data). */
export const childModels = (kind: BinKind): readonly string[] => ('children' in BIN_KINDS[kind] ? (BIN_KINDS[kind] as { children: readonly string[] }).children : []);
export type BinKind = keyof typeof BIN_KINDS;
export const isBinKind = (k: string): k is BinKind => Object.prototype.hasOwnProperty.call(BIN_KINDS, k);

export const KEEP_DAYS_KEY = 'recycle_bin.keep_days';
export const DEFAULT_KEEP_DAYS = 180;

type BinTx = Pick<Prisma.TransactionClient, 'recycleBinItem' | 'setting'>;

/** The row as JSON (dates as ISO strings, decimals and big numbers as strings): Prisma takes them back on restore. */
export function snapshot(row: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as Prisma.InputJsonObject;
}

/** Keeps the row (and, for kinds with children, its child rows by model) just before the delete. */
export async function toBin(
  tx: BinTx,
  c: { organizationId: string; userId?: string | null },
  kind: BinKind,
  row: { id: string } & Record<string, unknown>,
  label: string,
  children?: Record<string, Record<string, unknown>[]>,
): Promise<void> {
  const allowed = childModels(kind);
  for (const m of Object.keys(children ?? {})) if (!allowed.includes(m)) throw new Error(`recycle bin: ${kind} keeps no ${m} rows`);
  const data = children ? { ...snapshot(row), [CHILDREN_KEY]: snapshot(children) } : snapshot(row);
  await tx.recycleBinItem.create({
    data: { organizationId: c.organizationId, kind, entityId: row.id, label: (label || BIN_KINDS[kind].what).slice(0, 200), data, deletedBy: c.userId ?? null },
  });
}

/**
 * Turns stored JSON back into create input for one Prisma model: big numbers back to BigInt, empty JSON fields left out
 * (Prisma refuses a bare null there). Dates and decimals go back as their strings.
 */
export function revive(model: string, row: Record<string, unknown>): Record<string, unknown> {
  const name = model[0]!.toUpperCase() + model.slice(1);
  const fields = Prisma.dmmf.datamodel.models.find((m) => m.name === name)?.fields ?? [];
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) {
    if (!(f.name in out)) continue;
    if (f.type === 'BigInt' && out[f.name] !== null) out[f.name] = BigInt(out[f.name] as string);
    if (f.type === 'Json' && out[f.name] === null) delete out[f.name];
  }
  return out;
}

/** The company's "Keep deleted items for" in days (tenant setting, default 180). */
export async function keepDays(tx: BinTx, organizationId: string): Promise<number> {
  const row = await tx.setting.findFirst({ where: { organizationId, key: KEEP_DAYS_KEY, scopeType: 'tenant' }, orderBy: { createdAt: 'desc' } });
  const days = Number(row?.value);
  return Number.isInteger(days) && days > 0 ? days : DEFAULT_KEEP_DAYS;
}
