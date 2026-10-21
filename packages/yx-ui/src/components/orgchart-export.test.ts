import { describe, expect, it } from 'vitest';
import { chartLayout, jpegPdf } from './orgchart-export';

const p = (id: string, managerId: string | null = null) => ({ id, name: id, role: 'Role', department: 'Dept', managerId });

describe('org chart export (PPL-02)', () => {
  it('lays out the tree top-down: a manager over the middle of their reports', () => {
    const { boxes, width, height } = chartLayout([p('ceo'), p('a', 'ceo'), p('b', 'ceo'), p('c', 'a')]);
    const at = (id: string) => boxes.find((b) => b.person.id === id)!;
    expect(at('a').y).toBeGreaterThan(at('ceo').y);
    expect(at('c').y).toBeGreaterThan(at('a').y);
    expect(at('ceo').x).toBeCloseTo((at('a').x + at('b').x) / 2);
    expect(width).toBeGreaterThan(400);
    expect(height).toBeGreaterThan(150);
  });

  it('a manager outside the list makes a root (only the people the viewer may see are drawn)', () => {
    expect(chartLayout([p('x', 'hidden'), p('y', 'x')]).boxes.map((b) => b.person.id)).toEqual(['x', 'y']);
  });

  it('wraps the image in a one-page PDF with a valid cross-reference', async () => {
    const pdf = jpegPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 10, 20);
    const text = new TextDecoder('latin1').decode(new Uint8Array(await pdf.arrayBuffer()));
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Filter /DCTDecode');
    const xref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
  });
});
