// apps/api/src/integrations/webhook-url-allowlist.ts
export type IntegrationType = 'slack' | 'msteams';

export function isAllowedWebhookUrl(type: IntegrationType, rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (type === 'slack') {
    return host === 'hooks.slack.com';
  }
  // msteams: exact-suffix match on a dot boundary (host === suffix-body or ends with '.' + suffix)
  return endsWithHost(host, 'webhook.office.com') || endsWithHost(host, 'logic.azure.com');
}

function endsWithHost(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith('.' + suffix);
}

export function assertAllowedWebhookUrl(type: IntegrationType, rawUrl: string): void {
  if (!isAllowedWebhookUrl(type, rawUrl)) {
    throw new Error(`URL is not an allowed ${type} webhook endpoint`);
  }
}
