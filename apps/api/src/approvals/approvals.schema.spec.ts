import { PrismaClient } from '@prisma/client';

it('exposes the new approval models on the client', () => {
  const c = new PrismaClient();
  expect(c.approvalChain).toBeDefined();
  expect(c.approvalChainStep).toBeDefined();
  expect(c.approvalRequest).toBeDefined();
  expect(c.approvalDecision).toBeDefined();
});
