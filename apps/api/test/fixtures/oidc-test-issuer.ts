import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';

// A minimal OpenID Connect provider on 127.0.0.1 for e2e tests: discovery, JWKS and a token
// endpoint that checks client authentication, the redirect URI and PKCE before issuing a signed
// ID token. No real Google / Microsoft call is ever made (P12 Part 1e).
//
// `authorize()` plays the user + authorization endpoint: it reads the authorization URL the API
// built and returns the URL the IdP would redirect the browser back to. Its `tamper` options
// produce the bad tokens the API must refuse.

export interface Tamper {
  nonce?: string; // a different nonce
  issuer?: string; // a different iss
  audience?: string; // a different aud
  expiresInSeconds?: number; // negative = already expired
  signWithForeignKey?: boolean; // signed by a key not in the JWKS
  wrongVerifier?: boolean; // token endpoint sees a PKCE verifier that does not match
}

interface Grant {
  claims: Record<string, unknown>;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  nonce: string;
  tamper: Tamper;
}

export class OidcTestIssuer {
  issuer = '';
  clientId = `client-${randomUUID()}`;
  clientSecret = randomBytes(24).toString('base64url');
  private server!: Server;
  private key!: { privateKey: CryptoKey; jwk: JWK };
  private foreignKey!: CryptoKey;
  private readonly grants = new Map<string, Grant>();
  tokenRequests = 0;

  async start(): Promise<void> {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    this.key = { privateKey: privateKey as CryptoKey, jwk: { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' } };
    this.foreignKey = (await generateKeyPair('RS256')).privateKey as CryptoKey;
    this.server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        this.handle(req.method ?? 'GET', req.url ?? '/', req.headers.authorization, body)
          .then(({ status, json }) => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(json));
          })
          .catch(() => {
            res.writeHead(500);
            res.end();
          });
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.issuer = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.server.close(resolve));
  }

  // The user signs in at the IdP: returns the callback URL (path + query) for the API.
  authorize(authorizationUrl: string, claims: Record<string, unknown>, tamper: Tamper = {}): string {
    const url = new URL(authorizationUrl);
    const p = url.searchParams;
    if (url.origin !== this.issuer) throw new Error(`not this issuer: ${url.origin}`);
    if (p.get('response_type') !== 'code' || p.get('code_challenge_method') !== 'S256' || !p.get('code_challenge') || !p.get('nonce') || !p.get('state')) {
      throw new Error(`incomplete authorization request: ${url.search}`);
    }
    const code = randomBytes(16).toString('hex');
    this.grants.set(code, {
      claims,
      clientId: p.get('client_id')!,
      redirectUri: p.get('redirect_uri')!,
      codeChallenge: p.get('code_challenge')!,
      nonce: p.get('nonce')!,
      tamper,
    });
    const back = new URL(p.get('redirect_uri')!);
    back.searchParams.set('code', code);
    back.searchParams.set('state', p.get('state')!);
    return back.pathname + back.search;
  }

  private async handle(method: string, path: string, authorization: string | undefined, body: string): Promise<{ status: number; json: unknown }> {
    if (path === '/.well-known/openid-configuration') {
      return {
        status: 200,
        json: {
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/authorize`,
          token_endpoint: `${this.issuer}/token`,
          jwks_uri: `${this.issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
        },
      };
    }
    if (path === '/jwks') return { status: 200, json: { keys: [this.key.jwk] } };
    if (path !== '/token' || method !== 'POST') return { status: 404, json: {} };

    this.tokenRequests += 1;
    const form = new URLSearchParams(body);
    const grant = this.grants.get(form.get('code') ?? '');
    this.grants.delete(form.get('code') ?? ''); // codes are single use
    const [basicId, basicSecret] = authorization?.startsWith('Basic ')
      ? Buffer.from(authorization.slice(6), 'base64').toString().split(':').map(decodeURIComponent)
      : [form.get('client_id'), form.get('client_secret')];
    if (basicId !== this.clientId || basicSecret !== this.clientSecret) return { status: 401, json: { error: 'invalid_client' } };
    if (!grant || form.get('grant_type') !== 'authorization_code' || form.get('redirect_uri') !== grant.redirectUri) {
      return { status: 400, json: { error: 'invalid_grant' } };
    }
    const verifier = grant.tamper.wrongVerifier ? 'x' : (form.get('code_verifier') ?? '');
    if (createHash('sha256').update(verifier).digest('base64url') !== grant.codeChallenge) {
      return { status: 400, json: { error: 'invalid_grant', error_description: 'PKCE verification failed' } };
    }

    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ nonce: grant.tamper.nonce ?? grant.nonce, ...grant.claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(grant.tamper.issuer ?? this.issuer)
      .setAudience(grant.tamper.audience ?? grant.clientId)
      .setSubject(String(grant.claims.sub ?? randomUUID()))
      .setIssuedAt(now)
      .setExpirationTime(now + (grant.tamper.expiresInSeconds ?? 300))
      .sign(grant.tamper.signWithForeignKey ? this.foreignKey : this.key.privateKey);
    return { status: 200, json: { access_token: randomBytes(16).toString('hex'), token_type: 'Bearer', expires_in: 300, id_token: idToken } };
  }
}
