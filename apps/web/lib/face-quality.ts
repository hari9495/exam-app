import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type QualityProblem = 'no_face' | 'multiple_faces' | 'too_small' | 'off_centre';

export interface QualityMetrics {
  faceCount: number;
  faceWidthRatio: number;
  centreOffsetRatio: number;
}

export type QualityVerdict =
  | { ok: true; metrics: QualityMetrics }
  | { ok: false; problem: QualityProblem; hint: string; metrics: QualityMetrics };

// The face must span at least this fraction of the frame width. Below it the reference carries
// too few pixels to be worth comparing against for the next hour.
const MIN_FACE_WIDTH_RATIO = 0.15;
// How far the face centre may sit from the frame centre, as a fraction of frame width.
const MAX_CENTRE_OFFSET_RATIO = 0.25;

export function assessFaceQuality(result: FaceLandmarkerResult): QualityVerdict {
  const faces = result?.faceLandmarks ?? [];
  const empty: QualityMetrics = { faceCount: faces.length, faceWidthRatio: 0, centreOffsetRatio: 0 };

  if (faces.length === 0) {
    return { ok: false, problem: 'no_face', hint: "We can't see your face. Move into the light and look at the camera.", metrics: empty };
  }
  if (faces.length > 1) {
    return { ok: false, problem: 'multiple_faces', hint: "More than one person is visible. Make sure you're alone in frame.", metrics: empty };
  }

  const xs = faces[0].map((point) => point.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const faceWidthRatio = maxX - minX;
  const centreOffsetRatio = Math.abs((minX + maxX) / 2 - 0.5);
  const metrics: QualityMetrics = { faceCount: 1, faceWidthRatio, centreOffsetRatio };

  if (faceWidthRatio < MIN_FACE_WIDTH_RATIO) {
    return { ok: false, problem: 'too_small', hint: 'Move closer to the camera.', metrics };
  }
  if (centreOffsetRatio > MAX_CENTRE_OFFSET_RATIO) {
    return { ok: false, problem: 'off_centre', hint: 'Centre your face in the frame.', metrics };
  }
  return { ok: true, metrics };
}
