import { IsBase64, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// A staff member self-applying to an internal opening. Identity (name/email) comes from the session
// User, not the client -- so the DTO carries only the chosen job, the person's own words and an optional résumé.
export class ApplyInternalDto {
  @IsUUID('4') jobId!: string;
  // HIR-13: "Why are you interested?" (required in the designed apply sheet).
  @IsString() @MinLength(1) @MaxLength(2000) note!: string;
  // Optional PDF résumé as base64 (the server checks it is a PDF of at most 5 MB); the profile is used without one.
  @IsOptional() @IsString() @IsBase64() resumeBase64?: string;
}
