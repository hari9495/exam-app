import { PublicOffersController } from './public-offers.controller';

describe('PublicOffersController', () => {
  function setup() {
    const service = { getPublicOffer: jest.fn(), respondPublic: jest.fn() };
    const controller = new PublicOffersController(service as any);
    return { service, controller };
  }

  it('getOffer delegates to service.getPublicOffer with the token', () => {
    const { service, controller } = setup();
    controller.getOffer('offer-token-1');
    expect(service.getPublicOffer).toHaveBeenCalledWith('offer-token-1');
  });

  it('respond delegates to service.respondPublic with the token and action', () => {
    const { service, controller } = setup();
    controller.respond('offer-token-1', { action: 'accept' } as any);
    expect(service.respondPublic).toHaveBeenCalledWith('offer-token-1', 'accept');
  });

  it('respond passes decline through the same way', () => {
    const { service, controller } = setup();
    controller.respond('offer-token-1', { action: 'decline' } as any);
    expect(service.respondPublic).toHaveBeenCalledWith('offer-token-1', 'decline');
  });
});
