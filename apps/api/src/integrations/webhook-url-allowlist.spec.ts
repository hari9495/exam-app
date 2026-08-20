import { promises as dns } from 'node:dns';
import { assertAllowedWebhookUrl, assertPublicWebhookTarget, isAllowedWebhookUrl } from './webhook-url-allowlist';

describe('webhook URL allowlist (SSRF guard)', () => {
  it('allows a valid Slack hook', () => {
    expect(isAllowedWebhookUrl('slack', 'https://hooks.slack.com/services/T/B/x')).toBe(true);
  });
  it('allows Teams office.com and logic.azure.com hosts', () => {
    expect(isAllowedWebhookUrl('msteams', 'https://mytenant.webhook.office.com/webhookb2/abc')).toBe(true);
    expect(isAllowedWebhookUrl('msteams', 'https://prod-1.westus.logic.azure.com/workflows/x')).toBe(true);
  });
  it('rejects http (non-TLS)', () => {
    expect(isAllowedWebhookUrl('slack', 'http://hooks.slack.com/x')).toBe(false);
  });
  it('rejects a Slack URL on the wrong host', () => {
    expect(isAllowedWebhookUrl('slack', 'https://evil.example.com/x')).toBe(false);
  });
  it('rejects an internal/SSRF target', () => {
    expect(isAllowedWebhookUrl('msteams', 'https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedWebhookUrl('slack', 'https://localhost/x')).toBe(false);
  });
  it('rejects a lookalike suffix host', () => {
    expect(isAllowedWebhookUrl('msteams', 'https://webhook.office.com.evil.com/x')).toBe(false);
    expect(isAllowedWebhookUrl('slack', 'https://hooks.slack.com.evil.com/x')).toBe(false);
  });
  it('assert throws on reject', () => {
    expect(() => assertAllowedWebhookUrl('slack', 'https://evil.example.com')).toThrow(/not an allowed/i);
  });

  describe('generic webhook type (Zapier/Make/n8n/custom)', () => {
    it('allows any public https host', () => {
      expect(isAllowedWebhookUrl('webhook', 'https://hooks.zapier.com/hooks/catch/1/abc')).toBe(true);
      expect(isAllowedWebhookUrl('webhook', 'https://hook.eu1.make.com/xyz')).toBe(true);
      expect(isAllowedWebhookUrl('webhook', 'https://my-n8n.example.com/webhook/x')).toBe(true);
    });
    it('rejects http and non-public IP literals at save time (incl. bracketed IPv6)', () => {
      expect(isAllowedWebhookUrl('webhook', 'http://hooks.zapier.com/x')).toBe(false);
      expect(isAllowedWebhookUrl('webhook', 'https://10.0.0.1/x')).toBe(false);
      expect(isAllowedWebhookUrl('webhook', 'https://127.0.0.1/x')).toBe(false);
      expect(isAllowedWebhookUrl('webhook', 'https://169.254.169.254/latest')).toBe(false);
      expect(isAllowedWebhookUrl('webhook', 'https://[::1]/x')).toBe(false);
      expect(isAllowedWebhookUrl('webhook', 'https://0.0.0.0/x')).toBe(false);
    });
    it('normalizes obfuscated IPv4 (decimal/octal/hex) so they cannot bypass the check', () => {
      // WHATWG URL canonicalizes these to 127.0.0.1 before .hostname is read — guard against regression.
      expect(isAllowedWebhookUrl('webhook', 'https://2130706433/x')).toBe(false);
      expect(isAllowedWebhookUrl('webhook', 'https://0x7f000001/x')).toBe(false);
      expect(isAllowedWebhookUrl('webhook', 'https://0177.0.0.1/x')).toBe(false);
    });
  });

  describe('assertPublicWebhookTarget (delivery-time DNS-resolved SSRF guard)', () => {
    afterEach(() => jest.restoreAllMocks());
    it('allows a public IP-literal target without a DNS lookup', async () => {
      await expect(assertPublicWebhookTarget('https://8.8.8.8/x')).resolves.toBeUndefined();
    });
    it('rejects an IP-literal target in a private range', async () => {
      await expect(assertPublicWebhookTarget('https://10.0.0.5/x')).rejects.toThrow(/non-public/i);
    });
    it('rejects a hostname that resolves to a private/internal address (rebind)', async () => {
      jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '192.168.1.5', family: 4 }] as any);
      await expect(assertPublicWebhookTarget('https://sneaky.example.com/x')).rejects.toThrow(/non-public/i);
    });
    it('allows a hostname resolving to a public address', async () => {
      jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);
      await expect(assertPublicWebhookTarget('https://example.com/x')).resolves.toBeUndefined();
    });
  });
});
