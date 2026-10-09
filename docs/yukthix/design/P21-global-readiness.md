# P21 · Global Readiness

> **Status:** ✅ Decided by founder 28 Sep 2026: design now, build before the first customer in each region (validation pass 3 Shoulds, "Global prerequisites", option A).
> **Covers:** [VALIDATION-PASS-3](VALIDATION-PASS-3.md) **G1** (Arabic / RTL), **G2** (holiday feeds), **G3** (names and addresses), **G4 + T18** (visas, permits, national IDs), **G5** (bank formats), **G9 + S16** (regions, residency, region move), **G10** (e-invoicing), **R16** (GCC nationalisation, GOSI, WPS), **R17** (Singapore), **R18** (EU whistleblower timings). R19 (accessibility evidence) lives in the [UI brief](../reference/frappe-hrms-functional-spec/99-ui-design-brief.md) and is listed in the gate table. Decisions: [research/validation-pass-3/SHOULD-DECISIONS.md](research/validation-pass-3/SHOULD-DECISIONS.md); evidence: [research/validation-pass-3/val3-verticals-global.md](research/validation-pass-3/val3-verticals-global.md), [val3-regulation.md](research/validation-pass-3/val3-regulation.md).
> **What it is:** the cross-cutting pieces that must exist before YukthiX serves a company outside India, and a **gate table** saying which piece must be live before the first customer in which region.
> **Builds on:** D5 (no India-only assumptions in the core); P01 names, addresses, regions (YX-ORG-28–30); P02 residency and region move (YX-SEC-19, 37, 38); P07 country packs (YX-STAT-19); M02 holiday calendars; M03 bank files; M08 whistleblower cases; P14 invoices; M10 staffing invoices; P04 languages; P05 templates; P13 regions (#5).
> **Country payroll specifics** (rates, slabs, ceilings, due dates, file formats) are **P07 packs**; P21 names the packs and the gates, it does not restate the law.

---

## 1. Purpose & scope
India first, but the first GCC, EU, US or Singapore customer must not find India baked in. P21 fixes the shared foundations (script, calendars, names, IDs, banks, regions, invoices) and the few non-payroll duties per region, and stops sales from signing a region before its gate is green.

**Out of scope:** country payroll computation (P07 packs + M03); relocation / mobility cases (T18 part, Later); new languages beyond Arabic; P13 hosting choice per region (team brief).

## 2. What exists today
- **Exam app:** `organizations.region` (single value), LTR-only UI, Western digits, free-text names and addresses.
- **Design:** India-only holiday calendars (M02), Indian bank files (M03), one region per tenant (YX-SEC-19), GST invoices (P14), whistleblower case type without EU clocks (M08), a rule that new country packs are data (YX-STAT-19).
- **Missing:** everything in §3.

## 3. Concepts
- **Region:** a hosting cell in the platform **region catalogue**: `IN`, `ME-AE` (UAE, in-country), `ME-SA` (KSA, in-country), `EU`, `US`, `SG`. Each lists the countries it serves and its status (planned / live).
- **Home region:** where the tenant's control data lives (tenant, users, roles, settings, billing).
- **Data region:** where a legal entity's people data lives; defaults to the home region.
- **Multi-region tenant:** one tenant with entities in two or more data regions.
- **Region move:** moving a tenant's or an entity's data to another region.
- **Gate:** the list of P21 items (and P07 packs) that must be live before a region or country can be chosen at sign-up or for a new legal entity.
- **Work authorisation:** any document that allows a person to live or work in a country (visa, residence permit / iqama, work permit / labour card, Emirates ID, SG pass, passport).
- **Holiday feed:** a dated, source-cited public-holiday list per country / subdivision, including moving holidays with *expected* and *confirmed* dates.

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `regions` (platform) | code, hosting location, countries served, in-country flag, DR location, status, gate checklist items with live dates |
| `legal_entities.data_region` | Region code; must be live and serve the entity's country (P01 YX-ORG-30) |
| `region_moves` | tenant / entity, from, to, requested_by, legal basis, freeze window, stage (requested → approved → copying → verified → cut over → source deleted), checksums, deletion certificate ref |
| `holiday_feeds`, `holiday_feed_items` (platform) | country, subdivision, sector (private / public), year, version, source; item date, name per locale, `expected` / `confirmed`, moon-sighting flag |
| `holiday_calendar_subscriptions` | tenant calendar ← feed, auto-apply or approve, additions and removals of its own |
| `work_authorisations` | employee, country, type, number (encrypted, P02 Confidential), issuer, sponsor legal entity, occupation on permit, issue / expiry, status, document (P05) |
| `bank_accounts` (M03, extended) | country, format (IBAN / local), BIC / SWIFT, routing (ABA / sort code / IFSC), currency, split rule (fixed amount or %, order, remainder account) |
| `einvoice_submissions` | invoice (P14 or M10), country scheme (ZATCA / UAE / Peppol), payload hash, clearance / reporting id, QR, status, errors |
| `nationalisation_snapshots` | entity, scheme (Emiratisation / Nitaqat), period, counts by national / non-national and band, target, status |

Names, addresses, phones and gender: P01 §4.4 and YX-ORG-28 / 29. Tenant tables carry `organization_id` + RLS; `regions` and `holiday_feeds*` are platform tables.

## 5. Rules (YX-GLB)

| ID | Rule |
|---|---|
| YX-GLB-01 | **Region gate.** A country is offered at sign-up, for a new legal entity or for a region move only when its region is live **and** every gate item in §5a for that country is live. The platform console shows the gate per country; a staff override is not possible. |
| YX-GLB-02 | **Direction from locale (G1).** Layout direction follows the user's locale (`dir="rtl"` for Arabic); components use logical CSS properties only (a CI lint fails on `left` / `right` in shared components); directional icons, progress, steppers, timelines and time-series charts mirror; media controls, logos, code, phone numbers and IBANs do not. Mixed-script strings (names, IDs) are bidi-isolated. PDFs (letters, payslips, reports) render Arabic with correct shaping. |
| YX-GLB-03 | **Numerals and calendars (G1).** Stored numbers and dates are Western digits and Gregorian. Display digits (Western default / Arabic-Indic) and a Hijri (Umm al-Qura) date beside the Gregorian date are user or tenant display choices. Files for banks, WPS, GOSI, tax and e-invoicing always use the format the receiver requires, never the display setting. |
| YX-GLB-04 | **Arabic content (G1).** Employee-facing screens, notifications (P04) and GCC starter templates (P05: offer, contract, payslip, warning, end-of-service) ship in Arabic; contracts and payslips for UAE / KSA entities are bilingual Arabic + English, with the Arabic text marked as prevailing where the pack says so. Admin screens: English first, Arabic before the first GCC customer. |
| YX-GLB-05 | **Holiday feeds (G2).** Each country pack names its holiday feed; each item cites its source. Moving holidays are published as *expected* and later *confirmed*; a confirmed date that differs updates subscribed calendars and re-computes leave counts, attendance day status and holiday OT in **open** periods, and raises P08 adjustments for locked periods. Tenants choose auto-apply or HR approval per calendar; every change is notified to HR (P04) and audited. |
| YX-GLB-06 | **Work authorisations (G4 + T18).** A person may hold several authorisations; each has a type from the country pack, an expiry and a sponsor entity. Reminders at 90 / 60 / 30 / 7 days (starter, editable) open a renewal task. An expired or missing required authorisation flags the person in payroll pre-flight, blocks a new employment or assignment start in that country, and is shown on the profile; stopping pay is never automatic (HR decides with a reason). There is no field or status for the employer holding a passport. |
| YX-GLB-07 | **IDs that drive registrations (G4, R16).** WPS salary files (UAE SIF, KSA Mudad), GOSI registration and other pack-listed filings take the person's identifiers from `work_authorisations` / `employee_identifiers`; a missing or expired identifier fails the file's pre-flight with a "Fix" link, never a silent skip. Occupation on permit differing from the designation is flagged for HR. |
| YX-GLB-08 | **Bank formats (G5).** Account details are validated by country: IBAN (mod-97 and country length), BIC / SWIFT (structure + directory where licensed), US ABA routing, UK sort code, IFSC (India). Payment files come from M03 exporters per pack: SEPA credit transfer (pain.001), NACHA (ACH), BACS Standard 18, SWIFT MT103 / pain.001 for cross-border, plus WPS files. Changes follow YX-SEC-13 approval and cooling. |
| YX-GLB-09 | **Multi-currency and split pay (G5).** Pay is computed in the employment's pay currency; a payout may go in another currency using a dated rate from a named source, stored with the payslip. An employee may split net pay across at most 3 accounts (fixed amounts first, then %, remainder to the primary); WPS countries require the WPS-registered account to receive at least the amount the pack sets. |
| YX-GLB-10 | **Residency and multi-region tenants (G9 + S16).** Each legal entity's people data lives in its data region (P02 YX-SEC-37); UAE and KSA entity data, files, backups and DR stay in-country. A multi-region tenant has one home region for control data; cross-region screens query the entity's region at request time; only the directory card (P02 Public / Internal fields) may be copied to the home region. Aggregates are computed in-region and returned with small-group suppression (YX-SEC-14). |
| YX-GLB-11 | **Region move (G9 + S16).** A tenant or entity moves only on a System Admin request approved by YukthiX, outside the payroll-critical window (YX-CONSOLE-07) and within a planned freeze of at most 24 hours; data is copied, verified by checksums and row counts, cut over, and then deleted from the source (backups expire on their schedule) with a deletion certificate. Privacy rules: P02 YX-SEC-38. A move out of an in-country region (UAE, KSA) is refused unless the pack records a lawful transfer route. |
| YX-GLB-12 | **E-invoicing (G10).** Before YukthiX bills in KSA, UAE or an EU country, or a staffing tenant there issues M10 client invoices, the invoice is produced in the country scheme held as dated pack data: KSA ZATCA Fatoora (clearance / reporting, QR, cryptographic stamp), UAE e-invoicing (accredited service provider model), EU Peppol BIS / ViDA formats. An invoice is final only after the scheme's acceptance; rejections return errors to the maker; credit notes follow the same path. |
| YX-GLB-13 | **GCC nationalisation (R16).** Emiratisation (Nafis) and Nitaqat targets, bands and counting rules are dated P07 data (`AE.EMIRATISATION`, `SA.NITAQAT`). Each GCC entity gets a monthly snapshot (nationals / non-nationals, band, target, gap), a warning when a planned exit or hire would breach the target, and the pack's filings. GOSI contributions and registrations come from `SA.GOSI`; WPS files per YX-GLB-07. |
| YX-GLB-14 | **Singapore (R17).** `SG.*` packs hold CPF (age bands, wage ceilings), SDL, IR8A / AIS; Key Employment Terms and itemised payslips follow the MOM content and timing held in the pack (starter templates in P05). Flexible-work requests are a P03 request type with the response deadline and written-reason rule from the pack; Workplace Fairness Act duties (grievance process, protected characteristics) use M08 grievance with pack dates. |
| YX-GLB-15 | **EU whistleblower timings (R18).** For an EU legal entity with 50 or more workers, M08 whistleblower cases take clocks from `EU.WHISTLEBLOWER` plus the member-state pack: acknowledge within **7 days**, feedback within **3 months** of the acknowledgement, records kept only as long as the pack allows; reporter identity is confidential by default (YX-SEC-10) and anonymous reports follow the member-state choice (YX-CASE-11 return path). |
| YX-GLB-16 | **Law as data (all).** Every dated value named here (holiday dates, quotas, rates, deadlines, formats) sits in a P07 pack with source, version and maker ≠ checker publishing (YX-STAT-01–04); P21 code holds no country constant. |

### 5a. Gate table — must be live before the first customer there

| Item | Regions / countries | Must be live before |
|---|---|---|
| G1 Arabic / RTL, Arabic-Indic digits, Hijri display, Arabic templates | UAE, KSA | First GCC customer |
| G2 Holiday feed (incl. moving holidays) | Every country outside India | First customer in that country (first outside India overall) |
| G3 Name and address formats, E.164 phones, gender list | All | First customer outside India (gender list: before India Board's-report pack, R7) |
| G4 + T18 Work authorisations and IDs | UAE, KSA; SG passes | First GCC customer; first SG customer |
| G5 IBAN / BIC / SWIFT validation | EU, UK, GCC | First customer in that region |
| G5 SEPA · NACHA · BACS files | EU · US · UK | First customer in that region |
| G5 Multi-currency payout, salary split | All | First customer outside India |
| G9 + S16 Region catalogue, residency per entity | All | First customer outside India |
| G9 + S16 In-country hosting | UAE, KSA | First GCC customer |
| G9 + S16 Multi-region tenant, region move | All | First customer outside India |
| G10 ZATCA · UAE e-invoicing · Peppol / ViDA | KSA · UAE · EU | Before YukthiX bills there, or a staffing tenant there invoices through M10 |
| R16 Emiratisation / Nitaqat, GOSI, Mudad / WPS | UAE, KSA | First GCC customer |
| R17 CPF, SDL, KETs, itemised payslips, IR8A / AIS, flexible work, WFA | SG | First Singapore customer |
| R18 EU whistleblower timings | EU | First EU customer with a 50+ worker entity |
| R19 Accessibility evidence (WCAG 2.2 AA, EN 301 549, VPAT / ACR) | All | Public launch (UI brief) |
| P07 country payroll pack | Each country | First payroll customer in that country |

## 6. Flows
1. **New country:** pack authors publish P07 packs and the holiday feed → platform staff tick gate items with evidence → region status live → country appears at sign-up.
2. **Entity in a second region:** System Admin adds a legal entity in, say, UAE → data region `ME-AE` set → entity data created there; home-region screens federate. Event `org.legal_entity.created` carries `data_region`.
3. **Region move:** request → YukthiX approval and legal check → notice to admins (and employees where P02 requires) → freeze → copy → verify → cut over → source deletion certificate. Events `tenant.region_move.requested / cut_over / completed`.
4. **Moving holiday confirmed:** feed item confirmed → subscribed calendars updated (or queued for HR) → open periods re-computed → `holiday_feed.item.confirmed`.
5. **Permit expiry:** daily job → reminders → renewal task → on expiry, flag and pre-flight block → `work_authorisation.expiring / expired`.
6. **E-invoice:** invoice issued → submission to scheme → accepted (final, QR stored) or rejected (errors to maker) → `einvoice.accepted / rejected`.

## 7. UI
- **RTL:** every template (T1–T9) works mirrored; Storybook runs each component in `ar` (UI brief principle 12).
- **Profile:** "Work authorisations" tab (type, number masked, expiry, sponsor, document) with expiry badges; structured name and address forms per country (P01).
- **Payroll › Bank details:** country-aware form, live IBAN / BIC check, split-pay editor.
- **Settings › Holidays:** feed subscription, auto-apply / approve, expected vs confirmed badges.
- **Settings › Organisation:** data region per entity (read-only after creation; "Move region" starts the request).
- **Reports:** nationalisation dashboard per GCC entity; permit-expiry list.
- **Platform console:** region catalogue with gate checklist; region-move tracker; e-invoice submission log.

## 8. Migration & rollout
- **Now (design, no build):** logical CSS properties and bidi isolation in `packages/ui` from UI-0 (cheap now, costly later); structured name / address / E.164 / gender fields in P01 from the first build (YX-ORG-28 / 29).
- **Existing tenants:** `organizations.region` becomes the home region and every entity's data region (`IN`).
- **Per region:** build to the gate table; nothing else waits.
- **Team actions:** P13 to add in-country hosting for UAE / KSA and the EU / US / SG cells; P14 to add e-invoicing to the invoice flow; M08 to read EU clocks from the pack; APX entries per §8a.

### 8a. Appendix entries needed
- **APX-A:** permit expiry reminders (90 / 60 / 30 / 7), holiday change notice, region-move notices, e-invoice rejected, nationalisation target warning, EU whistleblower acknowledgement / feedback due.
- **APX-B:** `work_authorisation.expiring / expired`, `holiday_feed.item.confirmed`, `tenant.region_move.*`, `einvoice.accepted / rejected`, `nationalisation.snapshot.created`.
- **APX-C:** nationalisation status, permit expiry, headcount by gender incl. transgender / non-binary (R7).
- **APX-D:** Work authorisations tab, bank details (international), holiday feed settings, entity data region, region-move request, console region catalogue and e-invoice log.
- **APX-E:** holiday feed subscription, name / address format, gender list, split-pay limits, permit reminder days.
- **APX-F:** Arabic / bilingual offer, contract, payslip, warning, end-of-service; SG KET and itemised payslip.
- **APX-G:** cross-region transfer annex (SCCs / local mechanisms), region-move notice, EU whistleblower procedure.

## 9. Acceptance tests (samples)
- A UAE country is not offered at sign-up while the Arabic templates gate item is open (YX-GLB-01).
- In Arabic, the leave approval timeline runs right to left; an IBAN inside an Arabic sentence stays left to right (YX-GLB-02).
- A user with Arabic-Indic digits exports a WPS file; the file has Western digits (YX-GLB-03).
- Eid moves one day on confirmation; a leave spanning it in an open period is re-counted, a locked period gets a P08 adjustment (YX-GLB-05).
- An iqama expired yesterday: payroll pre-flight flags the person, pay is not stopped until HR decides; the Mudad file fails with a "Fix" link (YX-GLB-06 / 07).
- `DE89 3704 0044 0532 0130 00` passes; one changed digit fails mod-97 (YX-GLB-08).
- A 4th split account cannot be added; the WPS account receives at least the pack minimum (YX-GLB-09).
- An India-home HR admin opens a UAE employee: data is read from `ME-AE`; no UAE salary row exists in the India database (YX-GLB-10).
- A move from `ME-SA` to `IN` is refused without a pack transfer route (YX-GLB-11).
- A ZATCA-rejected invoice cannot be marked final (YX-GLB-12).
- A German entity with 60 workers: a whistleblower report filed 1 Oct shows "acknowledge by 8 Oct" (YX-GLB-15).

## 10. Open questions
None open: decided in one founder decision (option A) on 28 Sep 2026. Build-time details (exact file versions, scheme onboarding, hosting per region) are team actions under the gate table.

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| G1 | **Validation pass 3 Should (G1), founder decision 28 Sep 2026: Arabic / RTL.** Mirrored layouts via logical properties, Arabic templates (bilingual for UAE / KSA contracts and payslips), Arabic-Indic digits and Hijri as display choices only. YX-GLB-02–04; UI brief principle 12. Gate: first GCC customer. | 28 Sep 2026 |
| G2 | **Validation pass 3 Should (G2), founder decision 28 Sep 2026: country holiday feeds** with expected / confirmed moving holidays and re-computation of open periods. YX-GLB-05. Gate: first customer outside India. | 28 Sep 2026 |
| G3 | **Validation pass 3 Should (G3), founder decision 28 Sep 2026: name and address formats** (given / family / patronymic, name order, native script; ISO 3166 addresses; E.164 phones) in P01 YX-ORG-28, gender list YX-ORG-29. Gate: first customer outside India. | 28 Sep 2026 |
| G4 + T18 | **Validation pass 3 Should (G4 + T18), founder decision 28 Sep 2026: visas, work permits, national IDs** driving eligibility, WPS and GOSI; relocation cases later. YX-GLB-06 / 07. Gate: first GCC customer. | 28 Sep 2026 |
| G5 | **Validation pass 3 Should (G5), founder decision 28 Sep 2026: bank formats** IBAN / BIC / SWIFT, SEPA, NACHA, BACS, multi-currency payouts, split pay (max 3 accounts). YX-GLB-08 / 09. Gate: first customer in that region. | 28 Sep 2026 |
| G9 + S16 | **Validation pass 3 Should (G9 + S16), founder decision 28 Sep 2026: region catalogue** (IN, ME-AE, ME-SA, EU, US, SG), UAE / KSA in-country residency, data region per legal entity, multi-region tenants, region move. YX-GLB-10 / 11; P01 YX-ORG-30; P02 YX-SEC-37 / 38. Gate: first customer outside India. | 28 Sep 2026 |
| G10 | **Validation pass 3 Should (G10), founder decision 28 Sep 2026: e-invoicing** (ZATCA, UAE, Peppol / ViDA) for YukthiX and staffing invoices. YX-GLB-12. Gate: before billing in that region. | 28 Sep 2026 |
| R16 | **Validation pass 3 Should (R16), founder decision 28 Sep 2026: Emiratisation / Nitaqat, GOSI, Mudad WPS** as P07 packs plus nationalisation snapshots. YX-GLB-13. Gate: first GCC customer. | 28 Sep 2026 |
| R17 | **Validation pass 3 Should (R17), founder decision 28 Sep 2026: Singapore** CPF, SDL, KETs, itemised payslips, IR8A / AIS, flexible-work requests, Workplace Fairness Act. YX-GLB-14. Gate: first Singapore customer. | 28 Sep 2026 |
| R18 | **Validation pass 3 Should (R18), founder decision 28 Sep 2026: EU whistleblower timings** (7 days / 3 months / records) on M08 cases. YX-GLB-15. Gate: first EU customer with 50+ staff. | 28 Sep 2026 |
| R19 | **Validation pass 3 Should (R19), founder decision 28 Sep 2026: accessibility evidence** (WCAG 2.2 AA, EN 301 549, VPAT / ACR per product); held in the UI brief (principle 13, decision 7). Gate: public launch. | 28 Sep 2026 |
