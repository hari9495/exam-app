// apps/api/src/integrations/webhook-url-allowlist.ts
import ipaddr from 'ipaddr.js';
import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';

export type IntegrationType = 'slack' | 'msteams' | 'webhook';

export function isAllowedWebhookUrl(type: IntegrationType, rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = normalizeHost(url.hostname);
  if (type === 'slack') {
    return host === 'hooks.slack.com';
  }
  if (type === 'msteams') {
    // exact-suffix match on a dot boundary (host === suffix-body or ends with '.' + suffix)
    return endsWithHost(host, 'webhook.office.com') || endsWithHost(host, 'logic.azure.com');
  }
  // 'webhook': generic endpoint (Zapier/Make/n8n/custom). No vendor host to pin, so we accept any
  // public https host and enforce SSRF safety at delivery via assertPublicWebhookTarget (resolves
  // DNS). An IP-literal target is checked here too, for immediate save-time feedback.
  return isIP(host) ? isPublicIp(host) : true;
}

function isPublicIp(ip: string): boolean {
  try {
    // ipaddr ranges: only 'unicast' is a normal public address; private/loopback/linkLocal/
    // uniqueLocal/reserved/ipv4Mapped all fail closed.
    return ipaddr.parse(ip).range() === 'unicast';
  } catch {
    return false;
  }
}

// Delivery-time SSRF guard for generic webhooks: resolve the host and refuse if it points at a
// non-public address (cloud metadata 169.254.169.254, RFC1918, loopback, …).
// ponytail: TOCTOU vs fetch's own later DNS lookup (rebind) is the known ceiling; paired with the
// worker's redirect:'error' this blocks the practical vectors. Upgrade path: pin the resolved IP / egress proxy.
export async function assertPublicWebhookTarget(rawUrl: string): Promise<void> {
  const host = normalizeHost(new URL(rawUrl).hostname);
  const addrs = isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (addrs.length === 0 || !addrs.every(isPublicIp)) {
    throw new Error('Webhook target resolves to a non-public address');
  }
}

// URL.hostname keeps the brackets on IPv6 literals ("[::1]"), which net.isIP would then miss.
function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

function endsWithHost(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith('.' + suffix);
}

export function assertAllowedWebhookUrl(type: IntegrationType, rawUrl: string): void {
  if (!isAllowedWebhookUrl(type, rawUrl)) {
    throw new Error(`URL is not an allowed ${type} webhook endpoint`);
  }
}
