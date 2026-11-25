'use client';

import { CandidateLinkScreen } from '@yukthix/ui/assessments';

// Decision 2398 (step 4): the kit's "Your session has ended" screen.
export default function CandidateSessionEndedPage() {
  return <CandidateLinkScreen live={{ state: 'ended' }} />;
}
