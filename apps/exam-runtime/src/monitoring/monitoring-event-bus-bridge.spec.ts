import { Test } from '@nestjs/testing';
import { MonitoringEventBusBridge } from './monitoring-event-bus-bridge';
import { MonitoringGateway } from './monitoring.gateway';
import { monitoringEventBus } from './monitoring-event-bus';

describe('MonitoringEventBusBridge', () => {
  let bridge: MonitoringEventBusBridge;
  let monitoringGateway: { emitAttemptStatus: jest.Mock; emitMessageSent: jest.Mock; emitProctoringBypass: jest.Mock };

  beforeEach(async () => {
    monitoringGateway = { emitAttemptStatus: jest.fn(), emitMessageSent: jest.fn(), emitProctoringBypass: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [MonitoringEventBusBridge, { provide: MonitoringGateway, useValue: monitoringGateway }],
    }).compile();
    bridge = moduleRef.get(MonitoringEventBusBridge);
    bridge.onModuleInit();
  });

  afterEach(() => {
    monitoringEventBus.removeAllListeners();
  });

  it('forwards attempt-status events from the bus into MonitoringGateway.emitAttemptStatus', () => {
    monitoringEventBus.emitAttemptStatus({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', status: 'force_submitted' });

    expect(monitoringGateway.emitAttemptStatus).toHaveBeenCalledWith('exam-1', {
      attemptId: 'attempt-1',
      candidateId: 'cand-1',
      status: 'force_submitted',
    });
  });

  it('forwards message-sent events from the bus into MonitoringGateway.emitMessageSent', () => {
    const sentAt = new Date('2026-07-09T00:00:00.000Z');
    monitoringEventBus.emitMessageSent({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });

    expect(monitoringGateway.emitMessageSent).toHaveBeenCalledWith('exam-1', {
      attemptId: 'attempt-1',
      candidateId: 'cand-1',
      sentAt,
    });
  });

  it('forwards proctoring-bypass events from the bus into MonitoringGateway.emitProctoringBypass', () => {
    monitoringEventBus.emitProctoringBypass({ examId: 'exam-1', attemptId: 'attempt-1', proctoringBypassed: true });

    expect(monitoringGateway.emitProctoringBypass).toHaveBeenCalledWith('exam-1', { attemptId: 'attempt-1', proctoringBypassed: true });
  });
});
