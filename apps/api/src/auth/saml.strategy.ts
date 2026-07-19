import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { MultiSamlStrategy, Profile, ValidateInResponseTo, VerifyWithRequest } from '@node-saml/passport-saml';
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
  // Populated by onModuleInit(). NestJS calls lifecycle hooks in
  // module-registration order before any request can reach a controller, so
  // this is always set by the time a real request needs it; the undefined
  // case only matters for the theoretical pre-init edge case handled in
  // generateMetadata() below.
  private passportStrategy: MultiSamlStrategy | undefined;

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
    this.passportStrategy = strategy;
  }

  // SP metadata generation lives on the real MultiSamlStrategy instance built
  // in onModuleInit(), not on this class (see the file-level comment on why
  // SamlStrategy can't extend MultiSamlStrategy itself). This delegates to it.
  //
  // `req` only needs to carry `params.organizationSlug` here -- see
  // getSlugParam() -- so SamlRequestLike is enough and this stays clear of the
  // duplicate @types/express mismatch described above; the cast on the call
  // below bridges to the library's own (structurally identical) Request type,
  // the same workaround `passport.use` above already relies on.
  generateMetadata(req: SamlRequestLike, callback: (err: Error | null, metadataXml?: string) => void): void {
    if (!this.passportStrategy) {
      callback(new Error('SAML strategy has not finished initializing'));
      return;
    }
    this.passportStrategy.generateServiceProviderMetadata(
      req as unknown as Parameters<MultiSamlStrategy['generateServiceProviderMetadata']>[0],
      null,
      null,
      callback,
    );
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
      issuer: `${process.env.API_ORIGIN}/api/v1/auth/saml/${organizationSlug}/metadata`,
      callbackUrl: `${process.env.API_ORIGIN}/api/v1/auth/saml/${organizationSlug}/callback`,
      // The IdP's own entity ID is validated implicitly by idpCert matching --
      // this codebase's design keeps SP-side request signing out of scope (see
      // the plan's Global Constraints), so no privateKey/publicCert here.
      validateInResponseTo: ValidateInResponseTo.always,
      cacheProvider: this.cacheProvider,
    };
  }

  async validate(req: SamlRequestLike, profile: Profile | null, done: SsoDoneCallback): Promise<void> {
    const organizationSlug = getSlugParam(req);
    const org = await this.prisma.organization.findUnique({ where: { slug: organizationSlug } });
    if (!org || !profile) {
      done(null, false, { message: 'not_provisioned' });
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
