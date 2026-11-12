import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Answer 1048: a message to the System Admins of one or more companies. Plain text only. */
export class CsMessageDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true }) companyIds!: string[];
  @trim() @IsString() @MinLength(3) @MaxLength(120) @Matches(/^[^<>]*$/, { message: 'Write the subject without < or >.' }) subject!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(4000) body!: string;
}

/** Approve or send back a message waiting for a second staff member. */
export class CsDecisionDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}

/** Answer 1065: the notice about a published rule set (the companies come from the rule's country or state). */
export class CsNoticeDto {
  @trim() @IsString() @MinLength(3) @MaxLength(120) @Matches(/^[^<>]*$/, { message: 'Write the subject without < or >.' }) subject!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(4000) body!: string;
}

/** Answer 1082: a company's Customer success owner (null: nobody). */
export class CsOwnerDto {
  @IsOptional() @IsUUID() ownerUserId!: string | null;
}

/** Answer 1083: an alert's owner and status (the version guards against someone else's change). */
export class CsAlertDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsOptional() @IsIn(['open', 'contacted', 'resolved']) status?: 'open' | 'contacted' | 'resolved';
  @IsOptional() @IsUUID() ownerUserId?: string | null;
}

/** Answer 1083: Log outreach. */
export class CsOutreachDto {
  @trim() @IsString() @MinLength(1) @MaxLength(1000) note!: string;
}
