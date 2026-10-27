import PDFDocument from 'pdfkit';

// PPL-33: my data as a plain PDF: one heading per part, one line per value. Nested parts and lists print as they come.

const words = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/^./, (c) => c.toUpperCase());
const text = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? Object.values(v as Record<string, unknown>).filter((x) => x !== null && x !== '').map(text).join(' · ') : String(v));

export function myDataPdf(data: Record<string, unknown>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, info: { Title: 'My data' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(18).text(`My data at ${text(data.company)}`);
    doc.fontSize(10).fillColor('#555').text(`Exported on ${text(data.exportedOn)}`).fillColor('#000');
    for (const [key, value] of Object.entries(data)) {
      if (key === 'company' || key === 'exportedOn') continue;
      if (value !== null && typeof value === 'object') {
        doc.moveDown().fontSize(13).text(words(key));
        const rows = Array.isArray(value) ? value.map((v) => ['', v] as const) : Object.entries(value as Record<string, unknown>);
        if (!rows.length) doc.fontSize(10).text('Nothing on file.');
        for (const [k, v] of rows) doc.fontSize(10).text(k ? `${words(k)}: ${text(v)}` : text(v));
      } else {
        doc.fontSize(10).text(`${words(key)}: ${text(value)}`);
      }
    }
    doc.end();
  });
}
