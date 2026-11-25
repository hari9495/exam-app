import { IsBase64, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SubmitReferralDto {
  @IsUUID('4') jobId!: string;
  @IsString() @MaxLength(200) name!: string;
  @IsEmail() @MaxLength(320) email!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  // Optional PDF résumé as base64 (server validates PDF magic bytes + 5 MB cap).
  @IsOptional() @IsString() @IsBase64() resumeBase64?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  // HIR-12: the referrer ticked "My friend agreed that I can share their details" (kept in the audit record).
  @IsOptional() @IsBoolean() consentGiven?: boolean;
}

export class SetRewardStatusDto {
  @IsIn(['pending', 'approved', 'paid', 'rejected']) rewardStatus!: string;
  @IsOptional() @IsString() @MaxLength(2000) rewardNote?: string;
  // Answer 285: "paid" goes through payroll (default) or was paid outside payroll (the cost is posted at once).
  @IsOptional() @IsIn(['payroll', 'outside']) paidVia?: 'payroll' | 'outside';
}
