# Oracle E-Business Suite R12 HRMS: what we saw (17 Nov 2026, session 1)

Source: a training system with Oracle Vision demo data. We only read it: screens were opened and queried, and
nothing was saved or changed. Screenshots are in `shots/oracle/` (git-ignored).

E-Business Suite (EBS) is Oracle's older on-premise suite; Oracle Fusion HCM Cloud is what Oracle sells today.
The concepts below exist in both. Fusion has newer screens and some extra pieces, marked "(Fusion)" below from
general knowledge, to verify.

## 1. Positions (Work Structures, Position, Description)

Oracle separates **Job** (a generic role, for example "VP300.Vice President") from **Position** (one seat in one
organization, for example "1001.Operations Vice President" in "Vision Electric"). People are assigned to a position.

One position record holds:

| Tab | What it holds |
|---|---|
| Position Details | start date; date-effective name; type (single incumbent, shared, pooled); permanent or seasonal; organization and job; hiring status (active, frozen, proposed, eliminated) with its own dates; location; status |
| Hiring Information | **FTE and headcount**; earliest hire date; fill-by date; "permit recruiting"; proposed entry salary (payroll, salary basis, grade, step, grade rate range); **probation duration**; **overlap duration** for a handover; proposed layoff FTE and date |
| Work Terms | working hours and frequency; normal start and end time; **supervisor position**; related positions: **relief and successor**; "replacement required"; extended pay term (school-year style contracts) |
| Additional Detail | flexfields |
| Budgets | position budgets by version and period: allocated vs available |

Buttons: Reporting To, Evaluation (job evaluation points), Valid Grades, Others.

The menu also has Hierarchy, Mass Move, Diagrammer, **Position Transaction** (a position change goes through
approval), Position Copy and **Mass Position Update**.

**Ideas for YukthiX** (we have jobs and designations, but no positions as seats):
- P1: a Position = one seat (org + job + location + FTE + headcount + supervisor position), date-tracked.
- P2: hiring status on the seat (active, frozen, proposed, eliminated), so vacancies are seats with no one in them.
  Hiring requisitions are raised against a seat.
- P3: a position budget: approved headcount and cost per seat per year; dashboard of filled vs vacant vs budgeted.
- P4: relief and successor positions (feeds succession planning).
- P5: position changes go through an approval (Position Transaction), plus mass update.
- P6: valid grades per position, and a proposed entry salary from the grade.

## 2. Absence depth (Total Compensation, Basic, Accrual Plans)

An **Accrual Plan** is tied to one absence type and has:
- a category (for example Federal Annual Leave), units (hours or days), and an accrual start (hire date, etc.);
- an **accrual formula** and a **carry-over formula** (written in Oracle's FastFormula);
- a **period of ineligibility**, for example 12 calendar months, or a formula;
- a payroll balance reset date (none, 1 January, 1 June, hire anniversary, other);
- **Accrual Bands**: by **years of service from/to**, the annual rate, maximum carry-over and a ceiling;
- **Net Calculation Rules**: which absence types and elements reduce or add to the net entitlement.

Ideas for YukthiX: we have accrual, carry forward and encashment, and D3 "levels by years of service" is approved
in batch A. Oracle adds:
- A1: ceiling (maximum balance) per band, separate from the carry-over cap;
- A2: a period of ineligibility (for example no EL accrual in the first N months), as a setting;
- A3: net-calculation rules (which other absence types reduce this plan's balance).

## 3. Element (pay item) design and retro pay (Total Compensation, Basic, Element Description)

Each pay **element** has:
- **Standard tab:** a classification; nonrecurring or recurring; termination rule (actual termination, final close,
  last standard process); priority; skip rule; multiple entries allowed; process in run; once each period;
  "closed for entry"; qualifying conditions (age, length of service).
- **Advanced tab:** gross-up, iterative calculation, separate payment, process separately.
- **Recalculation tab:** recalculation events and **Retro Components**. The element says which back-dated changes
  make it recalculate, and which retro component pays the difference.
- **Proration tab:** a proration group and formula. Mid-period changes, such as a raise on the 12th, are split by
  days automatically.

Then Input Values, Balance Feeds (which totals the element adds to), Frequency Rules, Usages.

Ideas for YukthiX (we have per-component pay, arrears proposals and late corrections):
- R1: per component, a "recalculate when" list (salary change, joining date, LOP correction, statutory rule change).
  Retro then runs automatically for exactly those components, showing a retro line per component.
- R2: proration rules per component: calendar days, working days or fixed 30. This is in batch H if missing.
- R3: a per-component "separate payment" (for example bonus paid on its own payslip) and gross-up (company pays the
  tax, for example a joining bonus net of TDS).

## 4. Multi-entity (Work Structures, Organization, Description)

One organization record carries **many classifications** at once. Vision Corporation is all of these:
- Business Group (the top container: one set of HR data, one legislation);
- Corporate Headquarters, Employer, **GRE / Legal Entity** (tax-reporting legal employer);
- HR Organization, Operating Unit (finance), Parent Entity;
- AAP Organization, Asset Organization, Disability Organization, Medical Service Provider, and others.

Each classification turns on its own extra information (tax IDs, statutory registrations, costing, etc.).

Ideas for YukthiX (we have legal entities, branches and departments as separate lists):
- M1: allow one organization to be several things at once (legal entity + payroll entity + cost centre), with
  extra details per role, instead of separate trees that must be kept in step.
- M2: (Fusion) a **legislative data group** per country: payroll rules, statutory codes and currency per country,
  with several legal employers under it. This is the base for multi-country.

## 5. Payroll set-up (Payroll menu: Description, Consolidation, Payment Methods, GL Flexfield Map, RetroPay Set, Update Payroll Run)

**Payroll (a pay group):**
- Period type (weekly, semi-month, calendar month), first period end date, and how many years of periods to
  generate.
- **Date offsets** from the period end: check (pay) date, scheduled run, **cut-off** for inputs, and **payslip
  release** date.
- Default payment method and consolidation set (payrolls run together).
- **Default costing account and a suspense account**: costs with no valid account go to suspense, not lost.
- Negative payment allowed; **multiple assignments** (one person, two jobs, one payslip).
- Period Dates lists every period with its own status (Open or Closed) and its own check and run dates.

**GL Flexfield Map:** per payroll and ledger, each payroll costing segment maps to a GL chart-of-accounts segment.
That is how pay costs post to finance.

**RetroPay Set:** rules of the form *balance* (for example Regular Wages year-to-date) → *retro element* (Retro
Regular Wages) → input value. RetroPay recalculates past periods and pays the difference through the retro
element. (Fusion and later EBS use per-element "retro components" instead, see section 3.)

Ideas for YukthiX:
- PY1: per pay group, an input **cut-off** date and a **payslip release** date, separate from the pay date. Inputs
  after the cut-off roll to next month automatically, with a notice.
- PY2: a **suspense cost centre**: pay never fails to cost; finance clears suspense later.
- PY3: a GL mapping screen: our cost centre and component → the customer's GL account codes. Feeds the costing and GL
  export in the Enterprise batch.
- PY4: one person with two concurrent jobs (multiple assignments) on one payslip. This is rare in India, so it is
  tier 3.

## 6. Recruitment (Requisition and Vacancy)

A **requisition** (raised by a person, dated) holds one or more **vacancies**. Each vacancy has:
- category, **openings** (headcount) and a status (approved, etc.);
- what it is for: organization, job, **position**, grade, group and location;
- a recruiter;
- a **budget measurement**, for example FTE or "percent full time".

Ideas for YukthiX (Hire has jobs and openings):
- RC1: a vacancy can point at a Position seat (P2), so filling it fills the seat, and the position's headcount
  budget limits how many openings can be approved.
- RC2: a budget measurement on the opening (FTE).

## 7. People and assignment (People, Enter and Maintain)

- The **person** record (name, identification, person type, personal, employment, office, applicant, background,
  rehire, medical, benefits tabs) is separate from the **assignment**: organization, job, position, grade,
  payroll, location, status, vacancy, collective agreement, salary basis, supervisor, probation and notice period.
- Both are date-tracked; the effective-date block on every screen shows from and to.
- **Assignment "Others"** opens 25 linked screens, for example Costing, Budgets, Entry History, Extra Information
  and Grade Step.
- **Assignment costing:** a percentage split across cost codes, date-effective. For example, 60 % to one cost
  centre and 40 % to a project. This is the base for cost allocation.

Ideas for YukthiX:
- PE1: split a person's cost across cost centres or projects by percentage, from a date. This links to the projects
  module and to costing.
- PE2: an "entry history" view: every pay-input change on the person, by date.

## 8. Session 3 (17 Nov 2026, 10–11 PM): hands-on tests with create rights

Test records created, all named "YX TEST":
- position `9901.YX TEST Analyst` (shared, Accounts Payable, CL900.Clerk, FTE 2, headcount 2, permit recruiting,
  probation 6 months);
- requisition `YX TEST Req 1` with vacancy `YX TEST Vac 1`.

**T1, vacancy over headcount: not blocked.**
- A vacancy with **3 openings** on a position with **headcount 2** saved with no warning.
- Picking the position filled the vacancy's organization and job, and Oracle asked "use the location of the new
  position?".
- A requisition must be saved before its vacancy can be added.
- Lesson for YukthiX (O4): **warn, and with a company setting block**, when openings exceed the seat's free
  headcount. Oracle EBS leaves this to budgets and position control, which most customers never set up.

**T2, back-dated pay: could not run.**
- Payroll periods in this training system only run to about 2015.
- Opening one payroll's period dates raised a flexfield error (Time Definition value missing).
- Lesson: we keep the theory from section 3 (per-element recalculation events and retro components). Use Oracle's
  docs for the run output.

**T3, building a leave plan from scratch: needs four set-up records first.**
- An accrual plan must point to an **absence type** that is not used by any other plan, and units must match.
- The absence type needs an **associated element** (pay item) with an input value, plus an element link for
  eligibility. Only then can the plan, its bands and its formulas be saved.
- The absence type itself has: category, "allow absence overlaps" yes or no, units (hours or days), balance
  increasing or decreasing, and a list of **reasons**.
- Lesson: YukthiX creating a leave type in one screen (rules, balance and pay effect together) is a real advantage.
  Keep it, and offer ready-made templates (D2).

**T4, an existing plan with service bands (Vacation), read only.**
- Bands (years of service → annual rate / maximum carry-over / ceiling): 0–3 → 80 h / 40; 3–5 → 96 / 40;
  5–10 → 120 / 45; 10–20 → 160 / 50; 20–50 → 200 / 60. The ceiling is left empty.
- **Net calculation rules**: Carried Over Vacation adds; Paid Vacation subtracts; **VC Accrual Buy adds; VC Accrual
  Sell subtracts.** Employees can buy extra leave or sell leave back, and each moves the balance by date earned.
- Lesson for YukthiX: add "buy leave" (salary deduction for extra days) beside our existing encashment ("sell").
  This is new idea O29, Later.

**T5, timecard (Time Manager, Time Accounting, Entry/Validation/Approval), read only.**
- A timecard per payroll period: employee, period end, batch, approver, date approved, timecard status, total hours,
  source (for example "Manual (changed)").
- **Two blocks.** The top block is what the person worked: date, day, assignment, hours or in/out, hours type. The
  bottom block holds the **details generated by the earning policy**: the same time split into pay types such as
  regular, overtime and double time. A person with no earning policy gets an error and no details.
- **Earning policy** (Policies, Earning), for example the California policy:
  - daily base 8 h regular; over 8 h overtime; over 12 h double time; weekly base 40 h regular;
  - a holiday calendar; which earnings count towards the overtime cap;
  - premium eligibility and premium interaction policies; minimum timecard interval and round-up.
- Other policies in the menu: hour deduction (unpaid breaks), shift differential (night shift premium), premium
  eligibility and premium interaction (which premiums stack).
- Lesson for YukthiX: our attendance → payroll path should have the same split, with raw time kept as worked and
  pay hours worked out by a rule. Check the existing overtime rules against: a daily threshold, a weekly threshold, a
  double-time threshold, holiday premium, a shift differential (night shift allowance) and unpaid break deduction.
  For India: Factories Act overtime is double the ordinary rate over 9 h a day or 48 h a week. This is idea O30;
  check the code first.

**T6, DateTrack history (Tools, DateTrack History... on any date-tracked form).**
- **Change Field Summary:** one row per period (from, to) with the list of fields that changed in that period, and a
  tick for the period in force.
- **Full History:** a grid of every column for every period, with a folder icon to pick columns.
- Lesson: YukthiX already keeps date-tracked history. A per-record "what changed when" summary (fields changed per
  period) on the person, job and pay screens is a cheap, useful view if we don't show it yet. This is idea O31,
  Later; check first.

## 9. Not reached yet

- **Approval rules (AME, Approvals Management Engine):** needs the "Approvals Management Business Analyst"
  responsibility, which this login does not have.
- **Costing:** Payroll Description, Costing; cost allocation on the assignment and element links; how the costing
  flexfield maps to GL accounts.
- **RetroPay sets** and retro element mapping (Payroll, RetroPay set).
- **Audit history:** date-tracked "DateTrack History" on any person or assignment field.
- **Time Manager (OTL):** timecard templates and approval.

Login note: the system is open Monday to Friday, 3:30 PM to midnight IST. Do not change setup; read only.
