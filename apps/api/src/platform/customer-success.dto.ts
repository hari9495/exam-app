import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Answer 1047: the churn alert thresholds (each checked against its range by the service). */
export class CsSettingsDto {
  @IsObject() values!: Record<string, number>;
}

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
