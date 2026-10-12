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
import { PerformanceSetupController } from '../performance/setup.controller';
import { PerformanceGoalsController } from '../performance/goals.controller';
import { PerformanceFeedbackController } from '../performance/feedback.controller';
import { PerformanceReviewsController } from '../performance/reviews.controller';
import { PerformancePeerController } from '../performance/peer.controller';
import { PerformanceCalibrationController } from '../performance/calibration.controller';
import { PerformanceCompController } from '../performance/comp.controller';
import { SpecialCasesController } from '../lifecycle/special-cases.controller';
import { ExpensesController } from '../expenses/expenses.controller';
import { ExpenseClaimsController } from '../expenses/claims.controller';
import { ExpenseTripsController } from '../expenses/trips.controller';
import { ExpenseReportsController } from '../expenses/reports.controller';

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
  EmployeeHistoryController: ['list', 'asOf', 'timeline', 'serviceDates'],
  OrgStructureController: ['reference'], // public reference data (states, regions)
  AccessController: [],
  // Lifecycle 6a: the services decide per joiner, checklist, task and document (self, assignee, manager, HR in scope).
  LifecycleController: ['joiningSoon', 'joiner', 'myTasks', 'firstThirtyDays', 'journey', 'complete', 'skip'],
  DocumentsController: ['types', 'mine', 'upload', 'file'],
  // Batch 6b: my letters and my acceptance; the file route decides per letter (self, or HR in scope).
  LettersController: ['mine', 'file', 'signCode', 'sign', 'certificate'], // 6d: my own instant certificate
  // Batches 6c / 6d: my resignation, interview, assets and clearance items, and my team's probation reviews and exits.
  // Batch 6e: VRS schemes open to me, and applying.
  SpecialCasesController: ['myVrs', 'applyVrs'],
  // M05 E1: everyone who claims reads the categories, tiers and their own limits.
  ExpensesController: ['categories', 'tiers', 'myLimits'],
  // M05 E2: the service decides per claim (claimant, approver whose turn it is, expense.claim.view in scope, finance).
  ExpenseClaimsController: ['home', 'list', 'create', 'get', 'rename', 'receipt', 'addLine', 'updateLine', 'removeLine', 'receiptFile', 'fxProof', 'fxProofFile', 'check', 'submit', 'withdraw', 'approveAmount', 'decide'],
  // E4: the traveller, the approver whose task it is and the travel desk (in scope) are decided per trip or advance.
  ExpenseTripsController: ['list', 'create', 'get', 'update', 'submit', 'cancel', 'addBooking', 'partner', 'removeBooking', 'bookingFile', 'advances', 'request', 'advance', 'amount'],
  ExpenseReportsController: [],
  // M06 PM1: performance set-up is all behind perf.setup.manage.
  PerformanceSetupController: [],
  // PM2: goals are decided per goal (the owner, the manager chain, perf.goal.view in scope).
  PerformanceGoalsController: ['periods', 'list', 'alignOptions', 'get', 'create', 'update', 'submit', 'checkIn', 'drop', 'cascade'],
  // PM3: feedback and 1:1s are decided per item (the two people of a 1:1; giver, recipient, manager chain).
  PerformanceFeedbackController: ['list', 'give', 'withdraw', 'requests', 'request', 'decline', 'meetings', 'createMeeting', 'meeting', 'updateMeeting', 'addAgenda', 'agendaDone', 'privateNote', 'addAction', 'actionDone'],
  // PM4: reviews are decided per review (the person, the manager, the chain above, perf.review.view in scope).
  PerformanceReviewsController: ['list', 'get', 'saveSelf', 'submitSelf', 'saveManager', 'submitManager', 'skipAgree', 'sendBack', 'acknowledge', 'disagree', 'handovers', 'saveOther', 'submitOther'],
  // PM5: nominations and answers are decided per review (the employee, the manager, an approved nominee).
  PerformancePeerController: ['nominations', 'options', 'nominate', 'approve', 'decline', 'withdraw', 'tasks', 'form', 'savePeer', 'submitPeer', 'grouped'],
  // PM6: the board is open to its facilitator, HR and the managers of the people in it (decided per session).
  PerformanceCalibrationController: ['board'],
  // PM7: a manager's own team in a comp cycle, decided per cycle; my own pay band.
  PerformanceCompController: ['cycles', 'sheet', 'updateProposal', 'submit', 'myPayBand'],
  ExitsController: ['mine', 'resign', 'withdraw', 'myInterview', 'submitInterview', 'myAssets', 'acknowledge', 'review', 'list', 'get', 'myClearance', 'signOff'],
};

describe('every HR endpoint declares a permission (P02 YX-SEC-01)', () => {
  for (const controller of [PeopleController, EmployeeHistoryController, OrgStructureController, AccessController, LifecycleController, DocumentsController, LettersController, ExitsController, SpecialCasesController, ExpensesController, ExpenseClaimsController, ExpenseTripsController, ExpenseReportsController, PerformanceSetupController, PerformanceGoalsController, PerformanceFeedbackController, PerformanceReviewsController, PerformancePeerController, PerformanceCalibrationController, PerformanceCompController]) {
    it(`${controller.name}`, () => {
      const proto = controller.prototype as unknown as Record<string, unknown>;
      const handlers = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && typeof proto[m] === 'function' && Reflect.getMetadata(PATH_METADATA, proto[m] as object) !== undefined);
      expect(handlers.length).toBeGreaterThan(0);
      const undeclared = handlers.filter((m) => !Reflect.getMetadata(PERMISSIONS_KEY, proto[m] as object)?.length && !Reflect.getMetadata(PERMISSIONS_ANY_KEY, proto[m] as object)?.length);
      expect(undeclared.sort()).toEqual([...IMPLICIT[controller.name]].sort());
    });
  }
});
