// Candidate-facing translation of the internal pipeline stage. Rejected wins over stage so a
// rejected candidate never sees a stage label. Never expose the raw stage to candidates.
export function applicationStatusBucket(stage: string, rejected: boolean): string {
  if (rejected) return 'A decision has been made; the team will follow up';
  switch (stage) {
    case 'applied':
      return 'Application received';
    case 'screened':
    case 'interview':
      return 'Under review';
    case 'offer':
    case 'hired':
      return 'Moving forward — the team will be in touch';
    default:
      return 'Application received';
  }
}
