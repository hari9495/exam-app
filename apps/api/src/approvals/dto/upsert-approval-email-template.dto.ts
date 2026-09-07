import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpsertApprovalEmailTemplateDto {
  @IsString() subject!: string;
  @IsString() body!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
