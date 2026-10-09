import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { AccessController } from './access.controller';
import { PeopleController } from '../people/people.controller';
import { EmployeeHistoryController } from '../employee-history/employee-history.controller';
import { OrgStructureController } from '../org-structure/org-structure.controller';
import { LifecycleController } from '../lifecycle/lifecycle.controller';
import { DocumentsController } from '../documents/documents.controller';
import { LettersController } from '../documents/letters/letters.controller';
import { ExitsController } from '../lifecycle/exits.controller';

// P02 YX-SEC-01: every HR endpoint declares its permission. The only exceptions are the routes open to the
// implicit grants (YX-SEC-04: the person themselves, their managers, colleagues' Public fields) and public
// reference data, listed here by name with the reason; their services decide per record (P02 §4.3).
const IMPLICIT: Record<string, string[]> = {
  PeopleController: [
    'directory', // Public fields for employees (P02 Q4); Internal per HR scope
    'orgChart', // Public fields for employees
    'team', // the manager's own team
    'reports', // HR in scope, the person, managers above
    'person', // HR in scope or the person
    'me', // one's own record
    'accessLog', // who looked at one's own data
    'profile', // classes decided per record
    'reveal', // the person, or identity / Aadhaar keys in scope (checked by the service)
    'updatePersonal', // the person, or employee.profile.edit in scope
    'requestProfileChange', // the person, or employee.identity.manage in scope
    'profileRequests', // own requests and those in scope
    'cancelProfileChange', // the requester or the person
    'probations', // HR in scope, or the manager's team
  ],
  EmployeeHistoryController: ['list', 'asOf', 'timeline'],
  OrgStructureController: ['reference'], // public reference data (states, regions)
  AccessController: [],
  // Lifecycle 6a: the services decide per joiner, checklist, task and document (self, assignee, manager, HR in scope).
  LifecycleController: ['joiningSoon', 'joiner', 'myTasks', 'journey', 'complete', 'skip'],
  DocumentsController: ['types', 'mine', 'upload', 'file'],
  // Batch 6b: my letters and my acceptance; the file route decides per letter (self, or HR in scope).
  LettersController: ['mine', 'file', 'signCode', 'sign', 'certificate'], // 6d: my own instant certificate
  // Batches 6c / 6d: my resignation, interview, assets and clearance items, and my team's probation reviews and exits.
  ExitsController: ['mine', 'resign', 'withdraw', 'myInterview', 'submitInterview', 'myAssets', 'acknowledge', 'review', 'list', 'get', 'myClearance', 'signOff'],
};

describe('every HR endpoint declares a permission (P02 YX-SEC-01)', () => {
  for (const controller of [PeopleController, EmployeeHistoryController, OrgStructureController, AccessController, LifecycleController, DocumentsController, LettersController, ExitsController]) {
    it(`${controller.name}`, () => {
      const proto = controller.prototype as unknown as Record<string, unknown>;
      const handlers = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && typeof proto[m] === 'function' && Reflect.getMetadata(PATH_METADATA, proto[m] as object) !== undefined);
      expect(handlers.length).toBeGreaterThan(0);
      const undeclared = handlers.filter((m) => !Reflect.getMetadata(PERMISSIONS_KEY, proto[m] as object)?.length && !Reflect.getMetadata(PERMISSIONS_ANY_KEY, proto[m] as object)?.length);
      expect(undeclared.sort()).toEqual([...IMPLICIT[controller.name]].sort());
    });
  }
});
