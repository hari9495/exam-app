import { createBrowserEmbedder, toNchwFloat32, frameToImageData } from './face-embedder';

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

  it('close() during an in-flight load releases the session once loading finishes, instead of leaking it', async () => {
    // React StrictMode's double-mount hits exactly this: embed() kicks off the first load, then
    // close() runs (component unmounted) before InferenceSession.create() has settled. `session`
    // is still null at that point, so a naive `session?.release()` in close() can't see the
    // session the pending load is about to produce -- it becomes unreachable and leaks for the
    // rest of the exam attempt.
    const release = jest.fn().mockResolvedValue(undefined);
    let resolveCreate!: (session: unknown) => void;
    const create = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

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

        const embedPromise = embedder.embed({ videoWidth: 112, videoHeight: 112 } as unknown as HTMLVideoElement);
        // Let the dynamic import of onnxruntime-web resolve and reach InferenceSession.create()
        // before racing it with close() -- a macrotask flush guarantees every pending microtask
        // (including the mocked dynamic import) has run.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(create).toHaveBeenCalledTimes(1);

        embedder.close(); // races the still-pending load

        resolveCreate({ inputNames: ['input'], outputNames: ['embedding'], run: jest.fn(), release });
        await embedPromise;

        expect(release).toHaveBeenCalledTimes(1);

        // And it stays closed -- the session the in-flight load produced must not become usable.
        await embedder.embed({ videoWidth: 112, videoHeight: 112 } as unknown as HTMLVideoElement);
        expect(create).toHaveBeenCalledTimes(1);
      });
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  it('close() swallows a rejecting release() instead of leaving an unhandled promise rejection', async () => {
    // A failing cleanup must stay invisible: the candidate layout's ClientErrorListener turns any
    // unhandled rejection into a `systemEvents` row (severity 'error') tied to the candidate's
    // attemptId -- exactly the accusation this advisory tier must never cause.
    const release = jest.fn().mockRejectedValue(new Error('release failed'));
    const create = jest.fn().mockResolvedValue({ inputNames: ['input'], outputNames: ['embedding'], run: jest.fn(), release });

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
      drawImage: jest.fn(),
      getImageData: jest.fn().mockReturnValue({ data: new Uint8ClampedArray(112 * 112 * 4) }),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    const onUnhandledRejection = jest.fn();
    process.on('unhandledRejection', onUnhandledRejection);

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

        await embedder.embed({ videoWidth: 112, videoHeight: 112 } as unknown as HTMLVideoElement);
        expect(() => embedder.close()).not.toThrow();

        // Give the swallowed rejection's microtask a turn before asserting nothing escaped.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(release).toHaveBeenCalledTimes(1);
        expect(onUnhandledRejection).not.toHaveBeenCalled();
      });
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('close() is terminal: embed() after close() returns null without creating a new session', async () => {
    const release = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockResolvedValue({
      inputNames: ['input'],
      outputNames: ['embedding'],
      run: jest.fn().mockResolvedValue({ embedding: { type: 'float32', data: new Float32Array(4) } }),
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

        await embedder.embed({ videoWidth: 112, videoHeight: 112 } as unknown as HTMLVideoElement);
        embedder.close();

        const result = await embedder.embed({ videoWidth: 112, videoHeight: 112 } as unknown as HTMLVideoElement);

        expect(result).toBeNull();
        expect(create).toHaveBeenCalledTimes(1); // close() did not silently reopen a new session

        // Idempotent: a second close() is a no-op, not a second release().
        embedder.close();
        expect(release).toHaveBeenCalledTimes(1);
      });
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  it('sets ort.env.wasm.proxy so inference is moved off the main thread', async () => {
    const release = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockResolvedValue({ inputNames: ['input'], outputNames: ['embedding'], run: jest.fn(), release });
    const env = { wasm: {} as { proxy?: boolean } };

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
          env,
        }));
        const { createBrowserEmbedder: createIsolated } = await import('./face-embedder');
        const embedder = createIsolated('https://models.example/face-embedder.onnx');
        await embedder.embed({ videoWidth: 112, videoHeight: 112 } as unknown as HTMLVideoElement);

        expect(env.wasm.proxy).toBe(true);
      });
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });
});

describe('frameToImageData (center-crop geometry)', () => {
  it('draws a center-square crop of the source rect onto the 112x112 canvas, not a full-frame stretch', () => {
    // Regression guard for the exact defect the module comment warns about: a reviewer once
    // replaced this crop with a full-frame stretch and all other tests (including
    // toNchwFloat32's) still passed, because that math never looks at the drawImage call.
    const drawImage = jest.fn();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
      drawImage,
      imageSmoothingQuality: 'low',
      getImageData: jest.fn().mockReturnValue({ data: new Uint8ClampedArray(112 * 112 * 4) }),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const video = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement;
      frameToImageData(video);

      // 480 (the shorter side) square, centered within the 640-wide frame: sx = (640-480)/2 = 80,
      // sy = 0. A full-frame stretch would instead pass the untouched (0, 0, 640, 480) source
      // rect -- this assertion fails under that mutation.
      expect(drawImage).toHaveBeenCalledWith(video, 80, 0, 480, 480, 0, 0, 112, 112);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  it('requests willReadFrequently for the per-tick getImageData readback and sets high-quality resampling to narrow the gap with the server tier', () => {
    const ctx = {
      drawImage: jest.fn(),
      imageSmoothingQuality: 'low',
      getImageData: jest.fn().mockReturnValue({ data: new Uint8ClampedArray(112 * 112 * 4) }),
    };
    const getContext = jest.fn().mockReturnValue(ctx);
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = getContext as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      frameToImageData({ videoWidth: 112, videoHeight: 112 } as unknown as HTMLVideoElement);
      expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
      expect(ctx.imageSmoothingQuality).toBe('high');
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
