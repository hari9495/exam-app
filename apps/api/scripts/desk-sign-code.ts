import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createHash, randomInt } from 'crypto';
import { OrgSecretsCryptoService } from '@exam-platform/shared';

// LAPTOP ONLY. The desk's dev SMTP has nothing listening, so the one-time code for signing a document (founder decision
// 9 Oct 2026) never arrives. After "Send me a code" on the request page, this puts a fresh code in Redis exactly as the
// API does (same key, same HMAC, 5 minutes, 5 tries) for the person's newest document waiting for them, and prints it.
// Usage, from apps/api (reads DATABASE_URL, REDIS_URL and ORG_SECRETS_ENCRYPTION_KEY from .env):
//   npx ts-node scripts/desk-sign-code.ts arjun@demo-org.test            (company demo-org)
//   npx ts-node scripts/desk-sign-code.ts someone@x.test other-org --clear-wait

async function main() {
  process.loadEnvFile?.(join(__dirname, '../.env'));
  const [email = 'arjun@demo-org.test', orgSlug = 'demo-org'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (process.env.NODE_ENV === 'production') throw new Error('Laptops only.');
  const prisma = new PrismaClient();
  const found = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
    const org = await tx.organization.findUniqueOrThrow({ where: { slug: orgSlug }, select: { id: true } });
    const user = await tx.user.findFirstOrThrow({ where: { organizationId: org.id, email: email.toLowerCase() }, select: { id: true } });
    const login = await tx.personRole.findFirstOrThrow({ where: { organizationId: org.id, roleType: 'login', sourceTable: 'users', sourceId: user.id, endOn: null }, select: { personId: true } });
    const doc = await tx.sdRequestDocument.findFirstOrThrow({ where: { organizationId: org.id, signerPersonId: login.personId, status: 'pending' }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true } });
    return { org: org.id, user: user.id, doc };
  });
  await prisma.$disconnect();
  const key = `sd:sign-otp:${found.org}:${found.doc.id}:${found.user}`;
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const mac = new OrgSecretsCryptoService().hmac('otp', `${key}\u0000${code}`);
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await redis.multi().del(key).hset(key, { docId: found.doc.id, userId: found.user, mac, attempts: '0' }).expire(key, 300).exec();
  // --clear-wait: also lift the 60-second wait before the next "Send me a code".
  if (process.argv.includes('--clear-wait')) await redis.del(`auth:otp:cool:${createHash('sha256').update(`sd-sign:${found.org}:${found.user}`).digest('hex')}`);
  await redis.quit();
  console.log(`Signing code for ${email} on "${found.doc.title}": ${code} (5 minutes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
