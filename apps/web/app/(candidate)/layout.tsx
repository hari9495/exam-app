import { CandidateAuthProvider } from '../../lib/candidate-auth-context';

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <CandidateAuthProvider>
      <div className="min-h-screen bg-candidate-bg">{children}</div>
    </CandidateAuthProvider>
  );
}
