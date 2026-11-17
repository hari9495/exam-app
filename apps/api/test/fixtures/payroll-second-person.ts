import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import type { TenantPrismaService } from '@exam-platform/shared';

// Answers 1325 and 1521 (Settings S-3, S-7): a payroll, bonus, loan or reports-access setting saved by HR waits for a
// second person (payroll.settings.second_person, on by default): PUT /org/settings answers 200 with { pending: true } and
// nothing changes until someone else approves. That behaviour is tested in settings-s3-payroll and settings-s7-moves.
// Suites about payroll features themselves set many such values and read them back at once, so they run their
// company with the control off, which is itself a payroll setting: a second HR admin (made here) approves it once.
export async function payrollSettingsApplyAtOnce(
  server: Parameters<typeof request>[0],
  tenantPrisma: TenantPrismaService,
  org: { id: string; slug: string },
  adminToken: string,
): Promise<void> {
  const asked = (await request(server).put('/api/v1/org/settings').set('Authorization', `Bearer ${adminToken}`).send({ key: 'payroll.settings.second_person', scopeType: 'tenant', value: 'off' }).expect(200)).body as { pending?: boolean; id?: string };
  if (!asked.pending) return;
  const email = `second-hr-${randomUUID().slice(0, 8)}@settings.test`;
  const password = 'Corr3ct-Horse-Battery';
  const passwordHash = await argon2.hash(password);
  await tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: org.id, email, name: 'Second HR admin', passwordHash, role: 'org_admin' } }));
  const token = (await request(server).post('/api/v1/auth/staff/login').send({ organizationSlug: org.slug, email, password }).expect(200)).body.accessToken as string;
  await request(server).post(`/api/v1/org/settings/requests/${asked.id}/approve`).set('Authorization', `Bearer ${token}`).send({}).expect(200);
}
