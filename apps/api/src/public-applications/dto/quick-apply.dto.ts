import { IsBoolean, IsObject, IsOptional } from 'class-validator';

// One-click re-apply for a returning candidate (identified by their portal token). No name/email/
// résumé here -- those are reused from the candidate's existing record. Only the extras a specific
// job might still require: consent (if the org configured it) and any apply-visible custom fields
// not already on file.
export class QuickApplyDto {
  @IsOptional()
  @IsObject()
  customFields?: Record<string, string | number | null>;

  @IsOptional()
  @IsBoolean()
  consentAccepted?: boolean;
}
