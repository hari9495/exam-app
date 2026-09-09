import { BadRequestException } from '@nestjs/common';
import { SmsProviderAdapter, SmsSendArgs, SmsSendResult } from './types';

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

/**
 * SSRF guard for org-supplied webhook URLs: only a public https host may be
 * targeted. Rejects loopback/private/link-local hosts so the server can't be
 * coerced into POSTing candidate PII (to/body) to an internal address.
 */
function assertPublicHttpsUrl(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new BadRequestException('SMS webhook url must use https');
  }

  // Bracketed IPv6 hosts keep their brackets in URL#hostname; strip them to
  // inspect the address itself.
  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();

  const isPrivate =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^fc/.test(host) || // fc00::/7 unique-local
    /^fd/.test(host) ||
    /^fe80/.test(host); // link-local

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

      const headers: Record<string, string> = { 'Content-Type': contentType };
      if (!isBlank(config.authHeader)) {
        headers.Authorization = config.authHeader as string;
      }

      const res = await fetchImpl(url, {
        method: (config.method as string) || 'POST',
        headers,
        body,
      });
      return { ok: res.ok, status: res.status };
    } catch {
      return { ok: false };
    }
  },
};
