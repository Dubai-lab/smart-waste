# Smart Waste — Design System (MASTER)

Source: ui-ux-pro-max (`--design-system`, density 8, motion 4) + motion-sections, adjusted.
Database matches used: Swiss/minimal style, "Dashboard Data" font pairing, teal/amber palette.
Manual choices (no DB match for waste/environment): status colours, mobile density.

## Style
Minimal / Swiss. Flat surfaces, 1px borders, no heavy shadows (one elevation for popovers/modals).
Grid-based, high contrast, icon + label everywhere. Icons: Lucide (web), lucide-react-native (mobile). Never emoji.

## Typography
- UI/body: **Fira Sans** 400/500/600/700
- Numbers, IDs, codes, KPIs: **Fira Code** (tabular)
- Scale (px): 12 · 14 · 16 · 18 · 24 · 32. Body 14 (web dense) / 16 (mobile). Line-height 1.5.

## Colour tokens (light)
| token | hex |
|---|---|
| primary | #0D9488 (teal-600) — on-primary #FFFFFF for text ≥ 16px bold, else use #0F766E |
| primary-strong | #0F766E |
| accent / CTA | #D97706 — text on accent #1C1917 |
| background | #F6FAF9 |
| card | #FFFFFF |
| foreground | #0F2E2B |
| muted | #EEF3F2 · muted-fg #475569 |
| border | #D5E3E0 |
| success #15803D · warning #B45309 · danger #DC2626 · info #0369A1 |

Dark: background #0B1514, card #111F1D, foreground #E6F2F0, muted-fg #9FB3AF, border #1F3532, primary #2DD4BF.
Status always = colour + icon + text.

## Spacing / layout
4/8 rhythm. Web dashboard dense: 8–32px. Sidebar ≥1024px, top bar + drawer below. Max content 1440px.
Mobile: bottom tabs ≤5, touch targets ≥48dp, safe areas respected.

## Motion
- Web: Motion (`motion/react`). Mobile: Reanimated. One easing `[0.22, 1, 0.36, 1]`.
- Enter 0.2–0.4s, exit ~65% of enter. Animate opacity/transform only.
- Page: KPI cards stagger 40ms on load; counters count up once. Modals/toasts/drawers via AnimatePresence.
- No scroll-reveal on operational tables. Max 1–2 animated elements per view. Respect reduced motion.

## Data & charts
Recharts. Legend visible, tooltips, table alternative, empty/loading/error states, locale formatting (RWF).
