import type { ExpenseCategory, OverLimit, PolicyRule } from './types';

// The limits matrix (EXP-07) as rows a person edits: one row per category, one kind of limit per row ("per day" for
// meals, "per line" for hotels, …), an "Any city" column and one per city tier. Pure, so it is tested directly.
//   Not allowed   no rule rows
//   No limit      one "any city" row with no amounts
//   Per …         a row per filled cell; an empty tier cell falls back to "Any city"; both empty = not allowed there

export type Per = 'none' | 'free' | 'line' | 'day' | 'trip' | 'month';
export const ANY = '*';
const FIELD = { line: 'perLine', day: 'perDay', trip: 'perTrip', month: 'perMonth' } as const;

export interface MatrixRow {
  code: string;
  name: string;
  per: Per;
  overLimit: OverLimit;
  /** Column id (ANY or a tier id) → amount as typed ('' = empty). */
  cells: Record<string, string>;
}

const amountOf = (r: PolicyRule): [Per, string | null] => {
  for (const k of ['line', 'day', 'trip', 'month'] as const) if (r[FIELD[k]] !== null) return [k, r[FIELD[k]]];
  return ['free', null];
};

const plain = (x: string | null) => (x === null ? '' : String(Number(x)));

export function toRows(rules: readonly PolicyRule[], categories: readonly ExpenseCategory[]): MatrixRow[] {
  return categories
    .filter((c) => c.active)
    .map((c) => {
      const mine = rules.filter((r) => r.categoryCode === c.code);
      if (!mine.length) return { code: c.code, name: c.shownName ?? c.name, per: 'none' as Per, overLimit: 'justify_and_approve' as OverLimit, cells: {} };
      const kinds = mine.map(amountOf);
      const limited = kinds.find(([k]) => k !== 'free');
      if (!limited) return { code: c.code, name: c.shownName ?? c.name, per: 'free' as Per, overLimit: mine[0].overLimit, cells: {} };
      const per = limited[0];
      const cells: Record<string, string> = {};
      for (const r of mine) cells[r.tierId ?? ANY] = plain(r[FIELD[per as keyof typeof FIELD]]);
      return { code: c.code, name: c.shownName ?? c.name, per, overLimit: mine[0].overLimit, cells };
    });
}

/** The rows back as rules, or the first problem in plain words. */
export function fromRows(rows: readonly MatrixRow[]): { rules: PolicyRule[] } | { problem: string; code: string } {
  const rules: PolicyRule[] = [];
  const base = (code: string, tierId: string | null, overLimit: OverLimit): PolicyRule => ({ categoryCode: code, tierId, perLine: null, perDay: null, perTrip: null, perMonth: null, overLimit });
  for (const r of rows) {
    if (r.per === 'none') continue;
    if (r.per === 'free') {
      rules.push(base(r.code, null, r.overLimit));
      continue;
    }
    const filled = Object.entries(r.cells).filter(([, v]) => v.trim() !== '');
    if (!filled.length) return { problem: `${r.name}: give a limit, or choose "No limit".`, code: r.code };
    for (const [col, v] of filled) {
      if (!/^\d{1,12}(\.\d{1,2})?$/.test(v.trim())) return { problem: `${r.name}: ${v} is not an amount.`, code: r.code };
      rules.push({ ...base(r.code, col === ANY ? null : col, r.overLimit), [FIELD[r.per]]: Number(v.trim()).toFixed(2) });
    }
  }
  return { rules };
}

/** Rules equal, ignoring order and number formatting: the matrix is unchanged. */
export function sameRules(a: readonly PolicyRule[], b: readonly PolicyRule[]): boolean {
  const key = (r: PolicyRule) => [r.categoryCode, r.tierId ?? ANY, r.overLimit, ...(['perLine', 'perDay', 'perTrip', 'perMonth'] as const).map((k) => (r[k] === null ? '-' : Number(r[k]).toFixed(2)))].join('|');
  const x = a.map(key).sort();
  const y = b.map(key).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
