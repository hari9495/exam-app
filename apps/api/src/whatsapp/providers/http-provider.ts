import { BadRequestException } from '@nestjs/common';
import { assertPublicHttpsUrl } from '../../common/ssrf';
import { WhatsappProviderAdapter, WhatsappSendArgs, WhatsappSendResult } from './types';

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
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
function substitute(template: string, args: WhatsappSendArgs, isJson: boolean): string {
  const encode = (value: string) => (isJson ? JSON.stringify(value).slice(1, -1) : value);
  return template.replace(/\{\{to\}\}/g, encode(args.to)).replace(/\{\{body\}\}/g, encode(args.body));
}

export const httpProvider: WhatsappProviderAdapter = {
  id: 'http',
  label: 'Generic HTTP',
  configFields: [
    { key: 'url', label: 'Webhook URL', secret: false, required: true, placeholder: 'https://example.com/whatsapp' },
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
      throw new BadRequestException('WhatsApp webhook url is not a valid URL');
    }
    assertPublicHttpsUrl(parsed);
  },

  async send(
    config: Record<string, unknown>,
    args: WhatsappSendArgs,
    fetchImpl: typeof fetch = fetch,
  ): Promise<WhatsappSendResult> {
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
