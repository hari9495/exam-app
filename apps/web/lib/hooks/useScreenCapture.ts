'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_CAPTURE_WIDTH = 1280;
const JPEG_QUALITY = 0.5;
const CAPTURE_INTERVAL_MS = 5000;
const MAX_CAPTURES = 150;

type ScreenCaptureError = 'wrong-surface' | 'denied' | 'unsupported' | 'unavailable' | null;

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
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const endedHandlerRef = useRef<(() => void) | null>(null);
  const lastCaptureAtRef = useRef(0);
  const captureCountRef = useRef(0);

  // Bumped by every releaseCurrent() -- a concurrent second requestShare(), an
  // unmount, or enabled flipping false, all of which can land while a prior
  // requestShare() is still awaiting getDisplayMedia()/play(). requestShare()
  // captures the value right after its own releaseCurrent() call and re-checks it
  // after each subsequent await; a mismatch means it was superseded mid-flight, and
  // its stream must be discarded rather than assigned.
  const generationRef = useRef(0);

  // Shared by stopStream (an active share ending) and unmount cleanup (no state
  // update needed there) -- removes the 'ended' listener before stopping tracks so
  // a browser-initiated 'ended' racing teardown can't fire into a torn-down hook.
  const releaseCurrent = useCallback(() => {
    generationRef.current += 1;
    if (trackRef.current && endedHandlerRef.current) {
      trackRef.current.removeEventListener('ended', endedHandlerRef.current);
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    videoRef.current = null;
    trackRef.current = null;
    endedHandlerRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    releaseCurrent();
    setActive(false);
  }, [releaseCurrent]);

  // The exam turning screen-capture off mid-attempt (or the enclosing feature being
  // disabled) must release the share, not just skip future requestShare() calls.
  useEffect(() => {
    if (!enabled) stopStream();
  }, [enabled, stopStream]);

  useEffect(() => {
    return () => releaseCurrent();
  }, [releaseCurrent]);

  const requestShare = useCallback(async (): Promise<{ displaySurface?: string; userAgent: string } | null> => {
    if (!enabled) return null;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setError('unsupported');
      return null;
    }

    // A re-share while one is already active (re-sharing after a surface change, or
    // a double-clicked share button) must not orphan the previous stream -- release
    // it up front rather than overwriting the refs that track it, and claim this
    // call's own generation so a second concurrent call (or a teardown) landing
    // during either await below can be detected and yielded to.
    stopStream();
    const myGeneration = generationRef.current;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (err) {
      // A superseded call rejecting must not clobber the current call's state --
      // e.g. a stale 'denied' landing after the winner already set active/error.
      if (generationRef.current !== myGeneration) return null;
      // NotAllowedError covers both a candidate dismissing the picker AND a browser/org-level
      // display-capture block (Permissions-Policy, an enterprise ScreenCaptureAllowed policy, a
      // missing OS screen-recording grant) -- the client cannot tell these apart by err.name,
      // so 'denied' has to carry copy for both rather than assume a dismissal (see
      // ScreenShareRequiredOverlay). Anything else (NotFoundError/NotReadableError/AbortError/
      // InvalidStateError) is unambiguous device/state failure, not a picker outcome at all.
      setError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      return null;
    }

    if (generationRef.current !== myGeneration) {
      // Superseded while awaiting the picker -- a concurrent requestShare(),
      // unmount, or enabled->false already ran. Discard silently: whichever call
      // is current owns the error/active state now.
      stream.getTracks().forEach((t) => t.stop());
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

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // Safari/low-power-mode play() rejection: the stream is otherwise unreachable
      // by every teardown path (it was never assigned to streamRef), so it must be
      // stopped here rather than leaking a live share the candidate never sees used.
      stream.getTracks().forEach((t) => t.stop());
      // Same supersession check as above -- don't clobber the current call's state.
      if (generationRef.current !== myGeneration) return null;
      // Not a picker outcome at all -- the candidate already picked a screen, play() itself
      // failed. 'denied' ("click again") would be actively wrong here; 'unavailable' is.
      setError('unavailable');
      return null;
    }

    if (generationRef.current !== myGeneration) {
      // Superseded while awaiting play() -- same reasoning as above.
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }

    const handleEnded = () => {
      stopStream();
      onEndedRef.current();
    };
    track?.addEventListener('ended', handleEnded);

    streamRef.current = stream;
    videoRef.current = video;
    trackRef.current = track ?? null;
    endedHandlerRef.current = handleEnded;
    // A fresh re-share deliberately gets a new 150-capture allowance -- the server's
    // hard cap is the real enforcement, this counter is just client-side politeness.
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
