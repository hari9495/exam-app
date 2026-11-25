# YukthiX: design vs live UI audit (15 Oct 2026)

Source: `origin/main` at `88ac0d4e` (read-only `git archive` copy). Compared: designed screens and stories in `packages/yx-ui/src/screens/**` against the 193 live pages in `apps/web/app/yx/**/page.tsx` and the components they render.
Screens checked in the browser (read-only): Storybook PPL-01 Directory and TIM-17 Leave home; test app `/yx/people/directory`, `/yx/time/leave` and `/yx/payroll/runs`, signed in as `hr@demo-org.test`. The HR account cannot open Payroll, and the admin sign-in did not get past the email step, so I did not screenshot the Pay, Performance and Hiring pages. The rest of the audit comes from the code. No data was changed.

---

## 0. Summary for the founder (plain English)

- **None of the live pages use the designed screens.** Each live page uses a second version, built later and wired to real data.
- Of the 193 live pages:
  - **27** use the only screen that exists for them (sign-in, security, Service desk extras). The design library has nothing else to compare them with.
  - **92** are close to the design but simpler.
  - **41** are very different from the design.
  - **33** have no design at all.
- **The frame around every page (the shell) is the biggest difference.** The live app has no search box, no bell, no company switcher and no Home page. The left menu is grouped by permission, not by product area.
- Lists in Pay and Time are plain tables. Users cannot sort, filter, pick columns, save views or export.
- Some things in the designs need new backend work first. Examples: contract workers and placements in the Directory, the "3 more than August" trends, global search, the notification bell, market pay data, and AI help.
- **Recommended plan:** fix the shell first (about 2 weeks). Then swap in the designed screens, busiest pages first: People, Time, Pay, then Expenses, Approvals, Performance and Hiring. Delete each second version once its designed screen is live. All 9 batches together come to about 14 to 18 weeks of work for one developer.
- **You need to decide 7 things (section 7).** The most important: should we follow the designed menu (product areas plus Home)? And what should we do with live features that have no design?

---

## 1. The shell: designed vs live

Designed shell: `screens/_kit/frames.tsx` `DesktopFrame`, and `screens/platform-a/shell-home.tsx` `AppShellScreen` (story *Screens/Platform/Shell & homes · PLT-01*). Both use `components/shell.tsx` (`AppShell`, `SideRail`, `SidePanel`, `TopBar`, `ScopePicker`, `NotificationCentre`, `CommandPalette`, `ProfileMenu`).
Live shell: `screens/auth/shell.tsx` `WorkspaceShell`, fed by `apps/web/app/yx/(app)/layout.tsx` (a permission-filtered list of `WorkspaceLink`s).

| Element | Designed (PLT-01 / DesktopFrame) | Live (WorkspaceShell) | Gap |
|---|---|---|---|
| Rail items | Product areas in a fixed order: Home, People, Time, Pay, Compliance, Hire, Assess, Performance, Learning, Helpdesk, Analytics, Engage, Projects, Contract labour, Visitors, Settings (pinned at the bottom). Filtered per persona (`railFor`): employee, manager, HR, finance, admin. | One item per *permission group*: People, Hiring, Time, Payroll, Service desk, Organisation, Access, Security, Me (plus "Hiring app" for the old ATS). The HR test user sees only People, Time, Service desk, Organisation and Me. | No Home. No Compliance, Performance, Analytics or Settings areas. Performance pages are split between "People" and "Me". Expenses are split between "Me" and "Organisation". Settings are split between "Organisation" and "Security". "Me" is a rail area, but the design puts Me in the avatar menu (APX-D §1.1). |
| Rail icons | Lucide outline icons (`RAIL_ITEMS`) | Colour icons (`ColorIcon area.*`) | Visual difference. Pick one. |
| Module sub-menu (panel) | Titled with the area name ("People", "Time", "Pay"). Grouped sections with labels (e.g. People: Onboarding / Changes / Exits / More). Count badges (e.g. "Probation 5"). At most about 8 items per group. Role-filtered (`peoplePanel`, `timePanel`, `payPanel`, `hirePanel`, `growthPanel`, `settingsPanel`). | Titled "Menu". One flat group per rail item. The HR user's People panel is a flat list of 22 links, with no sub-groups and no counts. | Panel title, grouping, counts and ordering are all missing. |
| Global search | Top-bar search box "Search people, requests, actions", **Ctrl K**, opens `CommandPalette` (recent items, groups, "search all", Ask). PLT-21 search results page; mobile search. | Not passed (`onSearch` is undefined), so no search box. | **Missing.** A navigation-only palette needs no backend. People/records search needs a search API. |
| Company switcher | `ScopePicker`: legal entity (or "All entities (2)") plus payroll period, for HR, payroll and finance. Hidden on self-service pages. | Company name shown as text next to the logo. No picker. | **Missing.** Needs every list API to take the entity and period scope. |
| Notifications | `NotificationCentre` bell with unread count, inline approve, mark all read, preferences link (PLT-01 bell, PLT-03 inbox). | None. | **Missing.** Needs a YukthiX notification feed (the `apps/api/src/notifications` controller serves the exam app; check whether it can be reused). |
| Help | Help icon in the top bar. | A floating "Help" button at the bottom right (page-level). | Moved. The design rule R8 says tools sit in the bar, not floating. |
| Ask AI | Ask AI icon in the top bar (opens the assistant). | None. | Missing. Needs an AI backend, or hide it until one exists. |
| User menu | `ProfileMenu`: profile, preferences, theme, density, sign out. | Same component with the same options. | Same. Good. |
| Logo / home link | Monogram in the rail. Home goes to the role home (PLT-02). | Wordmark in the top bar. "Home" is the first permitted link. | No role home page. |
| Breadcrumbs | Not used in the designed module screens (the page title alone; `PageHeader.breadcrumbs` is optional). | Used only in `workforce` screens ("People › Directory"). Other live screens have none. | Inconsistent. Set one rule. |
| Page header | `PageHeader` (title, one-line description, actions at the top right). Often followed by a KPI or stat-card strip and a toolbar (`FilterBar`, `SavedViewMenu`, Columns, Export). | `LivePage` wrapper (128 uses): `PageHeader` plus loading, error and no-access states. No stat strips and no toolbars. | The header is the same. The strip and toolbar under it are missing. Keep the live no-access state; it is good. |
| Mobile | `MobileTabBar` (Home / Time / Requests / Pay / Me) and `PhoneFrame` variants for many screens. | Menu sheet only. No tab bar. | Mobile tab bar missing (planned for the mobile phase). |
| Security banner | Not in the design. | "Secure your account" MFA banner on every page. | Live-only. Keep it. |

---

## 2. Mapping: every live page to its design

Categories:
- **A:** renders the screen that Storybook shows, and no other design exists. (No live page renders a PPL / TIM / PAY / EXP / PRF / HIR / HLP / PLT / Settings G1–G8 designed screen.)
- **B:** a second version, close to the design.
- **C:** a second version, very different from the design.
- **D:** no design exists.

"Renders" names the yx-ui entry (`workforce`, `lifecycle` = `screens/people/live`, `time` = `screens/time/live`, `pay` = `screens/pay/live`, `expenses`, `performance`, `hiring` = their `live` folders; `desk`, `auth`, `org`, `access`, `history`, `global`, `notifications` = their own folders).

**People**

| Page | Designed screen | Renders | Cat |
|---|---|---|---|
| `/yx/people/directory` | PPL-01 Directory | workforce DirectoryScreen | **C** |
| `/yx/people/org-chart` | PPL-02 Org chart | workforce OrgChartScreen | **B** |
| `/yx/people/team` | PPL-08 Team page | workforce TeamScreen + lifecycle JoiningSoonCard | **C** |
| `/yx/people/profile` | PPL-03 Person record (+PPL-34/35/45/46 tabs) | access ProfileScreen | **C** |
| `/yx/people/history` | PPL-03 Person record, History tab | history PersonHistoryScreen | **B** |
| `/yx/people/changes` | PPL-05 Scheduled changes (+PPL-04) | history JobChangesScreen | **B** |
| `/yx/people/bulk-changes` | PPL-06 Bulk changes wizard | workforce BulkChangesScreen | **C** |
| `/yx/people/probation` | PPL-16 Probation queue (+PPL-17) | workforce ProbationScreen | **B** |
| `/yx/people/onboarding` | PPL-11 Onboarding board | lifecycle OnboardingBoardScreen | **C** |
| `/yx/people/onboarding/[id]` | PPL-13 Journey record (+PPL-41 buddy) | lifecycle JourneyScreen, JoinerPanel, BuddyCard, RehireCard | **B** |
| `/yx/people/ready-to-onboard` | PPL-12 Ready to onboard | lifecycle ReadyToOnboardScreen | **B** |
| `/yx/people/batches` | PPL-14 Pre-boarding batches | lifecycle BatchesScreen | **B** |
| `/yx/people/my-tasks` | none | lifecycle MyTasksScreen | **D** |
| `/yx/people/life-events` | none | lifecycle LifeJourneysScreen | **D** |
| `/yx/people/documents` | PPL-27 Document verification | lifecycle DocumentQueueScreen | **B** |
| `/yx/people/letters` | PPL-28 Issue letters | lifecycle LettersRegisterScreen | **B** |
| `/yx/people/exits` | PPL-19 Exit cases (list) | lifecycle ExitCasesScreen | **B** |
| `/yx/people/exits/[id]` | PPL-19 Exit case workspace | lifecycle ExitCaseScreen | **C** |
| `/yx/people/clearance` | PPL-20 Clearance sign-offs | lifecycle ClearanceScreen | **B** |
| `/yx/people/assets` | PPL-25 Asset register | lifecycle AssetsScreen | **B** |
| `/yx/people/absconding` | PPL-24 Absconding timeline | lifecycle AbscondingScreen | **B** |
| `/yx/people/retrenchment` | PPL-40 VRS scheme (partly) | lifecycle RetrenchmentScreen + VrsCard | **B** |
| `/yx/people/upcoming-exits` | none | lifecycle UpcomingExitsScreen | **D** |
| `/yx/people/profile-requests` | PPL-32 Profile change request | access ProfileRequestsScreen | **B** |

**Me**

| Page | Designed screen | Renders | Cat |
|---|---|---|---|
| `/yx/me/documents` | PPL-30 My documents and letters (+PPL-31) | lifecycle MyDocumentsScreen | **B** |
| `/yx/me/letters` | PPL-30 My documents and letters | lifecycle MyLettersScreen | **B** |
| `/yx/me/assets` | PPL-25 Asset acknowledge (phone) | lifecycle MyAssetsScreen | **B** |
| `/yx/me/resignation` | PPL-18 Resignation | lifecycle ResignationScreen | **B** |
| `/yx/me/exit-interview` | PPL-21 Exit interview | lifecycle ExitInterviewScreen | **B** |
| `/yx/me/first-30-days` | none | lifecycle FirstThirtyDaysScreen | **D** |
| `/yx/me/privacy` | PPL-33 My data and who accessed it | access AccessLogScreen | **B** |
| `/yx/me/security` | Security / My security (story) | auth MeSecurityScreen | **A** |
| `/yx/me/language` | Settings / Global core (story) | global MyLanguageScreen | **A** |
| `/yx/me/payslips` | PAY-21 Payslip viewer (+PAY-40) | pay MyPayslipsScreen | **C** |
| `/yx/me/tax` | PAY-22 Tax workspace (+PAY-41) | pay MyTaxScreen | **C** |
| `/yx/me/tax-declarations` | PAY-22 Tax workspace, Proofs tab | pay MyDeclarationsScreen | **B** |
| `/yx/me/loans` | PAY-18 Loan or advance request | pay LoansScreen (mine) | **B** |
| `/yx/me/earned-pay` | PAY-26 EWA request | pay MyEwaScreen | **B** |
| `/yx/me/incentives` | PAY-33 My incentive statement | pay MyIncentivesScreen | **B** |
| `/yx/me/equity` | none | pay MyEquityScreen | **D** |
| `/yx/me/pay-documents` | none | pay MyPayDocumentsScreen | **D** |

**Time**

| Page | Designed screen | Renders | Cat |
|---|---|---|---|
| `/yx/time/attendance` | Extra: My attendance today + Attendance calendar | time MyAttendanceScreen | **C** |
| `/yx/time/leave` | TIM-17 Leave home (+TIM-18/19) | time MyLeaveScreen | **B** |
| `/yx/time/balances` | TIM-21 Leave card | time LeaveBalancesScreen | **B** |
| `/yx/time/team` | TIM-20 Team leave calendar | time TeamLeaveScreen | **C** |
| `/yx/time/muster` | TIM-02 Muster | time MusterScreen | **C** |
| `/yx/time/roster` | TIM-05 Roster | time RosterPlannerScreen | **B** |
| `/yx/time/shifts` | TIM-05 My shifts (phone) + TIM-08 swap | time MyShiftsScreen | **B** |
| `/yx/time/shifts-setup` | TIM-06 Shift editor and patterns | time ShiftsSetupScreen | **B** |
| `/yx/time/overtime` | none | time MyOvertimeScreen | **D** |
| `/yx/time/overtime-review` | TIM-09 OT review | time OvertimeReviewScreen | **C** |
| `/yx/time/timesheet` | TIM-15 Timesheets (+TIM-43) | time MyTimesheetScreen | **C** |
| `/yx/time/periods` | TIM-11 Periods | time PeriodsScreen | **B** |
| `/yx/time/registers` | TIM-16 Attendance reports | time RegistersScreen | **C** |
| `/yx/time/payroll-feed` | none | time PayrollFeedScreen | **D** |
| `/yx/time/setup` | TIM-26/27/28/29 (holidays, leave types, policies, year end) | time TimeSetupScreen | **C** |

**Pay**

| Page | Designed screen | Renders | Cat |
|---|---|---|---|
| `/yx/payroll/runs` | PAY-01 Payroll home | pay PayRunsScreen | **C** |
| `/yx/payroll/runs/[id]` | PAY-03 Run workspace (+PAY-02/07/08/09) | pay PayRunScreen | **C** |
| `/yx/payroll/runs/[id]/payments` | PAY-10 Payments and files (+PAY-08) | pay RunPaymentsScreen | **B** |
| `/yx/payroll/inputs` | PAY-04/05/06 LOP, one-time pay, holds | pay PayInputsScreen | **B** |
| `/yx/payroll/compensation` | PAY-12 Compensation and revision (+PAY-42) | pay CompensationLiveScreen | **C** |
| `/yx/payroll/templates` | PAY-13 Template builder | pay TemplatesLiveScreen | **B** |
| `/yx/payroll/components` | PAY-14 Component library | pay ComponentLibraryLiveScreen | **B** |
| `/yx/payroll/payslip-layout` | PAY-15 Payslip layout editor | pay PayslipLayoutLiveScreen | **B** |
| `/yx/payroll/setup` | PAY-16 Payroll set-up wizard | pay PaySetupScreen | **C** |
| `/yx/payroll/loans` | PAY-17 Loans and advances | pay LoansScreen | **C** |
| `/yx/payroll/payslip-queries` | PAY-20 Payslip query queue | pay PayslipQueriesScreen | **B** |
| `/yx/payroll/proofs` | PAY-23 Proof verification queue | pay ProofCheckScreen | **B** |
| `/yx/payroll/ewa` | PAY-27 EWA admin | pay EwaAdminScreen | **C** |
| `/yx/payroll/arrears` | PAY-28 Arrears base (+PAY-19/37) | pay ArrearsScreen | **B** |
| `/yx/payroll/coverage` | PAY-30 Coverage monitor | pay CoverageLiveScreen | **B** |
| `/yx/payroll/special-pay` | PAY-31..36 (piece rate, incentives, tips, on-call, union) | pay SpecialPayScreen | **C** |
| `/yx/payroll/actuarial` | PAY-38 Actuarial | pay ActuarialScreen | **C** |
| `/yx/payroll/fnf` | PPL-22 F&F calculator | pay FnfScreen | **B** |
| `/yx/payroll/files` | PAY-10 Payments and files | pay ExchangeFilesScreen | **C** |
| `/yx/payroll/registers` | PAY-25 Payroll reports / CMP-03 registers | pay RegistersScreen | **C** |
| `/yx/payroll/statutory` | CMP-01 Statutory hub | pay StatutoryHubScreen | **B** |
| `/yx/payroll/statutory-rules` | CMP-08 Statutory rules and updates | pay StatutoryRulesScreen | **B** |
| `/yx/payroll/advisories` | CMP-08 Statutory rules and updates | pay AdvisoriesScreen | **B** |
| `/yx/payroll/certificates` | CMP-06 Form 16 bulk | pay TaxCertificatesScreen | **B** |
| `/yx/payroll/pay-groups` | Settings 4.1 Pay groups and calendars | pay PayGroupsScreen | **B** |
| `/yx/payroll/periods` | none (Settings 4.1 nearest) | pay PayPeriodsScreen | **D** |
| `/yx/payroll/reopen-requests` | none | pay ReopenRequestsScreen | **D** |
| `/yx/payroll/audit` | none | pay AuditScreen | **D** |
| `/yx/payroll/documents` | none | pay PayDocumentsScreen + NomineeDrawer | **D** |
| `/yx/payroll/imports` | none | pay PayImportsScreen | **D** |
| `/yx/payroll/payment-modes` | none | pay PaymentModesScreen | **D** |
| `/yx/payroll/go-live` | none (PLT-08 set-up hub nearest) | pay GoLiveScreen | **D** |
| `/yx/payroll/consultants` | none | pay ConsultantsScreen | **D** |
| `/yx/payroll/consultant-tds` | none | pay ConsultantTaxScreen | **D** |
| `/yx/payroll/equity` | none | pay EquityScreen | **D** |
| `/yx/payroll/country-packs` | none | pay CountryPacksScreen | **D** |

**Expenses**

| Page | Designed screen | Renders | Cat |
|---|---|---|---|
| `/yx/expenses` | EXP-01 Expenses home | expenses ExpensesHomeScreen (live) | **C** |
| `/yx/expenses/claims/[id]` | EXP-02 Claim composer + EXP-03 Claim review | expenses ClaimScreen | **B** |
| `/yx/expenses/trips` | EXP-04 Trip | expenses TripsScreen | **B** |
| `/yx/expenses/trips/[id]` | EXP-04 Trip | expenses TripScreen | **B** |
| `/yx/expenses/advances` | EXP-05 Advance card + request | expenses AdvancesScreen | **B** |
| `/yx/expenses/advances/[id]` | EXP-05 Advance card + request | expenses AdvanceScreen | **B** |
| `/yx/expenses/to-pay` | EXP-06 To-pay queue | expenses ToPayLiveScreen | **B** |
| `/yx/expenses/reports` | EXP-09 Expense reports | expenses ExpenseReportsScreen (live) | **C** |
| `/yx/settings/expenses` | EXP-07 Expense policy matrix | expenses ExpenseSetupScreen | **C** |

**Performance**

| Page | Designed screen | Renders | Cat |
|---|---|---|---|
| `/yx/performance` | PRF-01 Performance home + PRF-02 My goals | performance GoalsScreen | **C** |
| `/yx/performance/goals/[id]` | PRF-02 Goal open and check-in | performance GoalScreen | **B** |
| `/yx/performance/goal-map` | PRF-03 Company goal map | performance GoalMapScreen | **C** |
| `/yx/performance/cycles` | PRF-04 Cycle set-up | performance ReviewCyclesScreen | **B** |
| `/yx/performance/cycles/[id]` | PRF-04 Cycle control room (+PRF-07) | performance CycleScreen, PeerSetup, CalibrationSessions | **C** |
| `/yx/performance/reviews` | PRF-05/06 Reviews | performance ReviewsScreen | **B** |
| `/yx/performance/reviews/[id]` | PRF-05 Review workspace (+PRF-17) | performance ReviewScreen, PeerPanel | **C** |
| `/yx/performance/feedback` | PRF-08 Quick feedback | performance FeedbackScreen | **B** |
| `/yx/performance/feedback-tasks` | PRF-07 360 nominations | performance FeedbackTasksScreen | **B** |
| `/yx/performance/feedback-tasks/[id]` | PRF-07 360 nominations (peer form) | performance PeerFormScreen | **B** |
| `/yx/performance/one-on-ones` | PRF-11 1:1s | performance OneOnOnesScreen | **B** |
| `/yx/performance/one-on-ones/[id]` | PRF-11 1:1s (+PRF-16 agenda) | performance OneOnOneScreen | **B** |
| `/yx/performance/calibrations` | PRF-09 Calibration (list) | performance CalibrationListScreen | **B** |
| `/yx/performance/calibrations/[id]` | PRF-09 Calibration board and 9-box | performance CalibrationBoardScreen | **C** |
| `/yx/performance/comp` | PRF-10 Comp review sheet (list) | performance CompCyclesScreen | **B** |
| `/yx/performance/comp/[id]` | PRF-10 Comp review sheet | performance CompSheetScreen | **B** |
| `/yx/performance/pips` | PRF-12 PIP record (list) | performance PipsScreen | **B** |
| `/yx/performance/pips/[id]` | PRF-12 PIP record | performance PipScreen | **B** |
| `/yx/performance/pay-band` | PAY-39 My pay band | performance MyPayBandScreen | **B** |
| `/yx/performance/reports` | none (Analytics area) | performance PerformanceReportsScreen | **D** |
| `/yx/performance/reviewer-blocks` | none | performance ReviewerBlocksScreen | **D** |
| `/yx/settings/performance` | Settings 6.3 Performance (+PRF-14) | performance PerformanceSetupScreen | **B** |

**Hiring**

| Page | Designed screen | Renders | Cat |
|---|---|---|---|
| `/yx/hiring/plans` | HIR-01 Headcount plan board | hiring HeadcountPlansScreen | **B** |
| `/yx/hiring/jobs` | HIR-03 Jobs (list) | hiring HiringJobsScreen | **B** |
| `/yx/hiring/jobs/[id]` | HIR-03 Job workspace + HIR-04 Pipeline board | hiring JobWorkspaceScreen + ApplicationPanel | **C** |
| `/yx/hiring/candidates` | HIR-20 Talent CRM / HIR-05 | hiring HiringCandidatesScreen | **C** |
| `/yx/hiring/candidates/[id]` | HIR-05 Candidate record | hiring CandidateProfileScreen | **C** |
| `/yx/hiring/interviews` | HIR-06 Interview calendar | hiring MyInterviewsScreen | **C** |
| `/yx/hiring/interviews/[id]` | HIR-07 Scorecard form | hiring InterviewScreen | **B** |
| `/yx/hiring/pools` | HIR-20 Talent CRM | hiring TalentPoolsScreen | **C** |
| `/yx/hiring/careers` | T9-09 Careers site + Settings 6.1 | hiring CareersSiteScreen | **B** |
| `/yx/hiring/job-boards` | HIR-03 Postings tab | hiring JobBoardsScreen | **B** |
| `/yx/hiring/approval-routes` | none (Settings 6.1 nearest) | hiring ApprovalRoutesScreen | **D** |
| `/yx/hiring/scorecards` | none | hiring ScorecardTemplatesScreen | **D** |
| `/yx/hiring/duplicates` | none (PPL-36 pattern) | hiring DuplicatesScreen | **D** |
| `/yx/hiring/retention` | none (HIR-05 consent tab nearest) | hiring CandidateRetentionScreen | **D** |

**Helpdesk**

| Page | Designed screen | Renders | Cat |
|---|---|---|---|
| `/yx/desk/help` | HLP-01 Help centre | desk HelpCentreScreen + ChatPromptBanner + MyChannelsCard | **B** |
| `/yx/desk/help/[id]` | HLP-01 Help centre (my ticket) | desk MyTicketScreen + RequestTracker | **B** |
| `/yx/desk/tickets` | HLP-02 Agent desk | desk DeskTicketsScreen | **B** |
| `/yx/desk/tickets/[id]` | HLP-03 Ticket workspace | desk TicketScreen + rails | **B** |
| `/yx/desk/knowledge` | HLP-04 Knowledge base editor | desk KnowledgeScreen | **B** |
| `/yx/desk/reports` | HLP-05 SLA dashboard | desk ReportsScreen | **C** |
| `/yx/approvals` | PLT-04 Approvals | desk ApprovalsScreen + ChannelLinksCard | **B** |
| `/yx/desk/calendar` | Service desk story only | desk MyCalendarScreen | **A** |
| `/yx/desk/catalog` | Service desk story only | desk CatalogScreen | **A** |
| `/yx/desk/chat` | Service desk story only | desk RequesterChatScreen | **A** |
| `/yx/desk/live-chat` | Service desk story only | desk AgentChatScreen | **A** |
| `/yx/desk/customers` | Service desk story only | desk CustomersScreen | **A** |
| `/yx/desk/known-issues` | Service desk story only | desk KnownIssuesScreen | **A** |
| `/yx/desk/people` | Service desk story only | desk DeskPage + DuplicatesCard | **A** |
| `/yx/desk/people-list` | Service desk story only | desk PeopleListScreen | **A** |
| `/yx/desk/privacy` | Service desk story only | desk PrivacyScreen | **A** |
| `/yx/desk/setup` | Service desk story only | desk DeskSetupScreen + admin cards | **A** |
| `/yx/desk/team` | Service desk story only | desk TeamScreen | **A** |
| `/yx/desk/confirm-chat` | none | page-local (Button, InlineAlert) | **D** |
| `/yx/support` | Service desk / Contact YukthiX (story) | desk YukthixSupportScreen | **A** |

**Settings**

| Page | Designed screen | Renders | Cat |
|---|---|---|---|
| `/yx/settings/legal-entities` | Settings 1.2 Legal entities | org LegalEntitiesScreen | **B** |
| `/yx/settings/locations` | Settings 1.3 Locations | org LocationsScreen | **B** |
| `/yx/settings/structure` | Settings 1.4 Structure masters | org StructureScreen | **B** |
| `/yx/settings/company-rules` | Settings 1.1 / 1.5 | org CompanySettingsScreen (via lib) | **B** |
| `/yx/settings/access-settings` | Settings 2.2 Directory and privacy | org CompanySettingsScreen (via lib) | **B** |
| `/yx/settings/access` | Settings 2.1 Roles and access | access RolesAccessScreen | **B** |
| `/yx/settings/security` | Settings 2.3 Security | auth SecuritySettingsScreen | **B** |
| `/yx/settings/checklists` | Settings 2.5 Onboarding and probation | lifecycle JourneyTemplatesScreen | **B** |
| `/yx/settings/letters` | PPL-29 Letter templates / Settings 5.2 | lifecycle LetterTemplatesScreen | **B** |
| `/yx/settings/emails` | Settings 5.4 Notifications | notifications EmailSettingsScreen | **B** |
| `/yx/settings/sms` | Settings 5.5 WhatsApp and SMS | notifications SmsSettingsScreen | **B** |
| `/yx/settings/identity-providers` | Security / Admin (story) | auth IdentityProvidersScreen | **A** |
| `/yx/settings/support-access` | People / Access and privacy (story) | access SupportAccessScreen | **A** |
| `/yx/settings/countries` | Settings / Global core (story) | global CountryGuideScreen | **A** |
| `/yx/settings/translations` | Settings / Global core (story) | global TranslationsScreen | **A** |
| `/yx/admin/login-activity` | Security / Admin (story) | auth LoginActivityScreen | **A** |

**Public**

| Page | Designed screen | Renders | Cat |
|---|---|---|---|
| `/yx/sign-in` | Security / Sign in (story) | auth SignInScreen, MfaChallengeScreen | **A** |
| `/yx/sign-in/callback` | none (no UI) | redirect only | **D** |
| `/yx/forgot-password` | Security / Sign in (story) | auth ForgotPasswordScreen | **A** |
| `/yx/reset-password/[token]` | Security / Sign in (story) | auth ResetPasswordScreen | **A** |
| `/yx/setup-mfa` | Security / Sign in (story) | auth MfaEnrolScreen | **A** |
| `/yx/start` | Service desk story only | desk DeskSignUpScreen | **A** |
| `/yx/act/[token]` | Service desk story only | desk ActionLinkScreen | **A** |
| `/yx/wall/[org]/[token]` | Service desk story only | desk WallScreen | **A** |
| `/yx/portal/[org]/[portal]` | Service desk story only | desk PortalScreen | **A** |
| `/yx/portal/[org]/[portal]/confirm` | none | page-local | **D** |
| `/yx/help/[org]/[space]` | T9-16 Public help centre | page-local (help-client) | **C** |
| `/yx/help/[org]/[space]/[slug]` | T9-16 Public help centre (article) | page-local | **C** |
| `/yx/join/[org]` | T9-01 Pre-boarding portal | lifecycle PortalScreen + PortalSignIn | **B** |
| `/yx/alumni/[org]` | T9-02 Alumni and nominee portal | lifecycle AlumniScreen + PortalSignIn | **B** |
| `/yx/verify/[code]` | T9-08 Public verify page | pay VerifyDocumentScreen | **B** |
| `/yx/consultant/[org]` | none | pay ConsultantPortalScreen | **D** |
| `/yx/pay-portal/[org]` | none | pay MyPayDocumentsScreen + PayPortalSignIn | **D** |
| `/yx/m/[token]` | none | page-local | **D** |
| `/yx/rate/[org]/[token]` | none | page-local (rating form) | **D** |
| `/yx/widget/[key]` | none | page-local (chat widget) | **D** |

---

## 3. Gaps on B and C pages

Each page lists **UI:** (can be fixed in the front end with the data we already have) and **Backend:** (needs new data, APIs or features).
The design library calls the plain-table problem **"T"**. Every Pay and Time live screen draws lists with a plain HTML `<table>` (85 of them) instead of `DataTable`, so it has no sort, filter bar, saved views, column chooser, grouping, bulk select or export. People, Expenses, Performance and Hiring live screens do use `DataTable`, but none of them shows `FilterBar` or `SavedViewMenu` (0 uses in any live folder; the designed folders use them 30+ times).

### Cross-cutting (applies to most B/C pages)
- **UI:** no stat-card or KPI strip under the header; no FilterBar or SavedViewMenu; problem "T" (above) in Pay and Time; no "Needs action" list on home-type pages; few drawers or detail panels where the design opens one (live uses dialogs or a new page); no phone variants (design has `*Phone` screens).
- **Backend:** month-over-month trends ("3 more than August") need headcount or metric snapshots; counts in panel badges need cheap count endpoints.

### People
- **PPL-01 Directory (C).**
  - UI: workforce count cards that act as tabs (Employees / Contract workers / Consultants / Placements / All persons); **Import** and **Add employee** at the top right (live has "Add person" only); toolbar with **Filter, View (saved views), Group, Columns, Export**; **Status** and **ID** columns (HR); row actions (Issue letter, Start change, Export selected); employee-view quick chips (Everyone / My team / My department / My location); the "All persons" note "N roles held by M people"; phone layout.
  - Backend: person **kind** (contract worker, consultant, placement) and the **via** column (contractor / firm / client). Contract workers need the CLB module, and placements need the staffing desk (HIR-17), neither of which exists. **Status** per person (probation, notice, on leave, deployed) is not in `DirectoryPerson`. **Trend vs last month** needs snapshots. **Distinct-person count** (one person, two roles) needs the person/role model exposed. Phone is not in the directory API. Import needs the employee import (PPL-07).
- **PPL-02 Org chart (B).** UI: almost the same; live adds Export CSV. Design shows "as it will be on" future-dated views. Backend: future-dated org (scheduled changes) for the forward view.
- **PPL-08 Team page (C).** UI: "Today" column (in office / on leave / WFH), "Upcoming" column, a "Waiting for you" needs-action list, the "Onboarding and exit tasks" card, and Request a hire, Start a change and Nudge actions. Live has a plain member table plus a joining-soon card. Backend: today's attendance per member and the approvals feed per manager. Both exist in the Time and Approvals APIs; they need a team-level endpoint.
- **PPL-03 Person record (C).** UI: one record with tabs (Overview, Job, Pay, Time, Documents, Performance, Learning, Assets, History), as-of date travel, the Identity and Roles panels (PPL-34/35), Work authorisation and International bank tabs (PPL-45/46), and Message / Start change / Propose change / Request access. Live splits this into `/people/profile` (personal details plus a change request) and `/people/history` (job history). Backend: the Learning tab (no Learning module), work authorisations and international bank details.
- **PPL-05 Scheduled changes (B).** UI: "What changes" and "Raised by" columns, the pay show/hide toggle, open revision. Backend: none major.
- **PPL-06 Bulk changes wizard (C).** UI: a step-by-step wizard (choose type, pick people, edit raise, band check with "Cap at band max", letter, send). Live is CSV upload, check rows, then a batch list. Backend: pay-band limits per grade, and letter generation for bulk changes.
- **PPL-16 Probation (B).** UI: Escalated banner, Remind manager, decision drawer (PPL-17 form). Backend: the reminder notification.
- **PPL-11 Onboarding board (C).** UI: **kanban** by stage with entity, location and next-task filters. Live is a table with three tabs. Backend: none (the stage data exists).
- **PPL-13 Journey record (B).** UI: overdue alert, Issue letter, Mark done, Add task inline. Backend: none.
- **PPL-12 Ready to onboard (B).** UI: person type and location columns, checklist choice in the drawer, the "Change hand-off setting" link. Backend: none.
- **PPL-14 Batches (B).** UI: progress, offers issued, legal entity columns, the move-date dialog. Backend: none.
- **PPL-27 Document queue (B).** UI: review drawer with version and preview, Ask to re-upload. Backend: none.
- **PPL-28 Letters (B).** UI: the issue-letter sheet and bulk wizard look different; filters. Backend: none.
- **PPL-19 Exit cases (B list / C case).** UI: case workspace with a stage **stepper**, deprovisioning checklist, handover sign-off, links to F&F and the interview, held-letters alert, Manager/HR tabs. Backend: IT deprovisioning (integrations).
- **PPL-20 Clearance (B).** UI: department, owner and recovery columns. Live is 28 lines with tabs only. Backend: recovery amounts flowing to F&F.
- **PPL-25 Assets (B).** UI: tag, location and purchased columns, Import, Export selected, filter bar. Backend: none.
- **PPL-24 Absconding (B).** UI: timeline view with dispatch proof. Backend: none.
- **PPL-40 VRS / retrenchment (B).** Live merges retrenchment and VRS into one page; the design has the VRS scheme only.
- **PPL-32 Profile requests (B).** UI: the request stepper (Requested, HR approval, Penny drop, Cooling period). Backend: **penny-drop** bank verification.
- **PPL-30 My documents / letters (B).** UI: kind, date and size columns, Upload, share link with expiry. Backend: share links.
- **PPL-18 Resignation, PPL-21 Exit interview, PPL-25 My assets (B).** UI: approval tracker chips; Save for later. Backend: none.
- **PPL-33 My data (B).** UI: Download my data (PDF/JSON), Nominate someone, Request a correction, Report a concern, and a "Context" column. Backend: **data export (DSAR)** and the nominee flow.

### Me › Pay
- **PAY-21 Payslip viewer (C).** UI: a full payslip view with YTD, a past-month switcher, **"Why is my pay different"** (PAY-40 diff panel), **Raise a query**, Download PDF, and on-hold and not-published states. Live is a list plus a drawer. Backend: month-to-month diff reasons (explain endpoint).
- **PAY-22 Tax workspace (C for /me/tax, B for declarations).** UI: one workspace with tabs (Overview, Compare regimes, Proofs, Previous employer, Residential status), a TDS-by-month chart, Form 16 download, and a PAN link help. Live splits this into /me/tax (regime compare) and /me/tax-declarations. Backend: previous-employer income and residential status.
- **PAY-18 / 26 / 33 (B).** UI: step flow (form, confirm, done) for EWA; the incentive statement detail. Backend: none.

### Time
- **Attendance (C).** Design: "My attendance today" (clock card, this week, your rules, Regularise) and the month **calendar** (legend, locked month, export, raise a request). Live is a month list with prev/next only. UI: calendar grid, Regularise/Fix actions (TIM-07), export. Backend: regularisation requests; web clock-in (TIM-12 needs geofence and camera).
- **TIM-17 Leave home (B).** UI: per-balance booked/pending lines, comp-off expiry, "Waiting for X / In 13 days" on requests, Withdraw / Ask to cancel, an upcoming-holidays side card with optional holidays (TIM-23). Live has balance cards plus My requests and Holidays tabs. Backend: comp-off expiry and optional-holiday quota.
- **TIM-21 Leave card / balances (B).** UI: per-person ledger timeline, Adjust balance. Backend: none.
- **TIM-20 Team leave calendar (C).** UI: **people × days calendar grid** and a month view, review drawer, export, waiting-for-approval list. Live is a list with ±28 days. Backend: none.
- **TIM-02 Muster (C).** UI: **Freeze inputs, Lock period, Mark present with reason (bulk)**, cell drawer, view month, CSV download. Live is a read-only grid with a drawer. Backend: the "freeze inputs" state (lock exists in periods).
- **TIM-05 Roster (B).** UI: Swap shifts, Auto-roster button, Bids tab (TIM-35). Backend: auto-roster engine and open-shift bids.
- **TIM-06 Shift editor (B).** UI: live preview, duplicate, effective-date save notice; live adds Overtime, Timesheet projects and Night work tabs. Backend: none.
- **TIM-09 OT review (C).** UI: Employee / Worked / OT / Legal limit columns, bulk Approve / Give comp-off / Reject, Override limit. Live is a per-claim list with override only. Backend: comp-off conversion.
- **TIM-15 Timesheet (C).** UI: week grid editor, Submit / Resubmit week, correction flow, **Pre-fill from my tools** (TIM-43). Backend: tool integrations for pre-fill (calendar, issue tracker, code host).
- **TIM-11 Periods (B).** UI: blockers list, send for approval, approve lock, request reopen. Backend: two-person lock approval.
- **TIM-16 Registers (C).** UI: report tabs (Late and early, Overtime, Form 25 muster roll, Women night-shift register), charts, filter bar. Live is a download list per establishment. Backend: the extra statutory registers.
- **Time set-up (C).** Design has four separate screens: Holiday calendars (TIM-26), Leave type editor (TIM-27), Leave policies (TIM-28), Year-end wizard (TIM-29). Live has them as tabs on one page. UI: the editors' preview, rule explanations and year-end stepper. Backend: holiday feed (TIM-42).

### Pay (admin)
- **PAY-01 Payroll home (C).** UI: the current run's stage tracker, **stat cards**, "Approve and lock", the gross and net chart for the tax year, a "what you need before you start" help, and finance vs payroll-admin views. Live is a month-grouped list of runs. Backend: YTD aggregates endpoint.
- **PAY-03 Run workspace (C).** UI: tabs Inputs / **Validations** / Approvals / Files plus **Variance**; payslip table with Days paid, LOP, Gross, Deductions, Net, Pay mode, Status, Why; **why-this-number drawer**; filter and saved views; audit trail; void; approve sheet (PAY-07), bank file sheet (PAY-08), publish sheet (PAY-09); readiness checks with waive (PAY-02). Live has Items / Approval / Bank file / Publish tabs on simpler content. Backend: variance vs last month, per-line explanation, waiver records.
- **PAY-10 Payments and files (B for run payments, C for /payroll/files).** UI: debit/credit check, upload bank response, failure re-route, journal export (Tally XML / CSV / send to accounting). Backend: accounting integration and bank response parsing.
- **PAY-04/05/06 Inputs (B).** UI: LOP table with source and check columns, bulk upload drawer, freeze notice. Backend: none.
- **PAY-12 Compensation (C).** UI: person-centred record (Profile / Job / Compensation / Documents tabs), revision timeline, Revise drawer, **Suggest split** (PAY-42). Live is search, then a form. Backend: none new.
- **PAY-13 / 14 / 15 (B).** UI: compare-versions view, validate before publish, component table columns (Type, Code, Flags, Used in), GL mapping and language previews on the payslip layout. Backend: GL account mapping.
- **PAY-16 Set-up wizard (C).** UI: a **stepper** wizard (frequency, pay day, day basis, template starter, bank format) with "Payroll is on" end state. Live is a sections page. Backend: none.
- **PAY-17 Loans (C).** UI: 9-column table with filters, pause/resume EMIs, loan ledger, Add loan. Live is a short list. Backend: pause/resume.
- **PAY-20 / 23 queues (B).** UI: assignee and reply-due columns, Assign to me, filter bar; proof drawer with approve-part. Backend: query assignment.
- **PAY-27 EWA admin (C).** UI: tabs Policy / Partner / Recoveries / Reconciliation, partner-not-connected state, ageing buckets. Backend: **EWA partner integration**.
- **PAY-28 Arrears (B).** UI: base-confirm worksheet with compute and send for approval. Backend: none.
- **PAY-30 Coverage (B).** UI: switch-coverage flow in the panel. Backend: none.
- **PAY-31..36 Special pay (C).** Design has six screens (piece-rate cards, incentive plan builder, tips pool, on-call rules, union check-off, group health PAY-43). Live has one tabbed page. UI: the builders and calculators. Backend: plan-rule engines for incentives and tips.
- **PAY-38 Actuarial (C).** UI: stepper (census, valuation, journal post), XLSX export, reminders. Backend: journal posting.
- **PAY-25 / CMP-03 Registers (C).** UI: report catalogue with filters and charts. Backend: extra report types.
- **CMP-01 / 06 / 08 (B).** UI: hub cards with due dates; Form 16 bulk table; rule-set browser with advisories. Backend: none major.
- **PPL-22 F&F (B).** UI: calculator lines with recovery from clearance. Backend: none.
- **Settings 4.1 Pay groups (B).** UI: settings page template (read-only mode, audit). Backend: none.

### Expenses
- **EXP-01 Home (C).** UI: **stat cards**, "Waiting for you" needs-action list, quick actions (**Snap a receipt, Request a trip, Add mileage**, Open to-pay queue), finance view. Backend: receipt OCR (the `apps/ocr-worker` exists; wire it to claims).
- **EXP-02/03 Claim (B).** UI: camera capture, receipt / mileage / per-diem line types, approval stepper (Submitted, Manager, Department head, Finance audit), per-line decision table, Reduce. Backend: OCR; department-head over-limit step.
- **EXP-04 Trip, EXP-05 Advance (B).** UI: trip request form; forex advance; Schedule recovery. Backend: forex advances.
- **EXP-06 To pay (B).** UI: filter bar, saved views ("Show failed"), Re-route, payment reference column. Backend: none.
- **EXP-09 Reports (C).** UI: tabs Summary / Advance ageing / Unpaid / Over limit / **GST input**, spend-by-category chart, XLSX. Live is one table plus CSV. Backend: GST input report (supplier GSTIN, CGST/SGST/IGST capture).
- **EXP-07 Policy matrix (C).** UI: one grade × category matrix with versioning ("Save as v6"). Live has six tabs of lists. Backend: policy versions.
- **EXP-08 Card import:** no live page (section 4).

### Performance
- **PRF-01 Performance home (C, missing).** `/yx/performance` opens Goals. UI: home with to-do list, stat cards, rating distribution chart, nudges, "Start a review cycle", "Give feedback". Backend: aggregates and nudges.
- **PRF-02 Goals (B).** UI: goal tree with alignment, check-in sheet, approve / send back, period switcher, suggest a goal. Backend: AI goal suggestion (optional).
- **PRF-03 Goal map (C).** UI: tree or map view with stat cards, Export, Add company goal, Suggest parent. Live is a list. Backend: none.
- **PRF-04 Cycle control room (C).** UI: progress by stage, overdue by owner, Extend deadline, Send reminders, Release ratings. Live is a set-up and checks page. Backend: per-stage progress aggregates and reminders.
- **PRF-05 Review workspace (C).** UI: the full review form with peer feedback, kudos, score, "Help me write" draft, bias check (PRF-17), Download PDF. Live `ReviewScreen` is a 9-line wrapper. Backend: **AI writing help and bias check**.
- **PRF-07 / 08 / 11 / 12 (B).** UI: Praise / Suggestion kinds, cadence and agenda columns, PIP tabs (Plan / Acknowledgement / Outcome), extend plan. Backend: none major.
- **PRF-09 Calibration (C board).** UI: **9-box** tab, distribution-vs-guide chart, Close calibration. Backend: potential rating (second axis for the 9-box).
- **PRF-10 Comp review (B).** UI: rating, compa-ratio and proration columns, send back / approve, Export. Backend: **market data (P25 to P75)**.
- **PAY-39 Pay band, Settings 6.3 (B).** Minor layout differences.

### Hiring
- **HIR-01 Headcount plan (B).** UI: revision approval flow, budget bars, Export. Backend: none.
- **HIR-03 Jobs (B list / C workspace).** UI: Applicants, In pipeline, Recruiter and Posted columns; workspace tabs Overview / Pay range (HIR-24) / Referrals and internal; activity timeline. Backend: pay range on jobs; referrals link (the referrals API exists in the old ATS).
- **HIR-04 Pipeline board (C, missing).** UI: **kanban by stage**, bulk actions, move menu with reject reasons. Live job page lists applications. Backend: none (the `pipeline` API exists).
- **HIR-05 Candidate record (C).** UI: tabs Overview / Scores / Consent and retention, timeline, identity strip (HIR-22), Schedule interview, Move to next stage, under-18 and duplicate banners. Live has applications plus GDPR actions. Backend: identity checks.
- **HIR-06 Interview calendar (C).** UI: calendar, **Find a slot** and offer top 3, book and send invites. Backend: calendar free/busy (`calendar-sync` exists).
- **HIR-07 Scorecard (B).** Minor differences.
- **HIR-20 Talent CRM (C for candidates and pools).** UI: pools with opt-in columns, nurture sequences (email and WhatsApp), engagement timeline. Backend: sequences (`drip` exists in the old app).
- **T9-09 Careers, HIR-03 postings (B).** Minor differences.

### Helpdesk and approvals
- **HLP-01 Help centre (B).** UI: answer-first search with article deflection ("Glad that helped"), then raise a ticket. Live is tickets-first with a chat banner. Backend: none.
- **HLP-02 Agent desk, HLP-03 Ticket (B).** Live is often richer (board view, rails). The design adds "Show breaching", Assign to me, and Move to queue in the drawer.
- **HLP-04 KB editor (B).** UI: audience and placement panel, versions and compare, Preview as employee, Publish dialog.
- **HLP-05 SLA dashboard (C).** UI: stat cards, breaches-by-queue and weekly-target charts, agent table, Export. Live Reports has tabs only. Backend: SLA aggregates.
- **PLT-04 Approvals (B).** UI: "Delegated to me" and "Sent by me" views. Live has Waiting / History / When I am away.

### Settings
- **Settings G1–G8 (B for all mapped pages).** The design is one registry-driven settings system: a **Settings home with search** ("probation", "PF ceiling"), group pages and page templates with read-only mode, unsaved-changes guard, and a "below the legal minimum" block (`settings-screens.tsx`, `registry-*.ts`). The live settings are separate screens under Organisation and Security. UI: the Settings home, search and group pages. Backend: a settings search index (or a static registry).

### Public pages
- **T9-16 Public help centre (C).** Live is a page-local implementation (`help-client`), not the design.
- **T9-01, T9-02, T9-08 (B).** Minor layout and branding differences in the portal frame.

---

## 4. Designed screens with no live page

Counted from the story IDs. "Partly" means part of the screen exists inside another live page.

- **People (PPL):**
  - None: PPL-07 Employee import, PPL-09 Restructure wizard, PPL-10 Inter-entity continuity, PPL-23 Death in service, PPL-26 Succession, PPL-34 Identity panel, PPL-35 Roles panel, PPL-36 Possible same person, PPL-37 Merge/unmerge, PPL-38 Disability declaration, PPL-39 Union register, PPL-42 Re-verification, PPL-43 BFSI declarations, PPL-44 Trading pre-clearance, PPL-45 Work authorisations, PPL-46 International bank.
  - Partly: PPL-04 Change action, PPL-15 Pre-boarding actions, PPL-17 Probation form, PPL-31 Certificate request.
- **Time (TIM):**
  - None: TIM-01 Today board, TIM-03 Day card, TIM-04 Exceptions, TIM-07 Attendance request, TIM-10 Device backfill, TIM-12 Mobile check-in, TIM-13 Kiosk, TIM-14 Devices, TIM-19 Leave request detail, TIM-22 Comp-off, TIM-23 Optional holidays, TIM-24 Encashment, TIM-25 Long absence, TIM-30 Leave reports, TIM-31 Geofences, TIM-32 Field-force map, TIM-33 Visit check-in, TIM-34 Auto-roster, TIM-35 Open shifts, TIM-36 Presence, TIM-37 Industrial action, TIM-38 Standby, TIM-39 Block leave, TIM-40 Licences, TIM-41 Hybrid office days, TIM-42 Holiday feed, TIM-43 Timesheet pre-fill.
  - Partly: TIM-08 Swap, TIM-18 Apply leave, TIM-29 Year-end.
- **Pay (PAY):**
  - None: PAY-19 Court orders and recoveries, PAY-24 Bonus, PAY-29 Weekly/fortnightly runs, PAY-40 Why is my pay different, PAY-43 Group health.
  - Partly: PAY-02 Readiness, PAY-07/08/09 (run tabs), PAY-11 Off-cycle, PAY-25 Reports, PAY-41 Regime compare, PAY-42 Suggest split.
- **Expenses (EXP):** EXP-08 Card statement import.
- **Performance (PRF):** PRF-01 Home, PRF-06 Acknowledgement, PRF-13 Hand-over list, PRF-14 Competency framework, PRF-15 Disputes, PRF-16 Manager coach, PRF-17 Review assistant and bias check.
- **Hiring (HIR):** HIR-02 Requisitions (partly), HIR-04 Pipeline board, HIR-08 AI interview review, HIR-09 Offer builder, HIR-10 BGV, HIR-11 Recruiting costs, HIR-12 Referrals, HIR-13 Internal jobs, HIR-14..19 and 21 Staffing desk (clients, rate cards, submissions, placements, invoices, collections, vendors), HIR-22 Identity strip, HIR-23 Bias audit, HIR-24 Pay range, HIR-25 Notetaker consent, HIR-26 Rediscovery, HIR-27 Interview day, HIR-28 Bulk offers, HIR-29 Offer conditions, HIR-30 Placement fees, HIR-31 E-invoice banner. (Offers, referrals and internal jobs exist in the older ATS outside `/yx`.)
- **Projects (PRJ-01..08):** all 8.
- **Compliance (CMP):**
  - None: CMP-02 Statutory set-up (partly in Pay set-up), CMP-04 TDS challan, CMP-05 TDS return wizard, CMP-07 Missing-ID dashboard, CMP-09 IC console, CMP-10/11 POSH, CMP-12 Supplementary filing.
- **Contract labour (CLB-01..08):** all 8.
- **Helpdesk (HLP):** HLP-06 Speak-up, HLP-07 My cases, HLP-08 Case team, HLP-09 Ethics desk, HLP-10 Policy library, HLP-11 Policy admin, HLP-12 Accident case, HLP-13 Collective dispute, HLP-14 AI policy writer.
- **Visitors (VIS-01..04):** all 4.
- **Engage (ENG-01..12):** all 12.
- **Learning (LRN-01..16):** all 16.
- **Platform (PLT):**
  - None: PLT-01 shell (see section 1), PLT-02 Role homes, PLT-03 Notifications inbox, PLT-08 Set-up hub, PLT-09 Tenant wizard, PLT-14/15 Integrations and API keys, PLT-18 Access states (partly: live no-access state), PLT-20/21 Search, PLT-22/23 Object and layout builder, PLT-27 DSAR, PLT-28 AI governance, PLT-33..64 (rules, regions, copilot, EOR, jobs, trial, Workflow Studio).
- **Settings:** Settings home and search; G3 Time and leave pages beyond what Time set-up covers; G4.3 to 4.6; G5.1, 5.3, 5.6; G6.2, 6.4, 6.5; all of G7 (integrations) and G8 (billing).
- **Portals:** T9-03 to T9-07, T9-10 to T9-15, T9-17 to T9-25; PTR-01..09 Partner portal; MOB-01..03 Mobile shell.
- **Out of scope here:** Proctoring and Analytics (36 stories, the exam product); the YukthiX console (YX-01..18) lives under `/staff`, not `/yx`.

---

## 5. Summary numbers

**Per category (193 pages):** A 27 · B 92 · C 41 · D 33.

**Per module:**

| Module | Pages | A | B | C | D |
|---|---|---|---|---|---|
| People | 24 | 0 | 15 | 6 | 3 |
| Me (self-service) | 17 | 2 | 10 | 2 | 3 |
| Time | 15 | 0 | 6 | 7 | 2 |
| Pay | 36 | 0 | 15 | 10 | 11 |
| Expenses | 9 | 0 | 6 | 3 | 0 |
| Performance | 22 | 0 | 15 | 5 | 2 |
| Hiring | 14 | 0 | 5 | 5 | 4 |
| Helpdesk and approvals | 20 | 12 | 6 | 1 | 1 |
| Settings and admin | 16 | 5 | 11 | 0 | 0 |
| Public and portals | 20 | 8 | 3 | 2 | 7 |

Size check: in the live folders, screens average about 60 to 120 lines, while the designed counterparts run about 100 to 600 lines (e.g. Run workspace 81 vs 596, Loans 65 vs 430, Tax 73+92 vs 544).

### Top 15 most visible gaps
1. **No global search (Ctrl K)** in the top bar. [Shell; nav-only is UI, records need backend]
2. **Menu grouped by permission, not by product area.** No Home, Pay or Performance areas; the panel is titled "Menu" with a flat 22-link list, no groups, no counts. [Shell, UI]
3. **No notifications bell, no company/period switcher, no Ask AI**; Help floats at the bottom instead of sitting in the bar. [Shell; bell, scope and AI need backend]
4. **No Home page** (role home, PLT-02); people land on a module page. [UI + aggregates backend]
5. **Directory:** no count cards with trends, no Status/ID columns, no Filter / View / Group / Columns / Export, no Import. [UI + backend for kinds, status, trends]
6. **Plain tables in Pay and Time:** no sort, filter, saved views, columns, export or bulk select. [UI]
7. **Payroll home and run workspace** lack the stage tracker, stat cards, validations, variance, the "why this number" drawer and the audit trail. [UI + backend for variance and explain]
8. **Person record:** the designed 9-tab record is split across Profile and Job history. [UI, mostly]
9. **My payslips:** a list plus drawer instead of a payslip viewer with YTD, "why is my pay different", raise query and PDF. [UI + explain backend]
10. **Muster and team leave:** no freeze/lock/bulk-mark flow; no people × days calendar. [UI, small backend]
11. **Performance:** no Performance home; goal map is a list; calibration has no 9-box or distribution chart; review workspace is thin. [UI + AI backend]
12. **Hiring:** no pipeline kanban, no interview calendar or find-a-slot; candidate record lacks tabs, timeline and move stage. [UI, existing APIs]
13. **Onboarding board** is a table, not a kanban; **Exit case** lacks the stage stepper and deprovisioning. [UI]
14. **Expenses home and reports:** no stat cards, no "waiting for you", no snap receipt / mileage / trip quick actions, no charts or GST report. [UI + OCR backend]
15. **Settings:** no Settings home, no settings search, no G1–G8 structure. [UI]

---

## 6. Recommended fix order (rough sizes, one developer)

Sizes: S = 1–2 days, M = 3–5 days, L = 1–2 weeks, XL = 2–3 weeks.

| Batch | What | Size |
|---|---|---|
| 0 | **Enabler:** make the designed frames shell-aware. When `DesktopFrame`/`PhoneFrame` render inside a real `AppShell` (export `ShellContext`, check it), render only the children. Then any designed screen can drop into a live page without a second shell. Add `personaFromPermissions()` and a `useToday()` helper. | S |
| 1 | **Shell:** new workspace shell built on the designed parts. Area rail (`SCREEN_RAIL` filtered by permissions), area panels with groups and counts (`peoplePanel`, `timePanel`, `payPanel`, `hirePanel`, `growthPanel`) driven by the existing permission-filtered link list in `layout.tsx`; Me moves to the avatar menu; Help and the profile menu in the bar; **Ctrl K palette with navigation-only results**. Later in the batch: ScopePicker (entity), NotificationCentre (when the feed exists). Leave Ask AI hidden. | L |
| 2 | **People core:** Directory (PPL-01), Person record (PPL-03, merges profile and history), Team (PPL-08), Org chart (PPL-02). Plus a Home placeholder (PLT-02 with the approvals list only). | L |
| 3 | **Time employee and manager:** Attendance (calendar), Leave home (TIM-17/18/19), Team leave calendar (TIM-20), Muster (TIM-02), OT review (TIM-09). | L |
| 4 | **Pay core:** Payroll home (PAY-01), Readiness + Run workspace + approve/bank/publish (PAY-02/03/07/08/09), Payslip viewer (PAY-21), Tax workspace (PAY-22). | XL |
| 5 | **Approvals, Help centre, Expenses:** PLT-04, HLP-01, EXP-01/02/03/06. | M |
| 6 | **Performance:** home (PRF-01), goals and goal map (PRF-02/03), review workspace (PRF-05), calibration 9-box (PRF-09), cycle control room (PRF-04). | L |
| 7 | **Hiring:** jobs and workspace (HIR-03), pipeline board (HIR-04), candidate record (HIR-05), interview calendar (HIR-06), talent CRM (HIR-20). | L |
| 8 | **Remaining B pages** per module: mostly direct swaps (people lifecycle, pay set-up screens, time admin, expenses trips and advances, performance lists). | L |
| 9 | **Settings home and registry** (G1–G8 pages that map to live settings). | L |

Total: about 14 to 18 weeks. Batches 0 to 2 give the biggest visible change in about 4 weeks.

---

## 7. How to fix, per module, and the hard parts

**The general method for each screen:**
1. Add data props and async callbacks to the designed component, in place of its fixture imports and local "notice" mocks.
2. Write a small adapter in `apps/web/lib/yx-*` that maps the API to the designed row types.
3. Point the page at the designed screen.
4. Move the live screen's tests (and its good bits: the no-access state, the `run()` error handling) onto the designed screen.
5. Delete the live screen, its story and the `./live` export entry. When a folder is empty, change the `package.json` export (e.g. `./time` → `screens/time/index.ts`).

**What makes this hard, and the fix for each:**

| Problem | Where | Fix |
|---|---|---|
| Designed screens **wrap themselves in a mock frame** (`PeopleFrame`, `PayFrame`, `TimePage`, `GrowthFrame`, `HireFrame`, `EmpFrame`, `MeFrame`), each with mock user `ME`, mock entities and fixed panel counts. | All modules | Batch 0: the frame becomes a pass-through inside a real shell. Panel counts come from the shell, not the screen. |
| Designed screens **import fixtures and constants directly**: `ME`, `TODAY`, `DISTINCT_PERSONS`, `SINCE_AUGUST`, `ENTITIES`, `OPEN_QUERIES`, and "Kaveri Foods" in description text. | People, Pay, Time, Performance | Turn each into a prop (optional, defaulting to the fixture so the stories keep working). |
| **Client-side filtering of a full array** (e.g. Directory takes `rows: WorkforceRow[]`) vs **server paging** in live (`DirectoryPage` with offset/limit and a query). `DataTable` has client paging only (`pageSize`), no row count or page callbacks. | Directory, Candidates, Tickets, any large list | Add a server mode to `DataTable` (`rowCount`, `onQueryChange` for search, filter, sort and page), or use "load more". Lift filter state into props. |
| **Different row shapes:** the design uses display strings (`department: 'Engineering'`); live uses `Ref {id, name}` and nullable fields. | All | Map in the adapter, keeping ids for actions. Widen the designed types where needed (e.g. `id` alongside `name`). |
| **Different persona models:** People `'hr'\|'mgr'\|'emp'`, Pay `'pa'\|'fin'`, Growth `'emp'\|'mgr'\|'hr'\|'ld'\|'mod'\|'fin'`, Time takes a user object; live uses permission strings. | All | One helper `personaFromPermissions(perms, module)`. |
| **Actions are mocks** (`onClick={() => {}}`, `setNotice(...)`). | All | Add `onX(): Promise` props. Reuse the live `run()` pattern for busy, error and toast states (feedback memory: success = toast). |
| **One live page = several designs, or one design = several live pages** (Time set-up = TIM-26/27/28/29; Special pay = PAY-31..36; Tax = /me/tax + /me/tax-declarations; Person record = profile + history). | Time, Pay, People | Follow the design: separate routes where the design has separate screens, one route where it has one. Add redirects from old URLs. |
| **Design fields with no backend** (Directory kinds, status and trends; market pay data; AI help; EWA partner; OCR; notifications; search). | See section 3 "Backend" | Hide the control when the prop is missing (render nothing, not a disabled stub). Ship the UI swap first and turn the extras on as the backend lands. |
| **Live-only features with no design** (desk board view, candidate GDPR erase, consultants, equity, country packs, payroll audit, reopen requests, payroll feed, etc.: the 33 D pages and some extras). | Pay, Hiring, Time, Helpdesk | Keep them on the live screen, restyled with the designed patterns (PageHeader + DataTable + FilterBar), or design them first. Founder decision. |
| **Phone variants** (`*Phone` components) are separate in the design; live is responsive only. | All | Leave for the mobile phase; don't block the desktop swap. |

**Per module, in short:**
- **People:** swap Directory, Org chart, Team and Person record first. Lifecycle screens (`people/live`) are B and mostly direct swaps, apart from the onboarding kanban and the exit-case stepper.
- **Time:** the designed screens are the biggest (12.9k lines). Swap TIM-17/20/02/09/15 first. Time set-up becomes the four designed editors.
- **Pay:** the run workspace is the hardest (596 lines, many sheets). Do readiness → workspace → approve/bank/publish as one batch. Keep the live D pages (audit, reopen, imports, consultants, equity, country packs) and restyle them.
- **Expenses:** live is closest overall. Swap home and reports; claim, trip and advance are small diffs.
- **Performance:** add the missing home; swap the goal map, review workspace and calibration. AI items wait for the backend.
- **Hiring:** the pipeline board and candidate record are the core. Decide first about the older ATS ("Hiring app") so we don't build two of each.
- **Helpdesk:** live is often richer than HLP. Keep the live desk and port the designed HLP-01 search-first help centre and the HLP-05 dashboard.
- **Settings:** build the Settings home and registry, then move each live settings screen under its group page.

### Decisions for the founder
1. **Menu model:** adopt the designed product areas (Home, People, Time, Pay, Compliance, Hire, Performance, Helpdesk, Analytics, Settings) with Me in the avatar menu? (Recommended: yes.)
2. **Live features with no design** (33 D pages plus extras such as the desk board view and candidate erase): keep them as they are, restyle them, or design them first?
3. **Two hiring apps:** the older ATS ("Hiring app") and YukthiX Hiring. Which one is the future?
4. **Controls that need missing modules** (contract workers, placements, learning tab, AI help): hide them until the module exists (recommended), or show them as "coming soon"?
5. **Where Expenses and Performance live:** the design puts Expenses under Pay and Performance as its own area; live puts both under Me and People.
6. **Icons:** colour rail icons (live) or outline icons (design)?
7. **Breadcrumbs:** on every page, or nowhere (the design mostly uses none)?

### Founder decisions (accepted 15 Oct 2026)
1. **Menu model:** the designed product areas plus **Home**. **Me** moves to the avatar menu.
2. **Pages with no design (the 33 D pages):** design each one first, as a designed story in the yx-ui library in the YukthiX style, then make that design live.
3. **Hiring:** YukthiX Hiring is the only hiring app.
4. **Modules that are not built:** hide them (no "coming soon").
5. **Expenses** go under **Pay**. **Performance** is its own area.
6. **Icons:** exactly as designed (Lucide outline icons in the rail).
7. **Breadcrumbs:** below the top level of each area.

**Working rule from now on:** make the existing designed screen live by adapting it to real data; never build a second version. A page with no design is designed first. Match the design exactly before handing over. One step at a time: build, the founder tests, then the next step.
