import { Timeline, TimelineRow } from './Timeline';
import { STATUS } from './viz';
import type { ApprovalStepView } from '../../lib/types';

const stateTone: Record<ApprovalStepView['state'], string> = {
  approved: STATUS.ok,
  rejected: STATUS.bad,
  pending: 'var(--muted)',
};

// Purely presentational: renders one row per approval step, tone dot from step state, and marks
// the current step with a "Current" pill. No data fetching — callers pass ApprovalSummary.steps.
export function ApprovalTimeline({ steps, currentStep }: { steps: ApprovalStepView[]; currentStep: number }) {
  return (
    <Timeline>
      {steps.map((step, i) => (
        <div key={`${step.name}-${i}`} data-testid={`approval-step-${i}`} data-state={step.state}>
          <TimelineRow color={stateTone[step.state]} last={i === steps.length - 1}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: i === currentStep ? 700 : 500, color: 'var(--ink)', fontSize: 13 }}>{step.name}</span>
              {i === currentStep && (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--org-primary)', background: 'color-mix(in srgb, var(--org-primary) 12%, var(--paper))', borderRadius: 999, padding: '2px 8px' }}>
                  Current
                </span>
              )}
            </div>
          </TimelineRow>
        </div>
      ))}
    </Timeline>
  );
}
