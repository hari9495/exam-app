import { createHash } from 'crypto';

// No e2e test may reach the real Have I Been Pwned API. Every e2e file gets this stand-in for the
// k-anonymity range endpoint (jest setupFiles): a padded range response built from a tiny local
// corpus. A spec flips `hibp.down` to exercise the fail-open + re-check path. Other URLs pass through.
export const hibp = { down: false, corpus: new Set(['password1234', 'Passw0rd!2024', 'qwertyuiop123']) };
(globalThis as { __hibp?: typeof hibp }).__hibp = hibp;

const RANGE = 'https://api.pwnedpasswords.com/range/';
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith(RANGE)) return realFetch(input, init);
  if (hibp.down) throw new TypeError('fetch failed (e2e: HIBP marked down)');
  const prefix = url.slice(RANGE.length).toUpperCase();
  const rows = ['00000000000000000000000000000000000:0'];
  for (const password of hibp.corpus) {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    if (sha1.startsWith(prefix)) rows.push(`${sha1.slice(5)}:1234`);
  }
  return new Response(rows.join('\r\n'));
}) as typeof fetch;
