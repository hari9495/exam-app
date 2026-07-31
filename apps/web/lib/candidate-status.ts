import type { StatusTone } from '../components/ui';

// A candidate's raw attempt/invitation status ('pending_manual_grade', 'submitted', ...),
// kept distinct (not collapsed to a 3-stage bucket) since anywhere results are shown, a
// recruiter cares which kind of settlement a candidate got. Shared by the panel results
// page and the recruiter exam editor's Results tab so the two never drift apart.
export const RESULT_STATUS_LABEL: Record<string, string> = {
  invited: 'Invited',
  revoked: 'Revoked',
  in_progress: 'In Progress',
  paused: 'Paused',
  blocked: 'Blocked',
  pending_manual_grade: 'Pending Grade',
  submitted: 'Submitted',
  auto_submitted: 'Auto-submitted',
  force_submitted: 'Force-submitted',
};

export const RESULT_STATUS_TONE: Record<string, StatusTone> = {
  invited: 'info',
  revoked: 'danger',
  in_progress: 'warning',
  paused: 'neutral',
  blocked: 'danger',
  pending_manual_grade: 'warning',
  submitted: 'success',
  auto_submitted: 'success',
  force_submitted: 'danger',
};
