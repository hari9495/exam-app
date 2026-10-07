import { ChildProcess, spawn } from 'child_process';
import { join } from 'path';

// The local Google / Microsoft stand-in (scripts/mock-idp.mjs, the same one `npm run dev:mock-idp`
// runs for the founder), started on a free port for an e2e suite. `signIn()` plays the browser at
// the provider: it follows the authorization request, picks the person, and returns the callback
// URL (path + query) the provider sends the browser back to. No real Google / Microsoft call.
export class MockIdp {
  url = '';
  private child?: ChildProcess;

  async start(apiOrigin: string): Promise<void> {
    const script = join(__dirname, '..', '..', '..', '..', 'scripts', 'mock-idp.mjs');
    this.child = spawn(process.execPath, [script], {
      env: { ...process.env, MOCK_IDP_PORT: '0', MOCK_IDP_TEST_ACCOUNTS: '1', API_ORIGIN: apiOrigin, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.url = await new Promise<string>((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error(`mock-idp did not start: ${out}`)), 15000);
      const onData = (chunk: Buffer) => {
        out += chunk.toString();
        const m = out.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      };
      this.child!.stdout!.on('data', onData);
      this.child!.stderr!.on('data', (chunk: Buffer) => (out += chunk.toString()));
      this.child!.on('exit', (code) => reject(new Error(`mock-idp exited (${code}): ${out}`)));
    });
  }

  stop(): void {
    this.child?.kill();
  }

  // `person`: a demo account id from the script (e.g. 'g-admin') or ad-hoc ID token claims.
  // `tamper.nonce` changes the nonce in the authorization request (the ID token then carries it).
  async signIn(authorizationUrl: string, person: string | Record<string, unknown>, tamper: { nonce?: string } = {}): Promise<string> {
    const cookies = new Map<string, string>();
    const send = async (url: string, init: RequestInit = {}) => {
      const res = await fetch(url, {
        ...init,
        redirect: 'manual',
        headers: { ...(init.headers as Record<string, string>), cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
      });
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
      const location = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !location) throw new Error(`mock-idp: ${res.status} at ${url}: ${await res.text()}`);
      return new URL(location, url).href;
    };
    const start = new URL(authorizationUrl);
    if (tamper.nonce) start.searchParams.set('nonce', tamper.nonce);
    const interaction = await send(start.href);
    const form: Record<string, string> = typeof person === 'string' ? { account: person } : { claims: JSON.stringify(person) };
    const resume = await send(`${interaction}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
    const back = new URL(await send(resume));
    return back.pathname + back.search;
  }
}
