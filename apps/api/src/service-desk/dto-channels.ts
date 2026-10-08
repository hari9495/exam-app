import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Service Desk batch 3 inputs (M14 §12.1): mailboxes and rules, sending domains, portals and the external requester,
// banners, customers. Whitelisted by the global ValidationPipe (forbidNonWhitelisted).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const lowerEmail = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
const lowerList = () => Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/^@/, '') : v)) : value));
const Text = (min: number, max: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min)(target, key);
  MaxLength(max)(target, key);
};
const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const Domains = () => (target: object, key: string) => {
  lowerList()(target, key);
  IsArray()(target, key);
  ArrayMaxSize(20)(target, key);
  ArrayUnique()(target, key);
  Matches(DOMAIN, { each: true, message: 'Each domain looks like example.com' })(target, key);
};

export const MAILBOX_KINDS = ['hosted', 'forward', 'm365_oauth', 'gmail_oauth', 'imap'] as const;
export const RULE_FIELDS = ['from', 'domain', 'to', 'subject', 'body', 'header'] as const;
export const RULE_OPS = ['contains', 'equals', 'starts_with', 'ends_with'] as const;
export const RULE_ACTIONS = ['route', 'tag', 'priority', 'reject', 'spam', 'parse_field'] as const;

// ---------------------------------------------------------------------------------------------- email (SD-1.18…1.20)

export class SendingDomainDto {
  @lowerEmail()
  @Matches(DOMAIN, { message: 'Enter a domain like acme.com' })
  domain!: string;
}

export class MailboxDto {
  @lowerEmail()
  @IsEmail()
  @Matches(/^[^+]+$/, { message: 'Use the address without a +tag' })
  @MaxLength(254)
  address!: string;

  @IsIn(MAILBOX_KINDS)
  kind!: (typeof MAILBOX_KINDS)[number];

  @IsOptional()
  @Text(1, 100)
  displayName?: string;

  @IsOptional()
  @IsUUID()
  sendingDomainId?: string | null;

  @IsOptional()
  @IsUUID()
  defaultCategoryId?: string | null;

  @IsOptional()
  @IsUUID()
  defaultTypeId?: string | null;

  @IsOptional()
  @IsUUID()
  defaultTemplateId?: string | null;

  @IsOptional()
  @IsBoolean()
  autoAck?: boolean;

  @IsOptional()
  @Text(0, 2000)
  ackText?: string;

  @IsOptional()
  @Domains()
  trustedForwarders?: string[];

  /** IMAP host / port / user / password, or the company's own Microsoft 365 or Google app (kept encrypted). */
  @IsOptional()
  @IsObject()
  config?: Record<string, string | number | boolean>;
}

export class UpdateMailboxDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  displayName?: string;

  @IsOptional()
  @IsUUID()
  sendingDomainId?: string | null;

  @IsOptional()
  @IsUUID()
  defaultCategoryId?: string | null;

  @IsOptional()
  @IsUUID()
  defaultTypeId?: string | null;

  @IsOptional()
  @IsUUID()
  defaultTemplateId?: string | null;

  @IsOptional()
  @IsBoolean()
  autoAck?: boolean;

  @IsOptional()
  @Text(0, 2000)
  ackText?: string;

  @IsOptional()
  @Domains()
  trustedForwarders?: string[];

  @IsOptional()
  @IsIn(['active', 'paused'])
  status?: 'active' | 'paused';

  @IsOptional()
  @IsObject()
  config?: Record<string, string | number | boolean>;
}

export class EmailRuleDto {
  @Text(1, 100)
  name!: string;

  @IsIn(RULE_FIELDS)
  field!: (typeof RULE_FIELDS)[number];

  @ValidateIf((o: EmailRuleDto) => o.field === 'header')
  @Matches(/^[A-Za-z0-9-]{1,100}$/, { message: 'A header name like X-Priority' })
  headerName?: string;

  @IsIn(RULE_OPS)
  op!: (typeof RULE_OPS)[number];

  @Text(1, 200)
  value!: string;

  @IsIn(RULE_ACTIONS)
  action!: (typeof RULE_ACTIONS)[number];

  /** route: { categoryId } · tag: { tag } · priority: { priority } · parse_field: { key, field }. */
  @IsOptional()
  @IsObject()
  actionValue?: Record<string, string | number>;

  @IsOptional()
  @IsBoolean()
  stop?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

export class InboundQueryDto {
  @IsOptional()
  @IsIn(['held', 'spam', 'rejected', 'loop', 'bounce', 'accepted', 'all'])
  verdict?: string;
}

// ---------------------------------------------------------------------------------------------- portals (SD-1.21, 1.22)

export class PortalDto {
  @Matches(/^[a-z0-9][a-z0-9-]{1,39}$/, { message: 'The web address part is 2 to 40 small letters, digits or dashes' })
  slug!: string;

  @Text(1, 100)
  name!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  deskIds!: string[];

  @IsIn(['closed', 'allowed_domains', 'open'])
  signUp!: 'closed' | 'allowed_domains' | 'open';

  @IsOptional()
  @Domains()
  allowedDomains?: string[];

  @IsOptional()
  @IsBoolean()
  openRequests?: boolean;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'A colour like #2563eb' })
  accentColour?: string;

  @IsOptional()
  @Text(0, 100)
  loginTitle?: string;

  @IsOptional()
  @Text(0, 500)
  loginText?: string;

  @IsOptional()
  @IsBoolean()
  readingAids?: boolean;

  @IsOptional()
  @IsIn(['active', 'off'])
  status?: 'active' | 'off';

  @IsOptional()
  @IsInt()
  version?: number;
}

export class PortalEmailDto {
  @lowerEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** Cloudflare Turnstile token (assertHuman). */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  challengeToken?: string;
}

export class PortalVerifyDto {
  @lowerEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Matches(/^\d{6}$/, { message: 'The code is 6 digits' })
  code!: string;
}

export class PortalRaiseDto {
  @IsUUID()
  deskId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @Text(1, 200)
  subject!: string;

  @Text(1, 20000)
  description!: string;
}

export class OpenRequestDto extends PortalRaiseDto {
  @lowerEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Text(1, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  challengeToken?: string;
}

export class TokenDto {
  @Matches(/^[A-Za-z0-9_-]{20,100}$/, { message: 'This link is not valid' })
  token!: string;
}

export class PortalReplyDto {
  @Text(1, 20000)
  text!: string;
}

// ---------------------------------------------------------------------------------------------- banners (SD-1.23)

export class BannerDto {
  @Text(1, 300)
  text!: string;

  @IsIn(['info', 'warning', 'outage'])
  severity!: 'info' | 'warning' | 'outage';

  @IsIn(['everyone', 'employees', 'customers'])
  audience!: 'everyone' | 'employees' | 'customers';

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  /** The open incident a "me too" links the person to; the banner ends when it is solved. */
  @IsOptional()
  @IsUUID()
  ticketId?: string | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}

// ---------------------------------------------------------------------------------------------- customers (SD-1.28)

export class AccountDto {
  @Text(1, 120)
  name!: string;

  @IsOptional()
  @Domains()
  emailDomains?: string[];

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class UpdateAccountDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 120)
  name?: string;

  @IsOptional()
  @Domains()
  emailDomains?: string[];

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class ContactDto {
  @Text(1, 100)
  name!: string;

  @lowerEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsIn(['primary', 'billing', 'technical', 'member'])
  role?: 'primary' | 'billing' | 'technical' | 'member';

  @IsOptional()
  @IsBoolean()
  seesAccountTickets?: boolean;
}

export class UpdateContactDto {
  @IsOptional()
  @IsIn(['primary', 'billing', 'technical', 'member'])
  role?: 'primary' | 'billing' | 'technical' | 'member';

  @IsOptional()
  @IsBoolean()
  seesAccountTickets?: boolean;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class EntitlementDto {
  @Text(1, 60)
  plan!: string;

  @Matches(/^[a-z][a-z0-9_-]{0,39}$/, { message: 'The tier is a short word like gold or premium' })
  tier!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  ticketsAllowed?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  hoursAllowed?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(['email', 'portal', 'chat', 'phone', 'whatsapp'], { each: true })
  channels?: string[];

  @IsOptional()
  @IsIn(['flag', 'hold'])
  whenUsedUp?: 'flag' | 'hold';

  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @IsDateString()
  validTo?: string | null;
}

export class EndEntitlementDto {
  @IsDateString()
  validTo!: string;
}

export class ProductDto {
  @Text(1, 100)
  name!: string;

  @IsOptional()
  @IsUUID()
  deskId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AccountScopeDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  accountIds!: string[];
}

export class CustomerSearchDto {
  @IsOptional()
  @Type(() => String)
  @Text(0, 100)
  search?: string;
}
