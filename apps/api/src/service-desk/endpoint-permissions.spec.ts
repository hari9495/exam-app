import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { CalendarFeedController, DeskFilesController, DeskSetupController, DeskTicketsController, DeskWorkController, MyTicketsController } from './service-desk.controller';
import { STEP_UP_REQUIRED } from '../auth/step-up.decorator';
import { DeskChannelsController, InboundMailController, PortalController } from './channels.controller';
import { checkFile, safeName } from './attachments.service';
import { EICAR_TEST_STRING, DevFakeScanner, scannerFromEnv } from './scanner';

// M14 §15.1 permission guard: every staff desk endpoint declares a key (YX-SEC-01). The only exceptions are the
// requester's own records (implicit, YX-SD-16) and the signed file link, listed here by name.
const handlers = (controller: { prototype: object }) => {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && typeof proto[m] === 'function' && Reflect.getMetadata(PATH_METADATA, proto[m] as object) !== undefined);
};
const undeclared = (controller: { prototype: object }) => {
  const proto = controller.prototype as Record<string, unknown>;
  return handlers(controller).filter((m) => !Reflect.getMetadata(PERMISSIONS_KEY, proto[m] as object)?.length && !Reflect.getMetadata(PERMISSIONS_ANY_KEY, proto[m] as object)?.length);
};

describe('every Service Desk endpoint declares a permission (YX-SEC-01)', () => {
  it.each([DeskSetupController, DeskTicketsController, DeskWorkController, DeskChannelsController])('%p', (controller) => {
    expect(handlers(controller).length).toBeGreaterThan(5);
    expect(undeclared(controller)).toEqual([]);
  });

  it('only the requester routes and the signed file link are implicit', () => {
    expect(undeclared(MyTicketsController).sort()).toEqual(['banners', 'desks', 'get', 'link', 'list', 'meToo', 'raise', 'reply', 'upload', 'watch']);
    expect(undeclared(DeskFilesController)).toEqual(['download']);
    // The iCal feed: no session, the secret in the link is the key (US-G-009).
    expect(undeclared(CalendarFeedController)).toEqual(['feed']);
    // SD-1.19: the provider's webhook (signed per mailbox, no session).
    expect(undeclared(InboundMailController)).toEqual(['receive']);
    // SD-1.22: the outside portal (Turnstile, one-time codes, then its own session; never a staff key).
    expect(undeclared(PortalController).sort()).toEqual(['confirm', 'get', 'info', 'list', 'me', 'meToo', 'raise', 'reply', 'request', 'signIn', 'signOut', 'verify']);
  });

  it('showing a masked value needs step-up (YX-SD-15)', () => {
    expect(Reflect.getMetadata(STEP_UP_REQUIRED, DeskWorkController.prototype.unmask)).toBe(true);
  });

  it('a new webhook secret for a mailbox needs step-up (SD-1.19)', () => {
    expect(Reflect.getMetadata(STEP_UP_REQUIRED, DeskChannelsController.prototype.rotate)).toBe(true);
  });
});

describe('attachment checks (§14.2, US-G-031)', () => {
  const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const allowed = ['pdf', 'png', 'jpg', 'txt', 'zip'];

  it('accepts a real file of an allowed type', async () => {
    expect(await checkFile('Report.PDF', pdf, allowed, 10)).toEqual({ ok: true, contentType: 'application/pdf' });
    expect(await checkFile('shot.png', png, allowed, 10)).toMatchObject({ ok: true, contentType: 'image/png' });
    expect(await checkFile('notes.txt', Buffer.from('plain words, ಕನ್ನಡ too'), allowed, 10)).toEqual({ ok: true, contentType: 'text/plain' });
  });

  it('refuses types off the list, renamed files, binary text, big files and locked archives', async () => {
    expect((await checkFile('setup.exe', Buffer.from('MZ...'), allowed, 10)).ok).toBe(false);
    expect(await checkFile('invoice.pdf', png, allowed, 10)).toMatchObject({ ok: false, reason: expect.stringMatching(/does not match/) });
    expect((await checkFile('notes.txt', pdf, allowed, 10)).ok).toBe(false);
    expect((await checkFile('notes.txt', Buffer.from([0x61, 0x00, 0x62]), allowed, 10)).ok).toBe(false);
    expect((await checkFile('big.pdf', Buffer.concat([pdf, Buffer.alloc(2 * 1024 * 1024)]), allowed, 1)).reason).toMatch(/up to 1 MB/);
    expect((await checkFile('noext', pdf, allowed, 10)).ok).toBe(false);
    // A ZIP whose entry has the "encrypted" flag set.
    const zip = Buffer.alloc(40);
    zip.write('PK\u0003\u0004', 0, 'latin1');
    zip.writeUInt16LE(0x14, 4);
    zip.writeUInt16LE(1, 6);
    expect(await checkFile('secret.zip', zip, allowed, 10)).toMatchObject({ ok: false, reason: expect.stringMatching(/Password-protected/) });
  });

  it('keeps only a safe display name', () => {
    expect(safeName('..\\..\\C:/evil/"x\u0007.pdf')).toBe('x.pdf');
    expect(safeName('')).toBe('file');
  });
});

describe('virus scanner choice (§14.2)', () => {
  it('the dev fake knows only EICAR and is refused in production; no scanner means files stay pending', async () => {
    const quiet = { warn: () => undefined } as never;
    expect(await new DevFakeScanner().scan(Buffer.from(`x${EICAR_TEST_STRING}x`))).toMatchObject({ verdict: 'infected' });
    expect(await new DevFakeScanner().scan(Buffer.from('hello'))).toMatchObject({ verdict: 'clean' });
    expect(() => scannerFromEnv({ SD_SCANNER: 'dev-fake', NODE_ENV: 'production' }, quiet)).toThrow(/laptops only/);
    expect(scannerFromEnv({}, quiet)).toBeNull();
    expect(scannerFromEnv({ SD_CLAMD_HOST: 'clamav' }, quiet)?.name).toBe('clamd');
  });
});

describe("the requester's routes refuse anyone acting for someone else (review fix)", () => {
  it('impersonation and YukthiX support sessions get 403, the person themselves gets through', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RequesterService } = require('./requester.service');
    const svc = new RequesterService({} as never, {} as never, {} as never);
    const tenant = { organizationId: 'o1', isSuperAdmin: false };
    const req = (user: object) => ({ user }) as never;
    expect(() => svc.who(req({ userId: 'u1', role: 'panel', impersonatorUserId: 'staff' }), tenant)).toThrow(/acting for someone else/);
    expect(() => svc.who(req({ userId: 'u1', role: 'super_admin', actingSuperAdmin: true }), tenant)).toThrow(/acting for someone else/);
    expect(svc.who(req({ userId: 'u1', role: 'panel' }), tenant)).toMatchObject({ userId: 'u1', acting: false });
  });
});
