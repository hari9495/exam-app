import { createHash, generateKeyPairSync, randomBytes, sign, KeyObject } from 'crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

// A software WebAuthn authenticator for tests: a real P-256 key pair producing real "none"
// attestations and ES256 assertions, so the server's @simplewebauthn verification runs unmocked
// (origin, RP ID, challenge, signature and counter are all genuinely checked).
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest();
const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

export class SoftAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly privateKey: KeyObject;
  private readonly cosePublicKey: Uint8Array;
  counter = 0;

  constructor(
    readonly rpId = 'localhost',
    readonly origin = 'http://localhost:3000',
  ) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: 'jwk' });
    this.cosePublicKey = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ]),
    );
  }

  get id(): string {
    return b64url(this.credentialId);
  }

  private authData(flags: number, attested?: Uint8Array): Buffer {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    return Buffer.concat([sha256(this.rpId), Buffer.from([flags]), count, ...(attested ? [attested] : [])]);
  }

  // navigator.credentials.create() as @simplewebauthn/browser returns it.
  // `synced`: report a backed-up, multi-device passkey (BE + BS flags) rather than a device-bound key.
  register(options: { challenge: string }, overrides: { origin?: string; type?: string; synced?: boolean } = {}) {
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const attested = Buffer.concat([Buffer.alloc(16), idLength, this.credentialId, this.cosePublicKey]);
    const clientData = { type: overrides.type ?? 'webauthn.create', challenge: options.challenge, origin: overrides.origin ?? this.origin, crossOrigin: false };
    const attestationObject = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', this.authData(FLAG_UP | FLAG_UV | FLAG_AT | (overrides.synced ? 0x18 : 0), attested)]]) as never);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: { clientDataJSON: b64url(Buffer.from(JSON.stringify(clientData))), attestationObject: b64url(attestationObject), transports: ['internal'] },
      clientExtensionResults: {},
    };
  }

  // navigator.credentials.get(). Each call advances the signature counter unless told not to.
  assert(options: { challenge: string }, overrides: { origin?: string; tamper?: boolean; keepCounter?: boolean } = {}) {
    if (!overrides.keepCounter) this.counter += 1;
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: overrides.origin ?? this.origin, crossOrigin: false }));
    const authenticatorData = this.authData(FLAG_UP | FLAG_UV);
    const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), this.privateKey);
    if (overrides.tamper) signature[signature.length - 1] ^= 0x01;
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: { clientDataJSON: b64url(clientDataJSON), authenticatorData: b64url(authenticatorData), signature: b64url(signature) },
      clientExtensionResults: {},
    };
  }
}
