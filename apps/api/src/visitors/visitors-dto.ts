import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { PURPOSES } from './visitor-rules';
import { ID_TYPES } from './visitor-guard-rules';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const NO_TAGS = /^[^<>\u0000-\u001f\u007f]*$/;

/** VIS-02: a host invites a visitor (answers 601-610). The host is the person signed in. */
export class InviteVisitorDto {
  @trim() @IsString() @MinLength(1) @MaxLength(200) @Matches(NO_TAGS, { message: 'Use letters, spaces and ordinary punctuation in the name.' }) name!: string;
  @trim() @IsString() @MaxLength(20) mobile!: string;
  // Answer 609: the pass goes by email (WhatsApp / SMS only when the visitor opts in, later).
  @trim() @IsEmail({}, { message: 'Enter the visitor’s email, like name@example.com.' }) @MaxLength(254) email!: string;
  @IsOptional() @trim() @IsString() @MaxLength(200) @Matches(NO_TAGS) company?: string;
  @IsIn(PURPOSES) purpose!: (typeof PURPOSES)[number];
  @IsUUID() locationId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Choose the day.' }) day!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Enter when the visitor arrives.' }) from!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Enter when the visitor leaves.' }) to!: string;
  @IsOptional() @trim() @IsString() @MaxLength(20) @Matches(/^[A-Za-z0-9 -]*$/, { message: 'A vehicle number has letters, digits, spaces or hyphens.' }) vehicle?: string;
  /** Slice 2 (606): the visitor type, for its NDA and safety induction. */
  @IsOptional() @IsUUID() typeId?: string;
  // Answer 614: a visitor under 18 comes with a named adult (no photo and no ID for them).
  @IsOptional() @IsBoolean() minor?: boolean;
  @IsOptional() @trim() @IsString() @MaxLength(200) @Matches(NO_TAGS, { message: 'Use letters, spaces and ordinary punctuation in the name.' }) minorAdult?: string;
}

/** Answer 603: the ID shown, the type and the last 4 characters only (never a full number). */
class IdFields {
  @IsOptional() @IsIn(ID_TYPES, { message: 'Choose the ID type.' }) idType?: (typeof ID_TYPES)[number];
  @IsOptional() @trim() @IsString() @Matches(/^[A-Za-z0-9]{4}$/, { message: 'Enter only the last 4 characters of the ID number.' }) idLast4?: string;
}

/** VIS-01: reception checks a visitor in; the notice is confirmed at the desk when the visitor did not accept it on the link. */
export class CheckInDto extends IdFields {
  @IsOptional() @IsBoolean() noticeAccepted?: boolean;
  /** Slice 2 (606): the visitor read and accepted the type's NDA and induction at the desk (when not on their link). */
  @IsOptional() @IsBoolean() ndaAccepted?: boolean;
  @IsOptional() @IsBoolean() inductionAccepted?: boolean;
  /** 614: reception saw the named adult with a visitor under 18. */
  @IsOptional() @IsBoolean() adultPresent?: boolean;
}

/** VIS-01: a pass code typed or scanned at reception. */
export class FindPassDto {
  @trim() @IsString() @MaxLength(20) code!: string;
  @IsUUID() locationId!: string;
}

/** T9-14: the visitor accepts the notice (the version they read) and may add a vehicle number. */
export class AcceptVisitDto extends IdFields {
  @IsString() @MaxLength(40) noticeVersion!: string;
  /** Slice 2 (606): the NDA and induction versions the visitor read and accepted. */
  @IsOptional() @IsUUID() ndaVersionId?: string;
  @IsOptional() @IsUUID() inductionVersionId?: string;
  @IsOptional() @trim() @IsString() @MaxLength(20) @Matches(/^[A-Za-z0-9 -]*$/, { message: 'A vehicle number has letters, digits, spaces or hyphens.' }) vehicle?: string;
}

class SettingChangeDto {
  @IsString() @MaxLength(100) key!: string;
  @IsString() @MaxLength(1000) value!: string;
}

/** Settings 3.12: company-wide values (a location's own value is set on the company rules page). */
export class SaveVisitorSettingsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => SettingChangeDto) changes!: SettingChangeDto[];
}

/** Answer 605: a watch-list entry (matched by mobile, then by name). */
export class AddWatchDto {
  @trim() @IsString() @MinLength(2) @MaxLength(200) @Matches(NO_TAGS, { message: 'Use letters, spaces and ordinary punctuation in the name.' }) name!: string;
  @IsOptional() @trim() @IsString() @MaxLength(20) mobile?: string;
  @trim() @IsString() @MinLength(5, { message: 'Write the reason (at least 5 characters): only HR and Facility admins see it.' }) @MaxLength(500) @Matches(NO_TAGS, { message: 'Write the reason without < or >.' }) reason!: string;
}

/** Answer 603: the photo of the ID (multipart), with the ID type and its last 4. */
export class IdImageDto {
  @IsIn(ID_TYPES, { message: 'Choose the ID type.' }) idType!: (typeof ID_TYPES)[number];
  @trim() @IsString() @Matches(/^[A-Za-z0-9]{4}$/, { message: 'Enter only the last 4 characters of the ID number.' }) idLast4!: string;
}
