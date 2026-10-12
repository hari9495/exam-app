import { gstinProblem } from './checks';

// Receipt OCR (M05-BUILD-DESIGN §14.6): the worker returns raw text lines with their recognition scores and the QR
// payload, never fields. This pure parser turns them into suggested fields, each with a confidence, using Indian
// receipt patterns. It never decides anything: the employee confirms or edits every field (Q4).

export interface OcrTextLine {
  text: string;
  /** Recognition score 0–1 from the engine. */
  score: number;
}
export interface Suggested<T> {
  value: T;
  confidence: number;
}
export interface OcrFields {
  amount?: Suggested<string>;
  date?: Suggested<string>;
  merchant?: Suggested<string>;
  gstin?: Suggested<string>;
  invoiceNo?: Suggested<string>;
  taxableValue?: Suggested<string>;
  cgst?: Suggested<string>;
  sgst?: Suggested<string>;
  igst?: Suggested<string>;
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
const round = (x: number) => Math.round(x * 100) / 100;
/** "1,234.50" / "1234" / "₹ 1,18,000.00" → "1234.50"; null when not a money figure. */
export function moneyOf(s: string): string | null {
  const m = s.replace(/[₹]|rs\.?|inr/gi, ' ').match(/(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d{1,2})?(?!\d)/g);
  if (!m) return null;
  const last = m[m.length - 1].replace(/,/g, '');
  const n = Number(last);
  return Number.isFinite(n) && n > 0 && n < 1e10 ? n.toFixed(2) : null;
}

/** dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy, dd Mon yyyy, yyyy-mm-dd → ISO; impossible dates are dropped. */
export function dateOf(s: string): string | null {
  let y: string, mo: string, d: string;
  const iso = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const dmy = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  const named = s.match(/\b(\d{1,2})[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]*(\d{2,4})\b/i);
  if (iso) [, y, mo, d] = iso;
  else if (dmy) [, d, mo, y] = dmy;
  else if (named) {
    [, d, mo, y] = named;
    mo = MONTHS[mo.toLowerCase().slice(0, 3)];
  } else return null;
  if (y.length === 2) y = `20${y}`;
  const out = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const t = new Date(`${out}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== out ? null : out;
}

const pick = <T>(best: Suggested<T> | undefined, next: Suggested<T>) => (!best || next.confidence > best.confidence ? next : best);

/** Fields from the receipt's text lines. Confidence = the engine's score, lowered when only a weak pattern matched. */
export function parseReceiptText(lines: readonly OcrTextLine[]): OcrFields {
  const out: OcrFields = {};
  const clean = lines.map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), score: Math.max(0, Math.min(1, l.score)) })).filter((l) => l.text);
  clean.forEach((l, i) => {
    const t = l.text;
    const low = t.toLowerCase();
    // The total: labelled lines win over a bare biggest number.
    if (/\b(grand total|net payable|amount payable|total amount|bill amount|total)\b/i.test(t) && !/\b(sub ?total|total tax|total gst)\b/i.test(t)) {
      const v = moneyOf(t) ?? (clean[i + 1] ? moneyOf(clean[i + 1].text) : null);
      if (v) out.amount = pick(out.amount, { value: v, confidence: round(l.score * (/grand total|payable/i.test(t) ? 1 : 0.9)) });
    }
    const date = /\b(date|dt|dated|invoice date|bill date)\b/i.test(low) ? dateOf(t) : null;
    if (date) out.date = pick(out.date, { value: date, confidence: round(l.score) });
    else if (!out.date) {
      const any = dateOf(t);
      if (any) out.date = { value: any, confidence: round(l.score * 0.7) };
    }
    for (const g of t.toUpperCase().match(/\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g) ?? []) {
      // A GSTIN whose check character fails is still suggested, at low confidence, so the person sees and fixes it.
      out.gstin = pick(out.gstin, { value: g, confidence: round(l.score * (gstinProblem(g) ? 0.3 : 1)) });
    }
    const inv = t.match(/\b(?:invoice|bill|receipt)\s*(?:no|number|#)\.?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{1,39})/i);
    if (inv) out.invoiceNo = pick(out.invoiceNo, { value: inv[1].toUpperCase(), confidence: round(l.score) });
    for (const [key, re] of [['cgst', /\bcgst\b/i], ['sgst', /\b(sgst|utgst)\b/i], ['igst', /\bigst\b/i], ['taxableValue', /\b(taxable (value|amount))\b/i]] as const) {
      if (re.test(t)) {
        const v = moneyOf(t.replace(/\d{1,2}(\.\d+)?\s*%/g, ' '));
        if (v) out[key] = pick(out[key], { value: v, confidence: round(l.score) });
      }
    }
  });
  // The merchant: the first line near the top that is words, not numbers, dates, GSTINs or a known label.
  const top = clean.slice(0, 5).find((l) => /[a-z]{3}/i.test(l.text) && !/\d{4,}/.test(l.text) && !/\b(tax invoice|invoice|bill|receipt|gstin|date|cash memo)\b/i.test(l.text));
  if (top) out.merchant = { value: top.text.slice(0, 120), confidence: round(top.score * 0.8) };
  // No labelled total: the largest amount, at low confidence.
  if (!out.amount) {
    const amounts = clean.map((l) => ({ v: moneyOf(l.text), s: l.score })).filter((x): x is { v: string; s: number } => Boolean(x.v) && !dateOf(x.v!));
    const best = amounts.sort((a, b) => Number(b.v) - Number(a.v))[0];
    if (best) out.amount = { value: best.v, confidence: round(best.s * 0.5) };
  }
  return out;
}

/** Fields below the company threshold (starter 0.8) are highlighted "Please check" on the line. */
export function lowConfidence(f: OcrFields, threshold = 0.8): string[] {
  return (Object.keys(f) as (keyof OcrFields)[]).filter((k) => (f[k]?.confidence ?? 1) < threshold);
}
