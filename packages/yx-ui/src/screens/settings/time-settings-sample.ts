// Story and test sample: the Time & Leave, Payroll and People entries of the API's settings registry
// (apps/api/src/org-structure/settings-registry.ts), as GET /org/settings sends them.
import type { RegistryDef } from './time-settings-live';

export const TIME_REGISTRY_SAMPLE: Record<string, RegistryDef> = {
  // IT assets part 1 (answer 2712): Settings 2.8.
  "asset.ack_method": { "label": "Acknowledgement", "values": ["click", "none"], "default": "click", "labels": { "click": "Click to accept", "none": "None" }, "scopes": ["tenant"] },
  "asset.warranty_alert_days": { "label": "Warranty alert", "values": ["off", "7", "15", "30", "60", "90"], "default": "30", "labels": { "off": "Off", "7": "7 days before", "15": "15 days before", "30": "30 days before", "60": "60 days before", "90": "90 days before" }, "scopes": ["tenant"] },
  "asset.licence_alert_days": { "label": "Licence expiry alert", "values": ["off", "7", "15", "30", "60", "90"], "default": "30", "labels": { "off": "Off", "7": "7 days before", "15": "15 days before", "30": "30 days before", "60": "60 days before", "90": "90 days before" }, "scopes": ["tenant"] },
  "asset.contract_alert_days": { "label": "Contract notice alert", "values": ["off", "0", "7", "15", "30"], "default": "0", "labels": { "off": "Off", "0": "On the notice date", "7": "7 days before the notice date", "15": "15 days before the notice date", "30": "30 days before the notice date" }, "scopes": ["tenant"] },
  "asset.booking_max_days": { "label": "Longest booking", "values": ["1", "3", "7", "14", "30"], "default": "14", "labels": { "1": "1 day", "3": "3 days", "7": "7 days", "14": "14 days", "30": "30 days" }, "scopes": ["tenant"] },
  "asset.booking_approval": { "label": "IT approves each booking", "values": ["on", "off"], "default": "off", "scopes": ["tenant"] },
  "asset.recovery_to_fnf": { "label": "Add unreturned-asset recovery to F&F", "values": ["on", "off"], "default": "on", "scopes": ["tenant"] },
  "asset.recovery_basis": { "label": "Recovery amount", "values": ["category_default", "written_down", "hr_decides"], "default": "category_default", "labels": { "category_default": "Category default", "written_down": "Written-down value", "hr_decides": "Decided by HR each time" }, "scopes": ["tenant"] },
  "attendance.check_in_opens_minutes": {
    "label": "Check-in opens before the shift starts (minutes)",
    "values": [
      "any",
      "15",
      "30",
      "60",
      "90",
      "120",
      "180"
    ],
    "default": "any"
  },
  "attendance.phone_binding": {
    "label": "Phone check-in only from an approved phone",
    "values": [
      "off",
      "on"
    ],
    "default": "off",
    "guard": "access.role.manage"
  },
  "kiosk.methods": {
    "label": "At a kiosk people sign in with",
    "values": [
      "pin",
      "qr",
      "face"
    ],
    "default": "pin,qr",
    "multi": true
  },
  "kiosk.training_opens_minutes": {
    "label": "Training check-in at a kiosk opens this many minutes before the start",
    "values": [
      "0",
      "5",
      "10",
      "15",
      "30",
      "60"
    ],
    "default": "15"
  },
  "kiosk.pin_tries": {
    "label": "Wrong kiosk PIN tries before a 15-minute lock",
    "values": [
      "3",
      "5",
      "10"
    ],
    "default": "5",
    "guard": "access.role.manage"
  },
  "field.tracking": {
    "label": "Track field staff on duty (with their consent)",
    "values": [
      "off",
      "on"
    ],
    "default": "off"
  },
  "field.ping_minutes": {
    "label": "A moving phone reports its place every (minutes)",
    "values": [
      "1",
      "2",
      "5",
      "10",
      "15"
    ],
    "default": "5"
  },
  "field.max_accuracy_m": {
    "label": "Ignore places less accurate than (metres)",
    "values": [
      "50",
      "100",
      "200",
      "500"
    ],
    "default": "100"
  },
  "field.trail_retention_days": {
    "label": "Keep the location trail for (days)",
    "values": [
      "7",
      "15",
      "30",
      "45",
      "90",
      "180"
    ],
    "default": "30"
  },
  "roster.max_daily_hours": {
    "label": "Most hours of shifts in a day",
    "values": [
      "8",
      "9",
      "10",
      "11",
      "12"
    ],
    "default": "9"
  },
  "roster.max_weekly_hours": {
    "label": "Most hours of shifts in a week",
    "values": [
      "40",
      "45",
      "48",
      "54",
      "60"
    ],
    "default": "48"
  },
  "roster.max_spread_over_hours": {
    "label": "Longest working day from start to end, breaks included (hours)",
    "values": [
      "10.5",
      "12",
      "13"
    ],
    "default": "10.5"
  },
  "attendance.min_rest_hours": {
    "label": "Least rest between shifts (hours)",
    "values": [
      "0",
      "8",
      "9",
      "10",
      "11",
      "12"
    ],
    "default": "11"
  },
  "attendance.overtime.pre_approval": {
    "label": "Overtime claimed without pre-approval",
    "values": [
      "flag",
      "refuse",
      "allow"
    ],
    "default": "flag"
  },
  "standby.call_out_minimum_hours": {
    "label": "A call-out is paid for at least (hours)",
    "values": [
      "0",
      "1",
      "2",
      "3",
      "4"
    ],
    "default": "2"
  },
  "roster.change_notice_hours": {
    "label": "Notice before a published shift changes (hours)",
    "values": [
      "0",
      "12",
      "24",
      "48",
      "72"
    ],
    "default": "24"
  },
  "roster.open_shift_rule": {
    "label": "Open shifts go to",
    "values": [
      "manager_picks",
      "first_come"
    ],
    "default": "manager_picks"
  },
  "roster.min_weekly_offs": {
    "label": "Weekly offs each week at least",
    "values": [
      "0",
      "1",
      "2"
    ],
    "default": "1"
  },
  "attendance.late_mark_penalty": {
    "label": "Each late mark over the free ones costs (days of pay)",
    "values": [
      "0",
      "0.5",
      "1"
    ],
    "default": "0"
  },
  "attendance.short_hours.band1": {
    "label": "Short day: the shortest band is worked time under (hours)",
    "values": [
      "2",
      "3",
      "4",
      "5"
    ],
    "default": "4"
  },
  "attendance.short_hours.band2": {
    "label": "Short day: the middle band ends at (hours)",
    "values": [
      "5",
      "6",
      "7"
    ],
    "default": "6"
  },
  "attendance.short_hours.band3": {
    "label": "Short day: the longest band ends at (hours; a full day from here)",
    "values": [
      "7",
      "8",
      "9"
    ],
    "default": "8"
  },
  "attendance.frequent_breaks.count": {
    "label": "Frequent breaks: more breaks than this in a day",
    "values": [
      "2",
      "3",
      "4",
      "5",
      "6"
    ],
    "default": "3"
  },
  "attendance.frequent_breaks.minutes": {
    "label": "Frequent breaks: or breaks adding up to at least (minutes a day)",
    "values": [
      "30",
      "45",
      "60",
      "90",
      "120"
    ],
    "default": "60"
  },
  "attendance.regularise_monthly_limit": {
    "label": "Fixes a month with manager approval only",
    "values": [
      "0",
      "2",
      "3",
      "4",
      "5",
      "6",
      "8",
      "10"
    ],
    "default": "4"
  },
  "attendance.wfh_monthly_limit": {
    "label": "Work from home days a month with manager approval only",
    "values": [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "8",
      "10",
      "15",
      "22"
    ],
    "default": "4"
  },
  "attendance.day_place_rule": {
    "label": "A day with both office and remote punches counts as",
    "values": [
      "office_wins",
      "remote_wins",
      "first_punch"
    ],
    "default": "office_wins"
  },
  "attendance.wfh_same_day": {
    "label": "Clock in as work from home on the day (sent for approval)",
    "values": [
      "on",
      "off"
    ],
    "default": "on"
  },
  "attendance.presence": {
    "label": "Presence-based attendance on work-from-home days",
    "values": [
      "off",
      "on"
    ],
    "default": "off"
  },
  "attendance.on_duty.ahead_days": {
    "label": "On duty can be asked this many days ahead",
    "values": [
      "0",
      "7",
      "15",
      "30",
      "60",
      "90"
    ],
    "default": "30"
  },
  "attendance.on_duty.back_days": {
    "label": "On duty can be asked this many days back",
    "values": [
      "0",
      "3",
      "7",
      "15",
      "30",
      "60"
    ],
    "default": "60"
  },
  "attendance.on_duty.send_back": {
    "label": "Managers can send on duty back for changes",
    "values": [
      "on",
      "off"
    ],
    "default": "on"
  },
  "attendance.permission.monthly_limit": {
    "label": "Hourly permissions a month",
    "values": [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6"
    ],
    "default": "2"
  },
  "attendance.permission.max_minutes": {
    "label": "Longest hourly permission (minutes)",
    "values": [
      "30",
      "60",
      "90",
      "120",
      "180",
      "240"
    ],
    "default": "120"
  },
  "leave.notice_days.default": {
    "label": "Apply leave at least this many days ahead (types without their own number)",
    "values": [
      "0",
      "1",
      "2",
      "3",
      "5",
      "7",
      "10",
      "14",
      "15",
      "21",
      "30"
    ],
    "default": "0"
  },
  "leave.on_behalf.approval": {
    "label": "Leave HR applies for someone",
    "values": [
      "chain",
      "approved"
    ],
    "default": "chain"
  },
  "leave.send_back": {
    "label": "Approvers can send leave back for changes",
    "values": [
      "on",
      "off"
    ],
    "default": "on"
  },
  "leave.encashment.window": {
    "label": "Leave can be cashed in while working",
    "values": [
      "off",
      "any_month",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12"
    ],
    "default": "off"
  },
  "leave.year_end.encash_excess": {
    "label": "At year end, pay out cash-in leave over the carry-forward limit",
    "values": [
      "on",
      "off"
    ],
    "default": "on"
  },
  "leave.liability.divisor": {
    "label": "Daily pay for the leave liability: monthly pay divided by",
    "values": [
      "26",
      "30",
      "calendar"
    ],
    "default": "26"
  },
  "leave.probation.leave": {
    "label": "Leave while on probation",
    "values": [
      "all",
      "casual_sick_unpaid",
      "unpaid_only"
    ],
    "default": "all"
  },
  "leave.comp_off.claim_within_days": {
    "label": "Claim comp-off within (days of the work)",
    "values": [
      "7",
      "15",
      "30",
      "45",
      "60"
    ],
    "default": "30"
  },
  "leave.comp_off.auto_from_roster": {
    "label": "Credit comp-off automatically when the roster puts someone to work on a weekly off or holiday and they work it",
    "values": [
      "off",
      "on"
    ],
    "default": "off"
  },
  "leave.overview.no_leave_days": {
    "label": "Team leave: \"no leave taken\" means none approved in the last (days)",
    "values": [
      "30",
      "60",
      "90",
      "120",
      "180"
    ],
    "default": "90"
  },
  "leave.comp_off.expiry_days": {
    "label": "Comp-off must be used within (days of the work)",
    "values": [
      "30",
      "45",
      "60",
      "90",
      "180",
      "365",
      "never"
    ],
    "default": "60"
  },
  "leave.block_leave.days": {
    "label": "Block leave length (working days in a row)",
    "values": [
      "5",
      "10",
      "15"
    ],
    "default": "10"
  },
  "leave.block_leave.next_year_days": {
    "label": "A block may run into the next leave year if it starts within (days)",
    "values": [
      "0",
      "30",
      "60",
      "90"
    ],
    "default": "60"
  },
  "leave.optional_holiday.prorate_on_move": {
    "label": "Prorate optional holidays after a move to another office",
    "values": [
      "yes",
      "no"
    ],
    "default": "yes"
  },
  "leave.year_start_month": {
    "label": "Leave year starts in",
    "values": [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12"
    ],
    "default": "1"
  },
  "leave.block_dates.mode": {
    "label": "Planned leave on company block dates",
    "values": [
      "block",
      "warn"
    ],
    "default": "block"
  },
  "payroll.journal.suspense": {
    "label": "Pay lines with no ledger account go to the suspense account",
    "values": ["on", "off"],
    "default": "on",
    "labels": { "on": "On: park them there and let the journal go to the books", "off": "Off: refuse the export until every line is mapped" }
  },
  "payroll.costing.split": {
    "label": "Split each person's payroll cost by",
    "values": ["cost_centre", "project_hours"],
    "default": "cost_centre",
    "labels": { "cost_centre": "Cost centre (from the job)", "project_hours": "Project hours (approved timesheets, else allocations)" }
  },
  "payroll.journal.format": {
    "label": "Journal export format",
    "values": ["csv", "tally", "zoho", "sap", "oracle"],
    "default": "csv",
    "labels": { "csv": "CSV", "tally": "Tally (XML)", "zoho": "Zoho Books (CSV)", "sap": "SAP (flat file)", "oracle": "Oracle GL (interface CSV)" }
  },
  "payroll.variance_threshold_pct": {
    "label": "Ask to confirm a net pay change above (%)",
    "values": [
      "5",
      "10",
      "15",
      "20",
      "25"
    ],
    "default": "10"
  },
  "payroll.net_rounding": {
    "label": "Round net pay",
    "values": [
      "none",
      "rupee"
    ],
    "default": "rupee"
  },
  "payroll.standard_daily_hours": {
    "label": "Standard hours a day (for hourly rates and cost rates)",
    "values": [
      "8",
      "8.5",
      "9"
    ],
    "default": "8"
  },
  "payroll.leave_encashment_basis": {
    "label": "Leave encashment is paid on",
    "values": [
      "basic_da",
      "gross"
    ],
    "default": "basic_da"
  },
  "payroll.protected_net_percent": {
    "label": "Recoveries leave at least this share of gross pay (%)",
    "values": [
      "0",
      "10",
      "20",
      "25",
      "30",
      "40",
      "50"
    ],
    "default": "0"
  },
  "payroll.notice_shortfall": {
    "label": "An unserved notice period is",
    "values": [
      "recover",
      "waive"
    ],
    "default": "recover"
  },
  "payroll.one_time_review_above": {
    "label": "One-time pay above this amount needs approval",
    "values": [
      "none",
      "10000",
      "25000",
      "50000",
      "100000"
    ],
    "default": "50000"
  },
  "payroll.mid_period.join": {
    "label": "Joining in the middle of a month is paid",
    "values": [
      "segments",
      "cutoff",
      "next_month_arrears"
    ],
    "default": "segments"
  },
  "payroll.mid_period.exit": {
    "label": "Leaving in the middle of a month is paid",
    "values": [
      "segments",
      "cutoff"
    ],
    "default": "segments"
  },
  "payroll.mid_period.revision": {
    "label": "A pay change in the middle of a month is paid",
    "values": [
      "segments",
      "cutoff",
      "next_month_arrears"
    ],
    "default": "segments"
  },
  "payroll.mid_period.cutoff_day": {
    "label": "Whole-month cut-off day (changes after it are paid next month)",
    "values": [
      "10",
      "15",
      "20",
      "25"
    ],
    "default": "15"
  },
  "payroll.settings.second_person": {
    "label": "Payroll setting changes need a second person",
    "values": [
      "on",
      "off"
    ],
    "default": "on",
    "guard": "access.role.manage"
  },
  "payroll.settings.lapse_days": {
    "label": "A payroll setting change nobody decides lapses after (days)",
    "values": [
      "7",
      "14",
      "21",
      "30"
    ],
    "default": "14"
  },
  "payroll.payslip_email": {
    "label": "Email payslips as password-protected PDFs",
    "values": [
      "off",
      "on"
    ],
    "default": "off"
  },
  "payroll.document_retention_years": {
    "label": "Keep issued pay documents for (years)",
    "values": [
      "8",
      "10",
      "12",
      "15"
    ],
    "default": "8",
    "guard": "access.role.manage"
  },
  "tax.regime_cutoff": {
    "label": "Employees choose their tax regime until (day of the tax year)",
    "values": [
      "04-30",
      "05-31",
      "06-30",
      "07-31"
    ],
    "default": "05-31"
  },
  "tax.proof_window_opens": {
    "label": "Tax proof window opens",
    "values": [
      "10-01",
      "11-01",
      "12-01",
      "01-01",
      "01-15"
    ],
    "default": "01-01"
  },
  "tax.proof_cutoff": {
    "label": "Tax proof cut-off",
    "values": [
      "01-31",
      "02-15",
      "02-28",
      "03-15"
    ],
    "default": "02-28"
  },
  "exit.notice.probation": {
    "label": "Notice period during probation",
    "values": [
      "0d",
      "7d",
      "15d",
      "30d",
      "45d",
      "60d",
      "90d",
      "1m",
      "2m",
      "3m"
    ],
    "default": "15d",
    "dated": true
  },
  "exit.notice.confirmed": {
    "label": "Notice period once confirmed",
    "values": [
      "0d",
      "7d",
      "15d",
      "30d",
      "45d",
      "60d",
      "90d",
      "1m",
      "2m",
      "3m"
    ],
    "default": "30d",
    "dated": true
  },
  "retirement.age": {
    "label": "Retirement age",
    "values": [
      "58",
      "60",
      "62",
      "65"
    ],
    "default": "58"
  },
  "retirement.alert_months": {
    "label": "Open the retirement exit this many months before",
    "values": [
      "1",
      "3",
      "6"
    ],
    "default": "6"
  },
  "vrs.benefit_days": {
    "label": "VRS benefit: days of basic + DA per completed year",
    "values": [
      "30",
      "45",
      "60",
      "90"
    ],
    "default": "45"
  },
  "absconding.days": {
    "label": "Absconding timeline (days: hold, notice 1, notice 2, abandonment)",
    "values": [
      "3,7,14,21",
      "3,7,14,30",
      "5,10,20,30"
    ],
    "default": "3,7,14,21"
  },
  "alumni.access_years": {
    "label": "Alumni can read their documents for (years after leaving)",
    "values": [
      "3",
      "5",
      "7",
      "10"
    ],
    "default": "7"
  },
  "rehire.pf": {
    "label": "Rehire: PF membership (the UAN is always kept)",
    "values": [
      "continue",
      "transfer",
      "fresh"
    ],
    "default": "continue"
  },
  "rehire.same_fy_tax": {
    "label": "Rehire in the same financial year: tax",
    "values": [
      "combine",
      "previous_employer"
    ],
    "default": "combine"
  },
  "rehire.service": {
    "label": "Rehire: service",
    "values": [
      "fresh",
      "continuous",
      "break_counted"
    ],
    "default": "fresh"
  },
  "rehire.gratuity": {
    "label": "Rehire: gratuity service",
    "values": [
      "fresh",
      "add_prior"
    ],
    "default": "fresh"
  },
  "rehire.leave": {
    "label": "Rehire: leave balance",
    "values": [
      "fresh",
      "carry"
    ],
    "default": "fresh"
  },
  "rehire.probation": {
    "label": "Rehire: probation",
    "values": [
      "normal",
      "skip_if_break_lt_6m",
      "never"
    ],
    "default": "normal"
  },
  "rehire.prior_records": {
    "label": "Rehire: earlier warnings and PIPs",
    "values": [
      "hr_only",
      "manager",
      "hidden"
    ],
    "default": "hr_only"
  },
  "audit.retention_years": {
    "label": "Keep the audit log for (years)",
    "values": [
      "8",
      "9",
      "10",
      "12",
      "15",
      "20"
    ],
    "default": "8",
    "guard": "access.role.manage"
  }
};
