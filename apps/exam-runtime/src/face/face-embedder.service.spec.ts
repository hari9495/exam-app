import { FaceEmbedderService } from './face-embedder.service';

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
});
