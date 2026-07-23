import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import clsx from 'clsx';

type Tone = 'loading' | 'success' | 'error' | 'neutral';

const ICON_CLASSES: Record<Tone, string> = {
  loading: 'bg-candidate-bg text-candidate-text-tertiary',
  success: 'bg-candidate-primary-light text-candidate-primary',
  error: 'bg-candidate-danger-bg text-candidate-danger',
  neutral: 'bg-candidate-bg text-candidate-text-tertiary',
};

function ToneIcon({ tone }: { tone: Tone }) {
  const className = 'h-5 w-5';
  if (tone === 'loading') return <Loader2 className={clsx(className, 'animate-spin')} aria-hidden="true" />;
  if (tone === 'success') return <CheckCircle2 className={className} aria-hidden="true" />;
  if (tone === 'error') return <XCircle className={className} aria-hidden="true" />;
  return <Clock className={className} aria-hidden="true" />;
}

interface TerminalCardProps {
  tone: Tone;
  title: string;
  body: string;
}

export function TerminalCard({ tone, title, body }: TerminalCardProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-8 pb-32 pt-8">
      <div className="w-full max-w-sm rounded-lg border border-candidate-border bg-white p-6 text-center shadow-sm">
        <div className={clsx('mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full', ICON_CLASSES[tone])}>
          <ToneIcon tone={tone} />
        </div>
        <h1 className="mb-1 text-base font-bold text-candidate-text">{title}</h1>
        <p className="text-sm text-candidate-text-secondary">{body}</p>
      </div>
    </div>
  );
}
