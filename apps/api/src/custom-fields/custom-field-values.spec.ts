import { BadRequestException } from '@nestjs/common';
import { coerceCustomFieldValue, upsertCustomFieldValues, serializeCustomFieldValues, CustomFieldDefinitionLite } from './custom-field-values';

const textDef: CustomFieldDefinitionLite = { id: 'd1', key: 'visa', label: 'Visa', fieldType: 'text', optionsJson: null, required: false };
const numDef: CustomFieldDefinitionLite = { id: 'd2', key: 'years', label: 'Years', fieldType: 'number', optionsJson: null, required: true };
const dateDef: CustomFieldDefinitionLite = { id: 'd3', key: 'avail', label: 'Available', fieldType: 'date', optionsJson: null, required: false };
const selDef: CustomFieldDefinitionLite = { id: 'd4', key: 'source', label: 'Source', fieldType: 'select', optionsJson: JSON.stringify(['LinkedIn', 'Referral']), required: false };

describe('coerceCustomFieldValue', () => {
  it('text: stores trimmed string in valueText', () => {
    expect(coerceCustomFieldValue(textDef, '  H1B ')).toEqual({ valueText: 'H1B', valueNumber: null, valueDate: null, isEmpty: false });
  });
  it('text: empty string is empty', () => {
    expect(coerceCustomFieldValue(textDef, '').isEmpty).toBe(true);
  });
  it('number: accepts numeric string and number', () => {
    expect(coerceCustomFieldValue(numDef, '5').valueNumber).toBe(5);
    expect(coerceCustomFieldValue(numDef, 3.5).valueNumber).toBe(3.5);
  });
  it('number: rejects non-numeric', () => {
    expect(() => coerceCustomFieldValue(numDef, 'abc')).toThrow(BadRequestException);
  });
  it('date: parses YYYY-MM-DD', () => {
    const r = coerceCustomFieldValue(dateDef, '2026-01-15');
    expect(r.valueDate?.toISOString().slice(0, 10)).toBe('2026-01-15');
  });
  it('date: rejects garbage', () => {
    expect(() => coerceCustomFieldValue(dateDef, 'not-a-date')).toThrow(BadRequestException);
  });
  it('select: accepts a current option', () => {
    expect(coerceCustomFieldValue(selDef, 'Referral').valueText).toBe('Referral');
  });
  it('select: rejects a non-option', () => {
    expect(() => coerceCustomFieldValue(selDef, 'Twitter')).toThrow(BadRequestException);
  });
});

describe('upsertCustomFieldValues', () => {
  function fakeTx() {
    const calls: any[] = [];
    return {
      calls,
      customFieldValue: {
        deleteMany: jest.fn((args) => { calls.push(['deleteMany', args]); return Promise.resolve({ count: 1 }); }),
        upsert: jest.fn((args) => { calls.push(['upsert', args]); return Promise.resolve({}); }),
      },
    } as any;
  }

  it('enforces required across the passed definitions', async () => {
    const tx = fakeTx();
    await expect(
      upsertCustomFieldValues(tx, 'org1', 'candidate', 'c1', [numDef], {}),
    ).rejects.toThrow(BadRequestException);
  });
  it('rejects an unknown definition id', async () => {
    const tx = fakeTx();
    await expect(
      upsertCustomFieldValues(tx, 'org1', 'candidate', 'c1', [textDef], { unknownId: 'x', d2: '1' }),
    ).rejects.toThrow(BadRequestException);
  });
  it('upserts provided values and deletes cleared ones', async () => {
    const tx = fakeTx();
    await upsertCustomFieldValues(tx, 'org1', 'candidate', 'c1', [textDef, numDef], { d1: 'H1B', d2: '5' });
    expect(tx.customFieldValue.upsert).toHaveBeenCalledTimes(2);
  });
  it('clearing a value deletes its row (no upsert)', async () => {
    const tx = fakeTx();
    await upsertCustomFieldValues(tx, 'org1', 'candidate', 'c1', [textDef], { d1: '' });
    expect(tx.customFieldValue.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.customFieldValue.upsert).not.toHaveBeenCalled();
  });
});

describe('serializeCustomFieldValues', () => {
  it('maps rows to definitions by type', () => {
    const rows = [
      { definitionId: 'd1', valueText: 'H1B', valueNumber: null, valueDate: null },
      { definitionId: 'd2', valueText: null, valueNumber: 5, valueDate: null },
    ] as any;
    const out = serializeCustomFieldValues(rows, [textDef, numDef]);
    expect(out).toEqual([
      { definitionId: 'd1', key: 'visa', label: 'Visa', fieldType: 'text', value: 'H1B' },
      { definitionId: 'd2', key: 'years', label: 'Years', fieldType: 'number', value: 5 },
    ]);
  });
  it('returns null value for a definition with no row', () => {
    const out = serializeCustomFieldValues([], [textDef]);
    expect(out[0].value).toBeNull();
  });
});
