import type { Logger } from '@nestjs/common';
import { X509Certificate } from 'crypto';
import * as pkijs from 'pkijs';
import type { RuleSet } from '../statutory/evaluator';
import type { RuleFileSet } from '../statutory/load-rule-file';

// Founder decision 5b-D3 (9 Oct 2026): the India CCA root certificates a USB-token signature must chain to are published
// data in the rule store (statute IN.CCA-ROOTS), loaded from the CCA's own files (cca.gov.in, "Root Certificate") through
// the console's two-person flow, each with its SHA-256 fingerprint. A root whose bytes do not match its fingerprint is
// never trusted. The CCA publishes them as DER, PEM or bare base64; all three are read.

export const CCA_ROOTS = 'IN.CCA-ROOTS';

export interface CcaRoot {
  name: string;
  sha256: string;
  notAfter: string;
  pem: string;
  source: string;
}

/** The DER bytes of a certificate file in DER, PEM or bare base64 form. */
export function readCertificate(bytes: Buffer): Buffer {
  const text = bytes.toString('latin1');
  if (text.includes('-----BEGIN CERTIFICATE-----')) return Buffer.from(text.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, ''), 'base64');
  if (/^[A-Za-z0-9+/=\s]+$/.test(text)) return Buffer.from(text.replace(/\s+/g, ''), 'base64');
  return bytes;
}

const fingerprint = (c: X509Certificate) => c.fingerprint256.replace(/:/g, '').toLowerCase();
const toPem = (der: Buffer) => `-----BEGIN CERTIFICATE-----\n${der.toString('base64').replace(/(.{64})/g, '$1\n').trim()}\n-----END CERTIFICATE-----`;

/** A root entry for the rule store from a CCA file (its fingerprint computed here, to be compared with cca.gov.in). */
export function rootEntry(bytes: Buffer, source: string): CcaRoot {
  const der = readCertificate(bytes);
  const c = new X509Certificate(der);
  if (!c.ca) throw new Error(`${c.subject} is not a certifying authority certificate`);
  return { name: c.subject.split('\n').find((l) => l.startsWith('CN='))?.slice(3) ?? c.subject, sha256: fingerprint(c), notAfter: new Date(c.validTo).toISOString().slice(0, 10), pem: toPem(der), source };
}

/** A rule set listing the roots in force from `validFrom` (the console publishes it; a second person checks it). */
export function rootsRuleSet(roots: CcaRoot[], validFrom: string, version: string): RuleFileSet {
  return {
    statute: CCA_ROOTS,
    jurisdiction: 'IN',
    version,
    validFrom,
    validTo: null,
    lawVersion: 'OLD-ACT',
    verify: true,
    source: 'Information Technology Act, 2000 s.18 and the CCA’s Root Certifying Authority of India: root certificates as published on cca.gov.in (Root Certificate page), each with its SHA-256 fingerprint.',
    values: { kind: 'trusted_roots', roots },
    golden: roots.map((r) => ({ name: `${r.name} is trusted`, fn: 'trusted_roots', input: { sha256: r.sha256 }, expected: { trusted: true } })),
  };
}

/** Problems with a trusted-roots rule set (each certificate parses, is a CA, matches its fingerprint and is in date). */
export function rootProblems(rs: RuleSet): string[] {
  const roots = (rs.values.roots as CcaRoot[] | undefined) ?? [];
  if (!roots.length) return ['A trusted-roots rule set lists at least one root'];
  return roots.flatMap((r) => {
    try {
      const c = new X509Certificate(readCertificate(Buffer.from(r.pem, 'latin1')));
      if (fingerprint(c) !== r.sha256.replace(/:/g, '').toLowerCase()) return [`${r.name}: the certificate does not match its SHA-256 fingerprint`];
      if (!c.ca) return [`${r.name}: not a certifying authority certificate`];
      if (new Date(c.validTo).toISOString().slice(0, 10) < rs.validFrom) return [`${r.name}: expired before the rule set starts`];
      return [];
    } catch {
      return [`${r.name}: the certificate cannot be read`];
    }
  });
}

/** The roots of a published rule set, each checked against its fingerprint again before use. */
export function rootsOf(rs: RuleSet, log?: Logger): pkijs.Certificate[] {
  return ((rs.values.roots as CcaRoot[]) ?? []).flatMap((r) => {
    const der = readCertificate(Buffer.from(r.pem, 'latin1'));
    if (fingerprint(new X509Certificate(der)) !== r.sha256.replace(/:/g, '').toLowerCase()) {
      log?.error(`CCA root ${r.name} does not match its fingerprint: not trusted`);
      return [];
    }
    return [pkijs.Certificate.fromBER(der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer)];
  });
}
