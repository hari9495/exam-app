import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Who a What's new entry is for (answer 943; the four tours' roles, answer 944, plus everyone). */
export const NEWS_AUDIENCES = ['everyone', 'employee', 'manager', 'hr', 'payroll', 'admin'] as const;
export type NewsAudience = (typeof NEWS_AUDIENCES)[number];

/** A What's new entry as YukthiX staff write it in the console. */
export class WhatsNewEntryDto {
  @trim() @IsString() @MinLength(3) @MaxLength(120) @Matches(/^[^<>]*$/, { message: 'Write the title without < or >.' }) title!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(1000) @Matches(/^[^<>]*$/, { message: 'Write the text without < or >.' }) body!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(32, { each: true }) products!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsIn(NEWS_AUDIENCES, { each: true }) audiences!: NewsAudience[];
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Give the publish date as YYYY-MM-DD.' }) publishOn!: string;
}

export class WhatsNewUpdateDto extends WhatsNewEntryDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}

/** Mark entries read: the given ones, or every entry the person sees. */
export class WhatsNewReadDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) ids?: string[];
}
