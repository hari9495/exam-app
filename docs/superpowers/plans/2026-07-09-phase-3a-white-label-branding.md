# Phase 3a (White-Label Branding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organization set a logo (uploaded file) and two brand colors, visibly applied on the login page and dashboard.

**Architecture:** Extends the existing `OrganizationsModule` with three authenticated routes (read/update colors, upload logo) on the existing `OrganizationsController`, plus one new, deliberately unguarded `OrganizationsPublicController` for the slug-based public lookup the login page needs — mirroring how `CandidateAuthController` already has zero guards for its own public routes, rather than introducing a new `@Public()` bypass mechanism. Uploaded logos are written to local disk and served via `@nestjs/serve-static`, the first file-upload subsystem in this codebase.

**Tech Stack:** NestJS, Prisma (`sqlserver` provider), SQL Server, Jest/Supertest — plus `@nestjs/serve-static`, `multer` (new), `@types/multer` (new, dev-only). Frontend: Next.js (existing skeleton), no new dependencies.

## Global Constraints

- **Local disk storage only** — no cloud object storage in this phase (deferred to Phase 3c). Files live under `apps/api/uploads/`, gitignored.
- **No `@Public()` decorator exists in this codebase.** Public (unauthenticated) routes get their own controller with zero `@UseGuards(...)`, matching `CandidateAuthController`'s existing precedent — never a per-route guard bypass on an otherwise-guarded controller.
- **`super_admin` has `organizationId: null`** (confirmed in `CurrentTenant`, `apps/api/src/auth/current-tenant.decorator.ts`). All three authenticated branding routes act on "the caller's own organization" — a caller with `organizationId: null` gets a `400 BadRequestException` ("No organization context for this account"), never a null-scoped query and never silently treated as "no organization."
- **Hex colors validated as `/^#[0-9a-fA-F]{6}$/`** — a 6-digit hex string with a leading `#`, nothing else accepted.
- **Logo validation (mimetype allow-list, 2MB size cap) lives in `OrganizationsService`, not in Multer's own `fileFilter`/`limits`.** This keeps every validation rule unit-testable the same way every other service in this codebase is tested, rather than depending on Multer/Express's own error-handling quirks. The `FileInterceptor` uses `memoryStorage()` (the NestJS default) so the raw buffer reaches the service as `file.buffer`.
- **`logoUrl` in every API response is derived from `logoPath` + a new `API_ORIGIN` env var at read/write time** — the raw stored `logoPath` value is never returned to a client. This keeps the stored value free to change format later (e.g. when cloud storage replaces local disk) without a client-visible contract change.
- **Static files are served via `@nestjs/serve-static` mounted at `/uploads`, outside the `api/v1` global prefix.** `app.setGlobalPrefix('api/v1')` (`apps/api/src/main.ts`) does not apply to `ServeStaticModule`'s static middleware — it is a distinct, unprefixed route space by design, not an oversight to fix later.
- **This phase stays fully out of Phase 2b's `MonitoringGateway` and Phase 2c's `ProctoringAnalysisModule`** — no interaction with either subsystem anywhere in this plan.
- **No automated frontend tests.** No test tooling (Jest/RTL or otherwise) exists in `apps/web` as of Phase 2c — frontend tasks in this plan are verified manually, matching established precedent.
- Migrations are applied with `npx prisma migrate deploy`, **never** `npx prisma migrate dev` (`migrate dev --create-only` reliably fails with P3014 in this environment — hand-write the migration SQL, as every prior schema task in this project has done).
- Every timestamp-style column default must use `DEFAULT GETUTCDATE()`, never `DEFAULT CURRENT_TIMESTAMP` — not applicable to this plan's migration (no new timestamp columns), noted for completeness.
- **Never edit an already-applied migration file's SQL text in place.**
- Required (non-optional) `class-validator` DTO properties use a definite-assignment assertion (`body!: string;`); optional properties use `@IsOptional()` and a `?:` type, matching `ReportProctoringEventDto`'s existing convention.
- Full spec: `docs/superpowers/specs/2026-07-09-phase-3a-white-label-branding-design.md`.

---

## File Structure

```
apps/api/
  package.json                                            # Modify: add @nestjs/serve-static, multer; @types/multer devDep
  .env.example (repo root)                                # Modify: add API_ORIGIN
  .gitignore (repo root)                                  # Modify: add apps/api/uploads/
  prisma/
    schema.prisma                                          # Modify: Organization gains logoPath/primaryColor/accentColor
    migrations/
      20260709150000_organization_branding/
        migration.sql                                       # Create
  src/
    app.module.ts                                           # Modify: import ServeStaticModule
    organizations/
      uploads-path.ts                                        # Create: shared UPLOADS_ROOT constant
      dto/
        update-branding-colors.dto.ts                        # Create: { primaryColor?, accentColor? }
      organizations.service.ts                                # Modify: getBranding/updateBrandingColors/uploadLogo/
                                                                #         getPublicBrandingBySlug
      organizations.service.spec.ts                            # Modify: add tests
      organizations.controller.ts                              # Modify: add 3 authenticated branding routes
      organizations-public.controller.ts                       # Create: public slug-lookup route
      organizations.module.ts                                  # Modify: register new controller
  test/
    organization-branding.e2e-spec.ts                        # Create
apps/web/
  lib/
    api-client.ts                                             # Modify: apiFetch skips Content-Type for FormData bodies
  app/
    settings/
      branding/
        page.tsx                                               # Create: branding settings form
    login/
      page.tsx                                                 # Modify: fetch+apply public branding on slug blur
    dashboard/
      page.tsx                                                 # Modify: fetch+apply own org branding
```

---

### Task 1: Schema for organization branding

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260709150000_organization_branding/migration.sql`

**Interfaces:**
- Produces: `Organization.logoPath: string | null`, `Organization.primaryColor: string | null`, `Organization.accentColor: string | null` — every later task relies on these exact field names.

- [ ] **Step 1: Add the three fields to `Organization` in schema.prisma**

```prisma
model Organization {
  id           String     @id @default(uuid()) @db.UniqueIdentifier
  name         String
  slug         String     @unique
  region       String     @default("us")
  status       String     @default("active")
  logoPath     String?    @map("logo_path")
  primaryColor String?    @map("primary_color")
  accentColor  String?    @map("accent_color")
  planId       String     @map("plan_id") @db.UniqueIdentifier
  plan         Plan       @relation(fields: [planId], references: [id])
  createdAt    DateTime   @default(now()) @map("created_at")
  users        User[]
  auditLogs    AuditLog[]

  @@map("organizations")
}
```
(Only the three new lines are additions — every other field, relation, and the `@@map` are unchanged from the current model.)

- [ ] **Step 2: Generate the migration**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name organization_branding`
Expected: fails with a P3014 shadow-database permission error, same as every prior schema task in this project. Hand-write the migration SQL directly (Step 3).

- [ ] **Step 3: Write the migration SQL by hand**

`apps/api/prisma/migrations/20260709150000_organization_branding/migration.sql`:
```sql
-- AlterTable: organizations gains optional white-label branding fields. All three are
-- nullable with no default -- an org with nothing set keeps the current unstyled look.
ALTER TABLE [dbo].[organizations] ADD [logo_path] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [primary_color] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [accent_color] NVARCHAR(1000);
```

Note: no Row-Level Security change — `organizations` is the tenant boundary itself, not a tenant-scoped child table, and already has no RLS policy of its own (only its child tables like `users`/`audit_logs` are RLS-protected via `TenantAccessPolicy`).

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate deploy`, then `npx prisma generate`.
Expected: migration applies cleanly; `@prisma/client` types now include `Organization.logoPath`/`primaryColor`/`accentColor`.

- [ ] **Step 5: Verify against the real database**

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='organizations' AND COLUMN_NAME IN ('logo_path','primary_color','accent_color')" -C`
Expected: three rows returned.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add logo/color branding fields to Organization"
```

---

### Task 2: Branding colors — read and update

**Files:**
- Create: `apps/api/src/organizations/dto/update-branding-colors.dto.ts`
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Modify: `apps/api/src/organizations/organizations.service.spec.ts`
- Modify: `apps/api/src/organizations/organizations.controller.ts`

**Interfaces:**
- Produces: `OrganizationsService.getBranding(context: TenantContext): Promise<BrandingResponse>`, `OrganizationsService.updateBrandingColors(context: TenantContext, dto: UpdateBrandingColorsDto): Promise<BrandingResponse>` where `BrandingResponse = { logoUrl: string | null; primaryColor: string | null; accentColor: string | null }`. `GET /organizations/branding`, `PATCH /organizations/branding` (both `org:manage_settings`). Task 3 reuses `BrandingResponse` and the `buildLogoUrl` helper this task introduces.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/organizations/organizations.service.spec.ts` — add these `describe` blocks after the existing `create` tests (keep the existing `create` tests and their `beforeEach` setup unchanged, extend the mocked `prisma.organization` object with `findUnique`/`update` — check the current file first for the exact existing mock shape before editing):

```typescript
  describe('getBranding', () => {
    it('returns null logoUrl/colors for an org with nothing set', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', logoPath: null, primaryColor: null, accentColor: null });

      const result = await service.getBranding({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({ logoUrl: null, primaryColor: null, accentColor: null });
    });

    it('derives logoUrl from logoPath and API_ORIGIN', async () => {
      process.env.API_ORIGIN = 'http://localhost:3001';
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', logoPath: 'logos/org-1.png', primaryColor: '#1a73e8', accentColor: '#fbbc04' });

      const result = await service.getBranding({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({ logoUrl: 'http://localhost:3001/uploads/logos/org-1.png', primaryColor: '#1a73e8', accentColor: '#fbbc04' });
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(service.getBranding({ organizationId: null, isSuperAdmin: true })).rejects.toThrow(BadRequestException);
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('updateBrandingColors', () => {
    it('updates only the provided fields and returns the fresh branding', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1', logoPath: null, primaryColor: '#1a73e8', accentColor: null });

      const result = await service.updateBrandingColors({ organizationId: 'org-1', isSuperAdmin: false }, { primaryColor: '#1a73e8' });

      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { primaryColor: '#1a73e8' } });
      expect(result).toEqual({ logoUrl: null, primaryColor: '#1a73e8', accentColor: null });
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(
        service.updateBrandingColors({ organizationId: null, isSuperAdmin: true }, { primaryColor: '#1a73e8' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });
```

Add `BadRequestException` to the existing `@nestjs/common` import at the top of the file. Update the `prisma` type declaration and `beforeEach` to add `update: jest.fn()` alongside the existing `findUnique`/`create` mocks:
```typescript
  let prisma: { organization: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [OrganizationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(OrganizationsService);
  });
```
(This replaces the file's current `prisma` type declaration and `beforeEach` block — the existing `create` tests are otherwise unchanged and still pass unmodified against this widened mock shape.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- organizations.service`
Expected: FAIL — `getBranding`/`updateBrandingColors` are not defined yet.

- [ ] **Step 3: Write the DTO**

`apps/api/src/organizations/dto/update-branding-colors.dto.ts`:
```typescript
import { IsOptional, Matches } from 'class-validator';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export class UpdateBrandingColorsDto {
  @IsOptional()
  @Matches(HEX_COLOR_PATTERN, { message: 'primaryColor must be a 6-digit hex color, e.g. #1a73e8' })
  primaryColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR_PATTERN, { message: 'accentColor must be a 6-digit hex color, e.g. #1a73e8' })
  accentColor?: string;
}
```

- [ ] **Step 4: Implement the service methods**

`apps/api/src/organizations/organizations.service.ts`:
```typescript
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateBrandingColorsDto } from './dto/update-branding-colors.dto';

export interface BrandingResponse {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const existing = await this.prisma.organization.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Organization slug "${dto.slug}" is already taken`);
    }
    return this.prisma.organization.create({
      data: { name: dto.name, slug: dto.slug, region: dto.region, planId: dto.planId },
    });
  }

  async getBranding(context: TenantContext): Promise<BrandingResponse> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    return this.toBrandingResponse(org);
  }

  async updateBrandingColors(context: TenantContext, dto: UpdateBrandingColorsDto): Promise<BrandingResponse> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }), ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }) },
    });
    return this.toBrandingResponse(org);
  }

  private requireOrganizationId(context: TenantContext): string {
    if (!context.organizationId) {
      throw new BadRequestException('No organization context for this account');
    }
    return context.organizationId;
  }

  private toBrandingResponse(org: Pick<Organization, 'logoPath' | 'primaryColor' | 'accentColor'>): BrandingResponse {
    return {
      logoUrl: org.logoPath ? `${process.env.API_ORIGIN}/uploads/${org.logoPath}` : null,
      primaryColor: org.primaryColor,
      accentColor: org.accentColor,
    };
  }
}
```
(`toBrandingResponse` and `requireOrganizationId` are shared private helpers Task 3's `uploadLogo` also uses — do not duplicate this logic there.)

- [ ] **Step 5: Add the controller routes**

In `apps/api/src/organizations/organizations.controller.ts`, add the import, `CurrentTenant` decorator, and two new routes:
```typescript
import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '../prisma/tenant-context';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateBrandingColorsDto } from './dto/update-branding-colors.dto';

@Controller('organizations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @RequirePermissions('platform:manage_organizations')
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Get('branding')
  @RequirePermissions('org:manage_settings')
  getBranding(@CurrentTenant() tenant: TenantContext) {
    return this.organizationsService.getBranding(tenant);
  }

  @Patch('branding')
  @RequirePermissions('org:manage_settings')
  updateBrandingColors(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateBrandingColorsDto) {
    return this.organizationsService.updateBrandingColors(tenant, dto);
  }
}
```
(Task 3 adds the `POST branding/logo` route to this same controller — not duplicated here.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:api -- organizations.service`
Expected: full file passes (existing 2 `create` tests + 5 new).

Run: `npm run test:api` (from repo root)
Expected: all suites passing, no regressions.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/organizations/dto/update-branding-colors.dto.ts apps/api/src/organizations/organizations.service.ts apps/api/src/organizations/organizations.service.spec.ts apps/api/src/organizations/organizations.controller.ts
git commit -m "feat: add GET/PATCH /organizations/branding for reading and updating brand colors"
```

---

### Task 3: Logo upload and static serving

**Files:**
- Modify: `apps/api/package.json`
- Modify: `.env.example` (repo root)
- Modify: `.gitignore` (repo root)
- Create: `apps/api/src/organizations/uploads-path.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Modify: `apps/api/src/organizations/organizations.service.spec.ts`
- Modify: `apps/api/src/organizations/organizations.controller.ts`

**Interfaces:**
- Consumes: `BrandingResponse`, `requireOrganizationId`/`toBrandingResponse` (Task 2, same file).
- Produces: `OrganizationsService.uploadLogo(context: TenantContext, file: Express.Multer.File): Promise<BrandingResponse>`. `POST /organizations/branding/logo` (`org:manage_settings`, `multipart/form-data`).

- [ ] **Step 1: Add dependencies and config**

In `apps/api/package.json`, add to `dependencies`:
```json
    "@nestjs/serve-static": "^4.0.0",
    "multer": "^1.4.5-lts.1",
```
Add to `devDependencies`:
```json
    "@types/multer": "^1.4.11",
```

Run (from repo root): `npm install`
Expected: installs cleanly, `package-lock.json` updated.

In `.env.example` (repo root), add:
```
API_ORIGIN=http://localhost:3001
```

In `.gitignore` (repo root), add:
```
apps/api/uploads/
```

- [ ] **Step 2: Write the shared uploads-path constant**

`apps/api/src/organizations/uploads-path.ts`:
```typescript
import { existsSync } from 'fs';
import { dirname, join } from 'path';

// Walk up from this file's directory until we find `apps/api/package.json`. A fixed
// number of `..` segments is fragile here: this repo's tsconfig has no `rootDir`, so
// `nest build` compiles to `dist/src/organizations/uploads-path.js` (one level deeper
// than `dist/organizations/uploads-path.js`), while ts-jest runs this file straight
// from `src/organizations/uploads-path.ts`. Walking up to the package root resolves
// correctly in both cases instead of guessing a depth that only holds for one of them.
function findApiRoot(startDir: string): string {
  let dir = startDir;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      return startDir;
    }
    dir = parent;
  }
  return dir;
}

export const UPLOADS_ROOT = join(findApiRoot(__dirname), 'uploads');
```
(Resolves to `apps/api/uploads` at runtime, whether running from `src` via `ts-jest`/`ts-node` or from compiled `dist/src`. Both `OrganizationsService` — for writing — and `AppModule` — for serving — import this same constant so the write path and the serve path can never drift apart. The directory walk depends only on `fs.existsSync`, never the mocked `fs/promises` module used elsewhere in this task's tests, so it behaves identically in and out of Jest.)

- [ ] **Step 3: Write the failing tests**

In `apps/api/src/organizations/organizations.service.spec.ts`, add the import and mock `fs/promises` at the top of the file (this must be the first lines, before any other import, per Jest's module-mocking convention already used in `email.service.spec.ts`):
```typescript
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

import * as fs from 'fs/promises';
```

Add `import { sep } from 'path';` alongside the file's other imports (not inside the mocked block above — a normal top-level import).

Add this `describe` block after `updateBrandingColors`'s tests:
```typescript
  describe('uploadLogo', () => {
    const pngFile = { mimetype: 'image/png', size: 1024, buffer: Buffer.from('fake-png-bytes') } as Express.Multer.File;

    beforeEach(() => {
      process.env.API_ORIGIN = 'http://localhost:3001';
      // .mockReset() first: jest.mock('fs/promises', ...) above creates ONE mock function
      // shared across every test in this file (unlike `prisma`, which is a fresh object per
      // test) — without resetting call history here, an earlier test's fs.writeFile call
      // would leak into a later test's `expect(fs.writeFile).not.toHaveBeenCalled()`.
      (fs.mkdir as jest.Mock).mockReset().mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockReset().mockResolvedValue(undefined);
    });

    it('writes the file to logos/{orgId}.png and updates logoPath', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1', logoPath: 'logos/org-1.png', primaryColor: null, accentColor: null });

      const result = await service.uploadLogo({ organizationId: 'org-1', isSuperAdmin: false }, pngFile);

      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining(`logos${sep}org-1.png`), pngFile.buffer);
      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { logoPath: 'logos/org-1.png' } });
      expect(result.logoUrl).toBe('http://localhost:3001/uploads/logos/org-1.png');
    });

    it('rejects a non-image mimetype without writing any file', async () => {
      const badFile = { mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('x') } as Express.Multer.File;

      await expect(service.uploadLogo({ organizationId: 'org-1', isSuperAdmin: false }, badFile)).rejects.toThrow(BadRequestException);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('rejects a file over 2MB without writing any file', async () => {
      const bigFile = { mimetype: 'image/png', size: 2 * 1024 * 1024 + 1, buffer: Buffer.from('x') } as Express.Multer.File;

      await expect(service.uploadLogo({ organizationId: 'org-1', isSuperAdmin: false }, bigFile)).rejects.toThrow(BadRequestException);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(service.uploadLogo({ organizationId: null, isSuperAdmin: true }, pngFile)).rejects.toThrow(BadRequestException);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:api -- organizations.service`
Expected: FAIL — `uploadLogo` is not defined yet.

- [ ] **Step 5: Implement `uploadLogo`**

In `apps/api/src/organizations/organizations.service.ts`, add the imports and method:
```typescript
import { dirname, join } from 'path';
import * as fs from 'fs/promises';
import { UPLOADS_ROOT } from './uploads-path';
```
```typescript
const ALLOWED_LOGO_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
};
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
```
Add the method to `OrganizationsService` (after `updateBrandingColors`):
```typescript
  async uploadLogo(context: TenantContext, file: Express.Multer.File): Promise<BrandingResponse> {
    const organizationId = this.requireOrganizationId(context);

    const extension = ALLOWED_LOGO_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Logo must be a PNG, JPEG, or SVG image');
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      throw new BadRequestException('Logo file must be 2MB or smaller');
    }

    const logoPath = `logos/${organizationId}${extension}`;
    const fullPath = join(UPLOADS_ROOT, logoPath);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.buffer);

    const org = await this.prisma.organization.update({ where: { id: organizationId }, data: { logoPath } });
    return this.toBrandingResponse(org);
  }
```
(`logoPath` always uses forward slashes, e.g. `logos/org-1.png` — this is the value stored in the DB and used to build `logoUrl`; `join()` is only used for the actual filesystem write path, which correctly uses the OS-native separator.)

- [ ] **Step 6: Register `ServeStaticModule` in `AppModule`**

`apps/api/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UPLOADS_ROOT } from './organizations/uploads-path';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { CandidatesModule } from './candidates/candidates.module';
import { InvitationsModule } from './invitations/invitations.module';
import { CandidateAuthModule } from './candidate-auth/candidate-auth.module';
import { AttemptModule } from './attempts/attempt.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({ rootPath: UPLOADS_ROOT, serveRoot: '/uploads' }),
    PrismaModule,
    RbacModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    QuestionsModule,
    ExamsModule,
    CandidatesModule,
    InvitationsModule,
    CandidateAuthModule,
    AttemptModule,
  ],
})
export class AppModule {}
```
(Every existing module import is unchanged — only `ServeStaticModule` and `UPLOADS_ROOT` are new.)

- [ ] **Step 7: Add the controller route**

In `apps/api/src/organizations/organizations.controller.ts`, add the imports and route:
```typescript
import { Body, Controller, Get, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
```
```typescript
  @Post('branding/logo')
  @RequirePermissions('org:manage_settings')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@CurrentTenant() tenant: TenantContext, @UploadedFile() file: Express.Multer.File) {
    return this.organizationsService.uploadLogo(tenant, file);
  }
```
(`FileInterceptor('file')` with no options defaults to `memoryStorage()`, so `file.buffer` is populated — exactly what `uploadLogo` reads. No `limits`/`fileFilter` config here: all validation lives in the service per this plan's Global Constraints.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test:api -- organizations.service`
Expected: full file passes (existing 7 tests + 4 new).

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 9: Manually verify static serving**

Run: `npm run start:dev` (from `apps/api/`), then in a separate terminal create a placeholder file and confirm it's servable:
```bash
mkdir -p apps/api/uploads/logos
echo "test" > apps/api/uploads/logos/manual-check.txt
curl http://localhost:3001/uploads/logos/manual-check.txt
```
Expected: `test` printed (confirms `/uploads` is served outside the `api/v1` prefix). Delete `apps/api/uploads/logos/manual-check.txt` afterward — it was only for this manual check, not a test fixture.

- [ ] **Step 10: Commit**

```bash
git add apps/api/package.json package-lock.json .env.example .gitignore apps/api/src/organizations/uploads-path.ts apps/api/src/app.module.ts apps/api/src/organizations/organizations.service.ts apps/api/src/organizations/organizations.service.spec.ts apps/api/src/organizations/organizations.controller.ts
git commit -m "feat: add logo upload (local disk) and static file serving"
```

---

### Task 4: Public branding lookup by slug

**Files:**
- Create: `apps/api/src/organizations/organizations-public.controller.ts`
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Modify: `apps/api/src/organizations/organizations.service.spec.ts`
- Modify: `apps/api/src/organizations/organizations.module.ts`

**Interfaces:**
- Consumes: `BrandingResponse`, `toBrandingResponse` (Task 2, same file).
- Produces: `OrganizationsService.getPublicBrandingBySlug(slug: string): Promise<BrandingResponse>` (404 if the slug doesn't exist). `GET /organizations/by-slug/:slug/branding` — no guards, no authentication.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/organizations/organizations.service.spec.ts`, add `NotFoundException` to the existing `@nestjs/common` import, and add this `describe` block:
```typescript
  describe('getPublicBrandingBySlug', () => {
    it('returns branding for an existing slug, with no auth/tenant context required', async () => {
      process.env.API_ORIGIN = 'http://localhost:3001';
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', logoPath: 'logos/org-1.png', primaryColor: '#1a73e8', accentColor: null });

      const result = await service.getPublicBrandingBySlug('acme');

      expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { slug: 'acme' } });
      expect(result).toEqual({ logoUrl: 'http://localhost:3001/uploads/logos/org-1.png', primaryColor: '#1a73e8', accentColor: null });
    });

    it('throws NotFoundException for an unknown slug', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.getPublicBrandingBySlug('nope')).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- organizations.service`
Expected: FAIL — `getPublicBrandingBySlug` is not defined yet.

- [ ] **Step 3: Implement the service method**

In `apps/api/src/organizations/organizations.service.ts`, add `NotFoundException` to the `@nestjs/common` import and the method:
```typescript
  async getPublicBrandingBySlug(slug: string): Promise<BrandingResponse> {
    const org = await this.prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      throw new NotFoundException(`Organization "${slug}" not found`);
    }
    return this.toBrandingResponse(org);
  }
```

- [ ] **Step 4: Write the public controller**

`apps/api/src/organizations/organizations-public.controller.ts`:
```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsPublicController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('by-slug/:slug/branding')
  getPublicBranding(@Param('slug') slug: string) {
    return this.organizationsService.getPublicBrandingBySlug(slug);
  }
}
```
Deliberately no `@UseGuards(...)` — matching `CandidateAuthController`'s existing precedent for public routes. Sharing the `@Controller('organizations')` prefix with `OrganizationsController` is safe: NestJS routes by method+path, and `by-slug/:slug/branding` never collides with `branding`/`branding/logo`.

- [ ] **Step 5: Register the new controller**

`apps/api/src/organizations/organizations.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsPublicController } from './organizations-public.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController, OrganizationsPublicController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:api -- organizations.service`
Expected: full file passes (existing 11 tests + 2 new).

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/organizations/organizations-public.controller.ts apps/api/src/organizations/organizations.service.ts apps/api/src/organizations/organizations.service.spec.ts apps/api/src/organizations/organizations.module.ts
git commit -m "feat: add public GET /organizations/by-slug/:slug/branding lookup"
```

---

### Task 5: End-to-end test

**Files:**
- Create: `apps/api/test/organization-branding.e2e-spec.ts`

**Interfaces:**
- Consumes: the full branding HTTP surface (Tasks 1-4), the existing org/user setup flow from prior e2e specs.

- [ ] **Step 1: Write the e2e spec**

`apps/api/test/organization-branding.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';

describe('Organization branding flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let orgSlug: string;
  let orgAdminAccessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-branding-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    orgSlug = `ci-branding-org-${randomUUID()}`;
    const org = await prisma.organization.create({ data: { name: 'CI Branding Org', slug: orgSlug, planId } });
    orgId = org.id;

    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'admin@ci-branding.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
    );

    orgAdminAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: orgSlug, email: 'admin@ci-branding.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('returns null branding for a freshly created org', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/organizations/branding')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    expect(response.body).toEqual({ logoUrl: null, primaryColor: null, accentColor: null });
  });

  it('updates brand colors and reflects them on the next read', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/branding')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ primaryColor: '#1a73e8', accentColor: '#fbbc04' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/organizations/branding')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    expect(response.body).toEqual({ logoUrl: null, primaryColor: '#1a73e8', accentColor: '#fbbc04' });
  });

  it('rejects an invalid hex color', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/branding')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ primaryColor: 'not-a-color' })
      .expect(400);
  });

  it('uploads a logo, serves it via /uploads, and rejects a non-image file', async () => {
    const pngBuffer = Buffer.from('89504e470d0a1a0a', 'hex');

    const uploadResponse = await request(app.getHttpServer())
      .post('/api/v1/organizations/branding/logo')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .attach('file', pngBuffer, { filename: 'logo.png', contentType: 'image/png' })
      .expect(201);

    expect(uploadResponse.body.logoUrl).toContain(`/uploads/logos/${orgId}.png`);

    const servedResponse = await request(app.getHttpServer()).get(`/uploads/logos/${orgId}.png`).expect(200);
    expect(Buffer.compare(servedResponse.body, pngBuffer)).toBe(0);

    await request(app.getHttpServer())
      .post('/api/v1/organizations/branding/logo')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'not-a-logo.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('exposes the same branding publicly by slug, and 404s for an unknown slug', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/organizations/by-slug/${orgSlug}/branding`).expect(200);

    expect(response.body).toEqual({ logoUrl: expect.stringContaining(`/uploads/logos/${orgId}.png`), primaryColor: '#1a73e8', accentColor: '#fbbc04' });

    await request(app.getHttpServer()).get('/api/v1/organizations/by-slug/no-such-org/branding').expect(404);
  });

  it('rejects an unauthenticated request to the staff-only branding routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/organizations/branding').expect(401);
  });
});
```

Note: this spec leaves one uploaded file (`apps/api/uploads/logos/{orgId}.png`) on disk after the run — matching how e2e specs in this project already accept minor DB-level cleanup gaps as a known, logged tradeoff (e.g. Phase 2a's e2e review noted orphaned `audit_logs` rows post-cleanup) rather than adding filesystem cleanup logic that isn't otherwise needed. Do not add `fs.unlink` cleanup to `afterAll` — it's out of scope for this task and not requested by the plan.

- [ ] **Step 2: Run the full e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites pass, including all 6 tests in `organization-branding.e2e-spec.ts`, with no regressions to any other e2e spec file. If other, pre-existing suites show intermittent SQL Server deadlock/timeout failures under full parallel execution, that is the known pre-existing environmental flakiness documented since Phase 2b's Task 10 — re-run once or use `--runInBand` to confirm this spec's own 6 tests are solid, and do not add sleeps/retries to any test file to paper over it.

- [ ] **Step 3: Run the full unit suite one more time**

Run: `npm run test:api` (from repo root)
Expected: all suites still passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/organization-branding.e2e-spec.ts
git commit -m "test: add full organization branding e2e coverage - colors, logo upload, public lookup, auth"
```

---

### Task 6: Frontend — branding settings page and login/dashboard theming

**Files:**
- Modify: `apps/web/lib/api-client.ts`
- Create: `apps/web/app/settings/branding/page.tsx`
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET/PATCH /organizations/branding`, `POST /organizations/branding/logo`, `GET /organizations/by-slug/:slug/branding` (Tasks 2-4, exact routes and response shape `{ logoUrl, primaryColor, accentColor }`).

This task has no automated tests — per this plan's Global Constraints, no frontend test tooling exists in this codebase. Verify manually per Step 6 below.

- [ ] **Step 1: Fix `apiFetch` to support `FormData` bodies**

`apps/web/lib/api-client.ts` — the current implementation always sets `Content-Type: application/json`, which breaks a `multipart/form-data` upload (the browser must set that header itself, including the multipart boundary). Replace the whole file:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

export async function apiFetch(path: string, options: RequestInit = {}, accessToken?: string) {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }
  return response.json();
}
```
(Only the `Content-Type` header logic changes — everything else, including the `credentials: 'include'` and error-handling behavior, is unchanged. Every existing JSON caller of `apiFetch` is unaffected, since `options.body` for those calls is a JSON string, not a `FormData` instance.)

- [ ] **Step 2: Write the branding settings page**

`apps/web/app/settings/branding/page.tsx`:
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';

interface Branding {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

export default function BrandingSettingsPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#1a73e8');
  const [accentColor, setAccentColor] = useState('#fbbc04');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    apiFetch('/organizations/branding', {}, accessToken)
      .then((data: Branding) => {
        setBranding(data);
        if (data.primaryColor) setPrimaryColor(data.primaryColor);
        if (data.accentColor) setAccentColor(data.accentColor);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load branding'));
  }, [accessToken, router]);

  async function handleColorsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const updated = await apiFetch('/organizations/branding', { method: 'PATCH', body: JSON.stringify({ primaryColor, accentColor }) }, accessToken ?? undefined);
      setBranding(updated);
      setMessage('Colors updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update colors');
    }
  }

  async function handleLogoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!logoFile) {
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', logoFile);
      const updated = await apiFetch('/organizations/branding/logo', { method: 'POST', body: formData }, accessToken ?? undefined);
      setBranding(updated);
      setMessage('Logo updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo');
    }
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  return (
    <main>
      <h1>Branding Settings</h1>
      {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" style={{ maxHeight: 80 }} />}
      <form onSubmit={handleColorsSubmit}>
        <label>
          Primary color
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
        </label>
        <label>
          Accent color
          <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
        </label>
        <button type="submit">Save colors</button>
      </form>
      <form onSubmit={handleLogoSubmit}>
        <label>
          Logo (PNG, JPEG, or SVG, max 2MB)
          <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
        </label>
        <button type="submit">Upload logo</button>
      </form>
      {message && <p>{message}</p>}
    </main>
  );
}
```

- [ ] **Step 3: Theme the login page**

`apps/web/app/login/page.tsx` — replace the whole file:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

interface PublicBranding {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

export default function LoginPage() {
  const router = useRouter();
  const { setAccessToken } = useAuth();
  const [organizationSlug, setOrganizationSlug] = useState('demo-org');
  const [email, setEmail] = useState('admin@demo-org.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<PublicBranding | null>(null);

  async function handleSlugBlur() {
    if (!organizationSlug) {
      setBranding(null);
      return;
    }
    try {
      const result = await apiFetch(`/organizations/by-slug/${organizationSlug}/branding`);
      setBranding(result);
    } catch {
      setBranding(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await apiFetch('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug: organizationSlug || undefined, email, password }),
      });
      setAccessToken(result.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <main>
      {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" style={{ maxHeight: 60 }} />}
      <h1 style={branding?.primaryColor ? { color: branding.primaryColor } : undefined}>Staff Login</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Organization slug (leave blank for platform login)
          <input value={organizationSlug} onChange={(e) => setOrganizationSlug(e.target.value)} onBlur={handleSlugBlur} />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" style={branding?.primaryColor ? { backgroundColor: branding.primaryColor } : undefined}>
          Log in
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```
(The `handleSlugBlur` failure path is deliberately silent — an unknown/blank slug just means no branding to apply, never a user-visible error, per this plan's spec.)

- [ ] **Step 4: Theme the dashboard page**

`apps/web/app/dashboard/page.tsx` — add branding fetch/display alongside the existing users list (read the current file first for its exact structure before editing; only the additions below are new, the existing `users` fetch/render logic is unchanged):
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

interface UserRow {
  id: string;
  email: string;
  role: string;
}

interface Branding {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    apiFetch('/users', {}, accessToken)
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users'));
    apiFetch('/organizations/branding', {}, accessToken)
      .then(setBranding)
      .catch(() => setBranding(null));
  }, [accessToken, router]);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  return (
    <main>
      <header>
        {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" style={{ maxHeight: 48 }} />}
        <h1 style={branding?.primaryColor ? { color: branding.primaryColor } : undefined}>Dashboard</h1>
      </header>
      <ul>
        {users?.map((user) => (
          <li key={user.id}>
            {user.email} — {user.role}
          </li>
        ))}
      </ul>
    </main>
  );
}
```
(The dashboard's branding fetch fails silently to `null` — a recruiter who lacks `org:manage_settings` can still view the dashboard normally, just without the branding header, matching this plan's "no client-side role gating" decision.)

- [ ] **Step 5: Add a link to the branding settings page**

In `apps/web/app/dashboard/page.tsx`, add one line inside `<header>`, after the `<h1>`:
```typescript
        <a href="/settings/branding">Branding settings</a>
```

- [ ] **Step 6: Manually verify in a browser**

Run `npm run dev` (from `apps/web/`) and the API's `npm run start:dev` (from `apps/api/`) side by side. Log in as `admin@demo-org.test` / `DevAdmin123!` with organization slug `demo-org` (seeded by `apps/api/prisma/seed.ts`). From the dashboard, click "Branding settings," upload a small PNG/JPEG/SVG logo, set both colors, save. Confirm: the logo and colors appear on the dashboard header immediately after upload; logging out and back in to the login page with the same slug in the field, then blurring the slug field, shows the same logo/colors on the login page before authenticating.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/api-client.ts apps/web/app/settings apps/web/app/login/page.tsx apps/web/app/dashboard/page.tsx
git commit -m "feat: add branding settings page and apply org branding on login/dashboard"
```

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), authenticated colors read/update (Task 2), logo upload + static serving (Task 3), public slug lookup for pre-auth login theming (Task 4), full e2e coverage of all four routes plus the auth/validation edge cases (Task 5), frontend settings page + login/dashboard theming (Task 6) — every in-scope item from the design spec is covered. Deferred items (custom domains/SSL, email verification, cloud storage, automated frontend tests) are explicitly out of scope per the spec and not included here.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `BrandingResponse` (Task 2) is the exact return type of `getBranding`, `updateBrandingColors` (Task 2), `uploadLogo` (Task 3), and `getPublicBrandingBySlug` (Task 4) — one shape, defined once, reused everywhere, never redefined or drifted. `requireOrganizationId`/`toBrandingResponse` (Task 2, private helpers) are reused by Task 3's `uploadLogo` rather than duplicated. `UPLOADS_ROOT` (Task 3) is imported by both the write path (`OrganizationsService`) and the serve path (`AppModule`'s `ServeStaticModule.forRoot`) from the same single source, so they cannot drift apart.
- **Module/controller boundary verified explicitly:** `OrganizationsPublicController` (Task 4) has zero `@UseGuards(...)`, matching `CandidateAuthController`'s existing precedent for public routes in this codebase — confirmed by reading that controller's actual current code during spec-writing, not assumed. Both controllers share the `@Controller('organizations')` prefix with no route collision (`branding`/`branding/logo` vs. `by-slug/:slug/branding`).
- **Cross-task dependency flagged explicitly:** Task 3 adds a second constructor-unrelated change to `OrganizationsController` (a new route, not a constructor signature change, so no existing test needs updating beyond what Task 3 itself adds) and to `OrganizationsService` (new private-helper reuse, not a new constructor parameter — `OrganizationsService`'s constructor stays `(prisma: PrismaService)` throughout this entire plan, unlike several tasks in Phase 2b/2c that changed constructor signatures).
