// Local stand-in for Google and Microsoft sign-in (development and e2e tests only).
//
//   npm run dev:mock-idp            -> http://127.0.0.1:4010/google and http://127.0.0.1:4010/microsoft
//   API: YX_MOCK_IDP_URL=http://127.0.0.1:4010   (the API refuses that setting in production)
//
// Two real OpenID Connect providers (panva's oidc-provider, a devDependency: never in a build), with
// the demo people of the seed. Picking one on the page signs in as them; tokens are signed and checked
// exactly as Google's / Microsoft's are, PKCE, state and nonce included. Nothing leaves this machine.
//
// MOCK_IDP_PORT (default 4010; 0 = any free port, printed on start), API_ORIGIN (default
// http://localhost:3001) for the registered redirect URIs. MOCK_IDP_TEST_ACCOUNTS=1 (e2e only) also
// accepts an ad-hoc person as JSON claims.
import { createServer } from 'node:http';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import Provider from 'oidc-provider';

if (process.env.NODE_ENV === 'production') {
  console.error('mock-idp: refusing to run with NODE_ENV=production');
  process.exit(1);
}

const HOST = '127.0.0.1';
const PORT = Number(process.env.MOCK_IDP_PORT ?? 4010);
const API_ORIGIN = (process.env.API_ORIGIN ?? 'http://localhost:3001').replace(/\/+$/, '');
const TEST_ACCOUNTS = process.env.MOCK_IDP_TEST_ACCOUNTS === '1';

// Same values as MOCK_IDP_CLIENTS in apps/api/src/auth/social-sign-in.ts.
const CLIENTS = {
  google: { client_id: 'yx-mock-google', client_secret: 'yx-mock-google-secret' },
  microsoft: { client_id: 'yx-mock-microsoft', client_secret: 'yx-mock-microsoft-secret' },
};

// Fictional directory ids. The second one plays a stranger's Microsoft directory.
const DEMO_TENANT = '6a1f2c3d-0000-4000-8000-00000000d3a0';
const OTHER_TENANT = '7b2e3d4c-0000-4000-8000-0000000b0b00';
const CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';

// The seed's demo people (apps/api/prisma/seed.ts), plus the ones that must be refused.
const PEOPLE = {
  google: [
    { id: 'g-admin', label: 'Demo admin', claims: { email: 'admin@demo-org.test', email_verified: true, name: 'Demo Admin' } },
    { id: 'g-recruiter', label: 'Demo recruiter', claims: { email: 'recruiter@demo-org.test', email_verified: true, name: 'Demo Recruiter' } },
    { id: 'g-panel', label: 'Demo panel member', claims: { email: 'panel@demo-org.test', email_verified: true, name: 'Demo Panel' } },
    { id: 'g-hr', label: 'Demo HR admin (Lakshmi)', claims: { email: 'hr@demo-org.test', email_verified: true, name: 'Lakshmi Venkatesan' } },
    { id: 'g-consultant', label: 'Consultant in two companies (picker)', claims: { email: 'consultant@sharma-advisory.test', email_verified: true, name: 'Nikhil Sharma' } },
    { id: 'g-staff', label: 'YukthiX staff (refused)', claims: { email: 'super@platform.test', email_verified: true, name: 'Platform Staff' } },
    { id: 'g-unverified', label: 'Recruiter address, not verified (refused)', claims: { email: 'recruiter@demo-org.test', email_verified: false, name: 'Unverified' } },
    { id: 'g-nobody', label: 'No YukthiX account (refused)', claims: { email: 'nobody@elsewhere.test', email_verified: true, name: 'Nobody' } },
  ],
  microsoft: [
    { id: 'm-admin', label: 'Demo admin', claims: { tid: DEMO_TENANT, oid: '00000000-0000-4000-8000-0000000000a1', email: 'admin@demo-org.test', xms_edov: true, preferred_username: 'admin@demo-org.test', name: 'Demo Admin' } },
    { id: 'm-recruiter', label: 'Demo recruiter', claims: { tid: DEMO_TENANT, oid: '00000000-0000-4000-8000-0000000000a2', email: 'recruiter@demo-org.test', xms_edov: true, preferred_username: 'recruiter@demo-org.test', name: 'Demo Recruiter' } },
    // The manual test script signs in as Lakshmi (HR) with Microsoft too (MT-1-18).
    { id: 'm-hr', label: 'Demo HR admin (Lakshmi)', claims: { tid: DEMO_TENANT, oid: '00000000-0000-4000-8000-0000000000a4', email: 'hr@demo-org.test', xms_edov: true, preferred_username: 'hr@demo-org.test', name: 'Lakshmi Venkatesan' } },
    { id: 'm-staff', label: 'YukthiX staff (refused)', claims: { tid: DEMO_TENANT, oid: '00000000-0000-4000-8000-0000000000a3', email: 'super@platform.test', xms_edov: true, preferred_username: 'super@platform.test', name: 'Platform Staff' } },
    {
      id: 'm-takeover',
      label: "Someone else's directory claiming the admin's address (refused)",
      claims: { tid: OTHER_TENANT, oid: '00000000-0000-4000-8000-0000000000b1', email: 'admin@demo-org.test', preferred_username: 'intruder@intruder.test', name: 'Intruder' },
    },
    {
      id: 'm-personal',
      label: 'Personal account, address not verified (refused)',
      claims: { tid: CONSUMER_TENANT, oid: '00000000-0000-4000-8000-0000000000c1', email: 'panel@demo-org.test', preferred_username: 'panel@demo-org.test', name: 'Personal' },
    },
  ],
};

// accountId -> claims. Demo people are fixed; e2e people are added per sign-in.
const accounts = new Map();
for (const [kind, people] of Object.entries(PEOPLE)) for (const p of people) accounts.set(`${kind}:${p.id}`, { sub: p.id, ...p.claims });

const html = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const readForm = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) reject(new Error('too large'));
    });
    req.on('end', () => resolve(new URLSearchParams(body)));
    req.on('error', reject);
  });

function makeProvider(kind, issuer) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return new Provider(issuer, {
    clients: [
      {
        ...CLIENTS[kind],
        redirect_uris: [`${API_ORIGIN}/api/v1/auth/social/${kind}/callback`],
        response_types: ['code'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: 'client_secret_post',
      },
    ],
    jwks: { keys: [{ ...privateKey.export({ format: 'jwk' }), kid: `${kind}-1`, alg: 'RS256', use: 'sig' }] },
    cookies: { keys: [randomBytes(32).toString('hex')] },
    // The claims Google / Microsoft put in their ID tokens, in the ID token (openid-client reads it).
    claims: {
      openid: ['sub', 'tid', 'oid', 'xms_edov'],
      email: ['email', 'email_verified', 'preferred_username'],
      profile: ['name'],
    },
    conformIdTokenClaims: false,
    pkce: { required: () => true },
    features: { devInteractions: { enabled: false } },
    interactions: { url: (_ctx, interaction) => `/${kind}/interaction/${interaction.uid}` },
    async findAccount(_ctx, id) {
      const claims = accounts.get(`${kind}:${id}`);
      return claims && { accountId: id, claims: async () => claims };
    },
    // Consent is part of picking a person (no second page).
    async loadExistingGrant(ctx) {
      const grant = new ctx.oidc.provider.Grant({ clientId: ctx.oidc.client.clientId, accountId: ctx.oidc.session.accountId });
      grant.addOIDCScope('openid email profile');
      await grant.save();
      return grant;
    },
  });
}

function pickPage(kind, uid) {
  const buttons = PEOPLE[kind]
    .map((p) => `<button name="account" value="${html(p.id)}"><b>${html(p.label)}</b><span>${html(p.claims.email)}</span></button>`)
    .join('');
  const title = kind === 'google' ? 'Google (local test)' : 'Microsoft (local test)';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px system-ui,sans-serif;max-width:28rem;margin:2rem auto;padding:0 1rem;color:#1e293b}p{color:#475569}
form{display:flex;flex-direction:column;gap:.5rem}button{display:flex;flex-direction:column;align-items:flex-start;gap:.25rem;padding:.75rem 1rem;border:1px solid #cbd5e1;border-radius:.5rem;background:#fff;font:inherit;text-align:left;cursor:pointer}
button span{color:#475569;font-size:.875rem}button:hover{border-color:#3b5fe3}</style></head>
<body><h1>${title}</h1><p>Local mock sign-in for development. Pick who you are; nothing is sent to ${kind === 'google' ? 'Google' : 'Microsoft'}.</p>
<form method="post" action="/${kind}/interaction/${html(uid)}/login">${buttons}</form></body></html>`;
}

const server = createServer();
const providers = {};

server.on('request', async (req, res) => {
  try {
    const [, kind, ...rest] = (req.url ?? '/').split('?')[0].split('/');
    const provider = providers[kind];
    if (!provider) return void res.writeHead(404).end();
    // The provider is mounted under /<kind>: it reads its mount path from originalUrl vs url.
    const url = new URL(req.url.slice(kind.length + 1) || '/', 'http://mock');
    // "Pick an account" is the page below anyway; oidc-provider has no such prompt.
    if (url.pathname === '/auth' && url.searchParams.get('prompt') === 'select_account') url.searchParams.delete('prompt');
    req.url = url.pathname + url.search;
    req.originalUrl = `/${kind}${req.url}`;
    // /<kind>/interaction/<uid>[/login]: the page that stands in for the provider's own sign-in.
    if (rest[0] === 'interaction') {
      const details = await provider.interactionDetails(req, res);
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return void res.end(pickPage(kind, details.uid));
      }
      const form = await readForm(req);
      let accountId = form.get('account') ?? '';
      if (TEST_ACCOUNTS && form.get('claims')) {
        const claims = JSON.parse(form.get('claims'));
        accountId = String(claims.sub ?? `t-${randomUUID()}`); // the ID token's sub is the account id
        accounts.set(`${kind}:${accountId}`, { ...claims, sub: accountId });
      }
      if (!accounts.has(`${kind}:${accountId}`)) return void res.writeHead(400).end('unknown account');
      return void (await provider.interactionFinished(req, res, { login: { accountId } }, { mergeWithLastSubmission: false }));
    }
    // Everything else is the provider itself.
    provider.callback()(req, res);
  } catch (error) {
    res.writeHead(400, { 'content-type': 'text/plain' }).end(String(error?.message ?? error));
  }
});

server.listen(PORT, HOST, () => {
  const base = `http://${HOST}:${server.address().port}`;
  for (const kind of Object.keys(CLIENTS)) providers[kind] = makeProvider(kind, `${base}/${kind}`);
  console.log(`mock-idp listening on ${base} (set YX_MOCK_IDP_URL=${base} on the API)`);
});
