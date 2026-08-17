import { validatePdfUpload, MAX_RESUME_BYTES } from './pdf-validation';

describe('validatePdfUpload', () => {
  it('accepts a PDF-magic-byte buffer within the size cap', () => {
    expect(validatePdfUpload(Buffer.from('%PDF-1.7\n...'))).toEqual({ ok: true });
  });
  it('rejects a non-PDF buffer', () => {
    expect(validatePdfUpload(Buffer.from('PK\x03\x04 zip'))).toEqual({ ok: false, reason: 'not_pdf' });
  });
  it('rejects an oversized buffer', () => {
    const big = Buffer.alloc(MAX_RESUME_BYTES + 1, 0x25);
    expect(validatePdfUpload(big)).toEqual({ ok: false, reason: 'too_large' });
  });
});
