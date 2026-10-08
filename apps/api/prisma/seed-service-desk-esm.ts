import { Prisma } from '@prisma/client';
import { parseGroup } from '../src/rules-engine/conditions';
import { parseForm } from '../src/rules-engine/forms';
import { parseSteps } from '../src/workflow/approvals-engine.service';
import { cleanHtml } from '../src/service-desk/rich-text';

// Service Desk phase 3b-2 batch 1 demo for Kaveri Foods (fictional throughout):
//   - Arjun Kulkarni signs in as arjun@demo-org.test; his manager is Divya Raghunathan (panel@demo-org.test);
//   - the Engineering and Finance cost centres in Bengaluru are owned by payroll@demo-org.test (the cost-centre owner);
//   - IT catalogue: "New laptop" (manager, then cost-centre owner approve; a bundle of tasks for the IT team and the
//     Admin team, each with its OLA) and "Access to a shared folder" (manager approves);
//   - HR catalogue: "Address proof letter" (no approval; the HR team prepares it);
//   - a "Delivery details" question set in the company library, the order guide "Starting at Kaveri Foods";
//   - one active automation rule on the HR desk: payslip and pay questions go to the Payroll team.
// Idempotent: skipped once the New laptop item exists.

type Tx = Prisma.TransactionClient;
const json = (x: unknown) => x as Prisma.InputJsonValue;

export async function seedServiceDeskEsm(tx: Tx, organizationId: string) {
  const org = { organizationId };
  await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
  const it = await tx.sdDesk.findFirst({ where: { ...org, key: 'IT' } });
  const hr = await tx.sdDesk.findFirst({ where: { ...org, key: 'HR' } });
  if (!it || !hr || (await tx.sdCatalogItem.findFirst({ where: { ...org, deskId: it.id, name: 'New laptop' } }))) return;
  const admin = await tx.user.findFirstOrThrow({ where: { ...org, email: 'admin@demo-org.test' } });
  const panel = await tx.user.findFirstOrThrow({ where: { ...org, email: 'panel@demo-org.test' } });
  const payroll = await tx.user.findFirstOrThrow({ where: { ...org, email: 'payroll@demo-org.test' } });
  const hrUser = await tx.user.findFirstOrThrow({ where: { ...org, email: 'hr@demo-org.test' } });
  const farah = await tx.user.findFirstOrThrow({ where: { ...org, email: 'it-lead@demo-org.test' } });

  // ---- Arjun signs in; Divya is his manager in the HR record ----
  const arjunEmp = await tx.employee.findFirst({ where: { ...org, workEmail: 'arjun.kulkarni@kaverifoods.test' } });
  if (arjunEmp) {
    const arjun = await tx.user.upsert({ where: { organizationId_email: { organizationId, email: 'arjun@demo-org.test' } }, update: {}, create: { ...org, email: 'arjun@demo-org.test', name: 'Arjun Kulkarni', passwordHash: panel.passwordHash, role: 'panel' } });
    await tx.employee.update({ where: { id: arjunEmp.id }, data: { userId: arjun.id } });
    if (!(await tx.personRole.findFirst({ where: { ...org, personId: arjunEmp.personId, roleType: 'login', sourceTable: 'users', sourceId: arjun.id } }))) {
      await tx.personRole.create({ data: { ...org, personId: arjunEmp.personId, roleType: 'login', sourceTable: 'users', sourceId: arjun.id, startOn: new Date('2024-07-01T00:00:00Z') } });
    }
  }
  await tx.costCentre.updateMany({ where: { ...org, code: { in: ['CC-BLR-ENG', 'CC-BLR-FIN'] } }, data: { ownerUserId: payroll.id } });

  // ---- teams that fulfil requests ----
  const itTeam = await tx.sdGroup.findFirstOrThrow({ where: { ...org, deskId: it.id, name: 'IT help desk team' } });
  const adminTeam = await tx.sdGroup.create({ data: { ...org, deskId: it.id, name: 'Admin and facilities', assignmentMethod: 'manual' } });
  await tx.sdGroupMember.create({ data: { ...org, deskId: it.id, groupId: adminTeam.id, userId: farah.id, createdBy: admin.id } });
  const hrTeam = await tx.sdGroup.findFirstOrThrow({ where: { ...org, deskId: hr.id, name: 'HR help desk team' } });
  const payrollTeam = await tx.sdGroup.create({ data: { ...org, deskId: hr.id, name: 'Payroll', assignmentMethod: 'round_robin' } });
  await tx.sdGroupMember.create({ data: { ...org, deskId: hr.id, groupId: payrollTeam.id, userId: hrUser.id, createdBy: admin.id } });
  const cat = async (deskId: string, name: string) => (await tx.sdCategory.findFirstOrThrow({ where: { ...org, deskId, name } })).id;

  // ---- the question library (US-G-039) ----
  const deliveryFields = [
    { key: 'deliver_to', type: 'location', label: 'Deliver to', labels: { hi: 'कहाँ पहुँचाएँ' }, required: true },
    { key: 'floor_desk', type: 'text', label: 'Floor and desk', help: 'For example: 3rd floor, desk 14', max: 60 },
  ];
  await tx.sdQuestionnaire.create({ data: { ...org, name: 'Delivery details', description: 'Where to bring a device or a document.', fields: json(parseForm({ sections: [{ id: 'q', columns: 1, fields: deliveryFields }] }).sections[0].fields), createdBy: admin.id } });

  const item = async (deskId: string, categoryId: string, x: { name: string; shortText: string; cost?: number; deliveryDays: number; bodyHtml: string; media?: unknown[]; form: unknown; approval: unknown[]; fulfilment: unknown[]; sortOrder: number }) => {
    const form = parseForm(x.form);
    const steps = parseSteps(x.approval, [...formSchemaKeys(form), { key: 'quantity', label: 'Quantity', type: 'number' }, { key: 'total_cost', label: 'Total cost', type: 'money' }]);
    const draft = { bodyHtml: cleanHtml(x.bodyHtml), media: x.media ?? [], form, approval: steps, fulfilment: x.fulfilment };
    const row = await tx.sdCatalogItem.create({ data: { ...org, deskId, categoryId, name: x.name, shortText: x.shortText, state: 'published', currentVersion: 1, cost: x.cost ?? null, deliveryDays: x.deliveryDays, sortOrder: x.sortOrder, draft: json(draft), createdBy: admin.id } });
    await tx.sdCatalogItemVersion.create({ data: { ...org, deskId, itemId: row.id, version: 1, bodyHtml: draft.bodyHtml, media: json(draft.media), form: json(form), approval: json(steps), fulfilment: json(x.fulfilment), publishedBy: admin.id } });
    return row;
  };

  // ---- IT: New laptop (manager + cost-centre owner, a bundle for the IT and Admin teams) ----
  const laptop = await item(it.id, await cat(it.id, 'Laptop and devices'), {
    name: 'New laptop',
    shortText: 'A new work laptop, set up with your apps and delivered to your desk.',
    cost: 85000,
    deliveryDays: 5,
    sortOrder: 1,
    bodyHtml: '<p>Choose the standard laptop for office work, or the developer laptop if you build or test software.</p><ul><li>Your manager approves first, then the owner of the cost centre that pays for it.</li><li>IT sets it up; the Admin team brings it to your desk and collects your old laptop.</li></ul>',
    media: [{ kind: 'document', title: 'Laptop models and what they include', url: 'https://kaverifoods.example/it/laptops.pdf' }],
    form: {
      sections: [
        {
          id: 'laptop',
          title: 'Your laptop',
          columns: 2,
          fields: [
            { key: 'model', type: 'choice', label: 'Model', labels: { hi: 'मॉडल' }, required: true, options: [{ value: 'standard', label: 'Standard 14 inch', colour: 'blue' }, { value: 'developer', label: 'Developer 16 inch', colour: 'purple' }] },
            { key: 'os', type: 'choice', label: 'System', required: true, dependsOn: 'model', options: [{ value: 'windows', label: 'Windows' }, { value: 'macos', label: 'macOS' }, { value: 'linux', label: 'Linux' }], optionsBy: { standard: ['windows'], developer: ['windows', 'macos', 'linux'] } },
            { key: 'reason', type: 'textarea', label: 'Why do you need the developer laptop?', width: 'full' },
            { key: 'cost_centre', type: 'cost_centre', label: 'Cost centre that pays', required: true },
            { key: 'needed_by', type: 'date', label: 'Needed by' },
            { key: 'accessories', type: 'multi_choice', label: 'Also send', options: [{ value: 'mouse', label: 'Mouse' }, { value: 'headset', label: 'Headset' }, { value: 'bag', label: 'Laptop bag' }] },
          ],
        },
        { id: 'delivery', title: 'Delivery', columns: 2, fields: deliveryFields },
      ],
      rules: [{ id: 'dev', when: { id: 'w', join: 'and', items: [{ id: 'c', field: 'model', operator: 'is', value: 'developer' }] }, then: [{ action: 'show', field: 'reason' }, { action: 'require', field: 'reason' }] }],
    },
    approval: [
      { name: 'Your manager', approvers: [{ kind: 'manager', level: 1 }], mode: 'any', remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate' },
      { name: 'Cost-centre owner', approvers: [{ kind: 'cost_centre_owner', field: 'cost_centre' }], mode: 'any', remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate' },
    ],
    fulfilment: [
      { title: 'Prepare and set up the laptop', groupId: itTeam.id, olaHours: 16 },
      { title: 'Deliver the laptop and collect the old one', groupId: adminTeam.id, olaHours: 24 },
    ],
  });

  // ---- IT: Access to a shared folder (manager approves) ----
  const folder = await item(it.id, await cat(it.id, 'Access and accounts'), {
    name: 'Access to a shared folder',
    shortText: 'Read or edit access to a team folder on the shared drive.',
    deliveryDays: 1,
    sortOrder: 2,
    bodyHtml: '<p>Tell us which folder and what you need to do there. Your manager approves; IT gives the access the same day.</p>',
    form: {
      sections: [
        {
          id: 'access',
          columns: 1,
          fields: [
            { key: 'folder', type: 'text', label: 'Folder name or path', required: true, max: 200 },
            { key: 'access', type: 'choice', label: 'Access', required: true, options: [{ value: 'read', label: 'Read only', colour: 'green' }, { value: 'edit', label: 'Read and edit', colour: 'amber' }] },
            { key: 'until', type: 'date', label: 'Until (leave empty if ongoing)' },
          ],
        },
      ],
      rules: [],
    },
    approval: [{ name: 'Your manager', approvers: [{ kind: 'manager', level: 1 }], mode: 'any', remindAfterHours: 8, timeoutHours: 48, onTimeout: 'escalate' }],
    fulfilment: [{ title: 'Give the folder access', groupId: itTeam.id, olaHours: 4 }],
  });

  // ---- HR: Address proof letter (no approval) ----
  await item(hr.id, await cat(hr.id, 'Letters and documents'), {
    name: 'Address proof letter',
    shortText: 'A signed letter with your home address, for a bank, a visa or a landlord.',
    deliveryDays: 2,
    sortOrder: 1,
    bodyHtml: '<p>HR prepares the letter from your address in YukthiX HR and signs it. Check your address under <strong>Me › Personal details</strong> first.</p>',
    form: {
      sections: [
        {
          id: 'letter',
          columns: 2,
          fields: [
            { key: 'purpose', type: 'choice', label: 'For', required: true, options: [{ value: 'bank', label: 'A bank' }, { value: 'visa', label: 'A visa' }, { value: 'rental', label: 'A landlord' }, { value: 'other', label: 'Something else' }] },
            { key: 'addressed_to', type: 'text', label: 'Address the letter to', help: 'For example: The Branch Manager, State Bank of India, Koramangala', max: 200 },
            { key: 'copies', type: 'number', label: 'Copies', min: 1, max: 3 },
            { key: 'format', type: 'choice', label: 'How', required: true, options: [{ value: 'email', label: 'Signed PDF by email' }, { value: 'printed', label: 'Printed and signed' }] },
          ],
        },
      ],
      rules: [{ id: 'other', when: { id: 'w', join: 'and', items: [{ id: 'c', field: 'purpose', operator: 'is', value: 'other' }] }, then: [{ action: 'require', field: 'addressed_to' }] }],
    },
    approval: [],
    fulfilment: [{ title: 'Prepare and sign the address proof letter', groupId: hrTeam.id, olaHours: 24 }],
  });

  // ---- the order guide (US-G-041) ----
  const guideForm = parseForm({
    sections: [{ id: 'g', columns: 1, fields: [{ key: 'role', type: 'choice', label: 'What will you mostly do?', required: true, options: [{ value: 'engineering', label: 'Build or test software' }, { value: 'office', label: 'Office work' }] }] }],
  });
  await tx.sdOrderGuide.create({
    data: {
      ...org,
      name: 'Starting at Kaveri Foods',
      description: 'Answer one question and we add what new joiners usually need.',
      form: json(guideForm),
      rules: json([
        { id: 'eng', when: parseGroup({ id: 'w1', join: 'and', items: [{ id: 'c1', field: 'role', operator: 'is', value: 'engineering' }] }, [{ key: 'role', label: 'Role', type: 'choice', options: [{ value: 'engineering', label: 'e' }, { value: 'office', label: 'o' }] }]), itemIds: [laptop.id, folder.id] },
        { id: 'office', when: parseGroup({ id: 'w2', join: 'and', items: [{ id: 'c2', field: 'role', operator: 'is', value: 'office' }] }, [{ key: 'role', label: 'Role', type: 'choice', options: [{ value: 'engineering', label: 'e' }, { value: 'office', label: 'o' }] }]), itemIds: [laptop.id] },
      ]),
      createdBy: admin.id,
    },
  });

  // ---- one automation rule (SD-2.12): payslip and pay questions go to the Payroll team ----
  const payCat = await cat(hr.id, 'Payslip and pay');
  const rule = await tx.rule.create({ data: { ...org, ownerModule: 'desk', recordType: 'desk.ticket', scopeId: hr.id, name: 'Payroll questions go to the payroll team', description: 'When a ticket in "Payslip and pay" arrives, give it to the Payroll team.', status: 'active', recipeKey: 'payroll_to_payroll_team', createdBy: admin.id } });
  await tx.ruleVersion.create({ data: { ...org, ruleId: rule.id, version: 1, trigger: json({ type: 'created' }), condition: json({ id: 'g', join: 'and', items: [{ id: 'c1', field: 'category', operator: 'one_of', value: [payCat] }] }), actions: json([{ type: 'assign', groupId: payrollTeam.id }]), changeNote: 'From the recipe payroll_to_payroll_team', createdBy: admin.id } });
}

function formSchemaKeys(form: ReturnType<typeof parseForm>) {
  return form.sections.flatMap((s) => s.fields).map((f) => ({ key: f.key, label: f.label, type: (f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'choice' || f.type === 'cost_centre' || f.type === 'location' || f.type === 'person' ? 'choice' : 'text') as 'number' | 'date' | 'choice' | 'text' }));
}
