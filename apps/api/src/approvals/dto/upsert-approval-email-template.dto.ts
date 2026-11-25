import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertApprovalEmailTemplateDto {
  // Answer 2429 (Settings 5.4): bounded like the interview emails.
  @IsString() @MinLength(1) @MaxLength(300) subject!: string;
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
