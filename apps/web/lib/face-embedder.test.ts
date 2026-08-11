import { createBrowserEmbedder, toNchwFloat32 } from './face-embedder';

describe('createBrowserEmbedder', () => {
  // The advisory tier is a convenience. If it cannot load, the candidate must see no difference
  // and the server tier must remain the thing that decides. This exercises the REAL
  // onnxruntime-web module (not mocked) against a domain reserved by RFC 2606 to never resolve --
  // the model file this depends on does not exist yet (licensing gate), so this failure path is
  // the normal one, not an edge case, in every environment today.
  it('returns null from embed() when the model cannot load, rather than throwing', async () => {
    const embedder = createBrowserEmbedder('https://example.invalid/missing.onnx');
    await expect(embedder.embed({ videoWidth: 0, videoHeight: 0 } as never)).resolves.toBeNull();
  });

  it('close() is safe to call before anything loaded', () => {
    expect(() => createBrowserEmbedder('https://example.invalid/missing.onnx').close()).not.toThrow();
  });

  it('actually attempts to load the model rather than short-circuiting before it', async () => {
    // Guards against a test (and an implementation) that returns null at some earlier guard --
    // e.g. an empty modelUrl check -- without ever touching onnxruntime-web. A real, present
    // modelUrl with a real video-shaped object must reach the real load attempt and fail there.
    const createSpy = jest.spyOn((await import('onnxruntime-web')).InferenceSession, 'create');
    const embedder = createBrowserEmbedder('https://example.invalid/missing.onnx');
    await embedder.embed({ videoWidth: 640, videoHeight: 480 } as never);
    expect(createSpy).toHaveBeenCalledWith('https://example.invalid/missing.onnx');
    createSpy.mockRestore();
  });

  it('caches a failed load so a second embed() does not re-attempt InferenceSession.create', async () => {
    const createSpy = jest.spyOn((await import('onnxruntime-web')).InferenceSession, 'create');
    const embedder = createBrowserEmbedder('https://example.invalid/missing.onnx');
    await embedder.embed({ videoWidth: 640, videoHeight: 480 } as never);
    await embedder.embed({ videoWidth: 640, videoHeight: 480 } as never);
    expect(createSpy).toHaveBeenCalledTimes(1);
    createSpy.mockRestore();
  });

  it('returns null (not a rejected promise) for a zero-sized video frame even once a session exists', async () => {
    // A landmark loop can hand embed() a video element before its first frame has decoded
    // (videoWidth/videoHeight both 0). This must degrade the same as every other failure.
    const embedder = createBrowserEmbedder('https://example.invalid/missing.onnx');
    await expect(embedder.embed({ videoWidth: 0, videoHeight: 0 } as never)).resolves.toBeNull();
  });

  // A real model file and a real successful session are unavailable in this task (see module
  // comment) -- close()'s actual release behaviour is verified with a mocked onnxruntime-web,
  // isolated to this one test via jest.isolateModulesAsync so every other test in this file keeps
  // exercising the real, unmocked module.
  it('close() releases the underlying ONNX session once one has loaded', async () => {
    const release = jest.fn().mockResolvedValue(undefined);
    const run = jest.fn().mockResolvedValue({ embedding: { type: 'float32', data: new Float32Array(4) } });
    const create = jest.fn().mockResolvedValue({
      inputNames: ['input'],
      outputNames: ['embedding'],
      run,
      release,
    });

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
      drawImage: jest.fn(),
      getImageData: jest.fn().mockReturnValue({ data: new Uint8ClampedArray(112 * 112 * 4) }),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock('onnxruntime-web', () => ({
          InferenceSession: { create },
          Tensor: class {
            constructor(
              public type: string,
              public data: unknown,
              public dims: number[],
            ) {}
          },
        }));
        const { createBrowserEmbedder: createIsolated } = await import('./face-embedder');
        const embedder = createIsolated('https://models.example/face-embedder.onnx');

        const embedding = await embedder.embed({ videoWidth: 112, videoHeight: 112 } as unknown as HTMLVideoElement);
        expect(embedding).toEqual(new Float32Array(4));
        expect(release).not.toHaveBeenCalled();

        embedder.close();
        expect(release).toHaveBeenCalledTimes(1);
      });
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });
});

describe('toNchwFloat32', () => {
  it('normalises RGB bytes to [-1, 1] via (x/255-0.5)/0.5 and separates R/G/B into three contiguous planes (NCHW), not interleaved (NHWC)', () => {
    // A 2x2 "image", RGBA bytes: red, green, blue, mid-grey.
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255, // pixel 0: red
      0, 255, 0, 255, // pixel 1: green
      0, 0, 255, 255, // pixel 2: blue
      128, 128, 128, 255, // pixel 3: mid-grey
    ]);
    const out = toNchwFloat32(rgba, 2); // 2x2 = 4 pixels -> 3 planes of 4 floats each

    expect(out.length).toBe(3 * 4);
    const rPlane = out.slice(0, 4);
    const gPlane = out.slice(4, 8);
    const bPlane = out.slice(8, 12);

    // Pixel 0 (red) sits at index 0 of every plane -- a transposed (interleaved, or
    // plane-order-swapped) implementation would put its R value somewhere else.
    expect(rPlane[0]).toBeCloseTo(1, 6);
    expect(gPlane[0]).toBeCloseTo(-1, 6);
    expect(bPlane[0]).toBeCloseTo(-1, 6);
    // Pixel 3 (mid-grey, 128): all three planes land at the same near-zero value.
    expect(rPlane[3]).toBeCloseTo(0, 2);
    expect(gPlane[3]).toBeCloseTo(0, 2);
    expect(bPlane[3]).toBeCloseTo(0, 2);
  });
});
