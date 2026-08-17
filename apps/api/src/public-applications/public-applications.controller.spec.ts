import { PublicApplicationsController } from './public-applications.controller';

describe('PublicApplicationsController', () => {
  function setup() {
    const service = { getPublicJob: jest.fn(), apply: jest.fn(), getApplicationStatus: jest.fn() };
    const controller = new PublicApplicationsController(service as any);
    return { service, controller };
  }

  it('getJob delegates to service.getPublicJob with the applyToken', () => {
    const { service, controller } = setup();
    controller.getJob('apply-token-1');
    expect(service.getPublicJob).toHaveBeenCalledWith('apply-token-1');
  });

  it('apply delegates to service.apply with the applyToken and dto', () => {
    const { service, controller } = setup();
    const dto = { name: 'Candidate', email: 'candidate@example.com', resumeBase64: 'JVBERi0=' };
    controller.apply('apply-token-1', dto as any);
    expect(service.apply).toHaveBeenCalledWith('apply-token-1', dto);
  });

  it('status delegates to service.getApplicationStatus with the statusToken', () => {
    const { service, controller } = setup();
    controller.status('status-token-1');
    expect(service.getApplicationStatus).toHaveBeenCalledWith('status-token-1');
  });
});
