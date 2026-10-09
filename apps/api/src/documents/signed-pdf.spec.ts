import { createHash } from 'crypto';
import { parsePemBundle, verifySignedPdf } from './signed-pdf';
import { revocationStub, signPdf, testPki, type TestPki } from '../../test/fixtures/dsc';

// Founder decision D1 (9 Oct 2026): a USB-token signed PDF is accepted only if (a) the signature is valid, (b) the signer
// chains to a configured CCA root, is in date and not revoked, and (c) the signed bytes are the document we issued.

const issuedPdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');
const issued = { sha256: createHash('sha256').update(issuedPdf).digest('hex'), bytes: issuedPdf.length };

describe('signed PDF checks (D1)', () => {
  let pki: TestPki;
  let roots: ReturnType<typeof parsePemBundle>;
  beforeAll(async () => {
    pki = await testPki();
    roots = parsePemBundle(`# test bundle\n${pki.rootPem}\n`);
  });

  it('accepts a valid signature over the issued document from an in-date, unrevoked signer under a configured root', async () => {
    const signer = await verifySignedPdf(await signPdf(issuedPdf, pki), issued, roots, revocationStub('good'));
    expect(signer).toMatchObject({ subject: 'Kaveri Foods Pvt Ltd', issuer: 'Test Licensed CA 2026' });
  });

  it('(a) refuses a file changed after signing', async () => {
    await expect(verifySignedPdf(await signPdf(issuedPdf, pki, { tamper: true }), issued, roots, revocationStub('good'))).rejects.toThrow(/changed after signing/);
  });

  it('(b) refuses a signer that does not chain to a configured root, an expired signer, a revoked one and an unknown status', async () => {
    const other = await testPki();
    await expect(verifySignedPdf(await signPdf(issuedPdf, other), issued, roots, revocationStub('good'))).rejects.toThrow(/licensed certifying authority/);
    const old = await testPki({ signerExpired: true });
    await expect(verifySignedPdf(await signPdf(issuedPdf, old), issued, parsePemBundle(old.rootPem), revocationStub('good'))).rejects.toThrow(/expired|licensed certifying authority/);
    const signed = await signPdf(issuedPdf, pki);
    await expect(verifySignedPdf(signed, issued, roots, revocationStub('revoked'))).rejects.toThrow(/revoked/);
    await expect(verifySignedPdf(signed, issued, roots, revocationStub('unknown'))).rejects.toThrow(/could not confirm/);
    await expect(verifySignedPdf(signed, issued, [], revocationStub('good'))).rejects.toThrow(/No licensed certifying authority roots/);
  });

  it('(c) refuses a validly signed file that is not the issued document, and a file with bytes after the signature', async () => {
    const otherDoc = Buffer.from('%PDF-1.7\n% a different document\n%%EOF\n', 'latin1');
    await expect(verifySignedPdf(await signPdf(otherDoc, pki), issued, roots, revocationStub('good'))).rejects.toThrow(/not the document that was issued/);
    const appended = Buffer.concat([await signPdf(issuedPdf, pki), Buffer.from('\n% added later\n')]);
    await expect(verifySignedPdf(appended, issued, roots, revocationStub('good'))).rejects.toThrow(/does not cover the whole file/);
    await expect(verifySignedPdf(issuedPdf, issued, roots, revocationStub('good'))).rejects.toThrow(/no PDF signature/);
  });
});
