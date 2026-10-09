# P17 · Global Search & Command Palette

> **Status:** ✅ Decided (by principle), 26 Sep 2026. The 3 questions (§10) were decided by spec principles D17 / D18 and the user decision of 26 Sep 2026 (all B items included, recommended options adopted); see §11.
> **Covers:** spec §2.1.10 (Global Search, not designed until now); GAP-REGISTER **B11** (global search across records honouring P02 visibility; command palette; Bench 38).
>
> **Builds on:**
> - P01 tenancy and RLS (one search index per tenant);
> - P02 scopes, field classes, restricted areas (YX-SEC-10) and small-group rules;
> - P03 request types and the approvals inbox (actions);
> - P04 languages (English, Hindi, Tamil, Telugu);
> - P08 audit (search of Special data is audited);
> - P11 one service layer (search is an API route like any other, YX-API-02);
> - P13 infrastructure (search engine choice is a team / infra decision);
> - APX-D PLT-01 (app shell search box) and §3 rule 5 (Settings search, which becomes one result source here).
>
> **Build wave:** **wave 2** (records and actions for the modules live by then); every later module registers its sources in its own wave.

---

## 1. Purpose & scope
One search box in the desk app shell (and the mobile Me / Home header) that finds **anything the person may see** and **anything they may do**:
1. **Records:** employees, candidates, jobs / requisitions, requests (leave, expense, attendance, letters…), documents (metadata, and optionally content), policies, helpdesk tickets, cases (only for case members), reports / dashboards, settings pages, knowledge-base articles, custom-object records (P18).
2. **Command palette** (Ctrl-K / Cmd-K): jump to a screen, run an action ("apply leave", "approve", "new claim", "run payroll for Sep"), recent items.
3. **Trust:** results are filtered at query time by the same P02 rules as the record screens; the index itself never leaks data across tenants or into classes the viewer can't read.

**Out of scope:**
- Search inside a single list (each T2 list keeps its own filters and quick search, which call the same engine with a fixed source).
- The external T9 portals (no global search there, APX-D §4).
- Candidate sourcing across external job boards (M10 / B8 talent CRM).

## 2. What exists today (exam app, `origin/main`)

| Piece | Today | P17 |
|---|---|---|
| List search | Per-screen filters and text search on candidates, questions, tests | **Keep** as list-scoped search, routed through the P17 engine where the source is registered |
| Global search / palette | None | **New** |
| Settings search | Designed in APX-D §3 rule 5 (registry indexed with synonyms) | **Becomes a P17 source** (`settings`), same rules |
| Postgres | PostgreSQL + Prisma (D2) | **Reuse**: `pg_trgm` + `tsvector` in a `search` schema; no new service at launch |

## 3. Concepts

| Term | Meaning |
|---|---|
| **Source** | A registered kind of searchable thing: `employee`, `candidate`, `job`, `request`, `document`, `policy`, `ticket`, `case`, `report`, `dashboard`, `setting`, `kb_article`, `screen`, `action`, `custom_object:<key>` (P18). Each module registers its sources in code (like P09 metrics). |
| **Search document** | One row per searchable record in the tenant's index: title, subtitle, keywords, searchable text per **field class**, visibility keys, link. Built from domain events (APX-B). |
| **Visibility keys** | The attributes the P02 filter needs at query time: legal entity, location, department path, manager path, owner / subject, case membership, restricted-area flag, custom-object record scope. |
| **Action** | A command the palette can run or open: a request type ("apply leave"), a queue ("approve", opens the approvals inbox filtered), a create action ("new claim"), a navigation ("go to muster"). Actions come from the P03 request-type registry, the screen registry (APX-D §2) and P18 custom request types; each carries the permission it needs. |
| **Recent items** | The last records and screens the user opened (per user, max 20, 90 days), shown before typing. |
| **Phonetic key** | A normalised sound key for person names (Indian-name aware, §4.3) stored beside the name, so "Sreenivas", "Srinivas" and "Shrinivaas" match. |

## 4. Design

### 4.1 One box, three result groups
- Typing shows grouped results in < 300 ms (p95, tenant of 5,000 employees): **Actions** (max 3), **Records** (grouped by source, max 5 per source, "see all" opens a full results page), **Help & settings**.
- **Prefixes** narrow the source: `@` people (employees, candidates), `#` requests / tickets / cases by reference number, `>` actions and screens, `?` help and settings. Without a prefix all sources are searched.
- **Exact identifiers win:** an employee code, request reference, ticket / case number, candidate email or phone typed in full jumps to that record (if visible) as the first result.
- **Keyboard first:** Ctrl-K / Cmd-K opens the palette from anywhere; arrows, Enter, Esc; Tab switches source group. Screen-reader labels per result (WCAG 2.1 AA).
- **Mobile:** a search field in the Home header opens a full-screen search (records + actions only); no prefixes needed.

### 4.2 Security model: filter at query time, never leak through the index
1. **Per-tenant index.** Search documents carry `organization_id` and sit under the same RLS as everything else (P01). Queries set `app.current_org` like any API call. Nothing is shared across tenants; no global ranking model is trained on tenant data.
2. **Visibility at query time.** Each query adds the viewer's P02 scope filter (the same predicate the record list uses, built from the visibility keys). A result appears only if the viewer could open the record. No "you don't have access" hint is ever returned for search hits.
3. **Field classes decide what is searchable, per viewer.** Each indexed field is stored in the **text column of its class** (`text_public`, `text_internal`, `text_personal`, `text_confidential`). A query only matches against the columns of classes the viewer holds for that record's scope. A manager searching "₹12,00,000" never matches salaries.
4. **Special fields are not indexed.** Aadhaar, health / disability, religion / caste, POSH / disciplinary content, biometric data and case narratives are never in the index. Where finding a record by a Special identifier is a real need (Aadhaar for HR verification), only a **keyed hash of the full value** is stored; an exact full-number match by a role that holds Aadhaar access finds the record, and the result shows the masked value (last 4). Partial Special values never match.
5. **Restricted areas** (POSH, disciplinary, grievance, whistleblower, medical; YX-SEC-10): only **case members** get case results; their index rows carry a restricted flag and the case-membership key, and for everyone else the case behaves as "not found" (APX-D §6.3). Case search matches reference number and title only (titles are written neutrally), never narrative text.
6. **Suppression of existence.** Counts per group are shown only as "5+" style caps for sources where a count could reveal something (cases, candidates for a confidential requisition).
7. **Audit.** Queries that match Confidential data return results with an audit event for the record opened (P08), not for the search itself; a search that uses a Special-hash match is audited as a view.
8. **Freshness and revocation.** Index rows update from domain events (target < 5 s). **Permission changes need no re-index** because visibility is evaluated at query time; a record whose restricted flag or class changes is re-indexed synchronously before the change commits.

### 4.3 Matching quality
- **Postgres first** (Q1):
  - `tsvector` full-text with a `simple` configuration plus language-specific dictionaries where Postgres has them (English); ranking by `ts_rank_cd` with source weights;
  - `pg_trgm` trigram similarity for **typo tolerance** (one or two typos in names, titles, codes);
  - prefix matching for as-you-type.
- **Indian names:** a name normaliser (strip honorifics and initials, fold "sh / s", "th / t", "aa / a", "ee / i", "v / w", doubled consonants, common transliteration variants) produces a **phonetic key** stored with the name; initials match ("K. Ramesh" ↔ "Ramesh Kumar" via the given-name / surname split); names entered in Indic scripts get a transliterated Latin key and vice versa.
- **Multi-language:** titles and keywords are indexed in the record's language plus the tenant default; the palette's actions, screen names and help topics are indexed in all four P04 languages from the translation catalogue (YX-MOB-10), so "छुट्टी" finds "Apply leave". Search in other scripts matches via the transliteration key.
- **Synonyms:** a YukthiX synonym list per source (e.g. "LWP" ↔ "unpaid leave", "F&F" ↔ "full and final", "PAN" ↔ "permanent account number") as a **labelled starter** the company can extend with its own terms (D17).
- **Ranking:** exact identifier → recent items the user opened → same team / entity → source weight (actions and people first) → text rank → recency. Ranking uses only the user's own history and the tenant's data.

### 4.4 Document content search (optional, company choice)
- **Default:** documents are searchable by **metadata only** (type, title, owner, reference, tags, dates).
- **Content search** is a company setting (Q2) per document type, off for types marked Confidential or Special in P05 (payslips, medical certificates, ID proofs are never content-indexed). When on: text extracted (existing P05 pipeline; OCR only for scanned PDFs, which consumes AI / OCR credits per D18) into `text_<class>` of the document's class; snippets shown only to viewers who can open the document.
- **Storage:** content index counts towards the tenant's storage fair use; beyond fair use it is the storage add-on (D18).

### 4.5 Actions in the palette
- Actions come from registries: **request types** (P03, incl. P18 custom request types) → "Apply leave", "New expense claim", "Raise ticket"; **queues** → "Approve" (opens the approvals inbox, filtered to what the query names: "approve leave" → leave tab); **screens** (APX-D §2 IDs) → "Go to muster"; **create** actions from each module; **settings** pages (APX-D §3).
- An action is listed only if the viewer holds its permission and the product / add-on is enabled; otherwise it is hidden (not greyed; principle 7). "Available in wave X" states (APX-D §6.5) appear only for admins.
- **No silent execution:** an action opens its sheet, inbox or wizard; nothing irreversible runs from the palette (irreversible actions still use the APX-D §6.4 dialog).
- **Record-context actions:** with a record result focused, Tab shows its actions ("Open", "Change action", "Issue letter", "Approve" for a pending request).

### 4.6 Recent items and saved searches
- Recent items per user (records and screens opened, not search strings), cleared on sign-out from all devices or by the user; exited or re-scoped records drop out on next use (visibility re-checked).
- Saved searches: a full-results page with filters can be saved and pinned; they re-run with the viewer's permissions (like P09 YX-MET-07).

### 4.7 Future: a search engine behind the same API (Q1)
- The search service is an interface: `index(document)`, `delete(id)`, `query(viewer, text, filters)`. The Postgres implementation ships first. If a tenant's size or latency targets exceed what Postgres gives (team measures p95 per tenant), the **same interface** moves to a dedicated engine (OpenSearch / Meilisearch / Typesense class), chosen by the engineering team with P13 (hosting, region, cost per tenant).
- Whatever engine is used, §4.2 holds unchanged: per-tenant index or per-tenant filtered alias, visibility at query time, Special not indexed.

## 5. Data model (`search` schema)

| Table | Key columns | Notes |
|---|---|---|
| `search_sources` (platform catalogue) | `key`, `module`, `title_template`, `weight`, `permission`, `visibility_predicate` (code ref), `wave` | Registered in code; exempt from YX-ORG-14 like the metric registry (P07 YX-STAT-10) |
| `search_documents` | `organization_id`, `source`, `record_id`, `title`, `subtitle`, `keywords`, `lang`, `text_public tsvector`, `text_internal tsvector`, `text_personal tsvector`, `text_confidential tsvector`, `name_phonetic`, `special_hashes text[]` (keyed HMAC, per-tenant key), `legal_entity_id`, `location_id`, `department_path ltree`, `manager_path ltree`, `owner_id`, `subject_employee_id`, `restricted boolean`, `member_ids uuid[]` (cases), `record_scope jsonb` (P18), `updated_at` | RLS on `organization_id`; GIN indexes on the tsvectors, `pg_trgm` GIN on title / keywords, B-tree on visibility keys; partitioned by tenant hash for large tenants |
| `search_synonyms` | `organization_id` (null = YukthiX starter), `source`, `terms[]`, `is_starter` | Starter rows labelled; tenant rows added / edited (D17) |
| `search_recent` | `organization_id`, `user_id`, `source`, `record_id`, `opened_at` | Max 20 per user, 90-day expiry |
| `search_saved` | `organization_id`, `user_id`, `name`, `query`, `filters jsonb`, `pinned` | Re-run with viewer permissions |
| `search_settings` (P01 settings registry keys) | `search.document_content.types`, `search.synonyms`, `search.people.show_to_all` | See §7 Settings |

Keyed hashes use a per-tenant key held in KMS (P12); crypto-shredding the tenant key (YX-SECOPS-02) makes the hashes useless.

## 6. Rules

| ID | Rule |
|---|---|
| YX-SRCH-01 | Every search result, count, snippet and suggestion is filtered at query time by tenant RLS and the viewer's P02 scope for that source; a result is returned only if the viewer could open the record through its own screen. |
| YX-SRCH-02 | The search index is per tenant (`organization_id` + RLS, or a per-tenant index / filtered alias in any future engine); no query, ranking signal or suggestion uses another tenant's data. |
| YX-SRCH-03 | Indexed text is stored per P02 field class; a query matches only the classes the viewer holds for that record's scope, and snippets never show a value of a class the viewer lacks. |
| YX-SRCH-04 | Special-class fields and restricted-area narratives are never indexed as text; a Special identifier may be indexed only as a keyed hash of the full value, matched only for roles that hold that field, with the result showing the masked value; the match is audited as a view (P08). |
| YX-SRCH-05 | Restricted-area records (YX-SEC-10) appear only to their members, matched on reference and neutral title only; for everyone else search behaves exactly as for a record that does not exist. |
| YX-SRCH-06 | A change to a record's field class, restricted flag or scope keys re-indexes that record in the same transaction; other index updates follow domain events within 5 seconds (target). Permission changes take effect on the next query without re-indexing. |
| YX-SRCH-07 | The palette lists only actions the viewer holds the permission for and whose product / add-on is enabled; an action opens its sheet, inbox or wizard and never executes an irreversible step directly (APX-D §6.4). |
| YX-SRCH-08 | An exact identifier (employee code, request / ticket / case reference, candidate email or phone) typed in full returns that record first when visible. |
| YX-SRCH-09 | Name matching tolerates up to two typos and Indian transliteration / phonetic variants and matches across Latin and Indic scripts; actions, screen names and help topics are searchable in every P04 employee language. |
| YX-SRCH-10 | Document content is indexed only for document types the company has switched on and never for types classed Confidential or Special in P05; metadata search is always on. |
| YX-SRCH-11 | Synonyms ship as a labelled YukthiX starter list the company extends (D17); ranking uses only the tenant's data and the user's own history. |
| YX-SRCH-12 | Search is an API route like any other (YX-API-02): the same results for our apps and API clients with the same permissions; API keys search only the sources and field classes their scope lists (YX-SEC-22). |

## 7. Flows / APIs & UI

**API.**
- `GET /v1/search?q=&sources=&limit=&cursor=` → grouped results (`source`, `id`, `title`, `subtitle`, `snippet`, `link`, `actions[]`).
- `GET /v1/search/actions?q=` → palette actions for the caller.
- `GET/DELETE /v1/me/search/recent`, `/v1/me/search/saved`.
- Indexer consumes domain events (APX-B) per source: `*.created / updated / deleted`, `case.member.added / removed`, `document.classified`, `employment.exited` (re-index visibility keys).
- **Events emitted:** none public (search is read-only); internal `search.reindex.requested` for bulk backfills.

**UI** (brief T1 shell; APX-D PLT-01 and new PLT-20 / PLT-21, §2).
- **Search box** in the app shell top bar with "Ctrl K" hint; dropdown grouped results; empty state shows recent items and suggested actions for the role.
- **Command palette** overlay: one input, grouped list, keyboard hints, source chips for the prefixes.
- **Full results page** (T2): filters by source, entity, date, status; save search.
- **Mobile:** full-screen search from Home.
- **Settings › 2.2 Directory & privacy** gains: document types with content search, company synonyms, whether employees can find all colleagues or only their entity (the directory rule, P02 Q4, applies unchanged).

**Settings pages owned** (APX-D §3): 2.2 Directory & privacy (search options). No new Settings page.

## 8. Migration & rollout
1. Wave 2: engine, `search_documents`, sources for employees, requests, documents (metadata), policies (when M08 ships, wave 5), settings pages, screens and actions; palette in the desk shell; mobile search.
2. Each module registers its sources in its own wave (tickets and cases wave 5, candidates and jobs with the ATS, custom objects wave 6 with P18).
3. Exam-app candidates, questions and tests are backfilled by a one-off indexer job per tenant; existing list searches keep working and move to the engine source by source.
4. Engine switch (if ever): dual-write, compare result sets on sampled queries, then cut over per tenant.

## 9. Acceptance tests (samples)
- A manager in Chennai types a colleague's name from Pune who is outside their team: the result appears only if P02 Q4 directory visibility allows it, and never with salary or personal fields (YX-SRCH-01/03).
- An HR admin in tenant A searches a name that exists only in tenant B: no result, no count (YX-SRCH-02).
- A manager types an employee's CTC figure: no match; a payroll admin with Confidential access gets the employee (YX-SRCH-03).
- Searching a partial Aadhaar ("1234") returns nothing; an HR verifier typing the full number finds the employee, sees "•••• •••• 1234", and an audit event is written (YX-SRCH-04).
- A POSH case title is found by an IC member; an HR admin who is not a case member gets the same response as for a non-existent case (YX-SRCH-05).
- Moving an employee to another department: the old manager stops finding them on the next query, no re-index needed (YX-SRCH-06).
- An employee types "approve": no approve action is shown (no approvals permission); a manager sees "Approve (3 waiting)" and it opens the inbox, not an approval (YX-SRCH-07).
- "Shrinivaas", "Sreenivas" and "श्रीनिवास" all find "Srinivas K" (YX-SRCH-09).
- Payslip PDFs are never content-indexed even when the company switches content search on for all types (YX-SRCH-10).

## 10. Open questions (decided by principle, §11)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Search technology | **Postgres full-text first** (`tsvector` + `pg_trgm` + phonetic keys) behind a search-service interface; move to a dedicated engine only when measured tenant size / latency requires it; **the engine choice and hosting are a team / infra decision in P13**. Keeps per-user running cost inside the $1 price (D18). |
| Q2 | Document content search | **Metadata search always on; content search a company setting per document type, off by default**, never for Confidential / Special types; OCR for scanned files uses AI / OCR credits and the content index counts against storage fair use (D17, D18). |
| Q3 | People search reach | **Follow the P02 directory rule unchanged** (employees find colleagues per P02 Q4 with Public fields only; managers / HR within scope with their field classes); candidates only for hiring roles; no separate search permission. Company changes reach through the directory setting (D17). |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| Q1 | **Decided by principle (D17 / D18), user decision 26 Sep 2026 — recommended option adopted:** Postgres full-text (`tsvector`, `pg_trgm`, Indian-name phonetic keys, transliteration) behind a search-service interface; a dedicated search engine later only if measured need, **engine choice and hosting with the engineering team (P13)**; security model unchanged across engines (YX-SRCH-01–06). | 26 Sep 2026 |
| Q2 | **Decided by principle (D17 / D18), user decision 26 Sep 2026 — recommended option adopted:** metadata search always; document content search is a company setting per document type (off by default; never for Confidential / Special types, YX-SRCH-10); OCR consumes AI / OCR credits and the content index counts against storage fair use (add-ons beyond, D18). | 26 Sep 2026 |
| Q3 | **Decided by principle (D17 / D18), user decision 26 Sep 2026 — recommended option adopted:** people search follows the P02 directory rule and field classes with no extra permission; candidates only for hiring roles; restricted areas only for members (YX-SRCH-05). Included in every product's price (D18); build **wave 2**. | 26 Sep 2026 |
| B11 | **Gap-register extension (user decision 26 Sep 2026): global search & command palette** (GAP B11, spec §2.1.10) designed as P17: one box + Ctrl/Cmd-K palette across employees, candidates, jobs, requests, documents, policies, tickets, cases (members only), reports, settings, KB and custom objects (P18); actions, recent items, typo / phonetic / multi-language matching; rules YX-SRCH-01–12; screens PLT-01, PLT-20, PLT-21 (APX-D). | 26 Sep 2026 |
