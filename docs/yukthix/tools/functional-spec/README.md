# Functional spec builder

Rebuilds `YukthiX-Functional-Design-Specification-v1.0.docx` (and a PDF) from `design/*.md`, plus the reference screenshots in `reference/ui-screens/`.

```bash
cd tools/functional-spec && npm install
node build.js "<path-to>/YukthiX" raw.docx
powershell -File finish.ps1 -In "<abs>\raw.docx" -OutDocx "<abs>\YukthiX-Functional-Design-Specification-v1.0.docx" -OutPdf "<abs>\....pdf"
```

`finish.ps1` uses Microsoft Word to refresh the table of contents and page numbers. The screenshot-to-chapter mapping is the `SCREENS` table in `build.js`. The appendix comes from `design/CONSISTENCY-REVIEW.md`.
