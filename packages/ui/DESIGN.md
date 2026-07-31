# @arka/ui design tokens

Source of truth: `src/tokens.css`. Two layers — primitives (`--palette-*`,
raw values with no meaning of their own) and semantic tokens (`--color-*`,
`--radius-*`, `--font-*`, what every component in `src/*.tsx` actually
reads, aliased to a primitive). Nothing under `src/*.tsx` should ever
reference a `--palette-*` token directly. A visual overhaul means changing
primitive values and semantic aliases here, never a component file.

## Registers that exist today

Both registers share one set of semantic token names — that's what lets a
component be written once and rendered correctly in either.

**Light "customer" register** — default `:root`. Every screen in `apps/web`
uses this; nothing in that app sets `data-surface`. Phase 1 Figma values
(`figma.com/design/SfK9xpHnONjJvRcfbLt8Av`), rounded radius scale
(`--radius-sm/md/lg` 8/10/14px, `--radius-pill` 999px), Space Grotesk
display face.

**Dark "ops" register** — `:root[data-surface='ops']`, opted into by
`apps/console/src/app/layout.tsx` setting `data-surface="ops"` on `<html>`.
Applies to every screen in `apps/console` uniformly (no per-screen opt-in
inside that app today). Also Phase 1 Figma values, same token names,
darker aliases.

## Institutional primitives (Phase 2, added, not yet wired)

A third value set, `--institutional-*`, added alongside the two registers
above. Source: the marketing homepage rebuild,
`apps/web/src/app/globals.css`'s `.dw` scope — light paper ground, navy
ink, four dark "plate" panels, Source Serif 4 headings, 3px radius
throughout (nearly square, deliberately not a scale). Full rationale for
every value, including why the verification-teal and reject-red each split
into a paper variant and a plate variant (no single hex clears 4.5:1 text
contrast against both a near-white and a near-black ground at once — the
required luminance ranges don't overlap), is in the comment directly above
the token block in `tokens.css`. Read that before touching these values.

**The semantic aliases are now repointed to these primitives, in both
registers.** `--color-bg-*`, `--color-text-*`, `--color-accent-*`,
`--color-border-*`, `--color-focus-ring`, `--font-display` and
`--radius-sm/md/lg` all resolve to `--institutional-*` (light) or
`--institutional-plate-*` (ops) as of this commit; `--radius-pill` and the
status colors (`--color-success/warning/danger/info` and their tints) were
left alone; see the "why" comments directly on each alias in `tokens.css`
for the reasoning, including the one deliberate exception:
`--color-danger`/`--color-warning`/`--color-info` are not overridden in the
ops register, because both institutional-reject and a plate-brightened
warning fail contrast against the unchanged light-tint backgrounds badges
and alerts already pair them with; a screen that needs one of these as bare
text directly on a plate surface should use the existing `Badge` component
instead of fighting that conflict at the token layer.

## Extending this

- New color, spacing, or radius need: add a primitive, alias it from a
  semantic token, never hardcode a hex or px value in a component.
- Adopting the institutional look on a screen: repoint that screen's
  relevant semantic aliases (in the register it actually renders under) to
  the `--institutional-*` primitives above. Don't invent new semantic names
  for values the existing ones already cover.
- Source Serif 4 is not loaded app-wide. A screen adopting
  `--institutional-font-serif` needs its own `next/font/google` call
  (scoped, the same way `apps/web/src/app/page.tsx` does it) or it falls
  back to Georgia/Times New Roman.
