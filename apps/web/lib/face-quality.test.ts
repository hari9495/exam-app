import { assessFaceQuality } from './face-quality';

// MediaPipe normalises landmark x/y to 0..1 of the frame. A face is described here by the
// horizontal extent of its landmarks, which is what faceWidthRatio measures.
function face(minX: number, maxX: number, centreY = 0.5) {
  return [
    { x: minX, y: centreY, z: 0 },
    { x: maxX, y: centreY, z: 0 },
    { x: (minX + maxX) / 2, y: centreY, z: 0 },
  ];
}

describe('assessFaceQuality', () => {
  it('accepts a single, large, centred face', () => {
    const verdict = assessFaceQuality({ faceLandmarks: [face(0.35, 0.65)] } as never);
    expect(verdict.ok).toBe(true);
    expect(verdict.metrics.faceCount).toBe(1);
  });

  it('rejects an empty frame as no_face', () => {
    const verdict = assessFaceQuality({ faceLandmarks: [] } as never);
    expect(verdict).toMatchObject({ ok: false, problem: 'no_face' });
  });

  // Enrolling with two people in frame is how you end up with the wrong reference entirely.
  it('rejects two faces rather than guessing which one to enrol', () => {
    const verdict = assessFaceQuality(
      { faceLandmarks: [face(0.1, 0.3), face(0.6, 0.9)] } as never,
    );
    expect(verdict).toMatchObject({ ok: false, problem: 'multiple_faces' });
  });

  it('rejects a face too small in frame, and says what to do', () => {
    const verdict = assessFaceQuality({ faceLandmarks: [face(0.48, 0.54)] } as never);
    expect(verdict).toMatchObject({ ok: false, problem: 'too_small' });
    if (!verdict.ok) expect(verdict.hint).toMatch(/closer/i);
  });

  it('rejects a face pushed to the edge of frame', () => {
    const verdict = assessFaceQuality({ faceLandmarks: [face(0.72, 0.98)] } as never);
    expect(verdict).toMatchObject({ ok: false, problem: 'off_centre' });
  });

  it('always reports metrics, so a rejected enrolment can be debugged later', () => {
    const verdict = assessFaceQuality({ faceLandmarks: [face(0.48, 0.54)] } as never);
    expect(verdict.metrics.faceWidthRatio).toBeCloseTo(0.06, 2);
  });

  it('treats a missing faceLandmarks array as no_face rather than throwing', () => {
    const verdict = assessFaceQuality({} as never);
    expect(verdict).toMatchObject({ ok: false, problem: 'no_face' });
  });
});
