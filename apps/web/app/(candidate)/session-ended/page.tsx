import { TerminalCard } from '../components/TerminalCard';

export default function CandidateSessionEndedPage() {
  return (
    <TerminalCard
      tone="neutral"
      title="Your session has ended"
      body="This can happen if the exam was opened in another browser or tab, or if your session expired. If the exam is still open, use your invitation link again to continue."
    />
  );
}
