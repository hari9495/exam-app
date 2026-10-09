import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

// Service Desk inputs (M14 §12.1). Every body is whitelisted by the global ValidationPipe (forbidNonWhitelisted), so
// fields the system owns (number, kind, system state, billing class, sensitive, version bumps) can never be sent in.

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const lower = () => Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/^\./, '') : v)) : value));
const Text = (min: number, max: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min)(target, key);
  MaxLength(max)(target, key);
};

export const DESK_KINDS = ['hr', 'it', 'admin', 'facilities', 'finance', 'legal', 'security', 'customer_support', 'custom'] as const;
export const DESK_ROLES = ['agent', 'lead', 'admin', 'collaborator'] as const;
export const SYSTEM_STATES = ['new', 'open', 'pending', 'on_hold', 'solved', 'closed'] as const;
export const TYPE_KINDS = ['incident', 'request', 'question'] as const;
export const METHODS = ['manual', 'round_robin', 'load'] as const;
export const TIERS = ['L1', 'L2', 'L3'] as const;
const TAG = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u;

// ---------------------------------------------------------------------------------------------- desks (SD-1.01)

export class CreateDeskDto {
  @Text(1, 100)
  name!: string;

  /** Short key, also the default number prefix (IT → IT-1001). */
  @Matches(/^[A-Z][A-Z0-9]{1,9}$/, { message: 'The desk key is 2 to 10 capital letters or digits, starting with a letter' })
  key!: string;

  /** D8 / D11: chosen once. customer_support is a Customer support desk; every other kind an Employee help desk. */
  @IsIn(DESK_KINDS)
  kind!: (typeof DESK_KINDS)[number];
}

export class UpdateDeskDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  name?: string;

  @IsOptional()
  @IsIn(['standard', 'restricted'])
  privacy?: 'standard' | 'restricted';

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  calendarId?: string | null;

  @IsOptional()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,11}$/, { message: 'The prefix is capital letters, digits and dashes (up to 12)' })
  numberPrefix?: string;

  @IsOptional()
  @Matches(/^[A-Z0-9-]{0,12}$/, { message: 'The suffix is capital letters, digits and dashes (up to 12)' })
  numberSuffix?: string;

  /** US-G-214: the next number may only go up, so numbers stay unique. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999999999)
  nextNumber?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ArrayUnique()
  @lower()
  @Matches(/^[a-z0-9]{1,10}$/, { each: true, message: 'File types are extensions like pdf or docx' })
  attachmentTypes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(25)
  attachmentMaxMb?: number;

  @IsOptional()
  @IsBoolean()
  vipRaisesPriority?: boolean;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';

  /** YX-SD-11: resolving needs a resolution code and note. */
  @IsOptional()
  @IsBoolean()
  resolutionRequired?: boolean;

  /** YX-SD-10 / US-G-008: days after resolving in which the requester may reopen. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  reopenWindowDays?: number;

  @IsOptional()
  @IsBoolean()
  requesterCanReopen?: boolean;

  /** Days after resolving with no reply before the ticket closes by itself; null = never. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(90)
  autoCloseDays?: number | null;
}

export class AddMemberDto {
  @IsUUID()
  userId!: string;

  @IsIn(DESK_ROLES)
  role!: (typeof DESK_ROLES)[number];

  @IsOptional()
  @IsIn(TIERS)
  tier?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  skills?: string[];
}

export class GroupDto {
  @Text(1, 100)
  name!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(TIERS)
  tier?: string | null;

  @IsIn(METHODS)
  assignmentMethod!: (typeof METHODS)[number];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(500)
  maxOpenPerAgent?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Replaces the group's members; each must hold a seat on the desk. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  memberIds?: string[];
}

export class CategoryDto {
  @Text(1, 100)
  name!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  sensitive?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  defaultGroupId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(4)
  defaultPriority?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  /** SD-2.25: skills an agent needs for tickets in this category (routing tries them first). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^[a-z0-9][a-z0-9 _-]{0,39}$/, { each: true, message: 'A skill is a short lower-case word, for example network.' })
  skills?: string[];
}

export class TicketTypeDto {
  @Text(1, 60)
  name!: string;

  @IsIn(TYPE_KINDS)
  kind!: (typeof TYPE_KINDS)[number];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateTicketTypeDto {
  @IsOptional()
  @Text(1, 60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class StatusDto {
  @Text(1, 60)
  label!: string;

  @IsIn(SYSTEM_STATES)
  systemState!: (typeof SYSTEM_STATES)[number];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  ticketTypeId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

/** A label's system state never changes (reports read it); only the words, order and on / off. */
export class UpdateStatusDto {
  @IsOptional()
  @Text(1, 60)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class MatrixCellDto {
  @IsInt()
  @Min(1)
  @Max(4)
  impact!: number;

  @IsInt()
  @Min(1)
  @Max(4)
  urgency!: number;

  @IsInt()
  @Min(1)
  @Max(4)
  priority!: number;
}

export class MatrixDto {
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => MatrixCellDto)
  cells!: MatrixCellDto[];
}

export class CannedResponseDto {
  @Text(1, 100)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  bodyHtml!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ScenarioActionsDto {
  @IsOptional()
  @IsUUID()
  statusId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  priority?: number;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  /** 'me' (whoever runs it), a user id, or null to unassign. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^(me|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)
  assignee?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(TAG, { each: true })
  addTags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  reply?: string;
}

export class ScenarioDto {
  @Text(1, 100)
  name!: string;

  @ValidateNested()
  @Type(() => ScenarioActionsDto)
  actions!: ScenarioActionsDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class VipDto {
  @IsBoolean()
  vip!: boolean;

  @IsOptional()
  @Text(0, 200)
  note?: string;
}

export class SearchQueryDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class AgentStatusDto {
  @IsIn(['available', 'away', 'busy', 'offline'])
  status!: 'available' | 'away' | 'busy' | 'offline';

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  awayUntil?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1439)
  shiftStartMinute?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(1440)
  shiftEndMinute?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  shiftDays?: number[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(64)
  shiftTimeZone?: string | null;
}

// ---------------------------------------------------------------------------------------------- calendars (SD-1.02)

export class HoursDto {
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class HolidayDto {
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  on!: string;

  @Text(1, 100)
  name!: string;

  @IsOptional()
  @IsBoolean()
  halfDay?: boolean;
}

export class CalendarDto {
  @Text(1, 100)
  name!: string;

  @IsString()
  @MaxLength(64)
  timeZone!: string;

  @IsArray()
  @ArrayMaxSize(70)
  @ValidateNested({ each: true })
  @Type(() => HoursDto)
  hours!: HoursDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => HolidayDto)
  holidays?: HolidayDto[];
}

export class UpdateCalendarDto {
  @IsInt()
  version!: number;

  /** On a half-day holiday this half of the working day stays open (founder decision 8 Oct 2026). */
  @IsOptional()
  @IsIn(['first', 'second'])
  halfDayOpenHalf?: 'first' | 'second';

  @IsOptional()
  @Text(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;
}

/** New weekly hours from a date (today or later); the hours before stay as they were (§5.6). */
export class CalendarHoursDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;

  @IsArray()
  @ArrayMaxSize(70)
  @ValidateNested({ each: true })
  @Type(() => HoursDto)
  hours!: HoursDto[];
}

// ---------------------------------------------------------------------------------------------- tickets (SD-1.03 …)

export class RaiseTicketDto {
  @IsUUID()
  deskId!: string;

  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @Text(1, 200)
  subject!: string;

  /** Plain text from the requester (turned into safe HTML). */
  @Text(1, 20000)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  impact?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  urgency?: number;

  @IsOptional()
  @IsBoolean()
  private?: boolean;

  /** US-G-004: raised for someone else (needs request.raise_on_behalf for that person). */
  @IsOptional()
  @IsUUID()
  requestedForPersonId?: string;

  /** US-B-100: the screen the in-app help drawer was opened on (shown to the agent). */
  @IsOptional()
  @Matches(/^[\w\-./ ]{1,100}$/, { message: 'Screen name is not valid' })
  screen?: string;

  /** SD-2.25: the language the person writes in (ISO 639, e.g. hi, ta); routing prefers agents who speak it. */
  @IsOptional()
  @Matches(/^[a-z]{2,3}$/, { message: 'Use a language code such as en, hi or ta.' })
  language?: string;
}

export class AgentCreateTicketDto {
  @IsUUID()
  deskId!: string;

  @IsUUID()
  requesterPersonId!: string;

  @IsOptional()
  @IsUUID()
  requestedForPersonId?: string;

  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @Text(1, 200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  bodyHtml!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  impact?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  urgency?: number;

  @IsOptional()
  @IsBoolean()
  private?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @Matches(TAG, { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(['agent', 'api'])
  channel?: 'agent' | 'api';
}

export class UpdateTicketDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 200)
  subject?: string;

  @IsOptional()
  @IsUUID()
  statusId?: string;

  /** YX-SD-03: setting the priority by hand needs a reason. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  priority?: number;

  @ValidateIf((o) => o.priority !== undefined)
  @Text(3, 300)
  priorityReason?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  impact?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  urgency?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @Matches(TAG, { each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  private?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Text(1, 40)
  resolutionCode?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Text(1, 2000)
  resolutionNote?: string | null;
}

export class AssignDto {
  /** A user with an agent seat on the desk, or null to unassign. */
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  userId!: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  groupId?: string | null;
}

export class ConvertDto {
  @IsUUID()
  typeId!: string;

  @IsOptional()
  @Text(3, 300)
  reason?: string;
}

export class MessageDto {
  @IsIn(['reply', 'note'])
  kind!: 'reply' | 'note';

  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  bodyHtml!: string;

  /** Colleagues on this desk to notify (notes only). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  mentions?: string[];

  /** Files already uploaded to this ticket by you, sent with this message. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

  /** Optional status to set in the same step ("Send and wait on requester"). */
  @IsOptional()
  @IsUUID()
  statusId?: string;
}

export class EditNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  bodyHtml!: string;
}

export class RequesterReplyDto {
  @Text(1, 20000)
  text!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}

export class WatcherDto {
  @IsOptional()
  @IsUUID()
  personId?: string;

  /** Requesters add a colleague by email. */
  @IsOptional()
  @trim()
  @IsEmail()
  @MaxLength(320)
  email?: string;
}

export class CollaboratorDto {
  @IsUUID()
  userId!: string;
}

export class TimeEntryDto {
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;

  @IsOptional()
  @Text(0, 500)
  note?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workedOn?: string;
}

export class VersionDto {
  @IsInt()
  version!: number;
}

export class PresenceDto {
  @IsBoolean()
  typing!: boolean;
}

// ---------------------------------------------------------------------------------------------- lists (SD-1.07)

export const SORTS = ['updated_desc', 'created_desc', 'created_asc', 'priority_asc', 'number_desc'] as const;
const csv = () => Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value));

/** The filters a list, board, saved view and CSV export share. */
export class TicketFiltersDto {
  @IsOptional()
  @csv()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  deskIds?: string[];

  @IsOptional()
  @csv()
  @IsArray()
  @IsIn(SYSTEM_STATES, { each: true })
  states?: string[];

  @IsOptional()
  @csv()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  statusIds?: string[];

  @IsOptional()
  @csv()
  @IsArray()
  @ArrayMaxSize(4)
  @Transform(({ value }) => (Array.isArray(value) ? value.map(Number) : value))
  @IsInt({ each: true })
  priorities?: number[];

  /** me, none, or a user id. */
  @IsOptional()
  @Matches(/^(me|none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)
  assignee?: string;

  @IsOptional()
  @csv()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupIds?: string[];

  @IsOptional()
  @csv()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  categoryIds?: string[];

  @IsOptional()
  @csv()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(TAG, { each: true })
  tags?: string[];

  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  vip?: boolean;

  /** US-G-009: snoozed tickets leave my list until they wake; 'show' keeps them, 'only' lists just them. */
  @IsOptional()
  @IsIn(['show', 'only'])
  snoozed?: 'show' | 'only';

  /** Breaching soon: a response target missed or due within 4 hours. */
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  breaching?: boolean;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class TicketListQueryDto extends TicketFiltersDto {
  @IsOptional()
  @IsUUID()
  viewId?: string;

  @IsOptional()
  @IsIn(SORTS)
  sort?: (typeof SORTS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Opaque cursor from the previous page. */
  @IsOptional()
  @Matches(/^[0-9]{1,6}$/)
  cursor?: string;
}

export class ViewDto {
  @Text(1, 60)
  name!: string;

  @IsOptional()
  @IsUUID()
  deskId?: string;

  /** Shared with everyone on the desk (team leads). */
  @IsOptional()
  @IsBoolean()
  shared?: boolean;

  @ValidateNested()
  @Type(() => TicketFiltersDto)
  filters!: TicketFiltersDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(['number', 'subject', 'requester', 'desk', 'type', 'category', 'priority', 'status', 'assignee', 'group', 'tags', 'updated', 'created'], { each: true })
  columns?: string[];

  @IsOptional()
  @IsIn(SORTS)
  sort?: (typeof SORTS)[number];

  @IsOptional()
  @IsIn(['list', 'board'])
  layout?: 'list' | 'board';
}

export class BulkActionDto {
  @IsOptional()
  @IsUUID()
  statusId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  priority?: number;

  @IsOptional()
  @Text(3, 300)
  priorityReason?: string;

  /** 'me', a user id, or null to unassign. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^(me|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)
  assignee?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(TAG, { each: true })
  addTags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(TAG, { each: true })
  removeTags?: string[];

  @IsOptional()
  @IsUUID()
  scenarioId?: string;
}

export class BulkDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ticketIds!: string[];

  @ValidateNested()
  @Type(() => BulkActionDto)
  action!: BulkActionDto;
}

// ------------------------------------------------------------------------------------------ batch 2 (SD-1.09 to SD-1.17)

export const LINK_KINDS = ['related', 'blocks', 'caused_by', 'tracked_by'] as const;
export const TASK_STATES = ['open', 'in_progress', 'done', 'cancelled'] as const;

export class LinkDto {
  @IsUUID()
  ticketId!: string;

  @IsIn(LINK_KINDS)
  kind!: (typeof LINK_KINDS)[number];
}

export class MergeDto {
  @IsUUID()
  intoTicketId!: string;

  @IsInt()
  version!: number;
}

export class SplitDto {
  /** A reply the requester already saw (theirs or an agent reply); internal notes are never split out. */
  @IsOptional()
  @IsUUID()
  messageId?: string;

  @Text(1, 200)
  subject!: string;

  @IsOptional()
  @Text(1, 20000)
  text?: string;
}

export class ParentDto {
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parentId!: string | null;
}

export class SideConversationDto {
  @IsIn(['note_thread', 'child_ticket'])
  channel!: 'note_thread' | 'child_ticket';

  @Text(1, 200)
  subject!: string;

  @IsOptional()
  @Text(1, 200)
  withWhom?: string;

  @IsString()
  @MaxLength(200000)
  bodyHtml!: string;

  /** child_ticket: the desk of the other team, and optionally its type and category. */
  @IsOptional()
  @IsUUID()
  deskId?: string;

  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class SideMessageDto {
  @IsString()
  @MaxLength(200000)
  bodyHtml!: string;
}

export class TaskDto {
  @Text(1, 200)
  title!: string;

  @IsOptional()
  @Text(0, 2000)
  note?: string;

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  checklist?: boolean;
}

export class StandaloneTaskDto extends TaskDto {
  @IsUUID()
  deskId!: string;
}

export class UpdateTaskDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 200)
  title?: string;

  @IsOptional()
  @Text(0, 2000)
  note?: string;

  @IsOptional()
  @IsIn(TASK_STATES)
  state?: (typeof TASK_STATES)[number];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  assigneeUserId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  dueAt?: string | null;
}

export class TemplateDefaultsDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  priority?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

export class TemplateDto {
  @Text(1, 100)
  name!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  ticketTypeId?: string | null;

  @ValidateNested()
  @Type(() => TemplateDefaultsDto)
  defaults!: TemplateDefaultsDto;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  checklist!: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ResolutionCodeDto {
  @Matches(/^[a-z0-9][a-z0-9_]{0,39}$/, { message: 'A code is lower-case letters, digits and _ (up to 40)' })
  code!: string;

  @Text(1, 100)
  label!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ResolveDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  resolutionCode?: string;

  @IsOptional()
  @Text(0, 2000)
  resolutionNote?: string;

  /** US-G-220: the message every ticket linked to this tracker gets when it is solved. */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  linkedReplyHtml?: string;
}

export class EscalateDto {
  @IsIn(TIERS)
  tier!: (typeof TIERS)[number];

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @Text(3, 500)
  reason!: string;
}

export class TrackerDto {
  @IsBoolean()
  tracker!: boolean;
}

export class ReminderDto {
  @IsDateString()
  remindAt!: string;

  @IsOptional()
  @Text(0, 300)
  note?: string;

  @IsOptional()
  @IsUUID()
  ticketId?: string;
}

export class SnoozeDto {
  @IsDateString()
  until!: string;
}

export class RangeQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class MonthQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Month as YYYY-MM' })
  month!: string;
}

export class ReasonDto {
  @Text(3, 500)
  reason!: string;
}

export class LinkPersonDto {
  @IsUUID()
  intoPersonId!: string;
}

export class ReadsQueryDto {
  @IsUUID()
  ticketId!: string;
}

// ---- SLA (SD-1.14 to SD-1.17) ----

export const SLA_METRIC_LIST = ['assign', 'first_response', 'next_response', 'resolution', 'group', 'task'] as const;
export const MILESTONE_ACTION_LIST = ['notify_assignee', 'notify_group_leads', 'notify_desk_leads', 'raise_priority', 'move_to_group'] as const;

export class MilestoneActionDto {
  @IsIn(MILESTONE_ACTION_LIST)
  type!: (typeof MILESTONE_ACTION_LIST)[number];

  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class MilestoneDto {
  @IsInt()
  @Min(1)
  @Max(1000)
  percent!: number;

  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => MilestoneActionDto)
  actions!: MilestoneActionDto[];
}

export class SlaTargetDto {
  @IsIn(SLA_METRIC_LIST)
  metric!: (typeof SLA_METRIC_LIST)[number];

  /** Minutes for P1, P2, P3, P4 (null = no target for that priority). */
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @Transform(({ value }) => value)
  minutes!: (number | null)[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];
}

export class ScopeRuleDto {
  @IsIn(['priority', 'category', 'type', 'kind', 'channel', 'group', 'vip', 'tag', 'plan', 'product', 'account'])
  field!: 'priority' | 'category' | 'type' | 'kind' | 'channel' | 'group' | 'vip' | 'tag' | 'plan' | 'product' | 'account';

  @IsIn(['in', 'not_in'])
  op!: 'in' | 'not_in';

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  values!: string[];
}

export class ScopeDto {
  @IsIn(['all', 'any'])
  match!: 'all' | 'any';

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ScopeRuleDto)
  rules!: ScopeRuleDto[];
}

export class SlaVersionDto {
  /** From when the new version applies (now or later); open tickets keep the version they started with. */
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ValidateNested()
  @Type(() => ScopeDto)
  scope!: ScopeDto;

  @IsIn(['desk', 'calendar', 'requester_location'])
  calendarSource!: 'desk' | 'calendar' | 'requester_location';

  @IsOptional()
  @IsUUID()
  calendarId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SlaTargetDto)
  targets!: SlaTargetDto[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(['new', 'open', 'pending', 'on_hold'], { each: true })
  pauseStates?: string[];

  @IsOptional()
  @IsIn(['keep', 'retroactive'])
  recount?: 'keep' | 'retroactive';
}

export class SlaPolicyDto extends SlaVersionDto {
  @Text(1, 100)
  name!: string;

  @IsIn(['sla', 'ola'])
  kind!: 'sla' | 'ola';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

export class UpdateSlaPolicyDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ComplianceTargetDto {
  @IsIn(SLA_METRIC_LIST)
  metric!: (typeof SLA_METRIC_LIST)[number];

  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(4)
  priority!: number | null;

  @IsInt()
  @Min(1)
  @Max(100)
  targetPercent!: number;
}

export class ComplianceTargetsDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ComplianceTargetDto)
  targets!: ComplianceTargetDto[];
}
