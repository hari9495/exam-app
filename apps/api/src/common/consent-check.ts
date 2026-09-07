import { BadRequestException } from '@nestjs/common';

// Single place apply() and register() both route consent enforcement through, so the
// "empty/whitespace text = not configured" rule and the required-but-not-accepted rejection
// live once instead of twice. Returns the fields to merge into a candidate create/update
// payload: {} when the org hasn't configured apply consent (existing behavior, unchanged).
export function resolveConsentStamp(
  applyConsentText: string | null | undefined,
  applyConsentVersion: number,
  consentAccepted: boolean | undefined,
): { consentedAt: Date; consentVersion: number } | Record<string, never> {
  if (!applyConsentText || !applyConsentText.trim()) {
    return {};
  }
  if (!consentAccepted) {
    throw new BadRequestException('Consent is required to apply');
  }
  return { consentedAt: new Date(), consentVersion: applyConsentVersion };
}
