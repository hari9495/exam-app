import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsFQDN,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IDP_TYPES, JIT_ROLES } from '../identity-providers';

// Present = validated; null clears the field where the service allows it.
const Present = () => ValidateIf((_, value) => value !== undefined);
const lowerAll = ({ value }: { value: unknown }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v)) : value);

// Fields shared by create and update. Type-specific completeness (and the floor: JIT never grants
// a sensitive role, Entra pinned to one directory) is checked in IdentityProvidersService and,
// again, by the table's CHECK constraints.
export class UpdateIdentityProviderDto {
  @Present()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @Present()
  @IsIn(['active', 'disabled'])
  status?: string;

  @Present()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @Transform(lowerAll)
  @IsFQDN({ require_tld: true, allow_underscores: false }, { each: true })
  domains?: string[];

  @Present()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  samlEntityId?: string;

  @Present()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false })
  @MaxLength(1000)
  samlSsoUrl?: string;

  @Present()
  @IsString()
  @MaxLength(20000)
  samlCertificate?: string;

  // oidc_generic only: the issuer URL (discovery at <issuer>/.well-known/openid-configuration).
  @Present()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  @MaxLength(1000)
  oidcIssuer?: string;

  @Present()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  oidcClientId?: string;

  // Write-only: stored encrypted, never returned.
  @Present()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  oidcClientSecret?: string;

  // oidc_entra only: the directory (tenant) id. Never common / organizations / consumers.
  @Present()
  @IsUUID()
  entraTenantId?: string;

  @Present()
  @IsBoolean()
  jitEnabled?: boolean;

  @IsOptional()
  @IsIn(JIT_ROLES)
  jitRole?: string | null;

  @Present()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  mfaClaimValues?: string[];
}

export class CreateIdentityProviderDto extends UpdateIdentityProviderDto {
  @IsIn(IDP_TYPES)
  type!: string;
}

// Sign-in: pick the provider by id (a "Sign in with ..." button) or by the email's domain.
export class SsoStartDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  organizationSlug!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;
}
