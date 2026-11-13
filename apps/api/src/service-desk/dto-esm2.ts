import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, Equals, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

// Service Desk 3b-2 batch 2 inputs (M14 §12.2): moves and shares, branches, clone, lifecycles, documents, journeys,
// recurring records and sequences, interactions, live chat. Lifecycle drafts, forms, prompts and cards are JSON checked
// by their services (parseLifecycle, parseForm, parsePrompts, parseCard), never trusted as typed here.

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const Text = (min: number, max: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min)(target, key);
  MaxLength(max)(target, key);
};

export class DeskIdQueryDto {
  @IsUUID()
  deskId!: string;
}

export class VersionDto {
  @IsInt()
  version!: number;
}

// ---------------------------------------------------------------------------------------------- SD-2.10

export class MoveTicketDto {
  @IsUUID()
  deskId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @Text(3, 500)
  reason!: string;
}

export class ShareTicketDto {
  @IsUUID()
  deskId!: string;

  @IsIn(['view', 'comment'])
  level!: 'view' | 'comment';
}

export class ForwardToDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  deskIds!: string[];
}

export class CloneDeskDto {
  @Text(1, 100)
  name!: string;

  @Matches(/^[A-Z][A-Z0-9]{1,9}$/, { message: 'The key is 2 to 10 capital letters or digits, starting with a letter' })
  key!: string;
}

export class BranchDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  calendarId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  adminUserId?: string | null;
}

export class UpdateBranchDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  calendarId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  adminUserId?: string | null;
}

// ---------------------------------------------------------------------------------------------- SD-2.11

export class LifecycleDto {
  @IsUUID()
  deskId!: string;

  @IsUUID()
  ticketTypeId!: string;

  @Text(1, 100)
  name!: string;

  @IsOptional()
  @IsObject()
  draft?: Record<string, unknown>;
}

export class UpdateLifecycleDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  name?: string;

  @IsOptional()
  @IsObject()
  draft?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------- SD-2.07

export class DocTemplateDto {
  @IsUUID()
  deskId!: string;

  @Text(1, 100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  needsSignature?: boolean;
}

export class UpdateDocTemplateDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsBoolean()
  needsSignature?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class MakeDocumentDto {
  @IsUUID()
  templateId!: string;

  @IsOptional()
  @IsUUID()
  signerPersonId?: string;
}

export class SignDocumentDto {
  @IsIn(['sign', 'decline'])
  decision!: 'sign' | 'decline';

  @Text(0, 150)
  typedName!: string;

  @IsOptional()
  @Text(0, 500)
  reason?: string;

  /** The person confirms they read it and sign it (sign only). */
  @ValidateIf((o: SignDocumentDto) => o.decision === 'sign')
  @Equals(true, { message: 'Confirm that you have read the document and sign it.' })
  agree?: boolean;

  /** Founder decision 9 Oct 2026 (P05): the one-time code sent for this signature (sign only). */
  @ValidateIf((o: SignDocumentDto) => o.decision === 'sign')
  @Matches(/^\d{6}$/, { message: 'Type the 6-digit code we sent you.' })
  code?: string;
}

// ---------------------------------------------------------------------------------------------- SD-2.08

export class JourneyDto {
  @IsIn(['join', 'exit'])
  kind!: 'join' | 'exit';

  @Text(1, 100)
  name!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  itemIds!: string[];

  @IsOptional()
  @IsObject()
  audience?: Record<string, unknown> | null;
}

export class UpdateJourneyDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  itemIds?: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  audience?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class StartJourneyDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString({ strict: true })
  date!: string;
}

// ---------------------------------------------------------------------------------------------- SD-2.13

export class RecurringTemplateDto {
  @Text(1, 200)
  subject!: string;

  /** Helpdesk plan item 4: maintenance of one piece of equipment (its tickets name it, its building and area). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  equipmentId?: string | null;

  @IsString()
  @MaxLength(20000)
  bodyHtml!: string;

  @IsOptional()
  @IsUUID()
  typeId?: string | null;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  priority?: number | null;

  /** ITSM answer 1952: raise this pre-approved standard change each time (checked in the service). */
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurringStandardDto)
  standard?: RecurringStandardDto | null;
}

export class RecurringStandardDto {
  @IsUUID()
  templateId!: string;

  @IsInt()
  @Min(0)
  @Max(168)
  startAfterHours!: number;

  @IsInt()
  @Min(15)
  @Max(720)
  minutes!: number;
}

export class RecurringDto {
  @IsUUID()
  deskId!: string;

  @Text(1, 100)
  name!: string;

  @Text(1, 300)
  rrule!: string;

  @Text(1, 64)
  timeZone!: string;

  @IsDateString()
  startsAt!: string;

  @ValidateNested()
  @Type(() => RecurringTemplateDto)
  template!: RecurringTemplateDto;
}

export class UpdateRecurringDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @IsIn(['active', 'paused', 'ended'])
  state?: 'active' | 'paused' | 'ended';

  @IsOptional()
  @Text(1, 300)
  rrule?: string;

  @IsOptional()
  @Text(1, 64)
  timeZone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurringTemplateDto)
  template?: RecurringTemplateDto;
}

export class SequenceDto {
  @IsUUID()
  deskId!: string;

  @Text(1, 100)
  name!: string;

  @IsArray()
  @ArrayMaxSize(10)
  steps!: unknown[];
}

export class UpdateSequenceDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  steps?: unknown[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class StartSequenceDto {
  @IsUUID()
  sequenceId!: string;
}

// ---------------------------------------------------------------------------------------------- SD-2.17

export class InteractionDto {
  @IsUUID()
  deskId!: string;

  @IsIn(['call', 'walk_up'])
  channel!: 'call' | 'walk_up';

  @IsOptional()
  @IsUUID()
  personId?: string;

  @Text(1, 200)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsIn(['open', 'resolved'])
  outcome?: 'open' | 'resolved';

  @IsOptional()
  @Text(1, 100)
  callRef?: string;
}

export class UpdateInteractionDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsIn(['resolved', 'abandoned'])
  outcome?: 'resolved' | 'abandoned';
}

export class PromoteDto {
  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

// ---------------------------------------------------------------------------------------------- SD-2.18 / SD-2.19

export class ChatQueueDto {
  @IsUUID()
  deskId!: string;

  @Text(1, 100)
  name!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPerAgent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  waitMinutes?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Text(0, 300)
  welcome?: string | null;

  @IsOptional()
  @IsObject()
  preChat?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  prompts?: unknown[];
}

export class UpdateChatQueueDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPerAgent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  waitMinutes?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Text(0, 300)
  welcome?: string | null;

  @IsOptional()
  @IsObject()
  preChat?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  prompts?: unknown[];
}

export class StartChatDto {
  @IsUUID()
  queueId!: string;

  @IsOptional()
  @Text(0, 200)
  subject?: string;

  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

export class TransferChatDto {
  @IsOptional()
  @IsUUID()
  queueId?: string;

  @IsOptional()
  @IsUUID()
  agentUserId?: string;
}

export class EndChatDto {
  @IsBoolean()
  resolved!: boolean;
}

export class RateChatDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @Text(0, 500)
  comment?: string;

  /** Answer 1682: one of the desk's preset reasons (checked in the service). */
  @IsOptional()
  @Text(1, 40)
  reason?: string;
}

export class PromptQueryDto {
  @Text(1, 200)
  @Matches(/^\/[A-Za-z0-9/_-]*$/, { message: 'A page path starts with /' })
  path!: string;
}

// ---------------------------------------------------------------------------------------------- SD-2.09 (9 Oct 2026)

export class StarterPackDto {
  /**
   * Founder decision 9 Oct 2026: on an existing HR desk the pack makes the desk restricted only after the admin saw what
   * changes and said yes (true); false adds the pack and keeps the desk as it is.
   */
  @IsOptional()
  @IsBoolean()
  restrict?: boolean;
}

// ---------------------------------------------------------------------------------------------- Helpdesk plan item 4

export class FacilityAreaDto {
  @IsUUID()
  locationId!: string;

  @Text(1, 100)
  name!: string;

  @IsOptional()
  @IsIn(['active', 'retired'])
  status?: 'active' | 'retired';

  @IsOptional()
  @IsInt()
  version?: number;
}

export class EquipmentDto {
  @IsUUID()
  deskId!: string;

  @IsUUID()
  ownerGroupId!: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  areaId?: string | null;

  @Text(1, 100)
  name!: string;

  @Matches(/^[A-Za-z0-9][A-Za-z0-9 _./-]{0,39}$/, { message: 'A tag is letters, digits, spaces and - _ . / (up to 40).' })
  tag!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Text(0, 60)
  category?: string | null;

  @IsOptional()
  @IsIn(['active', 'retired'])
  status?: 'active' | 'retired';

  @IsOptional()
  @IsInt()
  version?: number;
}

/** The building, area and equipment a facilities ticket is about; null clears one. */
export class TicketPlaceDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  locationId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  areaId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  equipmentId?: string | null;
}

export class PlacePickDto {
  @IsIn(['buildings', 'areas', 'equipment'])
  kind!: 'buildings' | 'areas' | 'equipment';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** Equipment of one facilities desk only (its maintenance schedules). */
  @IsOptional()
  @IsUUID()
  deskId?: string;
}
