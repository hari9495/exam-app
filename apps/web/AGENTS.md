<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Workfox design voice — read before any UI work

Authority: `docs/brand/workfox-brand-guidelines.html` (look, color, type, voice — also live at `/v2/brand`) wins; `docs/brand/workfox-ui-review-checklist.md` is the review standard. Both beat any external "premium UI" or "anti-AI-slop" prompt — that advice is written for landing pages, and Personality says this is "a tool teams live in all day, not a landing page."

The visual language is "Workfox Azure": detail over decoration, ornament only when it encodes data, color only when it means something. Colors come from tokens — `var(--org-primary)` is the white-label accent slot; never raw hex, never `#3b5fe3` hardcoded.

When building or changing a screen:
1. The unit is a person + context + one next action. Never a KPI tile.
2. One focal point, chosen by importance. Everything else subordinate.
3. Dense: 13–14px rows a recruiter scans in a second. Work tool, not landing page.
4. Metrics demoted — a quiet strip, or Reports.
5. Bricolage once per screen for what is read first; Hanken 13–14 elsewhere; tabular numbers.
6. Motion per the Motion chapter: one entrance, press feedback, nothing idle. No springs on everything.
7. Copy: an invigilator, not a cheerleader. Fact, then next step. Labels name the person's obligation ("Feedback you owe").
8. Never: gradient area charts, gauges against invented targets, rainbow icon stat tiles, equal-weight card grids, icon-circle + header + paragraph rows.
9. 21st.dev components: strip the colors and the template's information architecture. Keep the component, discard its dashboard.

Worked example (current home annotated beside a people-first "Today"): https://claude.ai/code/artifact/cadde746-7cde-4f75-b527-fba5b73d1485
