import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { parseReceiptText, type OcrFields, type OcrTextLine } from './ocr-parse';

// Receipt OCR seam (M05-BUILD-DESIGN §14.6; founder D1, 12 Oct 2026): self-hosted PaddleOCR in an isolated worker
// (no network, non-root, CPU / memory / time limits) plus the e-invoice QR read. The adapter is chosen by
// EXPENSE_OCR_ADAPTER: 'paddle-worker' (production), 'dev-fake' (tests), 'none' (default: manual entry).
//
// The worker's output is untrusted: it is parsed strictly here (known keys only, capped strings, scores 0–1), and
// anything unexpected is a failed read, so the employee simply types the values. OCR only ever suggests (Q4).

export interface OcrResult {
  ok: boolean;
  adapter: string;
  fields: OcrFields;
  /** The raw text of a QR code on the receipt (an e-invoice QR is a signed token), checked separately (§13.4). */
  qr: string | null;
  /** E5 (F4): a 64-bit perceptual hash of the first page (16 hex), to spot a re-photographed receipt. */
  phash?: string | null;
  /** Why the read failed, in plain words (never shown as an error to the employee: manual entry is the fallback). */
  problem?: string;
}

export interface ReceiptReader {
  read(file: Buffer, mime: string, hints: { name: string; country: string; currency: string }): Promise<OcrResult>;
}

const MAX_LINES = 400;
const MAX_TEXT = 300;
const MAX_QR = 4096;

/** The worker's JSON, checked strictly: { lines: [{ text, score }], qr: string | null, phash?: 16 hex | null }. */
export function parseWorkerOutput(raw: unknown): { lines: OcrTextLine[]; qr: string | null; phash: string | null } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== 'lines' && k !== 'qr' && k !== 'phash')) return null;
  if (!Array.isArray(o.lines) || o.lines.length > MAX_LINES) return null;
  const lines: OcrTextLine[] = [];
  for (const l of o.lines) {
    if (!l || typeof l !== 'object' || Array.isArray(l)) return null;
    const x = l as Record<string, unknown>;
    if (Object.keys(x).some((k) => k !== 'text' && k !== 'score')) return null;
    if (typeof x.text !== 'string' || typeof x.score !== 'number' || !Number.isFinite(x.score) || x.score < 0 || x.score > 1) return null;
    lines.push({ text: x.text.slice(0, MAX_TEXT), score: x.score });
  }
  const qr = o.qr === null || o.qr === undefined ? null : typeof o.qr === 'string' && o.qr.length <= MAX_QR ? o.qr : undefined;
  if (qr === undefined) return null;
  const phash = o.phash === null || o.phash === undefined ? null : typeof o.phash === 'string' && /^[0-9a-f]{16}$/.test(o.phash) ? o.phash : undefined;
  if (phash === undefined) return null;
  return { lines, qr, phash };
}

/** Manual entry only (the e-invoice QR needs the worker's decoder, so it is not read either). */
export class NoReader implements ReceiptReader {
  async read(): Promise<OcrResult> {
    return { ok: false, adapter: 'none', fields: {}, qr: null, problem: 'Receipt reading is off.' };
  }
}

/**
 * Deterministic results for tests and local use: the upload's file name carries the text lines, e.g.
 * "receipt__Hotel Sea View__GSTIN 27AAPFU0939F1ZV__Date 01-10-2026__Grand Total 1,180.00@0.6.png"; a trailing @score
 * sets the recognition score (default 0.95). "__qr=<token>" passes a QR payload, "__phash=<16 hex>" an image hash.
 * Nothing leaves the process.
 */
export class DevFakeReader implements ReceiptReader {
  async read(_file: Buffer, _mime: string, hints: { name: string; country: string; currency: string }): Promise<OcrResult> {
    const parts = hints.name.replace(/\.[a-z0-9]+$/i, '').split('__').slice(1);
    const qr = parts.find((p) => p.startsWith('qr='))?.slice(3) ?? null;
    const phash = parts.find((p) => p.startsWith('phash='))?.slice(6) ?? null;
    const lines = parts.filter((p) => !p.startsWith('qr=') && !p.startsWith('phash=')).map((p) => {
      const at = p.lastIndexOf('@');
      return at > 0 && /^0?\.\d+$|^1$/.test(p.slice(at + 1)) ? { text: p.slice(0, at), score: Number(p.slice(at + 1)) } : { text: p, score: 0.95 };
    });
    const parsed = parseWorkerOutput({ lines, qr, phash });
    if (!parsed) return { ok: false, adapter: 'dev-fake', fields: {}, qr: null, problem: 'The fake reader got unexpected input.' };
    return { ok: true, adapter: 'dev-fake', fields: parseReceiptText(parsed.lines), qr: parsed.qr, phash: parsed.phash };
  }
}

/**
 * The isolated PaddleOCR worker, reached through a spool directory both sides mount (the worker has no network):
 * the API writes in/<id>.bin and in/<id>.json { mime }, the worker writes out/<id>.json { lines, qr, phash } and removes the
 * input. A missing or late answer is a failed read; the employee types the values.
 */
export class PaddleWorkerReader implements ReceiptReader {
  private readonly logger = new Logger('PaddleWorkerReader');
  constructor(
    private readonly spool: string,
    private readonly timeoutMs = 25_000,
  ) {}

  async read(file: Buffer, mime: string): Promise<OcrResult> {
    const id = randomUUID();
    const inDir = join(this.spool, 'in');
    const outFile = join(this.spool, 'out', `${id}.json`);
    try {
      await fs.writeFile(join(inDir, `${id}.bin`), file, { mode: 0o640 });
      // The job description is written last: the worker picks up a job only once its .json exists.
      await fs.writeFile(join(inDir, `${id}.json`), JSON.stringify({ mime }), { mode: 0o640 });
      const deadline = Date.now() + this.timeoutMs;
      while (Date.now() < deadline) {
        const text = await fs.readFile(outFile, 'utf8').catch(() => null);
        if (text !== null) {
          await fs.rm(outFile, { force: true });
          let raw: unknown;
          try {
            raw = JSON.parse(text.slice(0, 2_000_000));
          } catch {
            raw = null;
          }
          const parsed = parseWorkerOutput(raw);
          if (!parsed) return { ok: false, adapter: 'paddle-worker', fields: {}, qr: null, problem: 'The reader returned something unexpected.' };
          return { ok: true, adapter: 'paddle-worker', fields: parseReceiptText(parsed.lines), qr: parsed.qr, phash: parsed.phash };
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      return { ok: false, adapter: 'paddle-worker', fields: {}, qr: null, problem: 'The reader took too long.' };
    } catch (e) {
      this.logger.warn(`receipt read ${id}: ${(e as Error).message}`);
      return { ok: false, adapter: 'paddle-worker', fields: {}, qr: null, problem: 'The reader is not available.' };
    } finally {
      await fs.rm(join(inDir, `${id}.bin`), { force: true }).catch(() => undefined);
      await fs.rm(join(inDir, `${id}.json`), { force: true }).catch(() => undefined);
    }
  }
}

export function readerFromEnv(env: NodeJS.ProcessEnv = process.env): ReceiptReader {
  const kind = env.EXPENSE_OCR_ADAPTER ?? 'none';
  if (kind === 'dev-fake') return new DevFakeReader();
  if (kind === 'paddle-worker' && env.EXPENSE_OCR_SPOOL) return new PaddleWorkerReader(env.EXPENSE_OCR_SPOOL, Number(env.EXPENSE_OCR_TIMEOUT_MS ?? 25_000));
  return new NoReader();
}

export const RECEIPT_READER = 'RECEIPT_READER';
