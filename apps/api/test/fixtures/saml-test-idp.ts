import { generate } from 'selfsigned';
import { SignedXml } from 'xml-crypto';
import { randomUUID } from 'crypto';

// A fresh self-signed cert/key pair, generated once per test run (lazily, on
// first use -- `generate()` in the installed selfsigned@5.x is async-only,
// unlike the sync API older versions/docs assume, so this can't just be a
// top-level constant). This is test-only key material for signing FAKE
// assertions inside this test suite -- it never touches a real IdP or real
// user data, so there is nothing to keep secret about it (unlike
// samlIdpCertificate in production, which is real but still public key
// material anyway).
export interface TestIdp {
  cert: string;
  privateKey: string;
}

let idpPromise: Promise<TestIdp> | undefined;

export function getTestIdp(): Promise<TestIdp> {
  if (!idpPromise) {
    idpPromise = generate([{ name: 'commonName', value: 'test-idp.example.com' }]).then((pair) => ({
      cert: pair.cert,
      privateKey: pair.private,
    }));
  }
  return idpPromise;
}

// `xml-crypto`'s SignedXml has no default signatureAlgorithm/canonicalizationAlgorithm --
// computeSignature() throws ("signatureAlgorithm is required" / "Missing
// canonicalizationAlgorithm...") unless both are passed explicitly. Confirmed by
// reading node_modules/xml-crypto/lib/signed-xml.js (installed version 6.1.2)
// directly; not documented clearly in the README.
const SIGNATURE_ALGORITHM = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const CANONICALIZATION_ALGORITHM = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const DIGEST_ALGORITHM = 'http://www.w3.org/2001/04/xmlenc#sha256';
const TRANSFORMS = ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', CANONICALIZATION_ALGORITHM];

function signElement(xml: string, referencedElementXpath: string, insertAfterXpath: string, privateKey: string): string {
  const sig = new SignedXml({
    privateKey,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
  });
  sig.addReference({
    xpath: referencedElementXpath,
    transforms: TRANSFORMS,
    digestAlgorithm: DIGEST_ALGORITHM,
  });
  sig.computeSignature(xml, { location: { reference: insertAfterXpath, action: 'after' } });
  return sig.getSignedXml();
}

// The installed @node-saml/node-saml (5.1.0) defaults BOTH
// `wantAuthnResponseSigned` and `wantAssertionsSigned` to true (confirmed by
// reading node_modules/@node-saml/node-saml/lib/saml.js and constants.js --
// DEFAULT_WANT_ASSERTIONS_SIGNED = true, wantAuthnResponseSigned ?? true) and
// SamlStrategy's resolveOrgSamlConfig() doesn't override either. That means a
// single signature over just the Assertion (as the plan's starter code
// assumed) is NOT enough: the top-level samlp:Response must ALSO carry its
// own direct-child signature, or validatePostResponseAsync throws "Invalid
// document signature" before even looking at the assertion's signature. This
// helper signs the Assertion first, embeds it in the Response, then signs the
// Response as a second, separate enveloped signature -- this is the standard
// "double-signed" SAML response shape, and is what real IdPs (Okta, Azure AD,
// etc.) send by default.
export function buildSignedSamlResponse(params: {
  nameId: string;
  audience: string; // must match the SP's issuer/entityId the SamlStrategy config sends
  destination: string; // must match the ACS callbackUrl
  inResponseTo: string; // required: SamlStrategy configures validateInResponseTo: 'always'
  privateKey: string;
}): string {
  const { nameId, audience, destination, inResponseTo, privateKey } = params;
  const responseId = `_${randomUUID()}`;
  const assertionId = `_${randomUUID()}`;
  const issueInstant = new Date().toISOString();
  const notOnOrAfter = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const assertionXml =
    `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}" Version="2.0" IssueInstant="${issueInstant}">` +
    `<saml:Issuer>test-idp</saml:Issuer>` +
    `<saml:Subject>` +
    `<saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${nameId}</saml:NameID>` +
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
    `<saml:SubjectConfirmationData Recipient="${destination}" NotOnOrAfter="${notOnOrAfter}" InResponseTo="${inResponseTo}" />` +
    `</saml:SubjectConfirmation>` +
    `</saml:Subject>` +
    `<saml:Conditions NotBefore="${issueInstant}" NotOnOrAfter="${notOnOrAfter}">` +
    `<saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction>` +
    `</saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${issueInstant}">` +
    `<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>` +
    `</saml:AuthnStatement>` +
    `</saml:Assertion>`;

  const signedAssertion = signElement(assertionXml, `//*[local-name(.)='Assertion']`, `//*[local-name(.)='Issuer']`, privateKey);

  const responseXml =
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ` +
    `ID="${responseId}" Version="2.0" IssueInstant="${issueInstant}" Destination="${destination}" InResponseTo="${inResponseTo}">` +
    `<saml:Issuer>test-idp</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success" /></samlp:Status>` +
    signedAssertion +
    `</samlp:Response>`;

  return signElement(
    responseXml,
    `//*[local-name(.)='Response']`,
    `//*[local-name(.)='Response']/*[local-name(.)='Issuer']`,
    privateKey,
  );
}
