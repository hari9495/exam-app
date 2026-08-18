import { PublicInterviewsController } from './public-interviews.controller';

describe('PublicInterviewsController', () => {
  function setup() {
    const service = { getPublicInterview: jest.fn(), respondPublic: jest.fn() };
    const controller = new PublicInterviewsController(service as any);
    return { service, controller };
  }

  it('getInterview delegates to service.getPublicInterview with the token', () => {
    const { service, controller } = setup();
    controller.getInterview('interview-token-1');
    expect(service.getPublicInterview).toHaveBeenCalledWith('interview-token-1');
  });

  it('respond delegates to service.respondPublic with the token and the whole dto', () => {
    const { service, controller } = setup();
    const dto = { action: 'confirm', slotId: 'slot-1' } as any;
    controller.respond('interview-token-1', dto);
    expect(service.respondPublic).toHaveBeenCalledWith('interview-token-1', dto);
  });

  it('respond passes decline/reschedule through the same way', () => {
    const { service, controller } = setup();
    const dto = { action: 'reschedule', note: 'next week please' } as any;
    controller.respond('interview-token-1', dto);
    expect(service.respondPublic).toHaveBeenCalledWith('interview-token-1', dto);
  });
});
