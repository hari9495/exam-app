import { Prisma } from '@prisma/client';

// Batch G1 demo data (G1-GLOBAL-CORE-BUILD-DESIGN §7, §8): India set up through the "Add a country" guide (one
// finished guide per Kaveri entity) and some company words in Hindi and Tamil. Idempotent.

type Tx = Prisma.TransactionClient;

const WORDS: [subjectType: 'leave_type' | 'designation', code: string, hi: string, ta: string][] = [
  ['leave_type', 'EL', 'अर्जित अवकाश', 'ஈட்டிய விடுப்பு'],
  ['leave_type', 'CL', 'आकस्मिक अवकाश', 'தற்செயல் விடுப்பு'],
  ['leave_type', 'SL', 'बीमारी अवकाश', 'மருத்துவ விடுப்பு'],
  ['designation', 'QA-ANALYST', 'गुणवत्ता विश्लेषक', 'தர ஆய்வாளர்'],
  ['designation', 'PROD-SUP', 'उत्पादन पर्यवेक्षक', 'உற்பத்தி மேற்பார்வையாளர்'],
];

export async function seedGlobal(tx: Tx, organizationId: string): Promise<void> {
  const org = { organizationId };
  const admin = (await tx.user.findFirst({ where: { ...org, email: 'admin@demo-org.test' }, select: { id: true } }))?.id ?? null;
  for (const shortName of ['KFPL', 'KFPL-TN']) {
    const e = await tx.legalEntity.findFirst({ where: { ...org, shortName } });
    if (!e || (await tx.countrySetup.findFirst({ where: { ...org, legalEntityId: e.id } }))) continue;
    await tx.countrySetup.create({ data: { ...org, country: 'IN', legalEntityId: e.id, status: 'done', createdBy: admin, finishedBy: admin, finishedAt: new Date() } });
  }
  for (const [subjectType, code, hi, ta] of WORDS) {
    const subject = subjectType === 'leave_type' ? await tx.leaveType.findFirst({ where: { ...org, code } }) : await tx.designation.findFirst({ where: { ...org, code } });
    if (!subject) continue;
    for (const [language, text] of [['hi', hi], ['ta', ta]] as const) {
      await tx.contentTranslation.upsert({
        where: { organizationId_subjectType_subjectId_language: { organizationId, subjectType, subjectId: subject.id, language } },
        create: { organizationId, subjectType, subjectId: subject.id, language, text, updatedBy: admin },
        update: {},
      });
    }
  }
}
