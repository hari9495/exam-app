import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createHash, randomInt } from 'crypto';
import { OrgSecretsCryptoService } from '@exam-platform/shared';

// LAPTOP ONLY. The desk's dev SMTP (port 1026) has nothing listening, so portal sign-in codes never arrive. This puts a
// fresh code in Redis exactly as the portal's "Send me a code" does (same key, same HMAC, 5 minutes, 5 tries) and prints
// it. Usage, from apps/api (reads DATABASE_URL, REDIS_URL and ORG_SECRETS_ENCRYPTION_KEY from .env):
//   npx ts-node scripts/desk-portal-code.ts asha@annapurna-stores.test            (portal demo-org / care)
//   npx ts-node scripts/desk-portal-code.ts someone@annapurna-stores.test demo-org care
// Then type the email and the code on http://localhost:3400/yx/portal/demo-org/care.

async function main() {
  const [email = 'asha@annapurna-stores.test', orgSlug = 'demo-org', portalSlug = 'care'] = process.argv.slice(2);
  if (process.env.NODE_ENV === 'production') throw new Error('Laptops only.');
  const prisma = new PrismaClient();
  const { org, portal } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = await tx.organization.findUniqueOrThrow({ where: { slug: orgSlug }, select: { id: true } });
    const portal = await tx.sdPortal.findFirstOrThrow({ where: { organizationId: org.id, slug: portalSlug }, select: { id: true } });
    return { org, portal };
  });
  await prisma.$disconnect();
  const address = email.trim().toLowerCase();
  const key = `sd:portal-otp:${org.id}:${portal.id}:${createHash('sha256').update(address).digest('hex')}`;
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const mac = new OrgSecretsCryptoService().hmac('otp', `${key}\u0000${code}`);
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await redis.multi().del(key).hset(key, { email: address, mac, attempts: '0' }).expire(key, 300).exec();
  await redis.quit();
  console.log(`Sign-in code for ${address} on /yx/portal/${orgSlug}/${portalSlug}: ${code} (5 minutes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
