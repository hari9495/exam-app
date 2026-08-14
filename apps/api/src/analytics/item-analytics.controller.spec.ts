import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ItemAnalyticsController } from './item-analytics.controller';
import { ItemAnalyticsService } from './item-analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

describe('ItemAnalyticsController', () => {
  let controller: ItemAnalyticsController;
  let service: { forQuestion: jest.Mock; flagged: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      forQuestion: jest.fn().mockResolvedValue({ questionId: 'q1' }),
      flagged: jest.fn().mockResolvedValue([{ questionId: 'q1' }, { questionId: 'q2' }]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ItemAnalyticsController],
      providers: [{ provide: ItemAnalyticsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(ItemAnalyticsController);
  });

  // Minor 6: @Get('flagged') is declared before @Get(':id') so the literal path isn't swallowed
  // by the parameter route -- protected only by a comment and route declaration order. If that
  // ordering ever regresses, `/flagged` resolves as forQuestion('flagged') and returns a single
  // object where the web (useFlaggedQuestions) expects an array, so the Needs review button
  // silently never renders with no error anywhere. Asserting the shape here fails loudly instead.
  describe('flagged', () => {
    it('returns an array, not a single object', async () => {
      const result = await controller.flagged(tenant);
      expect(Array.isArray(result)).toBe(true);
      expect(service.flagged).toHaveBeenCalledWith(tenant);
    });
  });

  describe('forQuestion', () => {
    it('passes the tenant and id through to the service', async () => {
      await controller.forQuestion(tenant, 'q1');
      expect(service.forQuestion).toHaveBeenCalledWith(tenant, 'q1');
    });
  });
});
