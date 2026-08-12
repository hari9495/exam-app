import sharp from 'sharp';
import { FaceEmbedderService, __setOrtLoaderForTests } from './face-embedder.service';

// onnxruntime-node is deliberately not installed yet (see the note in face-embedder.service.ts),
// so the tensor-layout tests below supply their own Tensor. This records exactly what the service
// hands the model, which is what those tests assert on -- the real package would give us an opaque
// object and tell us less.
class FakeTensor {
  constructor(readonly type: string, readonly data: Float32Array, readonly dims: number[]) {}
}
beforeEach(() => {
  __setOrtLoaderForTests(async () => ({
    Tensor: FakeTensor as never,
    InferenceSession: { create: async () => ({}) },
  }));
});
afterAll(() => __setOrtLoaderForTests(null));

type FakeSession = {
  inputNames: string[];
  outputNames?: string[];
  run: jest.Mock;
};

function installFakeSession(service: FaceEmbedderService, session: FakeSession): void {
  (service as unknown as { session: unknown }).session = session;
}

function makeService(): FaceEmbedderService {
  return new FaceEmbedderService({ get: () => undefined } as never);
}

describe('FaceEmbedderService', () => {
  // The whole feature degrades to "no verdict" when the model is missing. It must NEVER
  // degrade to an accusation, and must never take the exam-runtime process down at boot.
  it('reports unavailable and returns null when no model path is configured', async () => {
    const service = new FaceEmbedderService({ get: () => undefined } as never);
    await service.onModuleInit();
    expect(service.isAvailable()).toBe(false);
    expect(await service.embed(Buffer.from('anything'))).toBeNull();
  });

  it('reports unavailable when the configured model file does not exist', async () => {
    const service = new FaceEmbedderService({ get: () => 'C:/definitely/not/here.onnx' } as never);
    await service.onModuleInit();
    expect(service.isAvailable()).toBe(false);
  });

  it('returns null rather than throwing when handed bytes that are not an image', async () => {
    const service = new FaceEmbedderService({ get: () => undefined } as never);
    await service.onModuleInit();
    await expect(service.embed(Buffer.from([0, 1, 2, 3]))).resolves.toBeNull();
  });

  // The test above passes at the `no session` guard, so it never reaches the decoder. This one
  // installs a session first, which is the only way the decode failure path is actually run.
  it('returns null when the decoder rejects the bytes, without calling the model', async () => {
    const service = makeService();
    const run = jest.fn();
    installFakeSession(service, { inputNames: ['x'], outputNames: ['out'], run });

    await expect(service.embed(Buffer.from([0, 1, 2, 3]))).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  describe('preprocessing', () => {
    const PLANE = 112 * 112;

    it('builds an NCHW planar float32 tensor normalised to (x/255-0.5)/0.5', async () => {
      const service = makeService();
      const run = jest.fn().mockResolvedValue({
        out: { type: 'float32', data: Float32Array.from([1, 2, 3]) },
      });
      installFakeSession(service, { inputNames: ['x'], outputNames: ['out'], run });

      const image = await sharp({
        create: { width: 200, height: 150, channels: 3, background: { r: 10, g: 200, b: 90 } },
      })
        .png()
        .toBuffer();

      const result = await service.embed(image);

      expect(result).toEqual(Float32Array.from([1, 2, 3]));
      expect(run).toHaveBeenCalledTimes(1);

      const feeds = run.mock.calls[0][0] as Record<string, { dims: number[]; data: Float32Array; type: string }>;
      const tensor = feeds['x'];
      expect(tensor.dims).toEqual([1, 3, 112, 112]);
      expect(tensor.data.length).toBe(3 * PLANE);

      const expectedR = (10 / 255 - 0.5) / 0.5;
      const expectedG = (200 / 255 - 0.5) / 0.5;
      const expectedB = (90 / 255 - 0.5) / 0.5;

      // Sample across each plane distinctly. A channel transposition (e.g. NHWC) or a
      // constant-normalisation mutation on one channel would fail these.
      for (const i of [0, 50, PLANE - 1]) {
        expect(tensor.data[i]).toBeCloseTo(expectedR, 5);
      }
      for (const i of [PLANE, PLANE + 50, PLANE * 2 - 1]) {
        expect(tensor.data[i]).toBeCloseTo(expectedG, 5);
      }
      for (const i of [PLANE * 2, PLANE * 2 + 50, PLANE * 3 - 1]) {
        expect(tensor.data[i]).toBeCloseTo(expectedB, 5);
      }
    });

    it('honours EXIF orientation so a sideways photo matches its upright equivalent', async () => {
      const width = 200;
      const height = 150;
      const upright = await sharp({ create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } } })
        .composite([
          {
            input: await sharp({
              create: { width: width / 2, height, channels: 3, background: { r: 0, g: 0, b: 255 } },
            })
              .png()
              .toBuffer(),
            left: width / 2,
            top: 0,
          },
        ])
        .png()
        .toBuffer();

      // Simulate a camera held sideways: physically rotate the pixels, then tag EXIF
      // orientation=6 ("rotate 90 CW to display correctly") without touching the pixels again.
      const physicallyRotated = await sharp(upright).rotate(270).png().toBuffer();
      const sideways = await sharp(physicallyRotated).withMetadata({ orientation: 6 }).png().toBuffer();

      async function embedAndCapture(image: Buffer): Promise<Float32Array> {
        const service = makeService();
        const run = jest.fn().mockResolvedValue({ out: { type: 'float32', data: Float32Array.from([0]) } });
        installFakeSession(service, { inputNames: ['x'], outputNames: ['out'], run });
        await service.embed(image);
        const feeds = run.mock.calls[0][0] as Record<string, { data: Float32Array }>;
        return feeds['x'].data;
      }

      const uprightTensor = await embedAndCapture(upright);
      const sidewaysTensor = await embedAndCapture(sideways);

      for (let i = 0; i < uprightTensor.length; i += 997) {
        expect(sidewaysTensor[i]).toBeCloseTo(uprightTensor[i], 1);
      }
    });
  });

  describe('output handling', () => {
    it('returns null and logs a warning when the model output is not float32', async () => {
      const service = makeService();
      const run = jest.fn().mockResolvedValue({
        out: { type: 'int8', data: Int8Array.from([1, 2, 3]) },
      });
      installFakeSession(service, { inputNames: ['x'], outputNames: ['out'], run });

      const image = await sharp({
        create: { width: 20, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .png()
        .toBuffer();

      await expect(service.embed(image)).resolves.toBeNull();
    });

    it('selects the output by outputNames rather than key insertion order', async () => {
      const service = makeService();
      const run = jest.fn().mockResolvedValue({
        decoy: { type: 'float32', data: Float32Array.from([9, 9, 9]) },
        real: { type: 'float32', data: Float32Array.from([1, 2, 3]) },
      });
      installFakeSession(service, { inputNames: ['x'], outputNames: ['real'], run });

      const image = await sharp({
        create: { width: 20, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .png()
        .toBuffer();

      await expect(service.embed(image)).resolves.toEqual(Float32Array.from([1, 2, 3]));
    });
  });

  describe('non-Error rejections', () => {
    it('returns null rather than throwing when session.run rejects with null', async () => {
      const service = makeService();
      const run = jest.fn().mockRejectedValue(null);
      installFakeSession(service, { inputNames: ['x'], outputNames: ['out'], run });

      const image = await sharp({
        create: { width: 20, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .png()
        .toBuffer();

      await expect(service.embed(image)).resolves.toBeNull();
    });
  });
});
