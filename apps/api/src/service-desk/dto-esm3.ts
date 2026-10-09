import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

// Service Desk 3b-2 batch 3 inputs (M14 §12.2): messaging channels and linked phones, help widgets, presence,
// capacity, shifts, forecast and reports, agent mailboxes, phone drafts. Templates and mailbox settings are JSON checked
// by their services, never trusted as typed here.

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const Text = (min: number, max: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min)(target, key);
  MaxLength(max)(target, key);
};

// ---------------------------------------------------------------------------------------------- SD-2.21 … SD-2.23

export class MsgChannelDto {
  @IsIn(['whatsapp', 'sms', 'teams', 'slack'])
  kind!: 'whatsapp' | 'sms' | 'teams' | 'slack';

  @Text(1, 100)
  name!: string;

  /** A company account (Settings › Notifications); null or absent = YukthiX's shared number or app. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  accountId?: string | null;

  @IsOptional()
  @IsObject()
  templates?: Record<string, { name?: string; language?: string; dltTemplateId?: string | null; body?: string; status?: string }>;
}

export class UpdateMsgChannelDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  name?: string;

  /** Move the line to another desk. */
  @IsOptional()
  @IsUUID()
  deskId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  accountId?: string | null;

  @IsOptional()
  @IsObject()
  templates?: Record<string, { name?: string; language?: string; dltTemplateId?: string | null; body?: string; status?: string }>;

  @IsOptional()
  @IsIn(['active', 'paused'])
  state?: 'active' | 'paused';
}

export class PhoneKindDto {
  @IsIn(['whatsapp', 'sms'])
  kind!: 'whatsapp' | 'sms';
}

/** The local demo's phone (dev transport only). */
export class DevMessageDto {
  @IsIn(['whatsapp', 'sms', 'teams', 'slack'])
  kind!: 'whatsapp' | 'sms' | 'teams' | 'slack';

  @Text(1, 2000)
  text!: string;

  /** Only for "JOIN <code>": the phone it comes from (E.164). */
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'Write the phone number with + and the country code, for example +919812345678.' })
  phone?: string;
}

// ---------------------------------------------------------------------------------------------- SD-2.20

export class WidgetDto {
  @IsUUID()
  portalId!: string;

  @Text(1, 100)
  name!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  allowedOrigins!: string[];

  @IsOptional()
  @IsBoolean()
  allowAnonymous?: boolean;

  @IsOptional()
  @IsBoolean()
  mobile?: boolean;
}

export class UpdateWidgetDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  allowedOrigins?: string[];

  @IsOptional()
  @IsBoolean()
  allowAnonymous?: boolean;

  @IsOptional()
  @IsBoolean()
  mobile?: boolean;

  @IsOptional()
  @IsIn(['active', 'paused'])
  state?: 'active' | 'paused';
}

export class WidgetSessionDto {
  /** The token the company's own server signed for this visitor (HS256 JWT). */
  @IsString()
  @MinLength(20)
  @MaxLength(4000)
  token!: string;

  /** The site the widget runs on, as the iframe saw it (browser only). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  parentOrigin?: string;
}

// ---------------------------------------------------------------------------------------------- SD-2.25 / SD-2.26

export class PresenceDto {
  @IsIn(['available', 'away', 'busy', 'offline'])
  status!: 'available' | 'away' | 'busy' | 'offline';

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  awayUntil?: string | null;
}

class CapacityDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(500)
  ticket?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10)
  chat?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(500)
  messaging?: number | null;
}

export class AgentRoutingDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CapacityDto)
  capacity?: CapacityDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^[a-z]{2,3}$/, { each: true, message: 'Use language codes such as en, hi or ta.' })
  languages?: string[];
}

export class ShiftDto {
  @IsUUID()
  userId!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @Text(0, 200)
  note?: string;
}

export class ShiftImportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  csv!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;
}

export class DayRangeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

export class ForecastQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  perAgent?: number;
}

// ---------------------------------------------------------------------------------------------- SD-2.24

export class AgentMailboxDto {
  @IsIn(['m365', 'gmail', 'dev'])
  kind!: 'm365' | 'gmail' | 'dev';

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------- SD-2.27

export class QueueQueryDto {
  @IsOptional()
  @IsIn(['mine', 'unassigned'])
  scope?: 'mine' | 'unassigned';
}

export class DraftDto {
  @IsUUID()
  ticketId!: string;

  @IsIn(['reply', 'note'])
  kind!: 'reply' | 'note';

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  bodyHtml!: string;

  @IsInt()
  @Min(1)
  baseTicketVersion!: number;

  /** Absent for a new draft; the version last seen for an existing one. */
  @IsOptional()
  @IsInt()
  version?: number;
}

export class SendDraftDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
