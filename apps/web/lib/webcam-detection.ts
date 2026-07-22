export const HEAD_TURN_THRESHOLD_DEGREES = 30;
export const PITCH_DOWN_THRESHOLD_DEGREES = 45;

export type ViolationReason = 'no_face' | 'head_turned' | 'multiple_faces';

interface FaceLandmarkerResult {
  faceLandmarks: unknown[];
  facialTransformationMatrixes?: { data: Float32Array | number[] }[];
}

export function detectViolationReason(result: FaceLandmarkerResult): ViolationReason | null {
  if (result.faceLandmarks.length === 0) {
    return 'no_face';
  }
  if (result.faceLandmarks.length > 1) {
    return 'multiple_faces';
  }
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  if (!matrix) {
    return null;
  }
  // Yaw (rotation around the vertical axis) from the 4x4 row-major rotation matrix:
  // matrix[8] = -sin(yaw), matrix[10] = cos(yaw).
  const yawRadians = Math.atan2(-matrix[8], matrix[10]);
  const yawDegrees = Math.abs((yawRadians * 180) / Math.PI);
  return yawDegrees > HEAD_TURN_THRESHOLD_DEGREES ? 'head_turned' : null;
}

// Report-only signal: candidate's head pitched downward past the threshold (e.g. looking
// at a phone in the lap). Single-face only -- multi-face and no-face are handled as
// violations above, and pitch is meaningless without exactly one head.
export function detectLookingDown(result: FaceLandmarkerResult): boolean {
  if (result.faceLandmarks.length !== 1) {
    return false;
  }
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  if (!matrix) {
    return false;
  }
  // Pitch (rotation around the horizontal axis): matrix[9] = -sin(pitch).
  const pitchRadians = Math.asin(Math.max(-1, Math.min(1, -matrix[9])));
  const pitchDegrees = (pitchRadians * 180) / Math.PI;
  // Positive = looking down in this convention.
  return pitchDegrees > PITCH_DOWN_THRESHOLD_DEGREES;
}
