import { generateKeyPairSync, sign } from 'crypto';
import { checkEinvoiceQr, keysFromPem } from './einvoice';
import { DevFakeReader, parseWorkerOutput } from './ocr';
import { dateOf, lowConfidence, moneyOf, parseReceiptText } from './ocr-parse';

// XP-2.08 (M05-BUILD-DESIGN §13.4, §14.6): the strict worker-output check, the receipt-text parser with confidence,
// the dev-fake reader and the e-invoice QR signature check (with a test key pair; the portal's keys are configuration).

describe('worker output is untrusted and parsed strictly', () => {
  it('accepts only { lines: [{ text, score }], qr }', () => {
    expect(parseWorkerOutput({ lines: [{ text: 'TOTAL 100', score: 0.9 }], qr: null })).toEqual({ lines: [{ text: 'TOTAL 100', score: 0.9 }], qr: null, phash: null });
    // E5 (F4): an optional 64-bit image hash, 16 lower-case hex, nothing else.
    expect(parseWorkerOutput({ lines: [], qr: null, phash: 'f0e1d2c3b4a59687' })!.phash).toBe('f0e1d2c3b4a59687');
    expect(parseWorkerOutput({ lines: [], qr: null, phash: 'F0E1D2C3B4A59687' })).toBeNull();
    expect(parseWorkerOutput({ lines: [], qr: null, phash: 'f0e1;drop table' })).toBeNull();
    expect(parseWorkerOutput({ lines: [], qr: null, amount: '100' })).toBeNull();
    expect(parseWorkerOutput({ lines: [{ text: 'x', score: 1.5 }], qr: null })).toBeNull();
    expect(parseWorkerOutput({ lines: [{ text: 'x', score: 0.5, html: '<b>' }], qr: null })).toBeNull();
    expect(parseWorkerOutput({ lines: 'TOTAL', qr: null })).toBeNull();
    expect(parseWorkerOutput({ lines: [], qr: 'x'.repeat(5000) })).toBeNull();
    expect(parseWorkerOutput([])).toBeNull();
    expect(parseWorkerOutput({ lines: [{ text: 'y'.repeat(1000), score: 0.5 }], qr: null })!.lines[0].text).toHaveLength(300);
  });
});

describe('receipt text → suggested fields', () => {
  it('reads Indian money and dates', () => {
    expect(moneyOf('Grand Total ₹ 1,18,000.50')).toBe('118000.50');
    expect(moneyOf('Rs. 450')).toBe('450.00');
    expect(moneyOf('Thank you')).toBeNull();
    expect(dateOf('Date: 01/10/2026')).toBe('2026-10-01');
    expect(dateOf('12-Oct-26')).toBe('2026-10-12');
    expect(dateOf('31/02/2026')).toBeNull();
  });

  it('a hotel bill: merchant, date, GSTIN, invoice number, tax lines and the total, each with a confidence', () => {
    const f = parseReceiptText([
      { text: 'Hotel Sea View', score: 0.97 },
      { text: 'TAX INVOICE', score: 0.99 },
      { text: 'GSTIN: 27AAPFU0939F1ZV', score: 0.95 },
      { text: 'Invoice No: SV/2026/1182', score: 0.93 },
      { text: 'Date 01-10-2026', score: 0.96 },
      { text: 'Room tariff 1,000.00', score: 0.9 },
      { text: 'CGST 9% 90.00', score: 0.92 },
      { text: 'SGST 9% 90.00', score: 0.91 },
      { text: 'Grand Total 1,180.00', score: 0.94 },
    ]);
    expect(f.merchant).toEqual({ value: 'Hotel Sea View', confidence: 0.78 });
    expect(f.gstin).toEqual({ value: '27AAPFU0939F1ZV', confidence: 0.95 });
    expect(f.invoiceNo?.value).toBe('SV/2026/1182');
    expect(f.date).toEqual({ value: '2026-10-01', confidence: 0.96 });
    expect(f.cgst?.value).toBe('90.00');
    expect(f.sgst?.value).toBe('90.00');
    expect(f.amount).toEqual({ value: '1180.00', confidence: 0.94 });
    expect(lowConfidence(f)).toEqual(['merchant']);
  });

  it('a typo in the GSTIN and an unlabelled total come back at low confidence', () => {
    const f = parseReceiptText([{ text: 'Chai Point', score: 0.9 }, { text: '27AAPFU0939F1ZW', score: 0.9 }, { text: '120.00', score: 0.8 }]);
    expect(f.gstin!.confidence).toBeLessThan(0.5);
    expect(f.amount).toEqual({ value: '120.00', confidence: 0.4 });
  });

  it('the dev-fake reader reads lines (and an optional score) from the file name', async () => {
    const r = await new DevFakeReader().read(Buffer.from('x'), 'image/png', { name: 'receipt__Cafe Mocha__Date 02-10-2026__Grand Total 450.00@0.6.png', country: 'IN', currency: 'INR' });
    expect(r).toMatchObject({ ok: true, adapter: 'dev-fake', qr: null, fields: { amount: { value: '450.00', confidence: 0.6 }, date: { value: '2026-10-02' } } });
  });
});

describe('e-invoice QR (§13.4)', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = (data: Record<string, unknown>, key = privateKey, alg = 'RS256') => {
    const head = `${enc({ alg, typ: 'JWT' })}.${enc({ data: JSON.stringify(data), iss: 'NIC' })}`;
    return `${head}.${sign('RSA-SHA256', Buffer.from(head), key).toString('base64url')}`;
  };
  const DATA = { SellerGstin: '27AAPFU0939F1ZV', BuyerGstin: '29AAPFU0939F1ZT', DocNo: 'SV/1182', DocTyp: 'INV', DocDt: '01/10/2026', TotInvVal: 1180, Irn: 'ABC123' };

  it('a token signed with the portal key is verified and gives the invoice fields', () => {
    expect(checkEinvoiceQr(token(DATA), keysFromPem(pem))).toEqual({ status: 'verified', fields: { sellerGstin: '27AAPFU0939F1ZV', buyerGstin: '29AAPFU0939F1ZT', docNo: 'SV/1182', docDate: '2026-10-01', total: '1180.00', irn: 'abc123' } });
  });

  it('a token signed with another key, or altered, is not verified; without keys nothing verifies; other QRs are ignored', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect(checkEinvoiceQr(token(DATA, other), keysFromPem(pem)).status).toBe('unverified');
    const t = token(DATA).split('.');
    const altered = `${t[0]}.${enc({ data: JSON.stringify({ ...DATA, TotInvVal: 11800 }) })}.${t[2]}`;
    expect(checkEinvoiceQr(altered, keysFromPem(pem))).toMatchObject({ status: 'unverified', fields: { total: '11800.00' } });
    expect(checkEinvoiceQr(token(DATA), [])).toMatchObject({ status: 'unverified', reason: expect.stringMatching(/No e-invoice portal key/) });
    expect(checkEinvoiceQr('https://pay.example/upi?x=1', keysFromPem(pem))).toEqual({ status: 'not_einvoice' });
    expect(keysFromPem('-----BEGIN PUBLIC KEY-----\nnot a key\n-----END PUBLIC KEY-----')).toEqual([]);
  });
});
