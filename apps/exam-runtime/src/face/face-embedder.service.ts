import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';

// The model is a PARAMETER, not a constant: the weights choice is still subject to a licensing
// answer, and swapping the file must not require a code change.
const MODEL_PATH_KEY = 'FACE_EMBEDDING_MODEL_PATH';

// `onnxruntime-node` is NOT a declared dependency yet, deliberately. It is unusable until the
// weights land (blocked on the EdgeFace licensing question), and its current releases all pull
// in adm-zip 0.5.x, which carries a high-severity advisory (GHSA-xcpc-8h2w-3j85) with no
// non-breaking fix. Taking a production CVE for a package that cannot run yet is a bad trade, so
// the plan's weights task installs it. Until then the dynamic import below simply throws and is
// caught -- the identical "inert" path as a missing model file, which is already tested.
//
// These are the minimum shapes this service touches. When the real package is installed, swap
// them for `typeof import('onnxruntime-node')` and let the compiler check them for real.
interface OrtTensorCtor {
  new (type: string, data: Float32Array, dims: number[]): unknown;
}
interface OrtModule {
  Tensor: OrtTensorCtor;
  InferenceSession: { create(path: string): Promise<unknown> };
}

let loadOrt = async (): Promise<OrtModule> => {
  // Non-literal specifier so bundlers and tsc do not try to resolve a package that is not
  // installed. It is expected to reject today; every caller treats that as "no verdict".
  const specifier = 'onnxruntime-node';
  return (await import(/* webpackIgnore: true */ specifier)) as unknown as OrtModule;
};

// The tensor-building tests need a real Tensor constructor to assert layout against, and the
// package it would normally come from is not installed (see above). This lets the spec supply a
// stand-in. Production never calls it -- the loader above is the default.
export function __setOrtLoaderForTests(loader: (() => Promise<OrtModule>) | null): void {
  loadOrt = loader ?? (async () => {
    const specifier = 'onnxruntime-node';
    return (await import(/* webpackIgnore: true */ specifier)) as unknown as OrtModule;
  });
}

@Injectable()
export class FaceEmbedderService implements OnModuleInit {
  private readonly logger = new Logger(FaceEmbedderService.name);
  private session: unknown = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const path = this.config.get<string>(MODEL_PATH_KEY);
    if (!path || !existsSync(path)) {
      // Deliberately not fatal. An exam-runtime that refuses to boot because a model file is
      // missing would take down every candidate's exam over an optional feature.
      this.logger.warn(`Face embedding model not available (${MODEL_PATH_KEY}=${path ?? 'unset'}); verification is disabled`);
      return;
    }
    try {
      const ort = await loadOrt();
      this.session = await ort.InferenceSession.create(path);
      this.logger.log(`Face embedding model loaded from ${path}`);
    } catch (error) {
      this.logger.error(`Failed to load face embedding model: ${String(error)}`);
      this.session = null;
    }
  }

  isAvailable(): boolean {
    return this.session !== null;
  }

  async embed(image: Buffer): Promise<Float32Array | null> {
    if (!this.session) return null;
    try {
      const ort = await loadOrt();
      const tensor = await this.toInputTensor(ort, image);
      if (!tensor) return null;
      const session = this.session as {
        inputNames: string[];
        outputNames?: string[];
        run(feeds: Record<string, unknown>): Promise<Record<string, { type: string; data: unknown }>>;
      };
      const output = await session.run({ [session.inputNames[0]]: tensor });
      const outputKey = session.outputNames?.[0] ?? Object.keys(output)[0];
      const first = outputKey ? output[outputKey] : undefined;
      if (!first) return null;
      if (first.type !== 'float32') {
        this.logger.warn(`Face embedding model returned unexpected output type "${first.type}"; expected float32`);
        return null;
      }
      return Float32Array.from(first.data as ArrayLike<number>);
    } catch (error) {
      // Every failure here degrades to "no verdict". Never an accusation, never a throw into
      // the snapshot pipeline.
      this.logger.warn(`Face embedding failed: ${String(error)}`);
      return null;
    }
  }

  // Decode to the model's expected input. EdgeFace takes a 112x112 RGB tensor normalised to
  // [-1, 1] in NCHW order.
  private async toInputTensor(ort: OrtModule, image: Buffer): Promise<unknown | null> {
    try {
      const sharp = (await import('sharp')).default;
      const { data } = await sharp(image).rotate().removeAlpha().resize(112, 112, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
      const floats = new Float32Array(3 * 112 * 112);
      const plane = 112 * 112;
      for (let i = 0; i < plane; i += 1) {
        floats[i] = (data[i * 3] / 255 - 0.5) / 0.5;
        floats[plane + i] = (data[i * 3 + 1] / 255 - 0.5) / 0.5;
        floats[plane * 2 + i] = (data[i * 3 + 2] / 255 - 0.5) / 0.5;
      }
      return new ort.Tensor('float32', floats, [1, 3, 112, 112]);
    } catch (error) {
      // Silence here would be the worst outcome: a missing decoder makes verification
      // permanently inert with nothing in the logs to say why.
      this.logger.warn(`Face image decode failed: ${String(error)}`);
      return null;
    }
  }
}
