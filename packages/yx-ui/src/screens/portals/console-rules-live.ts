// YukthiX console C-1 (founder answers 1041 to 1044): the shapes the rule store returns, for the live YX-01 to YX-03
// screens, and the small pure helpers they share. Dates arrive from JSON as ISO strings.
import type { SlabRow } from './portals-logic';

export type RuleState = 'draft' | 'in review' | 'changes requested' | 'published' | 'withdrawn';
export type LiveLoad = 'ready' | 'loading' | 'error' | 'no-access';

export interface LiveRuleRow {
  id: string;
  statute: string;
  jurisdiction: string;
  version: string;
  kind: string;
  validFrom: string;
  validTo: string | null;
  state: RuleState;
  lawVersion: string | null;
  transitional: boolean;
  draftedBy: string | null;
  draftedByName: string;
  reviewedByName: string | null;
  sentForReviewAt: string | null;
  changeNote: string | null;
  golden: number;
}

export interface LiveGoldenDef {
  name: string;
  fn: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
}

export interface LiveRuleDetail extends Omit<LiveRuleRow, 'golden' | 'kind'> {
  values: Record<string, unknown> & { kind: string };
  source: string;
  verify: boolean;
  review: { note: string; by: string | null; at: string | null } | null;
  previous: { version: string; validFrom: string; values: Record<string, unknown> } | null;
  golden: LiveGoldenDef[];
}

/** What a draft saves (the statute, jurisdiction and version never change). */
export interface RuleUpdateInput {
  validFrom: string;
  validTo?: string;
  values: Record<string, unknown> & { kind: string };
  source: string;
  lawVersion: string;
  verify: boolean;
  golden: LiveGoldenDef[];
  changeNote?: string;
}

export interface LiveGoldenRun {
  ranAt: string;
  problems: string[];
  passed: number;
  total: number;
  cases: { id: string; name: string; input: Record<string, unknown>; expected: Record<string, unknown>; actual: Record<string, unknown>; pass: boolean }[];
}

export interface LiveImpact {
  countable: boolean;
  companies: number | null;
  employees: number | null;
  bySize: { size: string; companies: number; employees: number }[];
  pastDated: boolean;
  validFrom: string;
}

/** The store's PT slabs (amounts as strings) as the editor's rows, and back. */
export const slabsFrom = (values: Record<string, unknown>): SlabRow[] =>
  ((values.slabs as { from: string; to: string | null; amount: string }[] | undefined) ?? []).map((s) => ({ from: Number(s.from), to: s.to === null ? null : Number(s.to), amount: Number(s.amount) }));
export const slabsTo = (rows: SlabRow[]) => rows.map((r) => ({ from: String(r.from), to: r.to === null ? null : String(r.to), amount: String(r.amount) }));

/** The editor's "Shape" column from the rule's kind. */
export const shapeOf = (kind: string): 'Slab' | 'Rate' | 'List' | 'Calendar' =>
  kind === 'pt' || kind === 'tds' || kind === 'lwf' ? 'Slab' : kind === 'pf' || kind === 'esi' || kind === 'layoff' ? 'Rate' : kind === 'calendar' ? 'Calendar' : 'List';

/** "amount 200, citation …" for a golden case's input, expected or actual. */
export const plain = (o: Record<string, unknown>) =>
  Object.entries(o)
    .map(([k, v]) => `${k} ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(', ');

/** The values as text for any kind the slab grid does not draw; null when it does not parse as an object with a kind. */
export const parseValues = (text: string): (Record<string, unknown> & { kind: string }) | null => {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { kind?: unknown }).kind === 'string' ? (v as Record<string, unknown> & { kind: string }) : null;
  } catch {
    return null;
  }
};

/** A PT slab table read as lines for the review's before-and-after ("₹0 – ₹24,999.99 → ₹0"). */
export const slabLines = (values: Record<string, unknown>, money: (n: number) => string) =>
  slabsFrom(values).map((s) => `${money(s.from)}${s.to === null ? '+' : ` – ${money(s.to)}`} → ${money(s.amount)}`);
