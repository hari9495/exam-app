"""Collect every gap-analysis row from the module docs into one classified appendix."""
import os, re, sys

DOCS = r"C:\Users\HariSivaSaiKumarMada\Downloads\YukthiX HR Product Design 1\YukthiX\reference\frappe-hrms-functional-spec"
OUT = os.path.join(DOCS, "99-gap-register.md")

def mark(cell):
    for m in ("❌", "⚠️", "✅", "⏳"):
        if m in cell:
            return m
    return "?"

CLASSES = [
    ("A", "In our spec — no reference in Frappe (design from scratch)", lambda f, s: f == "❌" and s in ("✅", "⚠️")),
    ("B", "Frappe has it — missing from our spec (add to spec)", lambda f, s: f in ("✅", "⚠️") and s in ("❌", "?")),
    ("C", "Neither has it — new need / differentiator", lambda f, s: f == "❌" and s in ("❌", "?")),
    ("D", "Frappe partial — we must do better", lambda f, s: f == "⚠️" and s in ("✅", "⚠️", "⏳")),
    ("E", "Covered by both — reuse Frappe rules as reference", lambda f, s: f == "✅" and s in ("✅", "⏳")),
]

rows = []
for fn in sorted(os.listdir(DOCS)):
    if not re.match(r"^\d\d-.*\.md$", fn) or "data-dictionary" in fn or fn.startswith("99"):
        continue
    mod = fn[:2]
    title = open(os.path.join(DOCS, fn), encoding="utf-8").readline().strip("# \n").split("—")[0].strip()
    in_gap = False
    for line in open(os.path.join(DOCS, fn), encoding="utf-8"):
        if line.startswith("## ") and "Gap analysis" in line:
            in_gap = True
            continue
        if in_gap and line.startswith("## "):
            in_gap = False
        if not in_gap or not line.startswith("|") or line.startswith("|---") or line.startswith("| Capability"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        cap, fr, sp, note = cells[0], cells[1], cells[2], cells[3]
        f, s = mark(fr), mark(sp)
        if mod == "01" and s in ("❌", "?"):  # all leave gaps approved into spec.md §1.3.3 on 23 Sep 2026
            s, sp = "✅", sp + " → ✅ added 23 Sep"
        cls = next((c for c, _, test in CLASSES if test(f, s)), "E")
        rows.append((cls, mod, title, cap, fr, sp, note))

out = ["# 99 · Gap Register (all modules)", "",
       "Generated from the *Gap analysis* section of every module doc by `../tools/build_gaps.py` — re-run after editing a module. "
       "Planning summary and priorities: [99-gap-summary.md](99-gap-summary.md).", "",
       "| Class | Meaning | Rows |", "|---|---|---|"]
for c, label, _ in CLASSES:
    out.append(f"| **{c}** | {label} | {sum(1 for r in rows if r[0] == c)} |")
out += ["", f"**Total rows: {len(rows)}**", ""]
for c, label, _ in CLASSES:
    sel = [r for r in rows if r[0] == c]
    out += ["---", "", f"## {c} · {label} ({len(sel)})", "",
            "| Module | Capability | Frappe | YukthiX spec | Note |", "|---|---|---|---|---|"]
    for r in sorted(sel, key=lambda r: (r[1], r[3])):
        out.append(f"| {r[2]} | {r[3]} | {r[4]} | {r[5]} | {r[6]} |")
    out.append("")
open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(out))
for c, label, _ in CLASSES:
    print(c, sum(1 for r in rows if r[0] == c), label)
print("total", len(rows))
