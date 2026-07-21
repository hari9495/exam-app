import { CandidateAuthProvider } from '../../lib/candidate-auth-context';
import { CandidateThemeProvider } from './components/CandidateThemeProvider';

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <CandidateAuthProvider>
      <CandidateThemeProvider>{children}</CandidateThemeProvider>
    </CandidateAuthProvider>
  );
}
