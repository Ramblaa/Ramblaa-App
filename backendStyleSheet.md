1) Design-token bridge to shadcn/ui
/* ============================
   Ramble <-> shadcn bridge
   ============================ */

/* Extend your existing :root with shadcn-style tokens */
:root {
  /* Base (map to your brand/ink scale) */
  --background: #ffffff;
  --foreground: var(--ink-900);

  --muted: var(--ink-50);
  --muted-foreground: var(--ink-600);

  --popover: #ffffff;
  --popover-foreground: var(--ink-900);

  --card: #ffffff;
  --card-foreground: var(--ink-900);

  --border: var(--ink-200);
  --input: var(--ink-200);

  --primary: var(--brand-600);
  --primary-foreground: #ffffff;

  --secondary: var(--ink-100);
  --secondary-foreground: var(--ink-800);

  --accent: var(--brand-100);
  --accent-foreground: var(--brand-800);

  --destructive: #ef4444;
  --destructive-foreground: #ffffff;

  --ring: var(--brand-400);

  --radius: 0.75rem; /* shadcn default: 0.5rem; keep your look */
}

/* Dark mode mapping */
html.dark {
  --background: var(--ink-0);
  --foreground: var(--ink-900);

  --muted: var(--ink-50);
  --muted-foreground: var(--ink-600);

  --popover: var(--ink-50);
  --popover-foreground: var(--ink-900);

  --card: var(--ink-50);
  --card-foreground: var(--ink-900);

  --border: var(--ink-300);
  --input: var(--ink-300);

  --primary: var(--brand-500);
  --primary-foreground: #ffffff;

  --secondary: var(--ink-100);
  --secondary-foreground: var(--ink-900);

  --accent: color-mix(in srgb, var(--brand-700) 20%, var(--ink-50));
  --accent-foreground: #fff;

  --destructive: #ef4444;
  --destructive-foreground: #fff;

  --ring: var(--brand-500);
}

/* Global surfaces */
body {
  background: var(--background);
  color: var(--foreground);
}

2) shadcn-style component primitives (pure CSS)

These mimic shadcn/ui’s Tailwind presets so your backend can look consistent even without Tailwind/React. Class names are aligned to shadcn where reasonable (.btn, .btn-outline, .card, .badge, .input, .textarea, .select, .alert, .accordion).

/* Buttons (variants + sizes) */
.btn {
  display:inline-flex; align-items:center; justify-content:center; gap:.5rem;
  font-weight:600; line-height:1; white-space:nowrap;
  border-radius: var(--radius);
  border: 1px solid transparent;
  background: var(--primary); color: var(--primary-foreground);
  padding:.7rem 1rem; box-shadow: var(--shadow-sm);
  transition: transform .04s ease, box-shadow .2s ease, background .2s ease, opacity .2s ease;
  cursor:pointer; text-decoration:none;
}
.btn:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
.btn:active { transform: translateY(0); box-shadow: var(--shadow-sm); }
.btn:disabled { opacity:.6; pointer-events:none; }

/* Variants */
.btn-outline {
  background: transparent; color: var(--foreground);
  border-color: var(--border);
}
.btn-secondary {
  background: var(--secondary); color: var(--secondary-foreground);
  border-color: var(--border);
}
.btn-ghost {
  background: transparent; color: var(--foreground);
  border-color: transparent;
}
.btn-link {
  background: transparent; border-color: transparent; color: var(--primary);
  padding: 0; box-shadow:none;
}
.btn-destructive {
  background: var(--destructive); color: var(--destructive-foreground);
}

/* Sizes */
.btn-sm { padding:.5rem .75rem; font-size: var(--fs-14); border-radius: calc(var(--radius) - 2px); }
.btn-lg { padding:.9rem 1.25rem; font-size: var(--fs-18); border-radius: calc(var(--radius) + 2px); }
.btn-icon { padding:.6rem; width:2.25rem; height:2.25rem; }

/* Inputs */
.label { display:inline-block; font-weight:600; color: var(--ink-800); margin-bottom:.4rem; }
.input, .textarea, .select {
  width:100%; background:var(--background); color:var(--foreground);
  border:1px solid var(--input); border-radius: var(--radius);
  padding:.65rem .8rem; outline:none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.textarea { min-height: 110px; resize: vertical; }
.input::placeholder, .textarea::placeholder { color: var(--muted-foreground); }
.input:focus, .textarea:focus, .select:focus {
  border-color: var(--ring);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ring) 25%, transparent);
}

/* Cards */
.card {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.card__header { padding: 1rem 1rem .5rem; font-weight:700; }
.card__content { padding: 0 1rem 1rem; }
.card__footer { padding: .75rem 1rem; border-top:1px solid var(--border); }

/* Badge */
.badge {
  display:inline-flex; align-items:center; gap:.35rem;
  border-radius: 999px; font-size: var(--fs-12); font-weight:600;
  padding:.25rem .6rem; border:1px solid transparent;
  background: var(--muted); color: var(--muted-foreground);
}
.badge--secondary { background: var(--secondary); color: var(--secondary-foreground); }
.badge--outline { background: transparent; color: var(--foreground); border-color: var(--border); }
.badge--destructive { background: color-mix(in srgb, var(--destructive) 12%, #fff); color: var(--destructive); }

/* Alert */
.alert {
  display:flex; gap:.75rem; align-items:flex-start;
  border:1px solid var(--border); border-radius: var(--radius);
  padding: .8rem .9rem; background: var(--muted); color: var(--foreground);
}
.alert--destructive { background: color-mix(in srgb, var(--destructive) 8%, var(--muted)); border-color: color-mix(in srgb, var(--destructive) 35%, var(--border)); }

/* Separator */
.separator { height:1px; background: var(--border); width:100%; }

/* Hover-ready row (like shadcn Table hover) */
.row-hover { transition: background .15s ease; }
.row-hover:hover { background: var(--muted); }

/* Accordion (pure CSS via <details>) */
.accordion { border:1px solid var(--border); border-radius: var(--radius); overflow:hidden; }
.accordion details { border-top:1px solid var(--border); background: var(--background); }
.accordion details:first-of-type { border-top:0; }
.accordion summary {
  list-style:none; cursor:pointer; padding:.9rem 1rem; font-weight:600; position:relative;
}
.accordion summary::-webkit-details-marker { display:none; }
.accordion summary::after {
  content:"▾"; position:absolute; right:1rem; transition: transform .2s ease;
}
.accordion[open] summary::after, details[open] summary::after { transform: rotate(180deg); }
.accordion__content { padding: .5rem 1rem 1rem; color: var(--muted-foreground); }

/* Tabs (simple) */
.tabs { display:flex; gap:.4rem; border-bottom:1px solid var(--border); }
.tab {
  padding:.6rem .9rem; border:1px solid transparent; border-bottom:2px solid transparent;
  color: var(--muted-foreground); cursor:pointer; font-weight:600;
}
.tab[aria-selected="true"] {
  color: var(--foreground); border-color: var(--border); border-bottom-color: var(--primary);
}

/* Tooltip (attribute-driven) */
[aria-tooltip] { position:relative; }
[aria-tooltip]:hover::after {
  content: attr(aria-tooltip);
  position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%);
  background: var(--foreground); color: var(--background);
  padding:.25rem .5rem; border-radius: .4rem; font-size: var(--fs-12); white-space:nowrap;
}
[aria-tooltip]:hover::before {
  content:""; position:absolute; bottom:100%; left:50%; transform:translateX(-50%);
  border:6px solid transparent; border-top-color: var(--foreground);
}

3) Keep your existing sections

Your previously provided layout/section styles (.navbar, .hero, .section, .grid--*, .card, .stats, .pricing, .cta, .footer, etc.) still apply. With the bridge above, new shadcn-style primitives slot in naturally:

Replace previous .btn modifiers with the variants above (.btn-outline, .btn-secondary, .btn-ghost, .btn-link, .btn-destructive).

Use .badge, .badge--outline, .badge--destructive in feature lists or card metas.

For forms, prefer .label + .input (and .textarea, .select) for consistent focus rings.

Use .accordion for FAQ/“details” sections.

4) Example markup
<div class="card">
  <div class="card__header">Connect WhatsApp</div>
  <div class="card__content">
    <label class="label" for="phone">Phone number</label>
    <input id="phone" class="input" placeholder="+62…" />
    <p class="text-muted" style="margin-top:.35rem;">We’ll verify ownership via SMS.</p>
  </div>
  <div class="card__footer">
    <button class="btn btn-lg">Continue</button>
    <button class="btn btn-outline btn-lg" style="margin-left:.5rem;">Cancel</button>
  </div>
</div>

<div class="accordion" style="margin-top:1rem;">
  <details open>
    <summary>What data do you store?</summary>
    <div class="accordion__content">
      Minimal metadata plus message logs for auditability.
    </div>
  </details>
</div>





Ramblaa — Brand Explanation Packet
For Designers & Creative Partners

1. What Ramblaa Is
Ramblaa is an AI-powered property manager for short-term rentals (Airbnb, VRBO, boutique hotels).
It handles guest communication automatically, coordinates with cleaners and maintenance, and escalates to the host only when necessary.

Core Functions
Responds to guests instantly, 24/7
Coordinates with cleaners and handymen
Creates and tracks tasks
Handles logistics (keys, check-in, towels, maintenance)
Learns each property’s quirks
Works across WhatsApp, SMS, Airbnb, and more
Ramblaa is the calm, competent manager handling everything behind the scenes.

2. Brand Personality
Traits
Calm & reassuring
Competent & smart
Warm, human, approachable
Discrete
Proactive
Trustworthy & dependable
Not
Corporate
Loud or “techy”
Robotic or playful
Chaotic
Overly expressive or quirky
Tone reference:
Four Seasons concierge + Apple simplicity + Notion calmness.

3. Brand Mission
Ramblaa gives hosts peace of mind by running their rental properties automatically.

Mission:

“You relax. Ramblaa handles it.”

4. Target Audience
Primary
Airbnb/STR hosts with 1–20 properties
Busy professionals
Hosts scaling into boutique property management
Small hotels and guesthouses
What They Care About
Reliability
Reduced stress
Guest satisfaction & reviews
Professionalism
Fast, accurate communication
Ramblaa must feel like a premium hospitality service, not a cheap automation tool.

5. Visual Look & Feel
Keywords
Clean
Soft
Natural
Calming
Minimal
Premium
Human-first
Visual Direction
Neutral, soothing palette (warm whites, muted sage, sand, charcoal)
Minimal UI with generous space
Organic shapes — avoid harsh geometric angles
Photography: warm interiors, quiet moments, natural textures
Motion: smooth, subtle, never flashy
The brand should evoke the calm of a perfectly prepared Airbnb at golden hour.

6. Logo Direction
The logo should communicate:

Soft intelligence
Calm flow / orchestration
Hospitality and warmth
Possible motifs:

A soft “R” with a path-like curve
Circular or ripple forms
Organic, natural lines
Avoid:

Robot heads
Speech bubbles
Lightning bolts
Literal or cartoony interpretations
7. Typography
Should Communicate
Modern hospitality
Soft sophistication
Friendly professionalism
Style Guidelines
Prefer:

Rounded or soft-serif modern fonts
Clean sans-serifs with warm personality
Wide line spacing and breathable layouts
Avoid:

Harsh geometric typefaces
Condensed or aggressive weights
Suggested inspirations: Airbnb Cereal, Inter, Sofia Pro, Work Sans, Humanist sans families.

8. Color System
Primary Palette (directional)
Warm White — #FAFAF8 (or similar)
Charcoal — deep, soft black
Sage Gray-Green — muted, calming
Sand — warm neutral
Secondary Options
Muted terracotta
Soft sky blue
Stone and clay tones
Emotion: grounded, premium, quiet.

9. UX & Product Feel
Product Should Feel
Effortless
Predictable
Hospitality-grade
Quietly powerful
Non-technical
Interface Guidelines
Plenty of white space
Soft corners
Colors used sparingly
Simple, clean iconography
Smooth, subtle animation
Think: Calm luxury meets automated intelligence.

10. Copy & Voice Guidelines
Voice Qualities
Clear
Warm
Brief
Reassuring
Confident
Human, never robotic
Example Voice
“I’ve arranged fresh towels at 12:30 pm.”
“All set — check-in instructions sent.”
“Don’t worry, I’ve taken care of it.”
Not
“Woohoo! Towels coming! 🎉”
“Executing workflow #12.”
“Your message has been processed.”
11. Brand Narrative
Ramblaa consistently communicates:

You’re not alone.
Things are taken care of before you worry about them.
Guests feel cared for.
Your life gets easier.
Ramblaa frees hosts from mental load and constant messaging.

12. Deliverables for Designers
This brand packet should guide creation of:

Full brand identity
Logo suite (primary, secondary, icon)
Color palette
Typography hierarchy
Brand guidelines document
Iconography style
Web landing page design
App interface design language
Social templates
Motion/animation principles
Pitch deck visual system
Appendix
A designer may request:

Moodboards
Figma brand system
Tone of voice examples
Homepage wireframes
Logo concept sketches
All are encouraged as next steps.