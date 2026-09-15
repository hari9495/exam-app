'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';
import { CandidateButton } from './CandidateButton';
import type { AnswerFile } from '../../../lib/types';

// Fixed global policy — mirrors ANSWER_AUDIO_* in the exam-runtime attempt.service.ts. The server
// re-validates; these give the candidate an instant, friendly rejection.
const MAX_SECONDS = 10 * 60; // 10 minutes
const MAX_BYTES = 30 * 1024 * 1024;
const AUDIO_ACCEPT = 'audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,.mp3,.m4a,.wav,.ogg,.webm';
const ALLOWED_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);
// MediaRecorder container preference, best-supported first.
const RECORD_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
const EXT_BY_TYPE: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

function readFileAsDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the recording'));
    reader.readAsDataURL(blob);
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function pickRecordMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return RECORD_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

interface SpokenAnswerRecorderProps {
  existing: AnswerFile | undefined;
  disabled: boolean;
  uploading: boolean;
  onUpload: (fileName: string, dataUri: string) => Promise<void>;
  onRemove: (fileId: string) => Promise<void>;
}

export function SpokenAnswerRecorder({ existing, disabled, uploading, onUpload, onRemove }: SpokenAnswerRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function cleanupStream() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Stop any live recording + release the mic if the component unmounts (e.g. navigating questions).
  useEffect(() => cleanupStream, []);

  async function startRecording() {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError("This browser can't record audio. Please upload an audio file instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone access was blocked. Allow the microphone in your browser, or upload an audio file instead.'
          : name === 'NotFoundError'
            ? 'No microphone was found. Plug one in, or upload an audio file instead.'
            : "Couldn't start recording. Try again, or upload an audio file instead.",
      );
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickRecordMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = (recorder.mimeType || 'audio/webm').split(';')[0].trim();
      const blob = new Blob(chunksRef.current, { type });
      cleanupStream();
      setRecording(false);
      void finishRecording(blob, type);
    };
    recorder.start();
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= MAX_SECONDS) stopRecording(); // auto-stop at the cap
        return next;
      });
    }, 1000);
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop(); // triggers onstop → finishRecording
    }
  }

  async function finishRecording(blob: Blob, type: string) {
    if (blob.size === 0) {
      setError('The recording was empty. Please try again.');
      return;
    }
    if (blob.size > MAX_BYTES) {
      setError('The recording is too large (over 30 MB). Please record a shorter answer.');
      return;
    }
    const ext = EXT_BY_TYPE[type] ?? 'webm';
    try {
      const dataUri = await readFileAsDataUri(blob);
      await onUpload(`recording-${Date.now()}.${ext}`, dataUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the recording.");
    }
  }

  async function handleFilePick(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    if (file.size === 0) return setError('That file is empty.');
    if (file.size > MAX_BYTES) return setError('That file is larger than 30 MB.');
    if (file.type && !ALLOWED_TYPES.has(file.type.split(';')[0].trim())) {
      return setError('That audio format is not supported.');
    }
    try {
      const dataUri = await readFileAsDataUri(file);
      await onUpload(file.name, dataUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that file.");
    }
  }

  const busy = uploading || disabled;

  return (
    <div className="flex flex-col gap-3">
      {existing ? (
        <div className="flex flex-col gap-2 rounded-md border border-candidate-border bg-candidate-bg p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-candidate-text-secondary">Your recording</span>
            <button
              type="button"
              onClick={() => onRemove(existing.id)}
              disabled={busy || recording}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-candidate-text-secondary hover:bg-candidate-border/40 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
            </button>
          </div>
          {existing.url ? (
            <audio controls preload="metadata" src={existing.url} className="w-full" />
          ) : (
            <span className="text-xs text-candidate-text-faint">Recording saved.</span>
          )}
          <span className="text-[11px] text-candidate-text-tertiary">Recording again replaces this one.</span>
        </div>
      ) : (
        <p className="text-sm text-candidate-text-faint">No recording yet.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {recording ? (
          <CandidateButton variant="secondary" onClick={stopRecording}>
            <span className="inline-flex items-center gap-1.5">
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              Stop
            </span>
          </CandidateButton>
        ) : (
          <CandidateButton onClick={startRecording} disabled={busy}>
            <span className="inline-flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5" aria-hidden="true" />
              {existing ? 'Re-record' : 'Record'}
            </span>
          </CandidateButton>
        )}
        {recording ? (
          <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-candidate-text-secondary">
            <span className="h-2 w-2 rounded-full bg-candidate-danger" aria-hidden="true" />
            {formatDuration(elapsed)} / {formatDuration(MAX_SECONDS)}
          </span>
        ) : (
          <label className="text-xs text-candidate-text-secondary">
            <span className="mr-2">or</span>
            <input
              type="file"
              accept={AUDIO_ACCEPT}
              aria-label="Upload an audio file"
              disabled={busy}
              onChange={(e) => {
                void handleFilePick(e.target.files?.[0]);
                e.target.value = '';
              }}
              className="text-xs text-candidate-text-secondary file:mr-2 file:rounded-md file:border-0 file:bg-candidate-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:opacity-90 disabled:opacity-50"
            />
          </label>
        )}
        {uploading ? <span className="text-xs text-candidate-text-faint">Saving…</span> : null}
      </div>

      {error ? (
        <span role="alert" className="text-xs text-candidate-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
