import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateSubmissionDto {
  @IsUUID() jobId!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsString() resumeBase64!: string;
  // Staffing slice 2 (HIR-21): a job shared with a rate cap needs the vendor's quote (rupees per unit), and the vendor's
  // confirmation of right to represent and the candidate's consent.
  @IsOptional() @IsString() @Matches(/^\d{1,9}(\.\d{1,2})?$/) quotedRate?: string;
  @IsOptional() @IsBoolean() rightToRepresent?: boolean;
  @IsOptional() @IsBoolean() consent?: boolean;
}
