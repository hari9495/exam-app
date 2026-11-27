import { BadRequestException } from '@nestjs/common';
import { checkDestination, csvCell, exportDue, toCsv } from './scheduled-export.service';

// T2-G 45 (answer 2744): the scheduled export's pure rules. Fake values only.
const now = new Date('2026-11-27T20:30:00Z');
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
const PASS = 'a-long-zip-password';

describe('exportDue', () => {
  it('weekly: due with no run yet, or when the last good run is a week old', () => {
    expect(exportDue('weekly', null, null, now)).toBe(true);
    expect(exportDue('weekly', ago(7 * 24), ago(7 * 24), now)).toBe(true);
    expect(exportDue('daily', ago(24), ago(24), now)).toBe(true);
  });
  it('not due when off, too soon, or tried in the last 20 hours after a failure', () => {
    expect(exportDue('off', null, null, now)).toBe(false);
    expect(exportDue('weekly', ago(3 * 24), ago(3 * 24), now)).toBe(false);
    expect(exportDue('monthly', ago(20 * 24), ago(20 * 24), now)).toBe(false);
    expect(exportDue('weekly', ago(10 * 24), ago(2), now)).toBe(false);
  });
});

describe('toCsv', () => {
  it('writes a header and quotes what needs it; formula-looking text is made safe', () => {
    expect(toCsv([{ a: 'x,y', b: null, c: new Date('2026-01-02T00:00:00Z') }, { a: '=SUM(A1)', b: 3n, c: { k: 1 } }])).toBe('a,b,c\r\n"x,y",,2026-01-02T00:00:00.000Z\r\n\'=SUM(A1),3,"{""k"":1}"\r\n');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('checkDestination', () => {
  it('accepts each kind and never puts the secret in the label', () => {
    const s3 = checkDestination({ kind: 's3', bucket: 'kaveri-backups', region: 'ap-south-1', prefix: 'yukthix/', accessKeyId: 'AKIAFAKEFAKEFAKE0000', secretAccessKey: 'fake/secret/value/0000000000', zipPassword: PASS });
    expect(s3.label).toBe('s3://kaveri-backups/yukthix/');
    expect(JSON.stringify(s3.target)).not.toContain('fake/secret');
    expect(checkDestination({ kind: 'azure_blob', accountName: 'kaverifoods', container: 'yukthix-exports', accountKey: 'ZmFrZWtleWZha2VrZXlmYWtla2V5ZmFrZWtleWZha2VrZXk=', zipPassword: PASS }).label).toBe('kaverifoods/yukthix-exports/');
    const key = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(200)}\n-----END PRIVATE KEY-----`;
    expect(checkDestination({ kind: 'google_drive', folderId: '1AbCdEfGhIjKlMn', clientEmail: 'exports@kaveri-hr.iam.gserviceaccount.com', privateKey: key, zipPassword: PASS }).label).toBe('Drive folder 1AbCdEfGhIjKlMn');
  });
  it('refuses a short zip password, a bad bucket, a path with .., a non-service-account email and an unknown kind', () => {
    const base = { kind: 's3' as const, bucket: 'kaveri-backups', region: 'ap-south-1', accessKeyId: 'AKIAFAKEFAKEFAKE0000', secretAccessKey: 'fake/secret/value/0000000000', zipPassword: PASS };
    expect(() => checkDestination({ ...base, zipPassword: 'short' })).toThrow(BadRequestException);
    expect(() => checkDestination({ ...base, bucket: 'Bad_Bucket' })).toThrow('bucket');
    expect(() => checkDestination({ ...base, prefix: '../other' })).toThrow('folder path');
    expect(() => checkDestination({ kind: 'google_drive', folderId: '1AbCdEfGhIjKlMn', clientEmail: 'me@gmail.com', privateKey: 'x', zipPassword: PASS })).toThrow('service account');
    expect(() => checkDestination({ kind: 'ftp' as never, zipPassword: PASS })).toThrow('Choose');
  });
});
