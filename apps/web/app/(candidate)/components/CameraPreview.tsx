import { Video, VideoOff } from 'lucide-react';
import clsx from 'clsx';
import { CandidateButton } from './CandidateButton';

type CameraStatus = 'idle' | 'checking' | 'granted' | 'denied';

interface CameraPreviewProps {
  status: CameraStatus;
  onEnable: () => void;
}

export function CameraPreview({ status, onEnable }: CameraPreviewProps) {
  if (status === 'granted') {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-16 flex-shrink-0 items-center justify-center rounded-md bg-candidate-text text-candidate-primary">
          <Video className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-candidate-text">Camera connected</p>
          <p className="text-xs text-candidate-text-tertiary">We can see you clearly — you&apos;re good to go.</p>
        </div>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-16 flex-shrink-0 items-center justify-center rounded-md bg-candidate-text text-candidate-danger">
            <VideoOff className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-candidate-danger">Camera access blocked</p>
            <p className="text-xs text-candidate-text-tertiary">
              Allow camera access in your browser&apos;s address-bar permissions, then retry.
            </p>
          </div>
        </div>
        <CandidateButton variant="secondary" onClick={onEnable} className="mt-3 w-full border-candidate-danger text-candidate-danger">
          Retry camera access
        </CandidateButton>
      </div>
    );
  }

  return (
    <CandidateButton onClick={onEnable} disabled={status === 'checking'} className={clsx('w-full')}>
      {status === 'checking' ? 'Requesting camera…' : 'Enable camera'}
    </CandidateButton>
  );
}
