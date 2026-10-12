import { promises as fs } from 'fs';
import { join } from 'path';
import { PaddleWorkerReader } from '../src/expenses/ocr';
import { LOOK_ALIKE_BITS, hamming } from '../src/expenses/fx';

// Contract test of the real receipt OCR worker (M05-BUILD-DESIGN §14.6, XP-2.10) through the API's adapter: the worker
// container runs with no network and shares only a spool directory. It runs only when OCR_WORKER_SPOOL and
// OCR_SAMPLES point at a running worker's spool and the synthetic samples (apps/ocr-worker/samples); CI keeps the fake.
const spool = process.env.OCR_WORKER_SPOOL;
const samples = process.env.OCR_SAMPLES;
const maybe = spool && samples ? describe : describe.skip;
// Logged so a skipped run says why (CI has no worker image; the fake reader covers the API side).
if (!spool || !samples) console.info('ocr-worker contract test skipped: OCR_WORKER_SPOOL and OCR_SAMPLES are not set (no running OCR worker).');

maybe('receipt OCR worker (PaddleOCR, isolated)', () => {
  const reader = new PaddleWorkerReader(spool ?? '', 60_000);
  const read = async (name: string, mime: string) => reader.read(await fs.readFile(join(samples ?? '', name)), mime);

  it('a hotel bill: total, date, GSTIN, invoice number and tax lines, each with a confidence', async () => {
    const r = await read('hotel.png', 'image/png');
    expect(r.ok).toBe(true);
    expect(r.adapter).toBe('paddle-worker');
    expect(r.fields.amount?.value).toBe('5900.00');
    expect(r.fields.date?.value).toBe('2026-10-01');
    expect(r.fields.gstin?.value).toBe('27AAPFU0939F1ZV');
    expect(r.fields.invoiceNo?.value).toBe('SV/2026/1182');
    expect(r.fields.cgst?.value).toBe('450.00');
    for (const f of Object.values(r.fields)) expect(f!.confidence).toBeGreaterThan(0);
  }, 90_000);

  it('a tilted photo still reads its total', async () => {
    expect((await read('hotel-tilted.jpg', 'image/jpeg')).fields.amount?.value).toBe('5900.00');
  }, 90_000);

  it('a PDF bill is rendered and read inside the worker', async () => {
    const r = await read('cafe.pdf', 'application/pdf');
    expect(r.fields.amount?.value).toBe('580.00');
    expect(r.fields.merchant?.value).toMatch(/Cafe Mocha/i);
  }, 90_000);

  it('a QR code on the bill comes back as its raw text for the API to check', async () => {
    expect((await read('taxi-qr.png', 'image/png')).qr).toBe('eyJhbGciOiJSUzI1NiJ9.eyJkYXRhIjoie30ifQ.c2lnbmF0dXJl');
  }, 90_000);

  it('the same bill photographed again has a near image hash; a different bill does not (F4)', async () => {
    const a = (await read('hotel.png', 'image/png')).phash!;
    const b = (await read('hotel-again.jpg', 'image/jpeg')).phash!;
    const c = (await read('taxi-qr.png', 'image/png')).phash!;
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hamming(a, b)).toBeLessThanOrEqual(LOOK_ALIKE_BITS);
    expect(hamming(a, c)).toBeGreaterThan(LOOK_ALIKE_BITS);
  }, 90_000);

  it('something that is not an image gives an empty read, never an error', async () => {
    const r = await reader.read(Buffer.from('%PDF-1.4 not really'), 'application/pdf');
    expect(r.ok).toBe(true);
    expect(r.fields).toEqual({});
  }, 90_000);
});
