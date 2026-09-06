import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type CustomFieldEntity = 'candidate' | 'job';

export interface CustomFieldDefinitionLite {
  id: string;
  key: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'select';
  optionsJson: string | null;
  required: boolean;
}

export interface CustomFieldRead {
  definitionId: string;
  key: string;
  label: string;
  fieldType: string;
  value: string | number | null;
}

const TEXT_MAX = 4000;

function parseOptions(optionsJson: string | null): string[] {
  if (!optionsJson) return [];
  try {
    const arr = JSON.parse(optionsJson);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function coerceCustomFieldValue(
  def: CustomFieldDefinitionLite,
  raw: unknown,
): { valueText: string | null; valueNumber: number | null; valueDate: Date | null; isEmpty: boolean } {
  const empty = { valueText: null, valueNumber: null, valueDate: null, isEmpty: true };
  if (raw === undefined || raw === null || raw === '') return empty;

  switch (def.fieldType) {
    case 'text': {
      if (typeof raw !== 'string') throw new BadRequestException(`Field "${def.label}" must be text`);
      const v = raw.trim();
      if (v === '') return empty;
      if (v.length > TEXT_MAX) throw new BadRequestException(`Field "${def.label}" is too long`);
      return { valueText: v, valueNumber: null, valueDate: null, isEmpty: false };
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) throw new BadRequestException(`Field "${def.label}" must be a number`);
      return { valueText: null, valueNumber: n, valueDate: null, isEmpty: false };
    }
    case 'date': {
      if (typeof raw !== 'string') throw new BadRequestException(`Field "${def.label}" must be a date`);
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`Field "${def.label}" is not a valid date`);
      return { valueText: null, valueNumber: null, valueDate: d, isEmpty: false };
    }
    case 'select': {
      if (typeof raw !== 'string') throw new BadRequestException(`Field "${def.label}" must be a choice`);
      const v = raw.trim();
      if (v === '') return empty;
      if (!parseOptions(def.optionsJson).includes(v)) throw new BadRequestException(`Field "${def.label}" has an invalid choice`);
      return { valueText: v, valueNumber: null, valueDate: null, isEmpty: false };
    }
    default:
      throw new BadRequestException(`Unsupported field type ${def.fieldType}`);
  }
}

export async function upsertCustomFieldValues(
  tx: Prisma.TransactionClient,
  organizationId: string,
  entityType: CustomFieldEntity,
  entityId: string,
  definitions: CustomFieldDefinitionLite[],
  input: Record<string, unknown>,
): Promise<void> {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  for (const key of Object.keys(input)) {
    if (!byId.has(key)) throw new BadRequestException(`Unknown custom field ${key}`);
  }
  for (const def of definitions) {
    const coerced = coerceCustomFieldValue(def, input[def.id]);
    if (coerced.isEmpty) {
      if (def.required) throw new BadRequestException(`Field "${def.label}" is required`);
      await tx.customFieldValue.deleteMany({ where: { organizationId, definitionId: def.id, entityId } });
      continue;
    }
    await tx.customFieldValue.upsert({
      where: { organizationId_definitionId_entityId: { organizationId, definitionId: def.id, entityId } },
      create: {
        organizationId, definitionId: def.id, entityType, entityId,
        valueText: coerced.valueText, valueNumber: coerced.valueNumber, valueDate: coerced.valueDate,
      },
      update: {
        valueText: coerced.valueText, valueNumber: coerced.valueNumber, valueDate: coerced.valueDate,
        updatedAt: new Date(),
      },
    });
  }
}

export function serializeCustomFieldValues(
  rows: { definitionId: string; valueText: string | null; valueNumber: number | null; valueDate: Date | null }[],
  definitions: CustomFieldDefinitionLite[],
): CustomFieldRead[] {
  const byDef = new Map(rows.map((r) => [r.definitionId, r]));
  return definitions.map((def) => {
    const row = byDef.get(def.id);
    let value: string | number | null = null;
    if (row) {
      if (def.fieldType === 'number') value = row.valueNumber;
      else if (def.fieldType === 'date') value = row.valueDate ? row.valueDate.toISOString().slice(0, 10) : null;
      else value = row.valueText;
    }
    return { definitionId: def.id, key: def.key, label: def.label, fieldType: def.fieldType, value };
  });
}
