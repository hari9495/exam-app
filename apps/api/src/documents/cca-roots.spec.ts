import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { checkShape, runGolden, type RuleSet } from '../statutory/evaluator';
import type { RuleFileSet } from '../statutory/load-rule-file';
import { readCertificate, rootEntry, rootsOf, rootsRuleSet } from './cca-roots';
import { parsePemBundle, verifySignedPdf } from './signed-pdf';
import { revocationStub, signPdf, testPki, type TestPki } from '../../test/fixtures/dsc';

// 5b-D3: CCA roots are published data with SHA-256 fingerprints. The loader reads the CCA's file forms (DER, PEM, bare
// base64); a root whose bytes do not match its fingerprint is refused at publish and never trusted; a signature checks
// against the published roots.
describe('CCA roots (5b-D3)', () => {
  let pki: TestPki;
  let der: Buffer;
  beforeAll(async () => {
    pki = await testPki();
    der = readCertificate(Buffer.from(pki.rootPem));
  });

  it('reads DER, PEM and bare base64 alike and fingerprints the certificate', () => {
    const b64 = Buffer.from(der.toString('base64').replace(/(.{76})/g, '$1\r\n'));
    for (const form of [der, Buffer.from(pki.rootPem), b64]) expect(readCertificate(form).equals(der)).toBe(true);
    expect(rootEntry(der, 'fixture').sha256).toBe(createHash('sha256').update(der).digest('hex'));
  });

  it('a published list passes its checks; a wrong fingerprint is refused and never trusted', async () => {
    const good = rootsRuleSet([rootEntry(der, 'fixture')], '2026-10-09', 'test');
    expect([...checkShape(good), ...good.golden.flatMap((g) => runGolden(good, g))]).toEqual([]);
    const bad: RuleSet = structuredClone(good);
    (bad.values.roots as { sha256: string }[])[0].sha256 = '00'.repeat(32);
    expect(checkShape(bad).join()).toMatch(/does not match its SHA-256 fingerprint/);
    expect(rootsOf(bad)).toEqual([]);
    const signed = await signPdf(Buffer.from('%PDF-1.7\n%%EOF\n'), pki);
    const issued = { sha256: createHash('sha256').update('%PDF-1.7\n%%EOF\n').digest('hex'), bytes: 15 };
    await expect(verifySignedPdf(signed, issued, rootsOf(good), revocationStub('good'))).resolves.toMatchObject({ issuer: 'Test Licensed CA 2026' });
    await expect(verifySignedPdf(signed, issued, rootsOf(bad), revocationStub('good'))).rejects.toThrow(/No licensed certifying authority roots/);
    expect(parsePemBundle(pki.rootPem)).toHaveLength(1);
  });

  it('the shipped pack holds the CCA India 2022 roots from cca.gov.in, each matching its fingerprint', () => {
    const [rs] = (JSON.parse(readFileSync(join(__dirname, '..', 'statutory', 'packs', 'in-cca-roots.json'), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
    expect([...checkShape(rs), ...rs.golden.flatMap((g) => runGolden(rs, g))]).toEqual([]);
    expect((rs.values.roots as { name: string; sha256: string }[]).map((r) => [r.name, r.sha256])).toEqual([
      ['CCA India 2022', '9a3fd3176798e842ddcb12c262f11cfacca70a8b84c6ea6fda30842a95a94cd8'],
      ['CCA India 2022 SPL', 'b724689b79b2ef9421ef8f5cc733eb093851b170ee715177005a09f226d8c91a'],
    ]);
    expect(rootsOf(rs)).toHaveLength(2);
  });
});
