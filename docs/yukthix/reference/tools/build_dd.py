"""Build plain-language data dictionaries from Frappe doctype JSON (clean-room: labels + meaning only, no internal field names)."""
import json, os, re, ast, sys

HRMS = r"C:\Users\HariSivaSaiKumarMada\Downloads\hrms-develop\hrms-develop\hrms"
INDIA = r"C:\Users\HariSivaSaiKumarMada\Downloads\india-payroll-develop\india-payroll-develop\india_payroll"
OUT = r"C:\Users\HariSivaSaiKumarMada\Downloads\YukthiX HR Product Design 1\YukthiX\reference\frappe-hrms-functional-spec"

LAYOUT = {"Section Break", "Column Break", "Tab Break", "HTML", "Button", "Heading", "Fold", "Image"}
TYPE = {
    "Data": "Text", "Small Text": "Long text", "Text": "Long text", "Long Text": "Long text",
    "Text Editor": "Rich text", "Code": "Code / expression", "Int": "Whole number", "Float": "Number",
    "Currency": "Amount", "Percent": "Percent", "Check": "Yes/No", "Date": "Date", "Datetime": "Date & time",
    "Time": "Time", "Select": "Choice", "Autocomplete": "Choice", "Attach": "File", "Attach Image": "Image file",
    "Password": "Secret (encrypted)", "Geolocation": "Map location", "Color": "Colour", "Rating": "Rating",
    "Duration": "Duration", "Read Only": "Display only", "Phone": "Phone", "Signature": "Signature",
    "JSON": "Structured data", "Markdown Editor": "Rich text",
}

def human(fn):
    return fn.replace("_", " ").strip().capitalize()

def find_json(name, roots):
    for r in roots:
        for base, dirs, files in os.walk(r):
            if os.path.basename(base) == name and name + ".json" in files:
                return os.path.join(base, name + ".json")
    return None

def cond(expr, labels):
    if not expr:
        return ""
    e = str(expr).strip()
    if e.startswith("eval:"):
        e = e[5:].strip().rstrip(";")
        e = re.sub(r"\bdoc\.__islocal\b", "new record", e)
        e = re.sub(r"!(?!=)", "not ", e)
        e = re.sub(r"\bdoc\.(\w+)",lambda m: "[" + labels.get(m.group(1), human(m.group(1))) + "]", e)
        e = e.replace("===", "=").replace("==", "=").replace("!=", "≠").replace("&&", " and ").replace("||", " or ")
        e = re.sub(r"\bin_list\(\[(.*?)\],\s*(\[[^\]]+\])\)", r"\2 is one of \1", e)
        e = re.sub(r"\[(.*?)\]\.includes\((\[[^\]]+\])\)", r"\2 is one of \1", e)
        e = re.sub(r"\s+", " ", e).strip()
        return e.replace("|", "/")
    return "[" + labels.get(e, human(e)) + "] is set"

def typ(f):
    ft = f.get("fieldtype", "")
    opt = (f.get("options") or "").strip()
    if ft == "Link":
        return f"Link → {opt}"
    if ft == "Dynamic Link":
        return "Link (record type chosen in another field)"
    if ft == "Table":
        return f"Table of *{opt}*"
    if ft == "Table MultiSelect":
        return f"Multi-select of *{opt}*"
    return TYPE.get(ft, ft)

def options(f):
    if f.get("fieldtype") in ("Select", "Autocomplete") and f.get("options"):
        vals = [v for v in str(f["options"]).split("\n") if v.strip()]
        return " / ".join(vals).replace("|", "/")
    return ""

def rows_for(fields):
    labels = {f["fieldname"]: (f.get("label") or human(f["fieldname"])) for f in fields if f.get("fieldname")}
    out = []
    for f in fields:
        if f.get("fieldtype") in LAYOUT or not f.get("fieldname"):
            continue
        if f.get("hidden") and f.get("fieldname") in ("amended_from",):
            continue
        flags = []
        if f.get("reqd"): flags.append("**required**")
        if f.get("read_only"): flags.append("read-only")
        if f.get("allow_on_submit"): flags.append("editable after submit")
        if f.get("unique"): flags.append("unique")
        if f.get("hidden"): flags.append("hidden")
        if f.get("fetch_from"): flags.append("copied from linked record")
        if f.get("non_negative"): flags.append("≥ 0")
        when = []
        if f.get("depends_on"): when.append("shown when " + cond(f["depends_on"], labels))
        if f.get("mandatory_depends_on"): when.append("required when " + cond(f["mandatory_depends_on"], labels))
        if f.get("read_only_depends_on"): when.append("read-only when " + cond(f["read_only_depends_on"], labels))
        default = str(f.get("default") or "").replace("\n", " ").replace("|", "/")
        out.append("| {} | {} | {} | {} | {} | {} |".format(
            (f.get("label") or human(f["fieldname"])).replace("|", "/"), typ(f), options(f),
            default, ", ".join(flags), "; ".join(when)))
    return out

def doctype_section(name, roots):
    p = find_json(name, roots)
    if not p:
        return f"### {human(name)}\n\n_Definition not found in this codebase._\n"
    j = json.load(open(p, encoding="utf-8"))
    title = j.get("name") or human(name)
    kind = []
    if j.get("istable"): kind.append("child table (rows inside another record)")
    if j.get("issingle"): kind.append("single settings record")
    if j.get("is_submittable"): kind.append("submittable (Draft → Submitted → Cancelled)")
    if not kind: kind.append("master / regular record")
    rows = rows_for(j.get("fields", []))
    s = [f"### {title}", "", f"*{'; '.join(kind)}* · {len(rows)} fields", ""]
    if rows:
        s += ["| Field | Type | Options | Default | Flags | Conditions |", "|---|---|---|---|---|---|"] + rows
    else:
        s.append("_No data fields._")
    return "\n".join(s) + "\n"

def custom_fields(pyfile, only_dt=None):
    """Extract custom-field dict literals (with fieldname + fieldtype) grouped by target record, via AST."""
    src = open(pyfile, encoding="utf-8").read()
    src = re.sub(r"\b_\(\s*(\"[^\"]*\"|'[^']*')\s*\)", r"\1", src)  # unwrap translation calls
    tree = ast.parse(src)
    groups = {}
    def lit(node):
        try:
            return ast.literal_eval(node)
        except Exception:
            return None
    for node in ast.walk(tree):
        if isinstance(node, ast.Dict):
            # pattern {"Doctype": [ {fieldname...}, ... ]}
            for k, v in zip(node.keys, node.values):
                key = lit(k) if k is not None else None
                if isinstance(key, str) and isinstance(v, (ast.List, ast.Tuple)):
                    items = [lit(e) for e in v.elts]
                    items = [i for i in items if isinstance(i, dict) and "fieldname" in i and "fieldtype" in i]
                    if items and key[:1].isupper():
                        groups.setdefault(key, [])
                        seen = {x["fieldname"] for x in groups[key]}
                        groups[key] += [i for i in items if i["fieldname"] not in seen]
    if only_dt:
        groups = {k: v for k, v in groups.items() if k in only_dt}
    return groups

def custom_section(groups, heading):
    s = [f"## {heading}", ""]
    for dt, fields in groups.items():
        rows = rows_for(fields)
        if not rows:
            continue
        s += [f"### Added to *{dt}*", "", f"{len(rows)} fields", "",
              "| Field | Type | Options | Default | Flags | Conditions |", "|---|---|---|---|---|---|"] + rows + [""]
    return "\n".join(s)

ERPNEXT = r"C:\Users\HariSivaSaiKumarMada\Downloads\erpnext-develop\erpnext-develop\erpnext"

MODULES = {
    "00-core-hr-masters": ("Core HR Masters (from ERPNext)", [ERPNEXT], [
        "employee", "employee_education", "employee_external_work_history", "employee_internal_work_history",
        "department", "designation", "branch", "employee_group", "employee_group_table",
        "holiday_list", "holiday"]),
    "06-expenses-advances-travel": ("Expenses, Advances & Travel", [HRMS, ERPNEXT], [
        "expense_claim", "expense_claim_detail", "expense_claim_advance", "expense_taxes_and_charges",
        "expense_claim_type", "expense_claim_account", "employee_advance", "travel_request",
        "travel_itinerary", "travel_request_costing", "purpose_of_travel", "vehicle_log",
        "vehicle_service", "vehicle_service_item", "vehicle"]),
    "07-performance": ("Performance", [HRMS], [
        "appraisal_cycle", "appraisee", "appraisal_template", "appraisal_template_goal", "kra",
        "employee_feedback_criteria", "appraisal", "appraisal_kra", "appraisal_goal",
        "employee_feedback_rating", "goal", "employee_performance_feedback"]),
    "08-recruitment": ("Recruitment", [HRMS], [
        "staffing_plan", "staffing_plan_detail", "job_requisition", "job_opening_template", "job_opening",
        "job_applicant_source", "job_applicant", "employee_referral", "interview_type", "interviewer",
        "expected_skill_set", "interview", "interview_detail", "interview_feedback", "skill_assessment",
        "job_offer", "job_offer_term", "offer_term", "job_offer_term_template"]),
    "09-training-grievance-misc": ("Training, Grievance & Other Features", [HRMS], [
        "training_program", "training_event", "training_event_employee", "training_result",
        "training_result_employee", "training_feedback", "employee_training", "employee_grievance",
        "grievance_type", "daily_work_summary_group", "daily_work_summary_group_user", "daily_work_summary",
        "department_approver", "identification_document_type", "interest"]),
    "10-mobile-pwa": ("Mobile App (PWA)", [HRMS], ["pwa_notification", "hr_settings"]),
    "01-leave-management": ("Leave Management", [HRMS], [
        "leave_type", "leave_period", "leave_policy", "leave_policy_detail", "leave_policy_assignment",
        "leave_allocation", "earned_leave_schedule", "leave_application", "leave_ledger_entry",
        "leave_encashment", "compensatory_leave_request", "leave_adjustment", "leave_block_list",
        "leave_block_list_date", "leave_block_list_allow", "leave_control_panel", "holiday_list_assignment",
        "salary_slip_leave"]),
    "02-attendance-and-shifts": ("Attendance, Shifts & Overtime", [HRMS], [
        "attendance", "attendance_request", "employee_checkin", "shift_type", "shift_assignment",
        "shift_request", "shift_location", "shift_schedule", "shift_schedule_assignment",
        "shift_assignment_tool", "employee_attendance_tool", "overtime_type", "overtime_salary_component",
        "overtime_slip", "overtime_details"]),
    "03-payroll-engine": ("Payroll Engine", [HRMS], sorted(os.listdir(os.path.join(HRMS, "payroll", "doctype")))),
    "04-india-statutory": ("India Statutory", [INDIA], sorted(os.listdir(os.path.join(INDIA, "india_payroll", "doctype")))),
    "05-employee-lifecycle": ("Employee Lifecycle", [HRMS], [
        "employee_onboarding", "employee_onboarding_template", "employee_boarding_activity",
        "employee_separation", "employee_separation_template", "employee_promotion", "employee_transfer",
        "employee_property_history", "exit_interview", "full_and_final_statement",
        "full_and_final_outstanding_statement", "full_and_final_asset", "appointment_letter",
        "appointment_letter_template", "appointment_letter_content", "employee_grade", "skill",
        "employee_skill_map", "employee_skill", "designation_skill", "employment_type",
        "employee_health_insurance", "hr_settings"]),
}

HEADER = """# {num} · {title} — Data Dictionary

Companion to [{doc}.md]({doc}.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---

"""

total = 0
for doc, (title, roots, names) in MODULES.items():
    names = [n for n in names if not n.startswith("__") and n != "__init__.py"]
    parts = [HEADER.format(num=doc[:2], title=title, doc=doc)]
    count = 0
    for n in names:
        sec = doctype_section(n, roots)
        count += sec.count("\n| ") - 1 if "| Field |" in sec else 0
        parts.append(sec)
    if doc == "04-india-statutory":
        g = custom_fields(os.path.join(INDIA, "install.py"))
        parts.append(custom_section(g, "Fields added to HRMS / ERPNext records by India Payroll"))
    if doc == "05-employee-lifecycle":
        g = custom_fields(os.path.join(HRMS, "setup.py"))
        parts.append(custom_section(g, "Fields added to ERPNext records by HRMS (Employee, Department, Company …)"))
        parts.append("\n> The core **Employee** record itself (70 fields) is in [00-core-hr-masters.data-dictionary.md](00-core-hr-masters.data-dictionary.md).\n")
    path = os.path.join(OUT, doc + ".data-dictionary.md")
    text = "\n".join(parts)
    open(path, "w", encoding="utf-8", newline="\n").write(text)
    n_obj = text.count("\n### ")
    n_fields = len(re.findall(r"^\| (?!Field \|)(?!---)", text, re.M))
    total += n_fields
    print(f"{doc}: {n_obj} objects, {n_fields} fields -> {os.path.basename(path)}")
print("TOTAL fields:", total)
