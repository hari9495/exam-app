import { BadRequestException } from '@nestjs/common';
import { assertPublicHttpsUrl, publicHttpsFetch } from '../../common/ssrf';
import { SmsFetch, SmsProviderAdapter, SmsSendArgs, SmsSendResult, networkFailure, readPath, statusFailure } from './types';

/**
 * Generic HTTP gateway: any SMS API (MSG91, Gupshup, Kaleyra, Exotel, Textlocal, ...) by configuration
 * only. Example configs: docs/sms-gateways.md.
 *
 *   url           https only, public host; the host may not contain a variable
 *   method        POST (default) | PUT | GET (GET sends no body)
 *   contentType   application/json (default) | application/x-www-form-urlencoded | any other (raw)
 *   headers       { name: template }, e.g. { "authkey": "{secret.authkey}" }
 *   secrets       { name: value }, write-only, referenced as {secret.name}
 *   bodyTemplate  template for the request body
 *   response      { successPath?, successValues?, messageIdPath? } dot paths into the JSON answer;
 *                 without successPath any 2xx is success
 *
 * Variables: {to} (E.164), {to_digits} (E.164 without +), {message}, {sender}, {dlt_entity_id},
 * {dlt_template_id}, {idempotency_key}, {var1}..{var9} (the DLT template's values), {secret.name}.
 * Each value is encoded for where it lands: percent-encoded in the URL and form bodies, JSON-escaped in
 * JSON bodies, as-is in other bodies and headers. Legacy {{to}} / {{body}} keep their old meaning.
 */

const VAR_RE = /\{\{(to|body)\}\}|\{(to|to_digits|message|sender|dlt_entity_id|dlt_template_id|idempotency_key|var[1-9]|secret\.[A-Za-z0-9_-]{1,40})\}/g;
const NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;
const HEADER_RE = /^[A-Za-z0-9-]{1,64}$/;
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection', 'content-type']);
const METHODS = ['POST', 'PUT', 'GET'];

type Encoding = 'url' | 'json' | 'form' | 'raw';

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function bodyEncoding(contentType: string): Encoding {
  return contentType.includes('json') ? 'json' : contentType.includes('x-www-form-urlencoded') ? 'form' : 'raw';
}

function encode(value: string, how: Encoding): string {
  if (how === 'json') return JSON.stringify(value).slice(1, -1);
  if (how === 'url' || how === 'form') return encodeURIComponent(value);
  return value;
}

/** Substitutes the variables into `template`. Throws on a {secret.x} that isn't configured. */
export function renderTemplate(template: string, config: Record<string, unknown>, args: SmsSendArgs, how: Encoding): string {
  const secrets = isRecord(config.secrets) ? config.secrets : {};
  return template.replace(VAR_RE, (_, legacy: string | undefined, name: string | undefined) => {
    // Legacy {{to}} / {{body}}: raw in the URL (as before), JSON-escaped in a JSON body.
    if (legacy) return how === 'json' ? encode(legacy === 'to' ? args.to : args.body, 'json') : legacy === 'to' ? args.to : args.body;
    const key = name as string;
    let value: unknown;
    if (key.startsWith('secret.')) {
      value = secrets[key.slice(7)];
      if (typeof value !== 'string') throw new Error(`secret ${key.slice(7)} is not set`);
    } else if (key.startsWith('var')) {
      value = args.vars?.[Number(key.slice(3)) - 1] ?? '';
    } else {
      value = {
        to: args.to,
        to_digits: args.to.replace(/^\+/, ''),
        message: args.body,
        sender: args.sender ?? '',
        dlt_entity_id: args.dltEntityId ?? '',
        dlt_template_id: args.dltTemplateId ?? '',
        idempotency_key: args.idempotencyKey ?? '',
      }[key];
    }
    return encode(String(value ?? ''), how);
  });
}

function referencedSecrets(...templates: unknown[]): string[] {
  return templates.flatMap((t) => (typeof t === 'string' ? [...t.matchAll(/\{secret\.([A-Za-z0-9_-]{1,40})\}/g)].map((m) => m[1]) : []));
}

function validateResponse(response: unknown): void {
  if (response === undefined) return;
  if (!isRecord(response)) throw new BadRequestException('response must be an object');
  for (const key of ['successPath', 'messageIdPath'] as const) {
    const path = response[key];
    if (path !== undefined && (typeof path !== 'string' || !/^[A-Za-z0-9_.-]{1,200}$/.test(path))) {
      throw new BadRequestException(`response.${key} must be a dot path such as data.0.id`);
    }
  }
  const values = response.successValues;
  if (values !== undefined && (!Array.isArray(values) || values.length > 20 || values.some((v) => typeof v !== 'string' || v.length > 100))) {
    throw new BadRequestException('response.successValues must be a list of up to 20 strings');
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
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
    // A variable in the host would let a message value pick the server the request goes to.
    if (!/^https:\/\/[^/?#{}]+([/?#]|$)/i.test(config.url as string)) {
      throw new BadRequestException('The webhook host must not contain a variable');
    }
    if (config.method !== undefined && !(typeof config.method === 'string' && METHODS.includes(config.method.toUpperCase()))) {
      throw new BadRequestException(`method must be one of ${METHODS.join(', ')}`);
    }
    if (config.contentType !== undefined && (typeof config.contentType !== 'string' || /[\r\n]/.test(config.contentType) || config.contentType.length > 100)) {
      throw new BadRequestException('contentType must be a media type such as application/json');
    }
    if (config.headers !== undefined) {
      if (!isRecord(config.headers) || Object.keys(config.headers).length > 20) throw new BadRequestException('headers must be an object of up to 20 headers');
      for (const [name, value] of Object.entries(config.headers)) {
        if (!HEADER_RE.test(name) || FORBIDDEN_HEADERS.has(name.toLowerCase())) throw new BadRequestException(`Header ${name.slice(0, 64)} is not allowed`);
        if (typeof value !== 'string' || value.length > 2000 || /[\r\n]/.test(value)) throw new BadRequestException(`Header ${name} must be one line of text`);
      }
    }
    if (config.secrets !== undefined) {
      if (!isRecord(config.secrets) || Object.keys(config.secrets).length > 20) throw new BadRequestException('secrets must be an object of up to 20 values');
      for (const [name, value] of Object.entries(config.secrets)) {
        if (!NAME_RE.test(name)) throw new BadRequestException('Secret names use letters, digits, - and _ only');
        if (typeof value !== 'string' || value.length === 0 || value.length > 2000 || /[\r\n]/.test(value)) throw new BadRequestException(`Secret ${name} must be one line of text`);
      }
    }
    const secrets = isRecord(config.secrets) ? config.secrets : {};
    const headerValues = isRecord(config.headers) ? Object.values(config.headers) : [];
    const missing = referencedSecrets(config.url, config.bodyTemplate, ...headerValues).filter((name) => typeof secrets[name] !== 'string');
    if (missing.length) throw new BadRequestException(`Set the secret ${missing[0]} or remove {secret.${missing[0]}}`);
    validateResponse(config.response);
  },

  async send(config: Record<string, unknown>, args: SmsSendArgs, fetchImpl: SmsFetch = publicHttpsFetch): Promise<SmsSendResult> {
    let request: { url: string; init: Parameters<SmsFetch>[1] };
    try {
      const contentType = (config.contentType as string) || 'application/json';
      const method = ((config.method as string) || 'POST').toUpperCase();
      const url = renderTemplate(config.url as string, config, args, 'url');
      // Re-validate the FINAL url: a legacy {{to}} can still land in the host.
      assertPublicHttpsUrl(new URL(url));

      const headers: Record<string, string> = { 'Content-Type': contentType };
      if (!isBlank(config.authHeader)) headers.Authorization = config.authHeader as string;
      for (const [name, template] of Object.entries(isRecord(config.headers) ? config.headers : {})) {
        const value = renderTemplate(String(template), config, args, 'raw');
        if (/[\r\n]/.test(value)) throw new Error(`header ${name} would span lines`);
        headers[name] = value;
      }
      const body = method === 'GET' ? undefined : renderTemplate(config.bodyTemplate as string, config, args, bodyEncoding(contentType));
      // redirect: 'manual' -- never follow a redirect (publicHttpsFetch never does).
      request = { url, init: { method, headers, body, redirect: 'manual' } };
    } catch (error) {
      return { ok: false, failure: 'rejected', error: `bad gateway configuration: ${(error as Error).message}`.slice(0, 200) };
    }

    let res: Response;
    try {
      res = await fetchImpl(request.url, request.init);
    } catch (error) {
      return networkFailure(error);
    }
    if (!res.ok) return statusFailure(res.status);

    const response = isRecord(config.response) ? config.response : {};
    if (!response.successPath && !response.messageIdPath) return { ok: true, status: res.status };
    let parsed: unknown;
    try {
      parsed = parseJson(await res.text());
    } catch {
      parsed = undefined;
    }
    const providerMsgId = response.messageIdPath ? readPath(parsed, response.messageIdPath as string) : undefined;
    const msgId = typeof providerMsgId === 'string' || typeof providerMsgId === 'number' ? String(providerMsgId).slice(0, 200) : undefined;
    if (response.successPath) {
      const value = readPath(parsed, response.successPath as string);
      const accepted = (Array.isArray(response.successValues) ? response.successValues : ['true']).map(String);
      // A 2xx we can't read may still have been sent: unknown, not rejected.
      if (parsed === undefined) return { ok: false, status: res.status, failure: 'unknown', error: 'gateway answer could not be read' };
      if (!accepted.includes(String(value))) return { ok: false, status: res.status, failure: 'rejected', error: 'gateway answered that the message was not accepted' };
    }
    return { ok: true, status: res.status, providerMsgId: msgId };
  },
};
