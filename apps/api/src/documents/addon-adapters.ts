import { createHash, randomUUID } from 'crypto';

// LIFE-5.08 paid add-ons: the seams only (founder D5 / D6: a digital-signature provider and a background-check partner
// come later). Each is an interface with a laptop fake; no provider is chosen and no paid SDK is installed. A real
// adapter implements the same interface and is picked by its env value; the fakes are refused in production.
// The company DSC already has its seam (payroll 5a: documents/signing.ts, dscSigner with a dev fake).

const fakeAllowed = (what: string) => {
  if (process.env.NODE_ENV === 'production') throw new Error(`${what}: the dev fake cannot run in production. Choose a provider (DECISION NEEDED).`);
};

// ------------------------------------------------------------------------------------------ Aadhaar eSign (P05 Q2)

export interface EsignRequest {
  documentSha256: string;
  signerName: string;
  /** Where the provider sends the person back to after they sign with their Aadhaar OTP. */
  returnUrl: string;
}
export interface EsignResult {
  status: 'pending' | 'signed' | 'declined';
  /** The signed PDF the provider returns (PAdES), once signed. */
  signedPdf?: Buffer;
  /** What the provider certifies: the name as in Aadhaar, the time, its transaction id. */
  evidence?: { aadhaarName: string; signedAt: string; providerRef: string };
}
export interface EsignProvider {
  readonly name: string;
  start(req: EsignRequest): Promise<{ providerRef: string; redirectUrl: string }>;
  status(providerRef: string, pdf: Buffer): Promise<EsignResult>;
}

/** Signs at once with a fake certificate name: for laptops and tests only. */
export class DevFakeEsignProvider implements EsignProvider {
  readonly name = 'dev-fake';
  private readonly started = new Map<string, EsignRequest>();
  async start(req: EsignRequest) {
    fakeAllowed('Aadhaar eSign');
    const providerRef = `fake-${randomUUID()}`;
    this.started.set(providerRef, req);
    return { providerRef, redirectUrl: `${req.returnUrl}?ref=${providerRef}` };
  }
  async status(providerRef: string, pdf: Buffer): Promise<EsignResult> {
    const req = this.started.get(providerRef);
    if (!req) return { status: 'declined' };
    if (createHash('sha256').update(pdf).digest('hex') !== req.documentSha256) return { status: 'declined' };
    return { status: 'signed', signedPdf: pdf, evidence: { aadhaarName: req.signerName, signedAt: new Date().toISOString(), providerRef } };
  }
}

// ------------------------------------------------------------------------------------------ background-check partner (D6)

export interface BgvOrder {
  checkType: string;
  /** Only what the check needs, and only after the joiner's recorded consent (DPDP). */
  subject: { name: string; dateOfBirth?: string | null };
  consentRef: string;
}
export interface BgvPartner {
  readonly name: string;
  order(o: BgvOrder): Promise<{ partnerRef: string }>;
  result(partnerRef: string): Promise<{ status: 'in_progress' | 'clear' | 'discrepancy'; summary?: string; reportPdf?: Buffer }>;
}

export class DevFakeBgvPartner implements BgvPartner {
  readonly name = 'dev-fake';
  async order(o: BgvOrder) {
    fakeAllowed('Background-check partner');
    if (!o.consentRef) throw new Error('No consent, no check.');
    return { partnerRef: `fake-bgv-${randomUUID()}` };
  }
  async result(partnerRef: string) {
    return partnerRef.startsWith('fake-bgv-') ? { status: 'clear' as const, summary: 'Laptop fake: no real check was made.' } : { status: 'in_progress' as const };
  }
}

// ------------------------------------------------------------------------------------------ day-one face match (P10)

export interface FaceMatcher {
  readonly name: string;
  /** Compares the joiner's live photo with their ID photo; HR's attestation stays the record (YX-LC-31). */
  match(livePhoto: Buffer, idPhoto: Buffer): Promise<{ score: number; match: boolean }>;
}

export class DevFakeFaceMatcher implements FaceMatcher {
  readonly name = 'dev-fake';
  async match(livePhoto: Buffer, idPhoto: Buffer) {
    fakeAllowed('Face match');
    const same = livePhoto.equals(idPhoto);
    return { score: same ? 0.99 : 0.1, match: same };
  }
}

/** The adapters from the environment: only the fakes exist until providers are chosen. */
export function addonsFromEnv(env = process.env) {
  const pick = <T>(value: string | undefined, fake: () => T): T | null => (value === 'dev-fake' ? fake() : null);
  return {
    esign: pick(env.AADHAAR_ESIGN_PROVIDER, () => new DevFakeEsignProvider()),
    bgv: pick(env.BGV_PARTNER, () => new DevFakeBgvPartner()),
    face: pick(env.FACE_MATCH_PROVIDER, () => new DevFakeFaceMatcher()),
  };
}
