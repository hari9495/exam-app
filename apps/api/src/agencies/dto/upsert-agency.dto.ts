import { IsOptional, IsString, IsBoolean, IsEmail, IsArray, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpsertAgencyDto {
  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsOptional() @IsEmail()
  contactEmail?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  jobIds?: string[];
}

// PATCH: same shape but every field (including name) optional. No
// @nestjs/mapped-types dependency in this repo, so this is written out by
// hand rather than PartialType(UpsertAgencyDto) -- ponytail: don't add a dep
// for four repeated fields.
export class UpdateAgencyDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsEmail()
  contactEmail?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  jobIds?: string[];
}
