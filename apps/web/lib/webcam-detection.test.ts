import { detectViolationReason } from './webcam-detection';

describe('detectViolationReason', () => {
  it('returns no_face when no face landmarks are present', () => {
    expect(detectViolationReason({ faceLandmarks: [], facialTransformationMatrixes: [] })).toBe('no_face');
  });

  it('returns null when a face is present and facing forward', () => {
    // Identity-like rotation: matrix[8] = 0 (sin yaw), matrix[10] = 1 (cos yaw) -> yaw = 0deg
    const data = new Float32Array(16);
    data[10] = 1;
    expect(detectViolationReason({ faceLandmarks: [[{ x: 0, y: 0, z: 0 }]], facialTransformationMatrixes: [{ data }] })).toBeNull();
  });

  it('returns head_turned when yaw exceeds the threshold', () => {
    // 90 degree yaw: matrix[8] = -sin(90deg) = -1, matrix[10] = cos(90deg) = 0
    const data = new Float32Array(16);
    data[8] = -1;
    data[10] = 0;
    expect(detectViolationReason({ faceLandmarks: [[{ x: 0, y: 0, z: 0 }]], facialTransformationMatrixes: [{ data }] })).toBe('head_turned');
  });

  it('returns null when no transformation matrix is available yet', () => {
    expect(detectViolationReason({ faceLandmarks: [[{ x: 0, y: 0, z: 0 }]], facialTransformationMatrixes: [] })).toBeNull();
  });
});
