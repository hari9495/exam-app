import { createPublicKey, verify, type KeyObject } from 'crypto';

// E-invoice QR (M05-BUILD-DESIGN §13.4): large suppliers register B2B invoices on the invoice registration portal,
// which returns a QR code holding a token signed with the portal's key (RS256). A valid token gives supplier GSTIN,
// buyer GSTIN, invoice number, date and value without OCR, and proves the receipt was not altered. The portal's public
// keys are configuration (EINVOICE_QR_PUBLIC_KEYS, PEM), published by the portal; until they are set nothing verifies.
// Field names follow the published e-invoice QR content (verify flag until the compliance owner signs off).

export interface EinvoiceFields {
  sellerGstin: string;
  buyerGstin: string | null;
  docNo: string;
  docDate: string | null;
  total: string | null;
  irn: string | null;
}
export type EinvoiceResult = { status: 'verified'; fields: EinvoiceFields } | { status: 'unverified'; reason: string; fields: EinvoiceFields | null } | { status: 'not_einvoice' };

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** The PEM blocks of EINVOICE_QR_PUBLIC_KEYS (public keys or certificates). Bad blocks are skipped. */
export function keysFromPem(pem: string | undefined): KeyObject[] {
  if (!pem) return [];
  return (pem.match(/-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g) ?? []).flatMap((block) => {
    try {
      return [createPublicKey(block)];
    } catch {
      return [];
    }
  });
}

/** dd/mm/yyyy → ISO, else null. */
const isoOf = (d: unknown) => {
  const m = typeof d === 'string' ? d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** Reads and checks a QR payload. Anything that is not a three-part token with e-invoice data is "not an e-invoice". */
export function checkEinvoiceQr(token: string, keys: readonly KeyObject[]): EinvoiceResult {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || token.length > 4096) return { status: 'not_einvoice' };
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64url(parts[0]).toString('utf8'));
    payload = JSON.parse(b64url(parts[1]).toString('utf8'));
  } catch {
    return { status: 'not_einvoice' };
  }
  let data: Record<string, unknown>;
  try {
    data = typeof payload.data === 'string' ? JSON.parse(payload.data) : (payload.data as Record<string, unknown>);
  } catch {
    return { status: 'not_einvoice' };
  }
  if (!data || typeof data !== 'object' || typeof data.SellerGstin !== 'string' || typeof data.DocNo !== 'string') return { status: 'not_einvoice' };
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v.trim().toUpperCase() : null);
  const fields: EinvoiceFields = {
    sellerGstin: str(data.SellerGstin, 15) ?? '',
    buyerGstin: str(data.BuyerGstin, 15),
    docNo: (str(data.DocNo, 40) ?? '').slice(0, 40),
    docDate: isoOf(data.DocDt),
    total: typeof data.TotInvVal === 'number' || (typeof data.TotInvVal === 'string' && /^\d+(\.\d+)?$/.test(data.TotInvVal)) ? Number(data.TotInvVal).toFixed(2) : null,
    irn: str(data.Irn, 64)?.toLowerCase() ?? null,
  };
  if (header.alg !== 'RS256') return { status: 'unverified', reason: 'The QR is not signed the way e-invoices are.', fields };
  if (!keys.length) return { status: 'unverified', reason: 'No e-invoice portal key is set up yet, so the signature was not checked.', fields };
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = b64url(parts[2]);
  const ok = keys.some((k) => {
    try {
      return verify('RSA-SHA256', signed, k, sig);
    } catch {
      return false;
    }
  });
  return ok ? { status: 'verified', fields } : { status: 'unverified', reason: 'The e-invoice signature does not match: the QR may be altered.', fields };
}
