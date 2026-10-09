// §41: components may not use raw colours, raw sizes or primitive tokens. §0: no banned patterns.
// Only src/styles/tokens.css holds raw values. Allowed px: 0, 1px, 2px (hairlines, focus) and inside @media queries.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(css|tsx)$/.test(f) && !p.endsWith('tokens.css') && !/[\\/]stories[\\/]|\.test\.tsx$/.test(p)) files.push(p);
  }
})('src');

const rules = [
  [/#[0-9a-fA-F]{3,8}\b/, 'raw hex colour'],
  [/\brgba?\(|\bhsla?\(/, 'raw rgb/hsl colour'],
  [/var\(--yx-(azure|slate|green|amber|red|purple)-\d+\)/, 'primitive token (use a semantic token)'],
  // §0 banned list
  [/gradient\(/, 'gradient (banned, §0)'],
  [/backdrop-filter/, 'glass blur (banned, §0)'],
  [/:hover[^{]*\{[^}]*translateY/, 'hover lift (banned, §0)'],
  [/Sparkles/, 'sparkle AI icon (banned, §8)'],
];
// @container queries are breakpoints too.
const pxRule = /(?<![\w-])(\d*\.?\d+)px\b/g;

let bad = 0;
for (const f of files) {
  readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
    for (const [re, why] of rules) if (re.test(line)) { console.log(`${f}:${i + 1}  ${why}: ${line.trim()}`); bad++; }
    if (f.endsWith('.css') && !line.includes('@media') && !line.includes('@container')) {
      for (const m of line.matchAll(pxRule)) if (!['0', '1', '2'].includes(m[1])) { console.log(`${f}:${i + 1}  raw size ${m[0]}: ${line.trim()}`); bad++; }
    }
  });
}
if (bad) { console.log(`\n${bad} token violation(s)`); process.exit(1); }
console.log(`tokens ok (${files.length} files)`);

// Clean-room / fictional-data rule: stories and sample data never name real companies or competitors.
const REAL = /\b(Deloitte|KPMG|PwC|Tata|Infosys|Wipro|Reliance|ICICI|HDFC Bank|Flipkart|Zomato|Swiggy|Google|Microsoft|Amazon|Accenture|TCS|Mahindra|Airtel|Paytm|Razorpay|Zoho|Keka|Darwinbox|greytHR|Cognizant|Capgemini|HCL|Byju'?s|Workday|BambooHR|SAP SuccessFactors)\b/;
const storyFiles = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if ((/[\\/]stories[\\/]/.test(p) && /\.tsx?$/.test(f)) || (/[\\/]screens[\\/]/.test(p) && /(\.stories\.tsx|data\.ts)$/.test(f))) storyFiles.push(p);
  }
})('src');
let realHits = 0;
for (const f of storyFiles) {
  readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const m = line.match(REAL);
    if (m) { console.log(`${f}:${i + 1}  real company name in sample data (${m[1]}): use a fictional name`); realHits++; }
  });
}
if (realHits) { console.log(`\n${realHits} real-name violation(s)`); process.exit(1); }
console.log(`sample data ok (${storyFiles.length} story files)`);
