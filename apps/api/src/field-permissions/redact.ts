export function redactFields<T extends Record<string, any>>(row: T, hidden: Set<string>, alias?: Record<string, string>): T {
  if (hidden.size === 0) return row;
  const out: any = { ...row };
  for (const key of hidden) {
    const prop = alias?.[key] ?? key;
    if (prop in out) out[prop] = null;
  }
  return out;
}

export function redactMany<T extends Record<string, any>>(rows: T[], hidden: Set<string>, alias?: Record<string, string>): T[] {
  return hidden.size === 0 ? rows : rows.map((r) => redactFields(r, hidden, alias));
}
