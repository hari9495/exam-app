import { CandidateAuthProvider } from '../../lib/candidate-auth-context';
import { CandidateThemeProvider } from './components/CandidateThemeProvider';
import { ClientErrorListener } from './components/ClientErrorListener';

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <CandidateAuthProvider>
      <ClientErrorListener />
      <CandidateThemeProvider>{children}</CandidateThemeProvider>
    </CandidateAuthProvider>
  );
}
