'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_CAPTURE_WIDTH = 1280;
const JPEG_QUALITY = 0.5;
const CAPTURE_INTERVAL_MS = 5000;
const MAX_CAPTURES = 150;

type ScreenCaptureError = 'wrong-surface' | 'denied' | 'unsupported' | null;

export function useScreenCapture(
  enabled: boolean,
  onEnded: () => void,
): {
  active: boolean;
  error: ScreenCaptureError;
  requestShare: () => Promise<{ displaySurface?: string; userAgent: string } | null>;
  capture: () => string | null;
} {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<ScreenCaptureError>(null);

  // Mirrored through a ref so the stable stopStream/requestShare callbacks below
  // always see the latest onEnded without needing to be recreated every render.
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastCaptureAtRef = useRef(0);
  const captureCountRef = useRef(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    videoRef.current = null;
    setActive(false);
  }, []);

  // The exam turning screen-capture off mid-attempt (or the enclosing feature being
  // disabled) must release the share, not just skip future requestShare() calls.
  useEffect(() => {
    if (!enabled) stopStream();
  }, [enabled, stopStream]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const requestShare = useCallback(async (): Promise<{ displaySurface?: string; userAgent: string } | null> => {
    if (!enabled) return null;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setError('unsupported');
      return null;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      setError('denied');
      return null;
    }

    const [track] = stream.getVideoTracks();
    // displaySurface isn't in TS's MediaTrackSettings lib type yet, though every
    // shipping implementation reports it.
    const displaySurface = (track?.getSettings() as MediaTrackSettings & { displaySurface?: string })?.displaySurface;

    if (displaySurface && displaySurface !== 'monitor') {
      stream.getTracks().forEach((t) => t.stop());
      setError('wrong-surface');
      return null;
    }

    track?.addEventListener('ended', () => {
      stopStream();
      onEndedRef.current();
    });

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();

    streamRef.current = stream;
    videoRef.current = video;
    lastCaptureAtRef.current = 0;
    captureCountRef.current = 0;
    setError(null);
    setActive(true);

    return { displaySurface, userAgent: navigator.userAgent };
  }, [enabled, stopStream]);

  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video) return null;
    if (captureCountRef.current >= MAX_CAPTURES) return null;
    if (Date.now() - lastCaptureAtRef.current < CAPTURE_INTERVAL_MS) return null;

    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight) return null;

    const scale = Math.min(1, MAX_CAPTURE_WIDTH / videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(videoWidth * scale);
    canvas.height = Math.round(videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    lastCaptureAtRef.current = Date.now();
    captureCountRef.current += 1;
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  }, []);

  return { active, error, requestShare, capture };
}
