import { SetMetadata } from '@nestjs/common';

// Marks a handler as a step-up action (P12 §3, YX-IAM-02): the caller must have proven AAL2 on
// this session within the step-up window. Enforced by PermissionsGuard, which also writes the
// step-up onto the audit log (`step_up.used`).
export const STEP_UP_REQUIRED = 'yx:step-up-required';
export const RequireStepUp = () => SetMetadata(STEP_UP_REQUIRED, true);

// Marks a handler as a sensitive-role action whose permission alone does not say so -- proctor
// and evaluator actions ride on exam:manage, which also covers everyday exam authoring. Such a
// handler needs an AAL2 session once the enrolment grace has passed (YX-IAM-01), exactly like a
// handler gated by one of MFA_SENSITIVE_PERMISSIONS. Enforced by PermissionsGuard.
export const SENSITIVE_ROLE_ACTION = 'yx:sensitive-role-action';
export const SensitiveRoleAction = () => SetMetadata(SENSITIVE_ROLE_ACTION, true);
