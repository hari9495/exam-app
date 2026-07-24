import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  MultiSamlStrategy,
  Profile,
  ValidateInResponseTo,
  VerifyWithRequest,
  generateServiceProviderMetadata,
} from '@node-saml/passport-saml';
import type { PassportSamlConfig } from '@node-saml/passport-saml';
// `import * as passport` compiles (via TS's esModuleInterop `__importStar`
// helper) to a shallow copy of `passport`'s OWN enumerable properties only.
// The `passport` package exports a singleton `new Passport()` instance whose
// `use`/`authenticate`/etc. methods live on the prototype, not as own
// properties -- so a namespace import silently loses them, and
// `passport.use(...)` below would be `undefined` at runtime. Import-equals
// compiles straight to `const passport = require('passport')` with no
// wrapper, keeping the real object (and, since @types/passport uses
// `export =`, still gives the merged namespace type used for `passport
// .Strategy` below).
import passport = require('passport');
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { SamlCacheProvider } from './saml-cache.provider';

export interface SsoUser {
  id: string;
  email: string;
  role: string;
  organizationId: string | null;
}

// The installed @node-saml/passport-saml types its verify callback's `user`
// slot as `Record<string, unknown>` only (no `false`), even though passing
// `false` for a failed verification is standard passport behavior and is
// exactly what this task's required contract calls for. Our own `validate()`
// uses this wider, accurate signature instead of the library's narrower one;
// the two are bridged with one cast at the point `onModuleInit` wires the
// library's callback in (see below).
export type SsoDoneCallback = (err: Error | null, user?: SsoUser | false, info?: { message: string }) => void;

// Deliberately NOT importing express's `Request` type here: this monorepo has
// two independently-installed copies of @types/express (the top-level one,
// and one nested under @node-saml/passport-saml's node_modules that its own
// .d.ts files reference). TypeScript treats those as distinct nominal-ish
// types even though they're structurally identical, so annotating `req` with
// either one breaks assignability against the other. This strategy only ever
// reads `req.params.organizationSlug`, so a minimal structural type sidesteps
// the duplicate-package mismatch entirely and is satisfied by both.
export interface SamlRequestLike {
  params: { organizationSlug?: string | string[] };
}

function getSlugParam(req: SamlRequestLike): string {
  const value = req.params.organizationSlug;
  return Array.isArray(value) ? value[0] : (value ?? '');
}

// @nestjs/passport's PassportStrategy() mixin wraps a strategy's constructor by
// always appending ONE generated verify callback as the LAST constructor argument
// (see node_modules/@nestjs/passport/dist/passport/passport.strategy.js:
// `super(...args, callback)`). @node-saml's MultiSamlStrategy takes THREE
// constructor args -- (options, signonVerify, logoutVerify) -- so `extends
// PassportStrategy(MultiSamlStrategy, 'saml')` would silently misroute: the
// mixin's generated callback (which delegates to a `validate()` method) would
// land in the *logoutVerify* slot, not signonVerify, since it's always appended
// last. Sign-on would then never call our lookup logic. That's a correctness
// bug, not just an inconvenience, so this class does NOT extend
// PassportStrategy. Instead it stays a plain injectable with the config
// resolution and sign-on verify logic, and manually constructs + registers the
// real MultiSamlStrategy instance in onModuleInit() -- the same
// well-established alternative NestJS uses elsewhere in this codebase for
// startup-time side effects (see StaticUploadsModule, SetupService).
@Injectable()
export class SamlStrategy implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cacheProvider: SamlCacheProvider,
  ) {}

  onModuleInit(): void {
    const signonVerify: VerifyWithRequest = (req, profile, done) => {
      this.validate(req, profile, done as unknown as SsoDoneCallback).catch((error) => done(error as Error));
    };

    // SAML Single Logout is out of scope for this feature -- nothing in the
    // app triggers a logout flow through this strategy. This callback exists
    // only because MultiSamlStrategy's constructor requires one.
    const logoutVerify: VerifyWithRequest = (_req, _profile, done) => {
      done(new Error('SAML Single Logout is not supported'));
    };

    const strategy = new MultiSamlStrategy(
      {
        passReqToCallback: true,
        getSamlOptions: (req, done) => {
          this.resolveOrgSamlConfig(getSlugParam(req))
            .then((config) => done(null, config))
            .catch((error) => done(error as Error));
        },
      },
      signonVerify,
      logoutVerify,
    );

    // `passport.use` (top-level `passport` package) types its strategy param via
    // the top-level @types/express Request. @node-saml/passport-saml ships its
    // own nested @types/express, so `MultiSamlStrategy`'s `authenticate` method
    // is structurally typed against a distinct (if identical-at-runtime) Request
    // type -- a duplicate-@types artifact of this monorepo's install layout, not
    // a real incompatibility. Passport itself is duck-typed at runtime.
    passport.use('saml', strategy as unknown as passport.Strategy);
  }

  // SP metadata (this SP's own entity ID/issuer + ACS callback URL) is
  // derived purely from API_ORIGIN + the org slug -- it does NOT depend on
  // anything the IdP admin configures. Confirmed by reading the installed
  // @node-saml/node-saml@5.1.0 source (lib/metadata.js):
  // `generateServiceProviderMetadata` destructures only `issuer`/`callbackUrl`
  // (required) plus optional SP-side signing/decryption/contact fields this
  // app never sets -- it never reads `entryPoint` or `idpCert`.
  //
  // Deliberately NOT routed through the MultiSamlStrategy instance built in
  // onModuleInit(): `MultiSamlStrategy.generateServiceProviderMetadata()`
  // calls `getSamlOptions` -> `resolveOrgSamlConfig()` under the hood, which
  // throws unless samlEnabled + all IdP fields are set. That would make the
  // "give this metadata URL to your IdP admin" onboarding step (see
  // saml.controller.ts / the org-admin settings page) impossible before SSO
  // is already fully configured and enabled -- backwards, since IdP admins
  // commonly need the SP's metadata FIRST. Calling the library's standalone
  // `generateServiceProviderMetadata(params)` directly with just this org's
  // issuer/callbackUrl sidesteps that guard entirely, and needs nothing from
  // onModuleInit (no more pre-init edge case to handle here).
  generateMetadata(req: SamlRequestLike, callback: (err: Error | null, metadataXml?: string) => void): void {
    this.resolveSpMetadataConfig(getSlugParam(req))
      .then((config) => callback(null, generateServiceProviderMetadata(config)))
      .catch((error) => callback(error as Error));
  }

  // Metadata-only config: just needs the org to exist, so the SP-side
  // issuer/callbackUrl can be built from its slug. No samlEnabled or IdP
  // field checks here -- see the comment on generateMetadata() above for why.
  // `@node-saml/node-saml`'s `GenerateServiceProviderMetadataParams` type
  // exists (lib/types.d.ts) but isn't part of that package's public named
  // exports (lib/index.d.ts), so it can't be imported by name here -- this
  // return type is written out structurally instead. It's exactly what
  // `generateServiceProviderMetadata()` requires (issuer + callbackUrl are
  // its only mandatory fields; see the comment on generateMetadata() above).
  async resolveSpMetadataConfig(organizationSlug: string): Promise<{ issuer: string; callbackUrl: string }> {
    const org = await this.prisma.organization.findUnique({ where: { slug: organizationSlug } });
    if (!org) {
      throw new NotFoundException(`Organization "${organizationSlug}" not found`);
    }
    return this.spUrls(organizationSlug);
  }

  // Shared by resolveOrgSamlConfig (full auth config) and
  // resolveSpMetadataConfig (metadata-only config) -- both need the same
  // org-scoped SP issuer/ACS callback URLs, and only that.
  private spUrls(organizationSlug: string): { issuer: string; callbackUrl: string } {
    return {
      issuer: `${process.env.API_ORIGIN}/api/v1/auth/saml/${organizationSlug}/metadata`,
      callbackUrl: `${process.env.API_ORIGIN}/api/v1/auth/saml/${organizationSlug}/callback`,
    };
  }

  async resolveOrgSamlConfig(organizationSlug: string): Promise<Partial<PassportSamlConfig>> {
    const org = await this.prisma.organization.findUnique({ where: { slug: organizationSlug } });
    if (!org) {
      throw new NotFoundException(`Organization "${organizationSlug}" not found`);
    }
    if (!org.samlEnabled || !org.samlIdpEntityId || !org.samlIdpSsoUrl || !org.samlIdpCertificate) {
      throw new BadRequestException(`SAML SSO is not configured for "${organizationSlug}"`);
    }

    return {
      entryPoint: org.samlIdpSsoUrl,
      idpCert: org.samlIdpCertificate,
      ...this.spUrls(organizationSlug),
      // NOTE: `idpIssuer` here is NOT what enforces the entity-ID check on
      // login. Confirmed by reading the installed @node-saml/node-saml@5.1.0
      // source (lib/saml.js): `idpIssuer` is only read by `verifyIssuer()`,
      // which is only called from `verifyLogoutRequest`/`verifyLogoutResponse`
      // -- the Single Logout message path this app doesn't implement (no SLO
      // route; `logoutVerify` above unconditionally errors). The normal
      // sign-on path (`validatePostResponseAsync` ->
      // `processValidlySignedAssertionAsync`) never calls `verifyIssuer` --
      // it just copies the assertion's `<Issuer>` into `profile.issuer`
      // without checking it against anything. So the real entity-ID
      // enforcement for login lives in `validate()` below, which compares
      // `profile.issuer` to `org.samlIdpEntityId` itself. `idpIssuer` is set
      // here anyway so it's correct if SLO support is ever added, and so this
      // config isn't silently missing a field the type otherwise supports --
      // but on its own it validates nothing for the flows this app uses.
      idpIssuer: org.samlIdpEntityId,
      // SP-side request signing is out of scope (see the plan's Global
      // Constraints), so no privateKey/publicCert here.
      validateInResponseTo: ValidateInResponseTo.always,
      cacheProvider: this.cacheProvider,
      // Entra ID's default "Signing Option" is "Sign SAML assertion" -- the
      // outer <Response> is left unsigned. node-saml defaults to requiring a
      // response-level signature (wantAuthnResponseSigned: true) and rejects
      // Entra's default with "Invalid document signature" (confirmed against
      // a captured live Entra response, 2026-07-24). The signed assertion is
      // what carries the authenticated identity, so require THAT signature
      // and accept an unsigned outer envelope -- otherwise every org admin
      // must find and flip a buried non-default Entra setting before SSO
      // works at all.
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
    };
  }

  async validate(req: SamlRequestLike, profile: Profile | null, done: SsoDoneCallback): Promise<void> {
    const organizationSlug = getSlugParam(req);
    const org = await this.prisma.organization.findUnique({ where: { slug: organizationSlug } });
    if (!org || !profile) {
      done(null, false, { message: 'not_provisioned' });
      return;
    }

    // The installed node-saml library does not check the assertion's
    // <Issuer> against anything on the normal sign-on path (see the comment
    // in resolveOrgSamlConfig() above) -- it just hands it back as
    // `profile.issuer`. This is the actual entity-ID check the org-admin's
    // configured samlIdpEntityId exists to enforce: reject any assertion
    // whose issuer doesn't match, so a cert that validates a signature from
    // some other issuer entirely can't be used to impersonate this org's IdP.
    if (profile.issuer !== org.samlIdpEntityId) {
      done(null, false, { message: 'issuer_mismatch' });
      return;
    }

    const user = await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, (tx) =>
      tx.user.findFirst({ where: { email: profile.nameID, organizationId: org.id } }),
    );

    if (!user) {
      done(null, false, { message: 'not_provisioned' });
      return;
    }

    const ssoUser: SsoUser = { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId };
    done(null, ssoUser);
  }
}
