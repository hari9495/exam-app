import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';

// The model is a PARAMETER, not a constant: the weights choice is still subject to a licensing
// answer, and swapping the file must not require a code change.
const MODEL_PATH_KEY = 'FACE_EMBEDDING_MODEL_PATH';

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
      const ort = await import('onnxruntime-node');
      this.session = await ort.InferenceSession.create(path);
      this.logger.log(`Face embedding model loaded from ${path}`);
    } catch (error) {
      this.logger.error(`Failed to load face embedding model: ${(error as Error).message}`);
      this.session = null;
    }
  }

  isAvailable(): boolean {
    return this.session !== null;
  }

  async embed(image: Buffer): Promise<Float32Array | null> {
    if (!this.session) return null;
    try {
      const ort = await import('onnxruntime-node');
      const tensor = await this.toInputTensor(ort, image);
      if (!tensor) return null;
      const session = this.session as { inputNames: string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>> };
      const output = await session.run({ [session.inputNames[0]]: tensor });
      const first = Object.values(output)[0];
      return first ? Float32Array.from(first.data) : null;
    } catch (error) {
      // Every failure here degrades to "no verdict". Never an accusation, never a throw into
      // the snapshot pipeline.
      this.logger.warn(`Face embedding failed: ${(error as Error).message}`);
      return null;
    }
  }

  // Decode to the model's expected input. EdgeFace takes a 112x112 RGB tensor normalised to
  // [-1, 1] in NCHW order.
  private async toInputTensor(ort: typeof import('onnxruntime-node'), image: Buffer): Promise<unknown | null> {
    try {
      const sharp = (await import('sharp')).default;
      const { data } = await sharp(image).removeAlpha().resize(112, 112, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
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
      this.logger.warn(`Face image decode failed: ${(error as Error).message}`);
      return null;
    }
  }
}
