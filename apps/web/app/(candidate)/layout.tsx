import { CandidateAuthProvider } from '../../lib/candidate-auth-context';
import { CandidateBrandingLogo } from './components/CandidateBrandingLogo';

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <CandidateAuthProvider>
      <div className="min-h-screen bg-candidate-bg">
        <CandidateBrandingLogo />
        {children}
      </div>
    </CandidateAuthProvider>
  );
}
