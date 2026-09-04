import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class PatchEntryDto {
  @IsOptional() @IsUUID() statusId?: string;
  @IsOptional() @IsBoolean() rejected?: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
