export const HEAD_TURN_THRESHOLD_DEGREES = 30;

export type ViolationReason = 'no_face' | 'head_turned';

interface FaceLandmarkerResult {
  faceLandmarks: unknown[];
  facialTransformationMatrixes?: { data: Float32Array | number[] }[];
}

export function detectViolationReason(result: FaceLandmarkerResult): ViolationReason | null {
  if (result.faceLandmarks.length === 0) {
    return 'no_face';
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
