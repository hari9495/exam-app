import type { ApprovalStepView } from './types';

// Pure step-state derivation for the approvals inbox detail view. ApprovalRequestDetail.steps
// carries no `state` of its own (unlike the embedded ApprovalSummary used on job/offer pages) --
// only the raw chain + a flat decisions[] list -- so the per-step approved/rejected/pending state
// ApprovalTimeline needs has to be computed here: a decision recorded at that position wins
// (approved or rejected, even if that isn't the current step any more); otherwise a step before
// the current position is implicitly approved, and the rest are still pending.
export function deriveStepStates(
  steps: { name: string }[],
  decisions: { stepPosition: number; decision: 'approved' | 'rejected' }[],
  currentStepPosition: number,
): ApprovalStepView[] {
  return steps.map((step, position) => {
    const decision = decisions.find((d) => d.stepPosition === position);
    const state: ApprovalStepView['state'] = decision ? decision.decision : position < currentStepPosition ? 'approved' : 'pending';
    return { name: step.name, state };
  });
}
