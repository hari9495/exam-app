import { TerminalCard } from '../components/TerminalCard';

export default function CandidateSubmittedPage() {
  return (
    <TerminalCard
      tone="success"
      title="Exam submitted"
      body="Your exam has been submitted. Results will be reviewed by the recruiter."
    />
  );
}
