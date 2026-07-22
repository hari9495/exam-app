import { detectViolationReason, detectLookingDown } from './webcam-detection';

// Row-major 4x4. Yaw about vertical axis: matrix[8] = -sin(yaw), matrix[10] = cos(yaw).
// Pitch about horizontal axis: matrix[9] = -sin(pitch), read back via asin(-matrix[9]).
function matrixFor({ yawDeg = 0, pitchDeg = 0 }: { yawDeg?: number; pitchDeg?: number }) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const m = new Array(16).fill(0);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  m[8] = -Math.sin(yaw); m[10] = Math.cos(yaw);
  m[9] = -Math.sin(pitch);
  return { data: m };
}
function result({ faces = 1, yawDeg = 0, pitchDeg = 0 } = {}) {
  return {
    faceLandmarks: Array.from({ length: faces }, () => ({})),
    facialTransformationMatrixes: faces > 0 ? [matrixFor({ yawDeg, pitchDeg })] : [],
  };
}

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

  it('returns multiple_faces when more than one face is detected', () => {
    expect(detectViolationReason(result({ faces: 2 }))).toBe('multiple_faces');
  });

  it('returns multiple_faces before checking yaw', () => {
    expect(detectViolationReason(result({ faces: 2, yawDeg: 90 }))).toBe('multiple_faces');
  });

  it('returns head_turned above the yaw threshold', () => {
    expect(detectViolationReason(result({ yawDeg: 40 }))).toBe('head_turned');
  });

  it('returns null when centered', () => {
    expect(detectViolationReason(result({ yawDeg: 5 }))).toBeNull();
  });
});

describe('detectLookingDown', () => {
  it('true when pitched down beyond 45 degrees', () => {
    expect(detectLookingDown(result({ pitchDeg: 55 }))).toBe(true);
  });

  it('false at a keyboard-glance angle (~25 degrees)', () => {
    expect(detectLookingDown(result({ pitchDeg: 25 }))).toBe(false);
  });

  it('false just under the 45 degree threshold', () => {
    expect(detectLookingDown(result({ pitchDeg: 44 }))).toBe(false);
  });

  it('true just over the 45 degree threshold', () => {
    expect(detectLookingDown(result({ pitchDeg: 46 }))).toBe(true);
  });

  it('false when no face', () => {
    expect(detectLookingDown(result({ faces: 0 }))).toBe(false);
  });

  it('false when multiple faces (looking-down is a single-face signal)', () => {
    expect(detectLookingDown(result({ faces: 2, pitchDeg: 55 }))).toBe(false);
  });
});
