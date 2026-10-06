// Bot challenge for the public sign-in steps (P12 YX-IAM-07, ASVS V2.2.1): Cloudflare Turnstile,
// the provider's own script. Inert until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set (the API checks
// the token when TURNSTILE_SECRET_KEY is set). Usually invisible; it asks for a click only when
// Cloudflare is unsure.
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('The human check did not load')));
    script.onerror = () => {
      loading = null;
      reject(new Error('The human check did not load. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

// A fresh single-use token for one sign-in request, or undefined when the check is not configured.
export async function botChallengeToken(siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY): Promise<string | undefined> {
  if (!siteKey) return undefined;
  const turnstile = await loadTurnstile();
  return new Promise<string>((resolve, reject) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let widgetId = '';
    const done = () => {
      if (widgetId) turnstile.remove(widgetId);
      container.remove();
    };
    widgetId = turnstile.render(container, {
      sitekey: siteKey,
      appearance: 'interaction-only',
      callback: (token: string) => {
        done();
        resolve(token);
      },
      'error-callback': () => {
        done();
        reject(new Error('We could not confirm you are human. Please try again.'));
      },
    });
  });
}
