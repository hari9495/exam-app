import { assertAllowedWebhookUrl, isAllowedWebhookUrl } from './webhook-url-allowlist';

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
});
