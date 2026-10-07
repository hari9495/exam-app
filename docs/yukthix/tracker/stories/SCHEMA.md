# Backlog story files

One JSON file per part (`A.json` … `E.json`), each an array of work items. `build_tracker.py` turns them into the Backlog and Coverage sheets.

```json
{
  "id": "US-B-014",              // unique, stable; prefix EP- / FT- / US- + part letter
  "type": "Epic | Feature | Story",
  "parent": "FT-B-003",           // feature for a story, epic for a feature, "" for an epic
  "title": "Agent works a ticket from the queue",
  "story": "As an IT agent, I want … so that …",          // stories only
  "acceptance": ["Given … when … then … (YX-HD-01)", "…"],  // 3-6 testable criteria, stories only
  "rules": ["YX-HD-01", "YX-HD-02"],  // every rule the story implements
  "docs": ["M14", "M08 §3"],
  "state": "Done | Active | New",
  "phase": "Step 3b-1",           // build phase / iteration label
  "order": 120,                   // global build order (smaller = earlier); epics and features too
  "points": 3,                    // 1,2,3,5,8,13 — stories only
  "priority": 1,                  // 1 must, 2 should, 3 could
  "depends": ["US-B-010"],
  "evidence": "PR #129 · 5dbcd4ee · test/email-first-sign-in.e2e-spec.ts"  // Done/Active only
}
```

Order bands: Step 0 = 0–99, Step 1 = 100–199, UI prototype = 200–299, Step 2 = 300–399, Step 3 = 400–499,
Step 3b = 500–599, Step 4 = 600–699, Step 5 = 700–799, Step 6+ HR modules = 800–1499, ATS & assessments = 1500–1999,
platform services built when first needed = order of the step that first needs them.
