export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// Magic-byte check: a real PDF starts with "%PDF". Size cap checked first so a huge upload is
// rejected before we inspect bytes. This runs on a PUBLIC endpoint, so it is the trust boundary.
export function validatePdfUpload(buffer: Buffer): { ok: true } | { ok: false; reason: 'too_large' | 'not_pdf' } {
  if (buffer.length > MAX_RESUME_BYTES) return { ok: false, reason: 'too_large' };
  const header = buffer.subarray(0, 5).toString('latin1');
  if (!header.startsWith('%PDF')) return { ok: false, reason: 'not_pdf' };
  return { ok: true };
}
