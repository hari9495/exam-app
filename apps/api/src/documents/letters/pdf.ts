import { Logger } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { docxParagraphs } from './docx';

// LIFE-2.05 Word → PDF and the issue stamp (P05 Q1, founder D4). One converter, chosen by the environment:
//   GOTENBERG_URL                 Gotenberg (LibreOffice inside), a container on the internal network with no internet
//                                 access; Indian-language fonts are baked into its image (docker/gotenberg);
//   LETTER_PDF_CONVERTER=dev-fake laptops and tests only: a plain PDF of the filled letter's text (Latin script only),
//                                 refused in production;
//   neither                       letters cannot be rendered: they stay "being prepared" and the job retries (fail closed).
// Then pdf-lib stamps every page with the reference and the public check, and the last page with a QR code and the
// signatory's signature image (founder D5); payroll's DSC signing adapter signs after that when the type asks for it.

export interface PdfConverter {
  readonly name: string;
  toPdf(docx: Buffer, opts: { pdfA: boolean }): Promise<Buffer>;
}

const MAX_PDF = 20 * 1024 * 1024;

export class GotenbergConverter implements PdfConverter {
  readonly name = 'gotenberg';
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async toPdf(docx: Buffer, opts: { pdfA: boolean }): Promise<Buffer> {
    const form = new FormData();
    form.append('files', new Blob([new Uint8Array(docx)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'letter.docx');
    if (opts.pdfA) form.append('pdfa', 'PDF/A-2b');
    const res = await fetch(`${this.url.replace(/\/$/, '')}/forms/libreoffice/convert`, { method: 'POST', body: form, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new Error(`The PDF service answered ${res.status}`);
    const out = Buffer.from(await res.arrayBuffer());
    if (out.length > MAX_PDF || !out.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('The PDF service returned something that is not a PDF');
    return out;
  }
}

/** DEVELOPMENT ONLY: the letter's text on A4 pages, no layout. Never in production. */
export class DevFakeConverter implements PdfConverter {
  readonly name = 'dev-fake (NOT the real PDF converter)';

  async toPdf(docx: Buffer): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage([595, 842]);
    let y = 780;
    for (const para of docxParagraphs(docx)) {
      for (const line of wrap(winAnsi(para), font, 11, 495)) {
        if (y < 90) {
          page = pdf.addPage([595, 842]);
          y = 780;
        }
        page.drawText(line, { x: 50, y, size: 11, font });
        y -= 15;
      }
      y -= 6;
    }
    return Buffer.from(await pdf.save());
  }
}

export function converterFromEnv(env = process.env, logger = new Logger('LetterPdf')): PdfConverter | null {
  if (env.GOTENBERG_URL) return new GotenbergConverter(env.GOTENBERG_URL);
  if (env.LETTER_PDF_CONVERTER === 'dev-fake') {
    if (env.NODE_ENV === 'production') throw new Error('LETTER_PDF_CONVERTER=dev-fake is for laptops only. Set GOTENBERG_URL.');
    logger.warn('Letters use the DEV FAKE PDF converter (plain text, Latin script only). Never use this outside a laptop.');
    return new DevFakeConverter();
  }
  logger.warn('No PDF converter configured (GOTENBERG_URL): letters stay "being prepared" until one is.');
  return null;
}

/** pdf-lib's standard fonts only encode WinAnsi; other characters become "?" (the real converter has Indic fonts). */
const winAnsi = (s: string) => s.replace(/[^ -~ -ÿ\n]/g, (c) => (c === '’' || c === '‘' ? "'" : c === '“' || c === '”' ? '"' : c === '–' || c === '—' ? '-' : c === '₹' ? 'Rs.' : '?'));

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    let line = '';
    for (const word of raw.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export interface Stamp {
  referenceNo: string;
  verifyCode: string;
  verifyUrl: string;
  signatory?: { name: string; title: string; image?: Buffer | null } | null;
}

/** Reference and check line on every page; QR code and signature image on the last page. */
export async function stampPdf(input: Buffer, s: Stamp): Promise<Buffer> {
  const pdf = await PDFDocument.load(input);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const qr = await pdf.embedPng(await QRCode.toBuffer(s.verifyUrl, { errorCorrectionLevel: 'M', margin: 1, width: 180 }));
  const pages = pdf.getPages();
  pages.forEach((p, i) => footer(p, font, `Ref. ${s.referenceNo} · Check this letter at ${s.verifyUrl.replace(/\/[^/]+$/, '')} with code ${s.verifyCode} · Page ${i + 1} of ${pages.length}`));
  const last = pages[pages.length - 1];
  last.drawImage(qr, { x: last.getWidth() - 110, y: 40, width: 70, height: 70 });
  if (s.signatory?.image) {
    const img = s.signatory.image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? await pdf.embedPng(s.signatory.image) : await pdf.embedJpg(s.signatory.image);
    const w = 120;
    const h = (img.height / img.width) * w;
    last.drawImage(img, { x: 50, y: 70, width: w, height: Math.min(h, 50) });
    last.drawText(winAnsi(`${s.signatory.name}, ${s.signatory.title}`), { x: 50, y: 58, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
  }
  return Buffer.from(await pdf.save());
}

function footer(page: PDFPage, font: PDFFont, text: string) {
  const size = 7;
  const lines = wrap(winAnsi(text), font, size, page.getWidth() - 160);
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 28 - i * 9, size, font, color: rgb(0.35, 0.35, 0.35) }));
}

/** A "Preview, not issued" mark on every page (template checks and the issuer's preview). */
export async function previewMark(input: Buffer): Promise<Buffer> {
  const pdf = await PDFDocument.load(input);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const p of pdf.getPages()) p.drawText('PREVIEW - NOT ISSUED', { x: 50, y: p.getHeight() - 30, size: 12, font, color: rgb(0.8, 0.1, 0.1) });
  return Buffer.from(await pdf.save());
}

/**
 * YX-DOC-12 the sealed acceptance copy: the letter's pages as issued, then a completion page with who accepted, when,
 * how and the issued letter's SHA-256. The issued (possibly DSC-signed) file itself is never changed.
 */
export async function acceptanceCopy(letter: Buffer, e: { title: string; referenceNo: string; letterSha256: string; who: string; at: string; channel: string; ip: string | null; device: string | null; assurance: string }): Promise<Buffer> {
  const src = await PDFDocument.load(letter, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const page = out.addPage([595, 842]);
  page.drawText('Acceptance certificate', { x: 50, y: 780, size: 16, font: bold });
  const rows: [string, string][] = [
    ['Letter', `${e.title} (${e.referenceNo})`],
    ['SHA-256 of the issued letter', e.letterSha256],
    ['Accepted by', e.who],
    ['Accepted at (UTC)', e.at],
    ['How', `Read the letter, ticked "I accept" and entered a one-time code sent by ${e.channel}`],
    ['Sign-in strength', e.assurance],
    ['IP address', e.ip ?? 'not known'],
    ['Device', e.device ?? 'not known'],
  ];
  let y = 740;
  for (const [k, v] of rows) {
    page.drawText(winAnsi(k), { x: 50, y, size: 9, font: bold });
    for (const line of wrap(winAnsi(v), font, 9, 330)) {
      page.drawText(line, { x: 215, y, size: 9, font });
      y -= 13;
    }
    y -= 6;
  }
  page.drawText(winAnsi('This page was added by YukthiX when the letter was accepted. The issued letter itself is unchanged; its hash above proves which letter was accepted.'), { x: 50, y: y - 10, size: 8, font, color: rgb(0.35, 0.35, 0.35), maxWidth: 495, lineHeight: 11 });
  return Buffer.from(await out.save());
}
