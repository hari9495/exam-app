import { BRAND } from '../../../lib/brand';

export interface BrandPair { do: string; dont: string }
export interface BrandSection { heading: string; body?: string; rules?: string[]; pairs?: BrandPair[] }
export interface BrandChapter { slug: string; title: string; intro: string; sections: BrandSection[] }

const P = BRAND.productName;
const C = BRAND.companyName;

export const BRAND_CHAPTERS: BrandChapter[] = [
  {
    slug: 'foundations',
    title: 'Foundations',
    intro: `${P} is an assessment and hiring platform by ${C}. The visual language is "${P} Azure": professional polish with examination-grade discipline — detail over decoration, ornament only when it encodes data, color only when it means something.`,
    sections: [
      { heading: 'Personality', rules: [
        'Precise: every number is exact, tabular, and sourced.',
        'Calm: the interface never shouts; urgency is reserved for genuine integrity events.',
        'Watchful: live states are visibly live — the platform sees what happens in a session.',
        'Professional: a tool teams live in all day, not a landing page.',
      ]},
      { heading: 'Naming', body: `The product is ${P} (status: ${BRAND.productNameStatus} name) by ${C}. The product name renders only from the BRAND constant.`, rules: [
        `Product surfaces where the platform speaks (staff login, footers, transactional email) say ${P}.`,
        `Legal and billing contexts say ${C}.`,
        `On candidate-facing org-branded surfaces the ORG speaks: its name and color lead; ${P} appears only as "powered by ${P}" attribution where contractually shown.`,
      ]},
    ],
  },
  {
    slug: 'voice',
    title: 'Voice and tone',
    intro: 'An invigilator, not a cheerleader. State the fact, then the next step. Short sentences. No exclamation marks in system copy.',
    sections: [
      { heading: 'Register', rules: [
        'Staff-facing: institutional and exact.',
        'Candidate-facing: warm, plain, and reassuring — an exam is stressful enough.',
        'Buttons: verb first, 1–3 words ("Release results", "Invite candidates").',
        'Errors: what happened, then what to do. Never blame, never apologize twice.',
      ]},
      { heading: 'Examples', pairs: [
        { do: "That email or password isn't right.", dont: 'Oops! Something went wrong!' },
        { do: 'Results released to 41 candidates.', dont: 'Success!! Your results have been released successfully!' },
        { do: 'Camera lost. Check your connection — the timer is paused.', dont: 'ERROR: MediaStreamTrack ended unexpectedly.' },
        { do: 'Invite candidates', dont: 'Click here to get started' },
      ]},
    ],
  },
  {
    slug: 'logo',
    title: 'Logo',
    intro: `The working mark is a stroke-drawn W monogram plus the ${P} wordmark set in Bricolage Grotesque 600. Both are placeholders with full usage rules, so the final mark can drop in without relayout.`,
    sections: [
      { heading: 'Usage', rules: [
        'Monogram minimum size 14px; wordmark minimum 12px cap height.',
        'Clear space: half the mark height on all sides.',
        'The mark inherits currentColor: ink on light, foreground on dark, org-on-primary inside org-colored tiles.',
        'Never stretch, rotate, outline, shadow, or gradient the mark.',
        'On org-branded candidate surfaces the org logo leads; the mark appears only in attribution.',
      ]},
    ],
  },
  {
    slug: 'color',
    title: 'Color',
    intro: 'A slate-neutral chassis with one working accent. Azure is the platform accent slot; an org\'s color replaces the slot wholesale on branded surfaces — platform and org chroma never coexist. Status colors are semantic and never overridden.',
    sections: [
      { heading: 'Product tokens (light)', rules: [
        'paper #ffffff — page and cards', 'surface #f8fafc — recessed grounds (boards, rails)',
        'ink #0b1220 — primary text', 'muted #64748b — secondary text',
        'hair #e2e8f0 — borders', 'accent #3b5fe3 — the slot: primary actions, focus, active nav',
        'danger #b91c1c — destructive and flag states',
      ]},
      { heading: 'Product tokens (dark, flat navy)', rules: [
        'paper #0b1220 — page AND cards (flat: depth from borders, not elevation)',
        'ink #f8fafc', 'muted #94a3b8', 'hair #1e293b', 'accent #3b82f6', 'danger #f87171',
      ]},
      { heading: 'Status semantics', rules: [
        'Clear = green #15803d. Review = amber #a16207. Flagged = red #b91c1c.',
        'A red 3px attention rail marks flagged items; nothing else may use it.',
        'Status colors never re-tint under white-labeling.',
      ]},
    ],
  },
  {
    slug: 'typography',
    title: 'Typography',
    intro: 'Bricolage Grotesque carries identity moments; Hanken Grotesk carries the interface; the mono stack carries evidence — serials, scores, clocks, counts.',
    sections: [
      { heading: 'Scale', rules: [
        'Display (Bricolage 600, −0.025em): page/job titles 26–34px.',
        'Eyebrow: 10.5–11px, 600, +0.14em, uppercase, accent color.',
        'UI labels: 12px/600 muted. Body: 13–14px. Helper: 11–12.5px.',
        'Mono (system stack): serials, scores, timers, counts — always tabular-nums.',
      ]},
      { heading: 'Rules', rules: [
        'Never letter-space body text; only eyebrows and mono micro-labels.',
        'One display moment per screen. Everything else is Hanken.',
      ]},
    ],
  },
  {
    slug: 'components',
    title: 'Components',
    intro: 'The ui-v2 primitives are the only building blocks for v2 surfaces. Components sourced from 21st.dev are retoned onto the tokens before use — never dropped in with their own colors.',
    sections: [
      { heading: 'Standards', rules: [
        'Fields: 38px, 1px hair border, 6px radius; focus = org-primary border + 18% ring.',
        'Primary button: org-primary fill (the slot), 40px, 6px radius, weight 600.',
        'Cards: paper on surface grounds, 1px hair border, 8px radius, shadow ≤ 2 layers and subtle.',
        'Flagged rows/cards carry the red attention rail.',
        'Every metric that decorates must be data-true (funnel widths from real counts, rings from real scores).',
      ]},
      { heading: '21st.dev intake', rules: [
        'Strip hardcoded colors → tokens. Strip gradients unless data-true. Match radii to 6/8px.',
        'If a component fights the accent-slot rule, adapt it or reject it.',
      ]},
    ],
  },
  {
    slug: 'motion',
    title: 'Motion and interaction',
    intro: 'One considered entrance per surface; micro-feedback on press; reduced motion always honored.',
    sections: [
      { heading: 'Rules', rules: [
        'Page/card entrance: single fade+8px rise, ~0.4s, ease-out. No stagger parades.',
        'Press: scale 0.98 spring tap on primary actions.',
        'Live states may pulse subtly (watch dots); nothing else animates idly.',
        'MotionConfig reducedMotion="user" wraps every v2 layout — no exceptions.',
        'Focus visibility is non-negotiable: every interactive element shows the slot-colored ring.',
      ]},
    ],
  },
  {
    slug: 'email',
    title: 'Email and marketing basics',
    intro: `Transactional email is part of the product: same voice, same restraint. Marketing pages may breathe more but draw from the same tokens.`,
    sections: [
      { heading: 'Rules', rules: [
        'Email chrome: white ground, ink text, one accent-colored button max.',
        `Sender identity: the org for candidate mail ("sent via ${P}" in the footer); ${P} for staff/system mail.`,
        `Legal footer: ${C}, unsubscribe/preferences where applicable.`,
        'Subject lines: fact first, no urgency theatre ("Your results for Drive 07", not "Don\'t miss your results!").',
      ]},
    ],
  },
];
