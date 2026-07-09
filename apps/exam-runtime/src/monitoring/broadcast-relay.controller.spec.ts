import { Test } from '@nestjs/testing';
import { BroadcastRelayController } from './broadcast-relay.controller';
import { MonitoringGateway } from './monitoring.gateway';

describe('BroadcastRelayController', () => {
  let controller: BroadcastRelayController;
  let monitoringGateway: { emitAttemptStatus: jest.Mock; emitMessageSent: jest.Mock };

  beforeEach(async () => {
    monitoringGateway = { emitAttemptStatus: jest.fn(), emitMessageSent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [BroadcastRelayController],
      providers: [{ provide: MonitoringGateway, useValue: monitoringGateway }],
    }).compile();
    controller = moduleRef.get(BroadcastRelayController);
  });

  describe('attemptStatus', () => {
    it('relays to MonitoringGateway.emitAttemptStatus', () => {
      const dto = { examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', status: 'force_submitted' };

      controller.attemptStatus(dto);

      expect(monitoringGateway.emitAttemptStatus).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1',
        candidateId: 'cand-1',
        status: 'force_submitted',
      });
    });
  });

  describe('messageSent', () => {
    it('relays to MonitoringGateway.emitMessageSent', () => {
      const dto = { examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt: '2026-07-09T00:00:00.000Z' };

      controller.messageSent(dto);

      expect(monitoringGateway.emitMessageSent).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1',
        candidateId: 'cand-1',
        sentAt: new Date('2026-07-09T00:00:00.000Z'),
      });
    });
  });
});
