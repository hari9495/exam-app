import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { BlobStorageService, OrgSecretsCryptoService, PrismaService, authCookieSecure, isOrganizationActive } from '@exam-platform/shared';

// Which company a sign-in is for, without anyone typing a company code (founder decision 7 Oct 2026).
// In order: the API's own orgSlug (exam / ATS clients, deep links -- unchanged), the web address
// (<slug>.<YX_BASE_DOMAIN> in production), the company this device last signed in to (a signed
// cookie). None of them: email-first across every company (AuthService).

export const REMEMBERED_COMPANY_COOKIE = 'yx_company';
const REMEMBERED_COMPANY_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
// Names under the base domain that are never a company.
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'app', 'admin', 'auth', 'login', 'mail', 'status', 'static', 'cdn', 'docs', 'help']);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// The company slug in a host name, only when it is exactly <label>.<base> for the configured base
// domain. Anything else -- other domains, deeper names, ports aside -- is ignored, so a spoofed Host
// or Origin can at most name a company, which an orgSlug can do anyway. X-Forwarded-Host is never read.
export function companySlugFromHost(host: string | undefined, base = process.env.YX_BASE_DOMAIN): string | null {
  const domain = base?.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!domain || !host) return null;
  let name: string;
  try {
    name = (host.includes('://') ? new URL(host).hostname : new URL(`http://${host}`).hostname).toLowerCase();
  } catch {
    return null;
  }
  if (!name.endsWith(`.${domain}`)) return null;
  const label = name.slice(0, -domain.length - 1);
  return LABEL.test(label) && !RESERVED_SUBDOMAINS.has(label) ? label : null;
}

// The web app's company addresses (https://<slug>.<YX_BASE_DOMAIN>) for CORS, or null when unset.
export function companyOriginPattern(base = process.env.YX_BASE_DOMAIN): RegExp | null {
  const domain = base?.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  return domain ? new RegExp(`^https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) : null;
}

export function rememberedCompanyCookieOptions(maxAge?: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: authCookieSecure(), path: '/', ...(maxAge ? { maxAge } : {}) };
}

export const setRememberedCompany = (res: Response, value: string) =>
  res.cookie(REMEMBERED_COMPANY_COOKIE, value, rememberedCompanyCookieOptions(REMEMBERED_COMPANY_MAX_AGE_MS));
export const clearRememberedCompany = (res: Response) => res.clearCookie(REMEMBERED_COMPANY_COOKIE, rememberedCompanyCookieOptions());

export interface CompanyCard {
  name: string;
  logoUrl: string | null;
}

@Injectable()
export class CompanyScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  // The browser reaches the API on the company's own name (Host) or calls it from there (Origin).
  hostSlug(req: Request): string | null {
    return companySlugFromHost(req.headers.host) ?? companySlugFromHost(typeof req.headers.origin === 'string' ? req.headers.origin : undefined);
  }

  // The slug a sign-in request is scoped to, or undefined for email-first.
  async slugFor(req: Request, explicit?: string): Promise<string | undefined> {
    const given = explicit?.trim();
    if (given) return given;
    return this.hostSlug(req) ?? (await this.remembered(req))?.slug ?? undefined;
  }

  // "Remember the company on this device": `<organization id>.<HMAC>`; HttpOnly, never readable by script.
  cookieValue(organizationId: string): string {
    return `${organizationId}.${this.crypto.hmac('remembered-company', organizationId)}`;
  }

  // The remembered company, when the cookie is intact and the company still active; else null.
  async remembered(req: Request) {
    const raw = req.cookies?.[REMEMBERED_COMPANY_COOKIE];
    const organizationId = typeof raw === 'string' ? this.verify(raw) : null;
    if (!organizationId) return null;
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, slug: true, name: true, logoPath: true, status: true } });
    return org && isOrganizationActive(org.status) ? org : null;
  }

  // The organisation id a cookie value vouches for, or null when it was altered.
  verify(value: string): string | null {
    const dot = value.indexOf('.');
    if (dot <= 0) return null;
    const organizationId = value.slice(0, dot);
    if (!/^[0-9a-f-]{36}$/.test(organizationId)) return null;
    const expected = Buffer.from(this.cookieValue(organizationId));
    const given = Buffer.from(value);
    return expected.length === given.length && timingSafeEqual(expected, given) ? organizationId : null;
  }

  // Name and logo only: what a sign-in screen may show about a company.
  async card(org: { name: string; logoPath: string | null }): Promise<CompanyCard> {
    return { name: org.name, logoUrl: ((await this.blobStorage.signIfOurs(org.logoPath ?? null)) as string | null) ?? null };
  }
}
