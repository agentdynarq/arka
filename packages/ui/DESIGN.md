# @arka/ui design tokens

Source of truth: `src/tokens.css`. Two layers — primitives (`--palette-*`,
raw values with no meaning of their own) and semantic tokens (`--color-*`,
`--radius-*`, `--font-*`, what every component in `src/*.tsx` actually
reads, aliased to a primitive). Nothing under `src/*.tsx` should ever
reference a `--palette-*` token directly. A visual overhaul means changing
primitive values and semantic aliases here, never a component file.

## The indigo flood system (current, chore/indigo-tokens)

One palette across all three surfaces — the homepage (`apps/web/src/app/
globals.css`'s `.dw` scope), the customer app (`apps/web`), and the Recovery
Console (`apps/console`) — replacing three registers that used to feel like
three different products. New primitives live at `:root` in `tokens.css`
(the flood gradient, cool neutral grounds, a single indigo primary, a
three-color status triad, and the type stack); the previous
`--institutional-*` block and `.dw`'s own primitives are now aliases onto
these, mapped by role rather than by hue, so no call site anywhere needed to
change. Full per-token reasoning is in the comments directly above each
block in `tokens.css` and `globals.css` — read those before touching a
value here.

Rules that apply everywhere:

- **The flood gradient (`--flood`, and its components `--flood-top`/
  `--flood-base`) is full-bleed homepage panels only, never a small element,
  never inside the customer app or the Recovery Console.** Exactly four
  panels on the homepage are flood-eligible: the hero, the contrast pair,
  the final CTA, and the value strip. It is not aliased to or from anything
  else in the token system; it's new markup only, not yet used by any
  existing screen as of this commit. The Fig. 1-4 plates (architecture
  diagram, verify-ledger terminal, failure comparison, hero line) stay
  solid `--ink`, deliberately never the gradient — if those plates were
  also gradient, the flood would stop meaning anything as a device.
- **`--primary` is the single interactive color on all three surfaces.**
  Anywhere that used to be a navy or teal button is now indigo (see the
  judgement-call comments on `--color-accent`, base and ops, in
  `tokens.css`).
- **Status colors (`--teal`/`--red`/`--amber`, and `--color-success/-warning/
  -danger/-info`) are never a button fill.** They back badges, alerts, and
  banners only.
- **Source Serif 4 for headings, Inter for body, JetBrains Mono for machine
  output only, loaded app-wide** (both `apps/web/src/app/layout.tsx` and
  `apps/console/src/app/layout.tsx`), not scoped to one route anymore. The
  serif is required, not a style preference — it's what keeps the indigo
  from reading as a crypto product. Don't substitute a geometric sans for
  it. Space Grotesk is gone entirely (no import, no `@font-face`, no `<link>`
  anywhere in the tree).
- **No gradients other than the flood, no glass, no emoji, no filled status
  pills, no avatar circles, no progress rings**, anywhere.

## Registers that exist today

Both registers share one set of semantic token names — that's what lets a
component be written once and rendered correctly in either.

**Light "customer" register** — default `:root`. Every screen in `apps/web`
uses this; nothing in that app sets `data-surface`. Radius scale
(`--radius-sm/md/lg`) now aliases the new `--radius` primitive (3px,
nearly square, not a rounded scale); `--radius-pill` (999px) is unchanged.

**"Ops" register** — `:root[data-surface='ops']`, opted into by
`apps/console/src/app/layout.tsx` setting `data-surface="ops"` on `<html>`.
Applies to every screen in `apps/console` uniformly (no per-screen opt-in
inside that app today). As of chore/indigo-tokens this register is **light**,
the same family as the customer register — "dark ops panel" was the previous
direction; the attribute and the seam it opts into both still exist, so a
genuinely dark register could be reintroduced through it later if one is
ever needed, but nothing in `apps/console` renders dark today.

## Institutional primitives (Phase 2, now aliased onto the indigo system)

A third value set, `--institutional-*`, originally the marketing homepage's
own palette: light paper ground, navy ink, four dark "plate" panels, Source
Serif 4 headings, 3px radius throughout (nearly square, deliberately not a
scale). As of chore/indigo-tokens every one of these is an alias onto the
new primitives above, not a second, separately-tuned palette — see the
block comment directly above `--institutional-*` in `tokens.css` for the
two mappings that are not a straight hue swap (the "plate" tokens alias the
new `--ink` neutral, not the flood gradient; `--institutional-verified`
keeps its own tuned value rather than aliasing `--teal` directly, since it's
specifically calibrated for a dark plate ground).

**The semantic aliases are still repointed to these primitives, in both
registers**, exactly as before this pass — `--color-bg-*`, `--color-text-*`,
`--color-border-*`, `--color-focus-ring`, `--font-display` and
`--radius-sm/md/lg` all resolve to `--institutional-*` (light) or, in the
ops register, now directly to the new light neutrals rather than to
`--institutional-plate-*` (see the ops-register block comment in
`tokens.css` for why: those primitives alias `--ink`, kept dark on purpose
for the homepage's actual plate panels, and the console needed to diverge
from that rather than inherit it once it went light).

## Resolved since the first indigo-tokens pass (fix/teal-on-dark)

- `--institutional-verified` is gone, renamed to `--teal-on-dark` (`#6fbfad`,
  in the new-primitives status group in `tokens.css`) — the old `#40bfb5`
  was tuned against paper, but reads as a bright-mint scam signal against
  indigo. `apps/web/src/app/globals.css`'s own `--verified` (the primitive
  actually rendered on the live homepage plates) got the same value fix,
  keeping its own name since only tokens.css's copy needed a rename.
- `.ui-button--teal` is retired. Both call sites (`transfer/page.tsx`'s
  confirm button, `dashboard/page.tsx`'s Send button) now render as the
  default `primary` variant; the modifier class is deleted from
  `components.css`, and `'teal'` is removed from `ButtonVariant`.
  `--color-teal`/`--color-teal-strong` are untouched and still needed —
  they back `.ui-panel__eyebrow` text, the progress bar fill, the modal
  panel's top border, and a couple of icon/text colors, none of which are
  button fills.

## Known gaps, still not fixed here (Lane C's, not Lane A's)

- `packages/ui/src/components.css` has four places (`.ui-split-hero__panel`,
  `.ui-split-hero__mark`, the modal backdrop, `.ui-balance-hero`) that
  reference `--palette-navy-900`/`--palette-navy-950` directly, and three
  more (`.ui-split-hero__panel::before`, `.ui-balance-hero__badge`, the
  balance-hero glow) that reference `--palette-teal-300`/`--palette-teal-600`
  directly — none of these go through the semantic layer at all, so none of
  them picked up the new palette. Still hardcoded navy/teal.
- `apps/web/src/app/reverify/page.tsx`'s split-hero panel and
  `apps/web/src/app/dashboard/page.tsx`'s balance hero are the two screens
  that actually render the components above, so they're where the mismatch
  will be visible first.

## Extending this

- New color, spacing, or radius need: add a primitive, alias it from a
  semantic token, never hardcode a hex or px value in a component.
- Don't invent new semantic names for values the existing ones already
  cover.
- Source Serif 4 is loaded app-wide now (both apps' `layout.tsx`). A new
  route doesn't need its own `next/font/google` call for it — the duplicate
  scoped loads in `apps/web/src/app/page.tsx` and
  `apps/web/src/app/judges/page.tsx` were collapsed in fix/teal-on-dark.
