import { BadRequestException } from '@nestjs/common';
import { SmsProviderAdapter, SmsSendArgs, SmsSendResult } from './types';

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

const IPV4_LITERAL_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isPrivateIPv4(ipv4: string): boolean {
  return (
    ipv4 === '0.0.0.0' ||
    /^127\./.test(ipv4) ||
    /^10\./.test(ipv4) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ipv4) ||
    /^192\.168\./.test(ipv4) ||
    /^169\.254\./.test(ipv4)
  );
}

/**
 * Extracts the embedded IPv4 address from an IPv4-mapped IPv6 literal, in
 * either its dotted-quad form (::ffff:1.2.3.4) or the hex form the WHATWG
 * URL parser normalizes it to (::ffff:7f00:1). Returns null if `host` isn't
 * one of those forms.
 */
function extractIPv4MappedAddress(host: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  if (dotted) {
    return dotted[1];
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join('.');
  }
  return null;
}

/**
 * SSRF guard for org-supplied webhook URLs: only a public https host may be
 * targeted. Rejects loopback/private/link-local hosts so the server can't be
 * coerced into POSTing candidate PII (to/body) to an internal address.
 *
 * The private/loopback/link-local range checks only apply when the host is
 * an IP literal (or the exact string "localhost") — a DNS hostname is never
 * range-matched, so a public domain like fc-gateway.com isn't wrongly
 * blocked just because it happens to start with an IPv6 prefix string.
 *
 * LIMITATION: DNS rebinding (a public hostname that resolves to a private
 * IP at request time) can't be caught here — this check is static, at
 * config-save time, and never resolves the hostname. Out of scope.
 */
function assertPublicHttpsUrl(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new BadRequestException('SMS webhook url must use https');
  }

  // Bracketed IPv6 hosts keep their brackets in URL#hostname; strip them to
  // inspect the address itself.
  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();

  const isIPv4Literal = IPV4_LITERAL_RE.test(host);
  const isIPv6Literal = host.includes(':');

  let isPrivate = host === 'localhost';

  if (isIPv4Literal) {
    isPrivate = isPrivate || isPrivateIPv4(host);
  }

  if (isIPv6Literal) {
    isPrivate =
      isPrivate ||
      host === '::1' ||
      /^fc/.test(host) || // fc00::/7 unique-local
      /^fd/.test(host) ||
      /^fe[89ab]/.test(host); // fe80::/10 link-local

    if (!isPrivate) {
      const mapped = extractIPv4MappedAddress(host);
      if (mapped && isPrivateIPv4(mapped)) {
        isPrivate = true;
      }
    }
  }

  if (isPrivate) {
    throw new BadRequestException('SMS webhook url must not target a private/local address');
  }
}

/**
 * Substitutes {{to}} and {{body}} into a template string.
 *
 * JSON-safety rule: when the effective contentType contains 'json', each
 * value is escaped via JSON.stringify(value).slice(1, -1) before insertion,
 * so it sits safely inside the JSON-string quotes the template author wrote
 * (e.g. "message": "{{body}}"). For any other contentType the raw value is
 * substituted verbatim.
 */
function substitute(template: string, args: SmsSendArgs, isJson: boolean): string {
  const encode = (value: string) => (isJson ? JSON.stringify(value).slice(1, -1) : value);
  return template.replace(/\{\{to\}\}/g, encode(args.to)).replace(/\{\{body\}\}/g, encode(args.body));
}

export const httpProvider: SmsProviderAdapter = {
  id: 'http',
  label: 'Generic HTTP',
  configFields: [
    { key: 'url', label: 'Webhook URL', secret: false, required: true, placeholder: 'https://example.com/sms' },
    { key: 'method', label: 'HTTP method', secret: false, required: false, placeholder: 'POST' },
    { key: 'authHeader', label: 'Authorization header', secret: true, required: false },
    { key: 'contentType', label: 'Content-Type', secret: false, required: false, placeholder: 'application/json' },
    { key: 'bodyTemplate', label: 'Body template', secret: false, required: true },
  ],

  validateConfig(config: Record<string, unknown>): void {
    if (isBlank(config.url) || isBlank(config.bodyTemplate)) {
      throw new BadRequestException('HTTP config requires url and bodyTemplate');
    }
    let parsed: URL;
    try {
      parsed = new URL(config.url as string);
    } catch {
      throw new BadRequestException('SMS webhook url is not a valid URL');
    }
    assertPublicHttpsUrl(parsed);
  },

  async send(
    config: Record<string, unknown>,
    args: SmsSendArgs,
    fetchImpl: typeof fetch = fetch,
  ): Promise<SmsSendResult> {
    try {
      const contentType = (config.contentType as string) || 'application/json';
      const isJson = contentType.includes('json');

      const url = substitute(config.url as string, args, isJson);
      const body = substitute(config.bodyTemplate as string, args, isJson);

      // Re-validate the FINAL substituted url: {{to}}/{{body}} can land in
      // the host (e.g. `https://{{to}}/x`), so the template check done at
      // config-save time isn't enough — throwing here is caught below.
      assertPublicHttpsUrl(new URL(url));

      const headers: Record<string, string> = { 'Content-Type': contentType };
      if (!isBlank(config.authHeader)) {
        headers.Authorization = config.authHeader as string;
      }

      const res = await fetchImpl(url, {
        method: (config.method as string) || 'POST',
        headers,
        body,
        redirect: 'manual', // never follow a redirect to an internal address
      });
      return { ok: res.ok, status: res.status };
    } catch {
      return { ok: false };
    }
  },
};
