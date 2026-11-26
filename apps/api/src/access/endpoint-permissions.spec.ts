import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { AccessController } from './access.controller';
import { PeopleController } from '../people/people.controller';
import { EmployeeHistoryController } from '../employee-history/employee-history.controller';
import { OrgStructureController } from '../org-structure/org-structure.controller';
import { LifecycleController } from '../lifecycle/lifecycle.controller';
import { DocumentsController } from '../documents/documents.controller';
import { ReverificationController } from '../documents/reverification.controller';
import { LettersController } from '../documents/letters/letters.controller';
import { ExitsController } from '../lifecycle/exits.controller';
import { PerformanceSetupController } from '../performance/setup.controller';
import { PerformanceGoalsController } from '../performance/goals.controller';
import { PerformanceFeedbackController } from '../performance/feedback.controller';
import { PerformanceReviewsController } from '../performance/reviews.controller';
import { PerformancePeerController } from '../performance/peer.controller';
import { PerformanceCalibrationController } from '../performance/calibration.controller';
import { PerformanceCompController } from '../performance/comp.controller';
import { PerformancePipsController } from '../performance/pips.controller';
import { PerformanceHomeController } from '../performance/home.controller';
import { PerformanceB3Controller } from '../performance/b3.controller';
import { SpecialCasesController } from '../lifecycle/special-cases.controller';
import { ExpensesController } from '../expenses/expenses.controller';
import { ExpenseClaimsController } from '../expenses/claims.controller';
import { ExpenseTripsController } from '../expenses/trips.controller';
import { ExpenseReportsController } from '../expenses/reports.controller';
import { EmployeeImportController } from '../people/employee-import.controller';
import { PeopleRegistersController } from '../lifecycle/people-registers.controller';
import { RestructureController } from '../people/restructure.controller';
import { PositionsController } from '../positions/positions.controller';
import { PersonPanelsController } from '../people/person-panels.controller';
import { BfsiController } from '../people/bfsi.controller';
import { MyPoliciesController, PoliciesAdminController } from '../policies/policies.controller';
import { SpeakupController } from '../speakup/speakup.controller';
import { AnnouncementsController, ModerationController, MyEngageController, SurveysController } from '../engage/engage.controller';
import { CasesController, EthicsController, MisconductReportsController, MyCasesController } from '../cases/cases.controller';
import { LearningController } from '../learning/learning.controller';
import { LibraryController } from '../library/library.controller';
import { ApprovalPoliciesController } from '../workflow/approval-policies.controller';
import { TimeController } from '../time/time.controller';
import { TimeOpsController } from '../time/time-ops.controller';

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
    'emergencyContacts', // the person, or HR with employee.profile.edit
    'customFields', // each value only where its class lets the viewer see it
    'setCustomFields', // the service checks each field's class and the editing grant
    'updateFamily', // HR with employee.profile.edit in scope (the service checks)
    'me', // one's own record
    'accessLog', // who looked at one's own data
    'myChangeForm', // one's own identity and bank change page (PPL-32)
    'myData', // one's own data as a file (PPL-33)
    'myNominee', // one's own nominee for one's data rights (PPL-33)
    'setNominee',
    'removeNominee',
    'paySplit', // the person, or employee.identity.manage in scope (PPL-46; checked by the service)
    'profile', // classes decided per record
    'reveal', // the person, or identity / Aadhaar keys in scope (checked by the service)
    'updatePersonal', // the person, or employee.profile.edit in scope
    'requestProfileChange', // the person, or employee.identity.manage in scope
    'profileRequests', // own requests and those in scope
    'cancelProfileChange', // the requester or the person
    'probations', // HR in scope, or the manager's team
    'activity', // anyone who may open the record; each kind of entry by its own key (checked by the service)
    'workPhone', // employee.profile.edit in scope (checked by the service)
  ],
  EmployeeHistoryController: ['list', 'asOf', 'timeline', 'serviceDates'],
  OrgStructureController: ['reference'], // public reference data (states, regions)
  AccessController: [],
  // PPL-34 on: the person record's panels, each with its class's key (the service checks scope per person).
  PersonPanelsController: ['myDisability', 'declareDisability', 'withdrawDisability'], // one's own disability declaration (PPL-38)
  // PPL-43: a designated person's own declaration (the service checks the designation).
  BfsiController: ['myBfsi', 'addHolding', 'removeHolding', 'addRelated', 'removeRelated', 'saveCoi', 'submitBfsi', 'myPreclearance', 'requestPreclearance', 'reportTrade'],
  // Lifecycle 6a: the services decide per joiner, checklist, task and document (self, assignee, manager, HR in scope).
  LifecycleController: ['joiningSoon', 'joiner', 'myTasks', 'firstThirtyDays', 'journey', 'complete', 'skip'],
  ReverificationController: ['forPerson'], // PPL-42: the person, HR in scope or the manager (decided by the service)
  // PPL-03: a manager's read-only view of the team's Public and Internal documents.
  // PPL-30: share links to my own issued letters and pay documents (the service refuses anyone else's).
  DocumentsController: ['types', 'mine', 'upload', 'file', 'forTeam', 'myShares', 'share', 'revokeShare'],
  // Batch 6b: my letters and my acceptance; the file route decides per letter (self, or HR in scope).
  LettersController: ['mine', 'file', 'signCode', 'sign', 'certificate', 'certificates'], // 6d / PPL-31: my own certificates
  // Batches 6c / 6d: my resignation, interview, assets and clearance items, and my team's probation reviews and exits.
  // Batch 6e: VRS schemes open to me, and applying.
  SpecialCasesController: ['myVrs', 'applyVrs'],
  // M05 E1: everyone who claims reads the categories, tiers and their own limits.
  ExpensesController: ['categories', 'tiers', 'myLimits'],
  // M05 E2: the service decides per claim (claimant, approver whose turn it is, expense.claim.view in scope, finance).
  // Saved expenses (Keka ideas): the person's own only; the service matches the employee and their own draft claim.
  ExpenseClaimsController: ['home', 'list', 'create', 'get', 'rename', 'receipt', 'addLine', 'updateLine', 'removeLine', 'receiptFile', 'fxProof', 'fxProofFile', 'check', 'submit', 'withdraw', 'approveAmount', 'decide', 'myItems', 'addItem', 'removeItem', 'claimItems', 'mine'], // mine: batch E, my own claims
  // E4: the traveller, the approver whose task it is and the travel desk (in scope) are decided per trip or advance.
  ExpenseTripsController: ['list', 'create', 'get', 'update', 'submit', 'cancel', 'addBooking', 'partner', 'removeBooking', 'bookingFile', 'advances', 'request', 'advance', 'amount'],
  ExpenseReportsController: [],
  // M06 PM1: performance set-up is all behind perf.setup.manage.
  PerformanceSetupController: [],
  // PRF-01: the home; each part is the viewer's own, their team's, or HR's with perf.cycle.manage (checked by the service).
  PerformanceHomeController: ['home'],
  // PM2: goals are decided per goal (the owner, the manager chain, perf.goal.view in scope).
  PerformanceGoalsController: ['periods', 'list', 'alignOptions', 'get', 'create', 'update', 'submit', 'decide', 'checkIn', 'drop', 'cascade', 'teamGaps', 'remindGap'], // batch F item 30: the manager's own team, checked in the service
  // One's own learning, the manager's team, a person's Learning tab (self, team or learning.report.view in scope).
  // G4: the report library (entries follow their area's keys) and company documents (the service decides per folder).
  LibraryController: ['reports', 'favourite', 'documents', 'file', 'schedulesList', 'schedule', 'endSchedule'],
  LearningController: ['me', 'mySkills', 'teamSkills', 'personSkills', 'assessSkill', 'decideSkill', 'addOwnSkill', 'raiseTeamNeed', 'feedbackDue', 'react', 'checks', 'check', 'roles', 'external', 'sessionList', 'upcoming', 'sessionPage', 'nominate', 'checkinCode', 'closeCheckin', 'mark', 'checkIn', 'decline', 'enrol', 'player', 'markDone', 'scormSave', 'itemFile', 'certificatePdf', 'team', 'person'],
  // PM3: feedback and 1:1s are decided per item (the two people of a 1:1; giver, recipient, manager chain).
  // counts: the record's Performance tab, counts only; the service checks who may ask.
  PerformanceFeedbackController: ['list', 'give', 'withdraw', 'requests', 'request', 'decline', 'meetings', 'createMeeting', 'meeting', 'updateMeeting', 'addAgenda', 'agendaDone', 'privateNote', 'addAction', 'actionDone', 'counts', 'goalOptions', 'myNotes', 'addNote', 'editNote', 'deleteNote'], // batch F item 32: the author alone (service and RLS)
  // PM4: reviews are decided per review (the person, the manager, the chain above, perf.review.view in scope); pdf: the same
  // view as a file (PRF-05 / PRF-06).
  PerformanceReviewsController: ['list', 'get', 'pdf', 'saveSelf', 'submitSelf', 'saveManager', 'submitManager', 'skipAgree', 'sendBack', 'acknowledge', 'disagree', 'handovers', 'saveOther', 'submitOther'],
  // PM5: nominations and answers are decided per review (the employee, the manager, an approved nominee).
  PerformancePeerController: ['nominations', 'options', 'nominate', 'send', 'approveAll', 'approve', 'decline', 'withdraw', 'tasks', 'form', 'savePeer', 'submitPeer', 'grouped'],
  // PM6: the board is open to its facilitator, HR and the managers of the people in it (decided per session).
  PerformanceCalibrationController: ['board'],
  // PM7: a manager's own team in a comp cycle, decided per cycle; my own pay band.
  PerformanceCompController: ['cycles', 'sheet', 'updateProposal', 'submit', 'myPayBand', 'decide'], // decide: the holder of an approval task of the cycle (PRF-10)
  // PM8: a plan is about one person; the person, their manager chain and HR in scope, decided per plan.
  PerformancePipsController: ['list', 'propose', 'get', 'acknowledge', 'checkin'],
  // PRF-13: the new manager's own hand-overs (or HR, checked again); PRF-15: the employee's own dispute; PRF-16: my coach
  // card and the 1:1's manager; PRF-17: the review's current manager. The service decides per record (404 otherwise).
  PerformanceB3Controller: ['handoverMine', 'handoverOptions', 'handoverDecide', 'myDispute', 'raise', 'addFile', 'coach', 'optOut', 'dismiss', 'agenda', 'assistant', 'draft', 'check', 'flag'],
  // People › Import, buddies, union register and succession: every route has its key.
  EmployeeImportController: [],
  PoliciesAdminController: [],
  // HLP-06: the form and one's own named report; cases: being routed to the case is the access (404 otherwise).
  SpeakupController: ['form', 'file', 'addFile', 'cases', 'caseDetail', 'teamReply', 'icCommittee', 'logAwareness', 'annualReportStep'], // IC routes: committee members only (404 otherwise); the report steps need the presiding officer (403)
  // HLP-07/08/09: membership of the case is the access (404 otherwise); My cases is one's own part.
  CasesController: ['list', 'detail', 'message', 'notice', 'delay', 'moreTime', 'propose', 'approve', 'sendBack', 'icReport', 'vote', 'sign', 'relief', 'reliefDone', 'recuse', 'addMember', 'upload', 'file', 'letter'],
  EthicsController: ['reports', 'severity', 'route'],
  MyCasesController: ['mine', 'one', 'message', 'reply', 'moreTime', 'upload', 'file'],
  // HLP-08 answer 55: a manager about their own reports (the reporting line is the access).
  MisconductReportsController: ['mine', 'people', 'file'],
  MyPoliciesController: ['mine', 'one', 'myFile', 'code', 'acknowledge'], // HLP-10: one's own policies (audience checked per policy)
  PeopleRegistersController: [],
  RestructureController: [],
  PositionsController: [],
  // E2: approval rules, limits, "Try it", the hiring move and notices; every route has its key (pay types also check
  // the pay approve key inside).
  ApprovalPoliciesController: [],
  // Batch G2 item 12: announcements need engage.announce; the feed is one's own (audience checked per announcement).
  AnnouncementsController: [],
  // Items 100, 73, 74, 75: my spaces, an invitation, my own team or a readable post (404 otherwise).
  MyEngageController: ['announcements', 'acknowledge', 'feed', 'spaces', 'post', 'like', 'comments', 'comment', 'reportPost', 'reportComment', 'kudosOptions', 'giveKudos', 'wall', 'vote', 'mySurveys', 'toTake', 'answer', 'teamSurveys', 'teamResults', 'myPlan', 'savePlan', 'celebrationsToday', 'myCelebrations', 'setMyCelebrations'],
  SurveysController: [],
  ModerationController: [],
  ExitsController: ['mine', 'resign', 'withdraw', 'myInterview', 'submitInterview', 'myAssets', 'acknowledge', 'review', 'list', 'get', 'myClearance', 'signOff', 'block', 'personAssets', 'myBookings', 'freeAssets', 'bookAsset', 'cancelMyBooking'], // IT assets answer 2715: one's own asset bookings (bookable assets only)
  // Time and leave: the me/* routes are the caller's own (peers-away: only the caller's own peers, the same manager today);
  // team/*, requests/:id and people/:employeeId/* are decided per person by the service (self, the manager chain, HR in
  // scope); set-up, the balance grid and adjustments need their keys.
  TimeController: [
    'myLeave', 'myPeersAway', 'myLeaveHistory', 'preview', 'apply', 'resend', 'withdraw', 'cancel', 'cancelDays', 'extend', 'choose', 'unchoose', // my own leave
    'myAttendance', 'punch', 'askWebDevice', 'regularise', 'workFromHome', 'onDuty', 'permission', 'withdrawFix', // my own attendance
    'calendar', 'teamLeaveHome', 'teamToday', // my own team (implicit manager grant)
    'request', // the requester, the approver whose task it is, or HR in scope
    'nudge', 'muster', 'dayCard', 'personAttendance', 'personBalances', 'ledger', // attendance or leave scope per person
  ],
};

describe('every HR endpoint declares a permission (P02 YX-SEC-01)', () => {
  for (const controller of [PeopleController, EmployeeHistoryController, OrgStructureController, AccessController, LifecycleController, DocumentsController, ReverificationController, RestructureController, EmployeeImportController, PeopleRegistersController, LettersController, ExitsController, SpecialCasesController, ExpensesController, ExpenseClaimsController, ExpenseTripsController, ExpenseReportsController, PerformanceSetupController, PerformanceGoalsController, PerformanceFeedbackController, PerformanceReviewsController, PerformancePeerController, PerformanceCalibrationController, PerformanceCompController, PerformancePipsController, PerformanceB3Controller, PerformanceHomeController, PersonPanelsController, BfsiController, PoliciesAdminController, MyPoliciesController, SpeakupController, AnnouncementsController, MyEngageController, ModerationController, SurveysController, CasesController, EthicsController, MyCasesController, MisconductReportsController, LearningController, LibraryController, PositionsController, ApprovalPoliciesController, TimeController]) {
    it(`${controller.name}`, () => {
      const proto = controller.prototype as unknown as Record<string, unknown>;
      const handlers = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && typeof proto[m] === 'function' && Reflect.getMetadata(PATH_METADATA, proto[m] as object) !== undefined);
      expect(handlers.length).toBeGreaterThan(0);
      const undeclared = handlers.filter((m) => !Reflect.getMetadata(PERMISSIONS_KEY, proto[m] as object)?.length && !Reflect.getMetadata(PERMISSIONS_ANY_KEY, proto[m] as object)?.length);
      expect(undeclared.sort()).toEqual([...IMPLICIT[controller.name]].sort());
    });
  }
});

describe('time and leave keys (T2-A)', () => {
  const keys = (m: string) => Reflect.getMetadata(PERMISSIONS_KEY, (TimeController.prototype as unknown as Record<string, object>)[m]);
  it('adding a starter leave type needs leave.settings.manage', () => {
    expect(keys('addStarter')).toEqual(['leave.settings.manage']);
    expect(Reflect.getMetadata(PATH_METADATA, (TimeController.prototype as unknown as Record<string, object>).addStarter)).toBe('setup/types/starter/:key');
  });
  it("peers away is the caller's own (no key; the service reads only the caller's peers)", () => {
    expect(keys('myPeersAway')).toBeUndefined();
    expect(Reflect.getMetadata(PATH_METADATA, (TimeController.prototype as unknown as Record<string, object>).myPeersAway)).toBe('me/peers-away');
  });
});

describe('timesheet routes (T2-D)', () => {
  it("my projects are the caller's own (no key; the service reads only the caller's allocations and weeks)", () => {
    const m = (TimeOpsController.prototype as unknown as Record<string, object>).myProjects;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, m)).toBeUndefined();
    expect(Reflect.getMetadata(PATH_METADATA, m)).toBe('me/timesheet/projects');
  });
});
