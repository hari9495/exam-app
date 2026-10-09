# YukthiX product docs

The design and decisions behind the YukthiX platform, kept next to the code that implements them. Imported on 6 Oct 2026 from the founder's working folder ("YukthiX HR Product Design 1").

| Path | What it is |
|---|---|
| `spec.md` | Working spec: features, decisions D1–Dn, build waves. Rendered by `build.py` into `index.html`. |
| `architecture-spec.md` | Architecture notes. |
| `design/` | Module and platform design docs. **P01–P23** platform (tenancy, access, workflow, notifications, identity P12, …), **M01–M13** HR modules, **T01–T08** assessments, **APX-A–G** appendices, gap register, validation passes, market and cost notes. Each doc lists its rule IDs (e.g. YX-IAM-01) — code and tests cite them. |
| `brand/` | Brand and design-system notes (DESIGN-SYSTEM.md v1.0). The implementation is `packages/yx-ui`. |
| `reference/` | Functional reference built from studying other products (clean-room — see below), the exam-app reuse inventory and next steps. Images are stored with Git LFS. |
| `tools/` | Scripts that build the Functional Design Specification document (`npm install` in `tools/functional-spec` first). |
| `YukthiX-Functional-Design-Specification-v1.16.*` | The compiled specification (Word and PDF, stored with Git LFS). |

## Clean-room rule (must read)

`reference/frappe-hrms-functional-spec/` describes the behaviour of Frappe HR and India Payroll, which are **GPL-3**. YukthiX is closed source. Those notes describe *what* a feature does in our own words only. Never copy their source code, names, structure or UI text into this repository, and never add their code here. See the rules table at the top of that folder's README.

## Large files

This folder uses Git LFS for `*.docx`, `*.pdf` and the reference images. Run `git lfs install` once before cloning so they download as real files.
