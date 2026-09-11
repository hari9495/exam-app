import { PublicApplicationsController } from './public-applications.controller';

describe('PublicApplicationsController', () => {
  function setup() {
    const service = { getPublicJob: jest.fn(), apply: jest.fn(), getApplicationStatus: jest.fn(), getJobsFeed: jest.fn(), getPortal: jest.fn(), updatePortalProfile: jest.fn(), uploadPortalResume: jest.fn(), getUnsubscribe: jest.fn(), setUnsubscribe: jest.fn(), getCareers: jest.fn() };
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

  it('jobsFeed delegates to service.getJobsFeed', () => {
    const { service, controller } = setup();
    controller.jobsFeed();
    expect(service.getJobsFeed).toHaveBeenCalled();
  });

  it('portal delegates to service.getPortal with the portalToken', () => {
    const { service, controller } = setup();
    controller.portal('portal-token-1');
    expect(service.getPortal).toHaveBeenCalledWith('portal-token-1');
  });

  it('updatePortalProfile delegates to service.updatePortalProfile with the portalToken and dto', () => {
    const { service, controller } = setup();
    const dto = { name: 'New Name', phone: '555-1111' };
    controller.updatePortalProfile('portal-token-1', dto as any);
    expect(service.updatePortalProfile).toHaveBeenCalledWith('portal-token-1', dto);
  });

  it('uploadPortalResume delegates to service.uploadPortalResume with the portalToken and dto', () => {
    const { service, controller } = setup();
    const dto = { resumeBase64: 'JVBERi0=' };
    controller.uploadPortalResume('portal-token-1', dto as any);
    expect(service.uploadPortalResume).toHaveBeenCalledWith('portal-token-1', dto);
  });

  it('status delegates to service.getApplicationStatus with the statusToken', () => {
    const { service, controller } = setup();
    controller.status('status-token-1');
    expect(service.getApplicationStatus).toHaveBeenCalledWith('status-token-1');
  });

  it('getUnsubscribe delegates to service.getUnsubscribe with the token', () => {
    const { service, controller } = setup();
    controller.getUnsubscribe('unsub-token-1');
    expect(service.getUnsubscribe).toHaveBeenCalledWith('unsub-token-1');
  });

  it('setUnsubscribe delegates to service.setUnsubscribe with the token and dto.optedOut', () => {
    const { service, controller } = setup();
    controller.setUnsubscribe('unsub-token-1', { optedOut: true } as any);
    expect(service.setUnsubscribe).toHaveBeenCalledWith('unsub-token-1', true);
  });

  it('getCareers delegates to service.getCareers with the orgSlug', () => {
    const { service, controller } = setup();
    controller.getCareers('acme');
    expect(service.getCareers).toHaveBeenCalledWith('acme');
  });
});
