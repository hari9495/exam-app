import { createHmac } from 'crypto';

// Shared document signing seam (P05 Q2, M03 §19 D4, founder 9 Oct 2026): the company's DSC signs Form 130 / 131,
// registers and letters with its own USB token through a small signing helper; YukthiX never holds the key. Used by
// pay documents and lifecycle letters alike. One adapter, chosen by DSC_SIGNER:
//   dev-fake     development and tests only: "signs" at once with a marker (an HMAC of the file), never in production;
//   usb-helper   the pilot: the document waits ("awaiting signature") until the helper uploads the signed PDF, which is
//                accepted only after signed-pdf.ts checks the signature, the signer's chain to a CCA-licensed CA (not
//                expired, not revoked) and that the signed bytes are exactly the document that was issued.

export interface DscSigner {
  readonly mode: 'immediate' | 'helper';
  /** Immediate signers return the signed bytes and a reference; helper signers return null (the helper signs later). */
  sign(pdf: Buffer, meta: { organizationId: string; legalEntityId: string; referenceNo: string }): Promise<{ pdf: Buffer; ref: string } | null>;
}

class DevFakeSigner implements DscSigner {
  readonly mode = 'immediate' as const;
  async sign(pdf: Buffer, meta: { referenceNo: string }) {
    const ref = `dev-fake:${createHmac('sha256', 'yukthix-dev-fake-dsc').update(pdf).update(meta.referenceNo).digest('hex').slice(0, 32)}`;
    return { pdf, ref };
  }
}

class UsbHelperSigner implements DscSigner {
  readonly mode = 'helper' as const;
  async sign() {
    return null;
  }
}

export function dscSigner(): DscSigner {
  const kind = process.env.DSC_SIGNER ?? (process.env.NODE_ENV === 'production' ? 'usb-helper' : 'dev-fake');
  if (kind === 'dev-fake') {
    if (process.env.NODE_ENV === 'production') throw new Error('DSC_SIGNER=dev-fake is not allowed in production');
    return new DevFakeSigner();
  }
  if (kind === 'usb-helper') return new UsbHelperSigner();
  throw new Error(`Unknown DSC_SIGNER ${kind}`);
}
