import { CandidateAuthProvider } from '../../lib/candidate-auth-context';
import { CandidateThemeProvider } from './components/CandidateThemeProvider';
import { ClientErrorListener } from './components/ClientErrorListener';
import { CandidateLegal } from './components/CandidateLegal';

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <CandidateAuthProvider>
      <ClientErrorListener />
      <CandidateThemeProvider>
        <CandidateLegal>{children}</CandidateLegal>
      </CandidateThemeProvider>
    </CandidateAuthProvider>
  );
}
