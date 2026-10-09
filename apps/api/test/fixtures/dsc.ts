import { webcrypto } from 'crypto';
import * as x509 from '@peculiar/x509';
import * as pkijs from 'pkijs';

// Test PKI for the signed-PDF checks (founder decision D1): a stand-in "CCA" root, a licensed CA under it and a company
// signer, all generated per run (ECDSA P-256), and a helper that signs a PDF the way the signing helper does: one
// incremental update appended to the issued file, a detached CMS signature over everything but its own /Contents hole.

x509.cryptoProvider.set(webcrypto as unknown as Crypto);
const ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
const day = 86_400_000;

export interface TestPki {
  root: x509.X509Certificate;
  ca: x509.X509Certificate;
  signer: x509.X509Certificate;
  signerKey: CryptoKey;
  rootPem: string;
}

async function cert(subject: string, issuer: string, keys: CryptoKeyPair, signingKey: CryptoKey, isCa: boolean, from = Date.now() - day, to = Date.now() + 365 * day) {
  return x509.X509CertificateGenerator.create({
    serialNumber: Buffer.from(webcrypto.getRandomValues(new Uint8Array(8))).toString('hex'),
    subject,
    issuer,
    notBefore: new Date(from),
    notAfter: new Date(to),
    signingAlgorithm: ALG,
    publicKey: keys.publicKey,
    signingKey,
    extensions: [new x509.BasicConstraintsExtension(isCa, undefined, true), new x509.KeyUsagesExtension(isCa ? x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign : x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.nonRepudiation, true)],
  });
}

export async function testPki(opts: { signerExpired?: boolean } = {}): Promise<TestPki> {
  const gen = () => webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
  const [rk, ck, sk] = [await gen(), await gen(), await gen()];
  const root = await cert('CN=Test CCA Root 2026', 'CN=Test CCA Root 2026', rk, rk.privateKey, true);
  const ca = await cert('CN=Test Licensed CA 2026', root.subject, ck, rk.privateKey, true);
  const signer = await cert('CN=Kaveri Foods Pvt Ltd, O=Kaveri Foods', ca.subject, sk, ck.privateKey, false, opts.signerExpired ? Date.now() - 30 * day : Date.now() - day, opts.signerExpired ? Date.now() - day : Date.now() + 365 * day);
  return { root, ca, signer, signerKey: sk.privateKey, rootPem: root.toString('pem') };
}

const pk = (c: x509.X509Certificate) => pkijs.Certificate.fromBER(c.rawData);

/** Appends a signature to `issued` as the signing helper does; `tamper` changes a byte after signing (inside the range). */
export async function signPdf(issued: Buffer, pki: TestPki, opts: { tamper?: boolean; prefix?: Buffer } = {}): Promise<Buffer> {
  const HOLE = 8192;
  const head = Buffer.concat([opts.prefix ?? issued, Buffer.from('\n9 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0000000000 0000000000 0000000000] /Contents <', 'latin1')]);
  const tail = Buffer.from('> >>\nendobj\n%%EOF\n', 'latin1');
  const b = head.length - 1;
  const c = head.length + HOLE * 2 + 1;
  const total = c + tail.length - 1;
  const range = `[0 ${String(b).padStart(10, '0')} ${String(c).padStart(10, '0')} ${String(total - c).padStart(10, '0')}]`;
  const headFixed = Buffer.from(head.toString('latin1').replace('[0 0000000000 0000000000 0000000000]', range), 'latin1');
  const data = Buffer.concat([headFixed.subarray(0, b), tail.subarray(1)]);
  const signerPk = pk(pki.signer);
  const sd = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: '1.2.840.113549.1.7.1' }),
    signerInfos: [new pkijs.SignerInfo({ version: 1, sid: new pkijs.IssuerAndSerialNumber({ issuer: signerPk.issuer, serialNumber: signerPk.serialNumber }) })],
    certificates: [signerPk, pk(pki.ca)],
  });
  await sd.sign(pki.signerKey, 0, 'SHA-256', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  const der = Buffer.from(new pkijs.ContentInfo({ contentType: pkijs.ContentInfo.SIGNED_DATA, content: sd.toSchema(true) }).toSchema().toBER(false));
  const hole = der.toString('hex').padEnd(HOLE * 2, '0');
  const out = Buffer.concat([headFixed, Buffer.from(hole, 'latin1'), tail]);
  if (opts.tamper) out[out.length - 3] = out[out.length - 3] ^ 1;
  return out;
}

/** A revocation stub: the given status for every certificate. */
export const revocationStub = (s: 'good' | 'revoked' | 'unknown') => ({ status: async () => s });
