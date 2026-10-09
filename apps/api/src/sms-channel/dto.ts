import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { CHANNEL_PROVIDER_IDS } from '../sms/providers';
import { TEMPLATE_BODY_MAX, TEMPLATE_STATUSES, TEMPLATE_VARIABLES } from './sms-templates';

const Present = () => ValidateIf((_, value) => value !== undefined);

export class SmsTemplateDto {
  @IsOptional()
  @Matches(/^\d{1,30}$/, { message: 'dltTemplateId is digits only' })
  dltTemplateId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(TEMPLATE_BODY_MAX)
  body!: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(TEMPLATE_VARIABLES, { each: true })
  variables!: string[];

  @IsIn(TEMPLATE_STATUSES)
  status!: string;
}

// An account's settings. `config` is the provider's non-secret settings (URL, body template, response and
// callback mapping, Twilio account SID / from); `secrets` are write-only: authToken / authHeader /
// callbackSecret, and any other name is an http {secret.name}. A secret set to null is removed; one left
// out is kept. Secrets are never returned.
export class CreateSmsAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsIn(CHANNEL_PROVIDER_IDS)
  provider!: string;

  @IsOptional()
  @Matches(/^\+?[A-Za-z0-9]{1,19}$/, { message: 'sender is a DLT header or sender number' })
  sender?: string | null;

  @IsOptional()
  @Matches(/^\d{1,30}$/, { message: 'dltEntityId is digits only' })
  dltEntityId?: string | null;

  @Present()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @Present()
  @IsIn(['active', 'disabled'])
  status?: string;

  @IsObject()
  config!: Record<string, unknown>;

  @Present()
  @IsObject()
  secrets?: Record<string, string | null>;

  @Present()
  @ValidateNested()
  @Type(() => SmsTemplateDto)
  otpTemplate?: SmsTemplateDto;
}

export class UpdateSmsAccountDto {
  @Present()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Matches(/^\+?[A-Za-z0-9]{1,19}$/, { message: 'sender is a DLT header or sender number' })
  sender?: string | null;

  @IsOptional()
  @Matches(/^\d{1,30}$/, { message: 'dltEntityId is digits only' })
  dltEntityId?: string | null;

  @Present()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @Present()
  @IsIn(['active', 'disabled'])
  status?: string;

  @Present()
  @IsObject()
  config?: Record<string, unknown>;

  @Present()
  @IsObject()
  secrets?: Record<string, string | null>;

  @Present()
  @ValidateNested()
  @Type(() => SmsTemplateDto)
  otpTemplate?: SmsTemplateDto;
}

export class UpdateSmsPolicyDto {
  @Present()
  @IsBoolean()
  useSharedAccount?: boolean;

  /** null = no cap. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  monthlyCap?: number | null;
}

export class DeliveriesQueryDto {
  @IsOptional()
  @IsUUID()
  before?: string;
}
