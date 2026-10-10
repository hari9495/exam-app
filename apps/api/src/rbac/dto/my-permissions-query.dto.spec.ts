import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MyPermissionsQueryDto } from './my-permissions-query.dto';

// The YukthiX menu asks which of its keys a person holds in one call; batch 4 of the Service Desk took it past 30
// keys, which once refused the whole menu (review fix); lifecycle 6b took it past 60. Up to 120 pass; more, or anything
// that is not a key, do not.
describe('GET /rbac/me/permissions keys', () => {
  const check = (keys: string) => validateSync(plainToInstance(MyPermissionsQueryDto, { keys }));
  const list = (n: number) => Array.from({ length: n }, (_, i) => `desk.key_${String.fromCharCode(97 + (i % 26))}.view`).join(',');
  it('takes the menu keys (about 65) and up to 120', () => {
    expect(check(list(65))).toHaveLength(0);
    expect(check(list(120))).toHaveLength(0);
  });
  it('refuses more than 120, or something that is not a key', () => {
    expect(check(list(121)).length).toBeGreaterThan(0);
    expect(check('desk.ticket.view,DROP TABLE').length).toBeGreaterThan(0);
  });
});
