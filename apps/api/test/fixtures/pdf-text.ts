import { execFileSync } from 'child_process';
import { join } from 'path';

/** The text of each page of a PDF, read by pdf.js (see pdf-text.mjs). */
export function pdfPages(pdf: Buffer): string[] {
  return JSON.parse(execFileSync(process.execPath, [join(__dirname, 'pdf-text.mjs')], { input: pdf, maxBuffer: 32 * 1024 * 1024 }).toString('utf8')) as string[];
}

/** All the text of a PDF on one line (runs of white space made one space). */
export const pdfText = (pdf: Buffer) => pdfPages(pdf).join(' ').replace(/\s+/g, ' ');
