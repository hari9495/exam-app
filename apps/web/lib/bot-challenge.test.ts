import { botChallengeToken } from './bot-challenge';

describe('botChallengeToken', () => {
  afterEach(() => {
    delete window.turnstile;
    document.body.innerHTML = '';
  });

  it('is inert (no script, no token) until a site key is configured', async () => {
    await expect(botChallengeToken('')).resolves.toBeUndefined();
    expect(document.querySelector('script[src*="turnstile"]')).toBeNull();
  });

  it('renders a one-shot widget and resolves with its token, then removes it', async () => {
    const remove = jest.fn();
    window.turnstile = {
      render: (container: HTMLElement, options: Record<string, unknown>) => {
        expect(document.body.contains(container)).toBe(true);
        expect(options).toMatchObject({ sitekey: 'site-key', appearance: 'interaction-only' });
        setTimeout(() => (options.callback as (t: string) => void)('token-1'));
        return 'w1';
      },
      remove,
    };
    await expect(botChallengeToken('site-key')).resolves.toBe('token-1');
    expect(remove).toHaveBeenCalledWith('w1');
    expect(document.body.children).toHaveLength(0);
  });

  it('rejects when the check fails', async () => {
    window.turnstile = {
      render: (_c: HTMLElement, options: Record<string, unknown>) => {
        setTimeout(() => (options['error-callback'] as () => void)());
        return 'w2';
      },
      remove: jest.fn(),
    };
    await expect(botChallengeToken('site-key')).rejects.toThrow('human');
  });
});
