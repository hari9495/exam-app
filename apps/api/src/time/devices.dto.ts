import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { MAX_SYNC_ITEMS } from './device-rules';

// TIM-12 / 13 / 14 inputs. Every text is bounded; secrets (PINs, set-up codes, card tokens) are never echoed back.

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const KINDS = ['in', 'out', 'break_start', 'break_end'] as const;
type Kind = (typeof KINDS)[number];
/** A face photo as base64 (about 2 MB at most). */
const IMAGE_MAX = 2_800_000;

export class RegisterKioskDto {
  @IsOptional()
  @trim()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/, { message: 'A kiosk code is 2 to 30 letters, digits or dashes.' })
  code?: string;

  @trim()
  @IsString()
  @MinLength(1, { message: 'Enter the place on site.' })
  @MaxLength(100)
  place!: string;

  @IsUUID()
  locationId!: string;

  @IsIn(['attendance', 'visitor'])
  mode!: 'attendance' | 'visitor';
}

/** Founder answer 1: "Web clock-in only from an approved computer" for the company, a legal entity or a location. */
export class WebApprovalDto {
  @IsIn(['tenant', 'legal_entity', 'location'])
  scopeType!: 'tenant' | 'legal_entity' | 'location';

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsIn(['on', 'off'])
  value!: 'on' | 'off';
}

export class ReasonDto {
  @trim()
  @IsString()
  @MinLength(3, { message: 'Give a reason (at least 3 characters).' })
  @MaxLength(300)
  reason!: string;
}

export class BindRequestDto {
  /** The app's own install id on this phone (hashed by the server; never stored as sent). */
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  installId!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  model!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(20)
  appVersion?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  oldPhoneLost?: boolean;
}

export class PinDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: 'A PIN is 4 digits.' })
  pin!: string;
}

export class FaceConsentDto {
  /** The person agrees to face sign-in at kiosks (DPDP Act 2023 s.6); the photo goes to the provider only. */
  @IsIn([true], { message: 'Face sign-in needs your consent.' })
  consent!: true;

  @IsString()
  @MinLength(16)
  @MaxLength(IMAGE_MAX)
  image!: string;
}

export class KioskSetupDto {
  @IsString()
  @MinLength(12)
  @MaxLength(20)
  code!: string;
}

export class KioskIdentifyDto {
  @IsIn(['pin', 'qr', 'face'])
  method!: 'pin' | 'qr' | 'face';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  pin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  qr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(IMAGE_MAX)
  image?: string;
}

/** A punch made on a device: its own id for the punch (made when taken, even offline) and when it was taken. */
export class DevicePunchDto {
  @IsIn(KINDS)
  kind!: Kind;

  @IsUUID()
  clientRef!: string;

  @IsDateString({ strict: true })
  punchedAt!: string;
}

export class KioskPunchDto extends DevicePunchDto {
  /** The short-lived pass from identify. */
  @IsString()
  @MaxLength(2000)
  person!: string;
}

/** An offline kiosk punch: who it was is proven at sync time (code and PIN, or the ID-card QR). */
export class KioskSyncItemDto extends DevicePunchDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  pin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  qr?: string;
}

export class KioskSyncDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SYNC_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => KioskSyncItemDto)
  items!: KioskSyncItemDto[];
}

export class PhonePunchItemDto extends DevicePunchDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracyM?: number;

  /** Answer 2477: the Wi-Fi name (SSID) the phone is on, checked against the location's office Wi-Fi names. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  wifi?: string;
}

export class PhonePunchDto extends PhonePunchItemDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  installId!: string;
}

export class PhoneSyncDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  installId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SYNC_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => PhonePunchItemDto)
  items!: PhonePunchItemDto[];
}

/** TIM-13: is this employee code known here (before the PIN)? */
export class KioskCodeDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;
}

/** TIM-13: the person at the kiosk (the short-lived pass from identify). */
export class KioskPersonDto {
  @IsString()
  @MaxLength(2000)
  person!: string;
}

/** TIM-13: leave applied at the kiosk, whole days only. */
export class KioskLeaveDto extends KioskPersonDto {
  @IsUUID()
  leaveTypeId!: string;

  @IsDateString({ strict: true })
  from!: string;

  @IsDateString({ strict: true })
  to!: string;
}

/** TIM-13: a training session HR sets up at a location (people mark themselves present at its kiosk). */
export class TrainingSessionDto {
  @IsUUID()
  locationId!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(80)
  room?: string;

  @IsDateString({ strict: true })
  startsAt!: string;

  @IsDateString({ strict: true })
  endsAt!: string;

  /** Who: none = everyone at the location; otherwise these employees only. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  invitees?: string[];
}

export class TrainingPeopleQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

/** A change to a session: the same fields, plus the version the HR person saw (two people never overwrite each other). */
export class TrainingSessionEditDto extends TrainingSessionDto {
  @IsInt()
  @Min(1)
  version!: number;
}
