import type { OrgPerson } from './orgchart';

// Org chart export as an image or a PDF (PPL-02), with the browser's own canvas: no library. The caller passes the
// people the viewer may see (the chart's own list), so an export never shows more than the screen.

export interface ChartBox {
  person: OrgPerson;
  x: number;
  y: number;
}

const CARD_W = 200;
const CARD_H = 58;
const GAP_X = 24;
const GAP_Y = 48;
const PAD = 32;

/** A top-down tree layout: each person centred over their reports; people without a manager in the list are roots. */
export function chartLayout(people: OrgPerson[]): { boxes: ChartBox[]; width: number; height: number } {
  const ids = new Set(people.map((p) => p.id));
  const kids = new Map<string | null, OrgPerson[]>();
  for (const p of people) {
    const m = p.managerId && ids.has(p.managerId) ? p.managerId : null;
    kids.set(m, [...(kids.get(m) ?? []), p]);
  }
  const width = new Map<string, number>();
  const measure = (p: OrgPerson, seen: Set<string>): number => {
    if (seen.has(p.id)) return CARD_W;
    seen.add(p.id);
    const ch = kids.get(p.id) ?? [];
    const w = ch.length ? Math.max(CARD_W, ch.reduce((s, c) => s + measure(c, seen), 0) + GAP_X * (ch.length - 1)) : CARD_W;
    width.set(p.id, w);
    return w;
  };
  const roots = kids.get(null) ?? [];
  const seen = new Set<string>();
  const total = roots.reduce((s, r) => s + measure(r, seen), 0) + GAP_X * Math.max(0, roots.length - 1);
  const boxes: ChartBox[] = [];
  let depth = 0;
  const place = (p: OrgPerson, left: number, level: number, placed: Set<string>) => {
    if (placed.has(p.id)) return;
    placed.add(p.id);
    const w = width.get(p.id) ?? CARD_W;
    boxes.push({ person: p, x: PAD + left + (w - CARD_W) / 2, y: PAD + level * (CARD_H + GAP_Y) });
    depth = Math.max(depth, level);
    let x = left;
    for (const c of kids.get(p.id) ?? []) {
      place(c, x, level + 1, placed);
      x += (width.get(c.id) ?? CARD_W) + GAP_X;
    }
  };
  let x = 0;
  const placed = new Set<string>();
  for (const r of roots) {
    place(r, x, 0, placed);
    x += (width.get(r.id) ?? CARD_W) + GAP_X;
  }
  return { boxes, width: total + PAD * 2, height: (depth + 1) * CARD_H + depth * GAP_Y + PAD * 2 };
}

/** Draws the chart on a canvas (white page, grey lines, one card per person; vacancies dashed). */
export function drawChart(people: OrgPerson[], title: string): HTMLCanvasElement {
  const { boxes, width, height } = chartLayout(people);
  const scale = Math.min(2, 16000 / Math.max(width, height + 40));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil((height + 40) * scale);
  const g = canvas.getContext('2d')!;
  g.scale(scale, scale);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, width, height + 40);
  g.fillStyle = '#1f2937';
  g.font = '600 16px system-ui, sans-serif';
  g.fillText(title, PAD, 28);
  g.translate(0, 40);
  const at = new Map(boxes.map((b) => [b.person.id, b]));
  g.strokeStyle = '#9ca3af';
  g.lineWidth = 1;
  for (const b of boxes) {
    const m = b.person.managerId ? at.get(b.person.managerId) : undefined;
    if (!m) continue;
    const midY = m.y + CARD_H + GAP_Y / 2;
    g.beginPath();
    g.moveTo(m.x + CARD_W / 2, m.y + CARD_H);
    g.lineTo(m.x + CARD_W / 2, midY);
    g.lineTo(b.x + CARD_W / 2, midY);
    g.lineTo(b.x + CARD_W / 2, b.y);
    g.stroke();
  }
  const clip = (t: string, max: number) => {
    let s = t;
    while (s.length > 1 && g.measureText(s).width > max) s = s.slice(0, -1);
    return s === t ? t : `${s.slice(0, -1)}…`;
  };
  for (const b of boxes) {
    g.setLineDash(b.person.vacant ? [5, 4] : []);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#d1d5db';
    g.beginPath();
    g.roundRect(b.x, b.y, CARD_W, CARD_H, 8);
    g.fill();
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#111827';
    g.font = '600 13px system-ui, sans-serif';
    g.fillText(clip(b.person.vacant ? `Vacant · ${b.person.role}` : b.person.name, CARD_W - 20), b.x + 10, b.y + 24);
    g.fillStyle = '#4b5563';
    g.font = '12px system-ui, sans-serif';
    g.fillText(clip(b.person.vacant ? b.person.department : [b.person.role, b.person.department].filter(Boolean).join(' · '), CARD_W - 20), b.x + 10, b.y + 43);
  }
  return canvas;
}

/** A one-page PDF around a JPEG (the page sized to the image): the PDF syntax by hand, no library. */
export function jpegPdf(jpeg: Uint8Array, w: number, h: number): Blob {
  const enc = new TextEncoder();
  const parts: (Uint8Array | string)[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (x: Uint8Array | string) => {
    parts.push(x);
    length += typeof x === 'string' ? enc.encode(x).length : x.length;
  };
  const obj = (n: number, body: string | (Uint8Array | string)[]) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    for (const b of Array.isArray(body) ? body : [body]) push(b);
    push('\nendobj\n');
  };
  const pw = Math.round(w * 0.75);
  const ph = Math.round(h * 0.75);
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream']);
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

const save = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Saves the chart as a PNG image or a one-page PDF. */
export async function exportOrgChart(people: OrgPerson[], format: 'png' | 'pdf', title: string, fileName: string): Promise<void> {
  const canvas = drawChart(people, title);
  if (format === 'png') {
    const png = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('The image could not be made.'))), 'image/png'));
    save(png, `${fileName}.png`);
    return;
  }
  const jpeg = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('The PDF could not be made.'))), 'image/jpeg', 0.92));
  save(jpegPdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height), `${fileName}.pdf`);
}
