import { SetMetadata } from '@nestjs/common';

// Marks a handler as a step-up action (P12 §3, YX-IAM-02): the caller must have re-verified at
// AAL2 within the step-up window. Part 1c's StepUpGuard enforces handlers carrying this metadata;
// until it lands the mark is declarative only.
export const STEP_UP_REQUIRED = 'yx:step-up-required';
export const RequireStepUp = () => SetMetadata(STEP_UP_REQUIRED, true);
