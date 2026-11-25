import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateEasyApplyConfigDto } from './update-easy-apply-config.dto';

// Answer 2631: a set Easy Apply secret is at least 16 characters; blank keeps the stored one; turning off needs none.
const errors = (o: object) => validateSync(plainToInstance(UpdateEasyApplyConfigDto, o)).map((e) => e.property);

describe('UpdateEasyApplyConfigDto', () => {
  it('takes a long secret, a blank one (keep) and turning off', () => {
    expect(errors({ provider: 'indeed', secret: 'a-long-enough-secret' })).toEqual([]);
    expect(errors({ provider: 'indeed', secret: '' })).toEqual([]);
    expect(errors({ provider: 'linkedin', enabled: false })).toEqual([]);
  });
  it('refuses a short secret and an unknown board', () => {
    expect(errors({ provider: 'indeed', secret: 'short' })).toEqual(['secret']);
    expect(errors({ provider: 'monster', secret: 'a-long-enough-secret' })).toEqual(['provider']);
  });
});
