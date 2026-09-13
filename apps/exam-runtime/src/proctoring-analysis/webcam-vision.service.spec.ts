import { AiNotConfiguredError } from '@exam-platform/shared';
import { WebcamVisionService } from './webcam-vision.service';

describe('WebcamVisionService', () => {
  let service: WebcamVisionService;
  let tenantPrisma: { forTenant: jest.Mock };
  let resolver: { resolve: jest.Mock };
  let quota: { assertAiCredits: jest.Mock };
  let blob: { downloadToBuffer: jest.Mock };
  let client: { analyze: jest.Mock };
  const provider = { generateStructured: jest.fn(), ping: jest.fn() };

  const examBase = {
    organizationId: 'org-1',
    enableAntiCheating: true,
    webcamProctoringEnabled: true,
    webcamAiAnalysisEnabled: true,
    webcamRecordOnly: false,
    proctoringEnforcement: 'block',
    proctoringStrikeLimit: 3,
    disabledProctoringSignalsJson: null,
    screenCaptureEnabled: false,
    lockdownRequired: false,
    faceVerificationEnabled: false,
    faceEnrolmentPolicy: 'retry_then_allow',
  };

  function tenantWith(exam: Record<string, unknown>, snapshots: unknown[], sinks: { create: jest.Mock; usage: jest.Mock }) {
    const tx = {
      attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'a1', startedAt: new Date(), proctoringBypassedAt: null, proctoringBypassRevokedAt: null, invitation: { exam } }) },
      proctoringEvent: { findMany: jest.fn().mockResolvedValue(snapshots), create: sinks.create },
      aiCreditUsage: { create: sinks.usage },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));
    return tx;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    tenantPrisma = { forTenant: jest.fn() };
    resolver = { resolve: jest.fn().mockResolvedValue(provider) };
    quota = { assertAiCredits: jest.fn().mockResolvedValue(undefined) };
    blob = { downloadToBuffer: jest.fn().mockResolvedValue(Buffer.from('jpegbytes')) };
    client = { analyze: jest.fn().mockResolvedValue({ riskLevel: 'high', summary: 's', flags: [{ type: 'another_person', note: 'x' }] }) };
    service = new WebcamVisionService(tenantPrisma as never, resolver as never, quota as never, blob as never, client as never);
  });

  const snaps = [
    { metadataJson: JSON.stringify({ snapshot: 'https://blob/1.jpg' }) },
    { metadataJson: JSON.stringify({ snapshot: 'https://blob/2.jpg' }) },
  ];

  it('analyzes sampled snapshots, records usage, and writes ONE flag event when flagged', async () => {
    const sinks = { create: jest.fn(), usage: jest.fn() };
    tenantWith(examBase, snaps, sinks);

    await service.analyze('a1');

    expect(quota.assertAiCredits).toHaveBeenCalled();
    expect(client.analyze).toHaveBeenCalledWith([expect.stringContaining('data:image/jpeg;base64,'), expect.stringContaining('data:image/jpeg;base64,')], provider);
    expect(sinks.usage).toHaveBeenCalledWith({ data: { organizationId: 'org-1', source: 'webcam_vision', credits: 1, sourceId: 'a1' } });
    expect(sinks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attemptId: 'a1', eventType: 'webcam_ai_flag', severity: 'medium' }) }));
  });

  it('records usage but writes no event when the verdict is clean', async () => {
    client.analyze.mockResolvedValue({ riskLevel: 'low', summary: 'clean', flags: [] });
    const sinks = { create: jest.fn(), usage: jest.fn() };
    tenantWith(examBase, snaps, sinks);

    await service.analyze('a1');
    expect(sinks.usage).toHaveBeenCalled();
    expect(sinks.create).not.toHaveBeenCalled();
  });

  it('does nothing when the exam has not opted into webcam AI analysis', async () => {
    const sinks = { create: jest.fn(), usage: jest.fn() };
    tenantWith({ ...examBase, webcamAiAnalysisEnabled: false }, snaps, sinks);

    await service.analyze('a1');
    expect(client.analyze).not.toHaveBeenCalled();
    expect(sinks.usage).not.toHaveBeenCalled();
  });

  it('skips when there are no stored webcam snapshots', async () => {
    const sinks = { create: jest.fn(), usage: jest.fn() };
    tenantWith(examBase, [], sinks);

    await service.analyze('a1');
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(client.analyze).not.toHaveBeenCalled();
  });

  it('skips (no charge, no call) when the org has no AI configured', async () => {
    resolver.resolve.mockRejectedValue(new AiNotConfiguredError('no key'));
    const sinks = { create: jest.fn(), usage: jest.fn() };
    tenantWith(examBase, snaps, sinks);

    await service.analyze('a1');
    expect(quota.assertAiCredits).not.toHaveBeenCalled();
    expect(client.analyze).not.toHaveBeenCalled();
    expect(sinks.usage).not.toHaveBeenCalled();
  });
});
