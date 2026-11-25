import { execFileSync } from 'child_process';
import { join } from 'path';
import { inflateSync } from 'zlib';

/** The text of each page of a PDF, read by pdf.js (see pdf-text.mjs). */
export function pdfPages(pdf: Buffer): string[] {
  return JSON.parse(execFileSync(process.execPath, [join(__dirname, 'pdf-text.mjs')], { input: pdf, maxBuffer: 32 * 1024 * 1024 }).toString('utf8')) as string[];
}

/** All the text of a PDF on one line (runs of white space made one space). */
export const pdfText = (pdf: Buffer) => pdfPages(pdf).join(' ').replace(/\s+/g, ' ');

const ESC: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
/**
 * The ActualText of each marked run (what copy and search give in a full reader). pdf.js reads glyphs in drawn order, so a
 * Devanagari, Bengali or Gujarati vowel sign drawn before its consonant comes back first; the ActualText keeps the typed order.
 */
export function pdfActualTexts(pdf: Buffer): string[] {
  const out: string[] = [];
  const raw = pdf.toString('latin1');
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    let body: string;
    try {
      body = inflateSync(Buffer.from(raw.slice(start, raw.indexOf('endstream', start)), 'latin1')).toString('latin1');
    } catch {
      continue; // not a deflated content stream
    }
    for (const a of body.matchAll(/\/ActualText \(/g)) {
      let s = '';
      for (let i = a.index! + a[0].length, depth = 0; i < body.length; i++) {
        const c = body[i];
        if (c === '\\') {
          const oct = /^[0-7]{1,3}/.exec(body.slice(i + 1))?.[0];
          if (oct) {
            s += String.fromCharCode(parseInt(oct, 8));
            i += oct.length;
          } else s += ESC[body[++i]] ?? body[i];
          continue;
        }
        if (c === ')' && depth === 0) break;
        if (c === '(') depth++;
        if (c === ')') depth--;
        s += c;
      }
      const bytes = Buffer.from(s, 'latin1');
      out.push(bytes[0] === 0xfe && bytes[1] === 0xff ? bytes.subarray(2).swap16().toString('utf16le') : s);
    }
  }
  return out;
}
