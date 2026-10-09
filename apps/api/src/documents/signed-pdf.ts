import { createHash, webcrypto } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

// Founder decision D1 (9 Oct 2026, M03-BUILD-DESIGN §19): a PDF signed by the company's USB token (through the signing
// helper) is accepted only when all three hold:
//   (a) the PDF signature (a CMS / PKCS#7 detached signature over its /ByteRange) is cryptographically valid;
//   (b) the signer's certificate chains to a root of the India CCA (configurable data: DSC_TRUSTED_ROOTS, a PEM bundle),
//       every certificate is inside its validity period now, and none is revoked (OCSP, else the CRL);
//   (c) the signed bytes start with exactly the document we issued (its stored SHA-256 and length), and the signature
//       covers the whole file except its own hole, so nothing was added or changed.
// The checks use pkijs (PKI.js, PeculiarVentures), not our own cryptography. Every refusal says why, in plain words.

pkijs.setEngine('node', new pkijs.CryptoEngine({ name: 'node', crypto: webcrypto as unknown as Crypto }));

export class SignatureRefused extends Error {}

export type RevocationStatus = 'good' | 'revoked' | 'unknown';
export interface RevocationChecker {
  /** The status of `cert` as its issuer `issuer` publishes it now (OCSP or CRL). */
  status(cert: pkijs.Certificate, issuer: pkijs.Certificate): Promise<RevocationStatus>;
}

export interface SignerInfo {
  subject: string;
  issuer: string;
  serial: string;
  notAfter: Date;
}

const toAB = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const cn = (name: pkijs.RelativeDistinguishedNames) => name.typesAndValues.find((t) => t.type === '2.5.4.3')?.value.valueBlock.value ?? name.typesAndValues.map((t) => t.value.valueBlock.value).join(', ');
const hex = (b: ArrayBuffer) => Buffer.from(b).toString('hex');

/** Certificates of a PEM bundle (comments and blank lines allowed). */
export function parsePemBundle(pem: string): pkijs.Certificate[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return blocks.map((b) => pkijs.Certificate.fromBER(toAB(Buffer.from(b.replace(/-----[A-Z ]+-----|\s/g, ''), 'base64'))));
}

/** The configured CCA roots (DSC_TRUSTED_ROOTS, default apps/api/config/dsc-trusted-roots.pem). */
export function trustedRoots(): pkijs.Certificate[] {
  const path = process.env.DSC_TRUSTED_ROOTS ?? join(__dirname, '..', '..', 'config', 'dsc-trusted-roots.pem');
  try {
    return parsePemBundle(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}

/** /ByteRange and /Contents of the last signature in the file (the helper appends one incremental update). */
export function signatureParts(pdf: Buffer): { range: [number, number, number, number]; cms: Buffer } {
  const text = pdf.toString('latin1');
  const at = text.lastIndexOf('/ByteRange');
  if (at < 0) throw new SignatureRefused('The file has no PDF signature.');
  const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(text.slice(at, at + 200));
  if (!m) throw new SignatureRefused('The signature’s byte range cannot be read.');
  const range = m.slice(1).map(Number) as [number, number, number, number];
  const [a, b, c, d] = range;
  if (a !== 0 || b <= 0 || c <= b || c + d !== pdf.length) throw new SignatureRefused('The signature does not cover the whole file, so something may have been added after signing.');
  const hole = text.slice(b, c);
  if (!/^<[0-9A-Fa-f]+>$/.test(hole)) throw new SignatureRefused('The signature value is not where the byte range says.');
  return { range, cms: Buffer.from(hole.slice(1, -1), 'hex') };
}

/**
 * The default revocation check: the certificate's OCSP responder (its signed answer checked against the issuer), else
 * the CRL from its distribution point (signature checked). Only http(s) addresses taken from a certificate that already
 * chains to a configured root; 5 seconds and 2 MB at most.
 */
export class OnlineRevocationChecker implements RevocationChecker {
  private async fetchBytes(url: string, init?: RequestInit): Promise<ArrayBuffer | null> {
    if (!/^https?:\/\//i.test(url)) return null;
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!res.ok) return null;
      const body = await res.arrayBuffer();
      return body.byteLength > 2_000_000 ? null : body;
    } catch {
      return null;
    }
  }

  /** OCSP addresses (authority information access) or CRL distribution points of a certificate. */
  private urls(cert: pkijs.Certificate, ext: string, method: string): string[] {
    const e = cert.extensions?.find((x) => x.extnID === ext);
    if (!e?.parsedValue) return [];
    const out: string[] = [];
    if (ext === '1.3.6.1.5.5.7.1.1') for (const d of (e.parsedValue as pkijs.InfoAccess).accessDescriptions) if (d.accessMethod === method && d.accessLocation.type === 6) out.push(String(d.accessLocation.value));
    if (ext === '2.5.29.31') for (const p of (e.parsedValue as pkijs.CRLDistributionPoints).distributionPoints) for (const n of (p.distributionPoint as pkijs.GeneralName[] | undefined) ?? []) if (n.type === 6) out.push(String(n.value));
    return out;
  }

  async status(cert: pkijs.Certificate, issuer: pkijs.Certificate): Promise<RevocationStatus> {
    for (const url of this.urls(cert, '1.3.6.1.5.5.7.1.1', '1.3.6.1.5.5.7.48.1')) {
      const req = new pkijs.OCSPRequest();
      await req.createForCertificate(cert, { hashAlgorithm: 'SHA-256', issuerCertificate: issuer });
      const body = await this.fetchBytes(url, { method: 'POST', headers: { 'Content-Type': 'application/ocsp-request' }, body: req.toSchema(true).toBER(false) });
      if (!body) continue;
      try {
        const res = pkijs.OCSPResponse.fromBER(body);
        if (!res.responseBytes) continue;
        const basic = pkijs.BasicOCSPResponse.fromBER(res.responseBytes.response.valueBlock.valueHexView.slice().buffer as ArrayBuffer);
        if (!(await basic.verify({ trustedCerts: [issuer] }))) continue;
        const s = await basic.getCertificateStatus(cert, issuer);
        if (s.isForCertificate) return s.status === 0 ? 'good' : s.status === 1 ? 'revoked' : 'unknown';
      } catch {
        continue;
      }
    }
    for (const url of this.urls(cert, '2.5.29.31', '')) {
      const body = await this.fetchBytes(url);
      if (!body) continue;
      try {
        const crl = pkijs.CertificateRevocationList.fromBER(body);
        if (!(await crl.verify({ issuerCertificate: issuer }))) continue;
        if (crl.nextUpdate && crl.nextUpdate.value < new Date()) continue;
        return crl.isCertificateRevoked(cert) ? 'revoked' : 'good';
      } catch {
        continue;
      }
    }
    return 'unknown';
  }
}

/**
 * Checks a signed PDF against D1 (a)–(c). `issued` is what we stored when we issued the document. Returns the signer;
 * throws SignatureRefused with the reason otherwise.
 */
export async function verifySignedPdf(pdf: Buffer, issued: { sha256: string; bytes: number }, roots: pkijs.Certificate[], revocation: RevocationChecker, now = new Date()): Promise<SignerInfo> {
  if (!roots.length) throw new SignatureRefused('No licensed certifying authority roots are set up, so signed files cannot be accepted yet. Ask YukthiX support.');
  const { range, cms } = signatureParts(pdf);
  const [, b, c, d] = range;
  // (c) The issued document, byte for byte, is the start of what was signed.
  if (issued.bytes > b || createHash('sha256').update(pdf.subarray(0, issued.bytes)).digest('hex') !== issued.sha256) {
    throw new SignatureRefused('The signed file is not the document that was issued. Sign the file downloaded from YukthiX, without changing it.');
  }
  // (a) The signature over the byte range.
  let signed: pkijs.SignedData;
  try {
    const asn = asn1js.fromBER(toAB(cms));
    if (asn.offset === -1) throw new Error('bad');
    const info = new pkijs.ContentInfo({ schema: asn.result });
    if (info.contentType !== pkijs.ContentInfo.SIGNED_DATA) throw new Error('not signed data');
    signed = new pkijs.SignedData({ schema: info.content });
  } catch {
    throw new SignatureRefused('The signature in the file cannot be read.');
  }
  if (signed.signerInfos.length !== 1) throw new SignatureRefused('The file must carry exactly one signature.');
  const data = Buffer.concat([pdf.subarray(0, b), pdf.subarray(c, c + d)]);
  let result: pkijs.SignedDataVerifyResult;
  try {
    result = await signed.verify({ signer: 0, data: toAB(data), checkChain: true, trustedCerts: roots, checkDate: now, extendedMode: true });
  } catch (e) {
    const r = e as { signatureVerified?: boolean | null; signerCertificateVerified?: boolean | null; message?: string };
    if (r.signatureVerified === false) throw new SignatureRefused('The signature does not match the file: it was changed after signing.');
    if (r.signerCertificateVerified === false) throw new SignatureRefused('The signer’s certificate does not lead to a licensed certifying authority, or it has expired or is not yet valid.');
    throw new SignatureRefused(`The signature could not be checked: ${String(r.message ?? 'unknown problem').slice(0, 120)}`);
  }
  if (!result.signatureVerified) throw new SignatureRefused('The signature does not match the file: it was changed after signing.');
  if (!result.signerCertificateVerified || !result.signerCertificate || result.certificatePath.length < 2) throw new SignatureRefused('The signer’s certificate does not lead to a licensed certifying authority, or it has expired or is not yet valid.');
  // (b) Validity now, and revocation of every certificate below the root.
  const path = result.certificatePath;
  for (const cert of path) {
    if (cert.notBefore.value > now || cert.notAfter.value < now) throw new SignatureRefused('A certificate in the signer’s chain has expired or is not yet valid.');
  }
  for (let i = 0; i < path.length - 1; i++) {
    const s = await revocation.status(path[i], path[i + 1]);
    if (s === 'revoked') throw new SignatureRefused(i === 0 ? 'The signer’s certificate has been revoked.' : 'A certifying authority in the signer’s chain has been revoked.');
    if (s !== 'good') throw new SignatureRefused('We could not confirm that the signer’s certificate is not revoked (no answer from its authority). Try again later.');
  }
  const cert = result.signerCertificate;
  return { subject: cn(cert.subject), issuer: cn(cert.issuer), serial: hex(cert.serialNumber.valueBlock.valueHexView.slice().buffer), notAfter: cert.notAfter.value };
}

/** Nest tokens: the configured roots and the revocation checker (tests put their own in). */
export const DSC_ROOTS = 'DSC_ROOTS';
export const DSC_REVOCATION = 'DSC_REVOCATION';
