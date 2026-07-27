# @arka/ui

Shared design tokens and components for `apps/web` and `apps/console`. Built so a later visual overhaul
(the intended "more premium" pass) is cheap: change values, not call sites.

## Why this exists

Before this package, `apps/web` and `apps/console` each had their own hand-rolled `globals.css` with
different accent colors (`#0a5c46` vs `#8a3b12`) and no shared components. They did not read as the same
product. This package is the fix: one token set, one component set, both apps import from here instead
of repeating `<div className="panel">`.

## How to change the look later

**Almost never edit a component file.** `src/tokens.css` is a two-layer system:

- **Primitives** (`--palette-*`): raw values with no meaning of their own.
- **Semantic tokens** (`--color-*`, `--space-*`, `--radius-*`, ...): what every component actually reads,
  aliased to a primitive.

A component (`Button.tsx`, `Panel.tsx`, ...) never references a `--palette-*` token directly, only a
semantic one. So a premium reskin is: pick new primitive values, or re-point which primitive a semantic
token aliases to, in `tokens.css`. Every screen updates at once. Only reach for a component file if the
*shape* needs to change (a button gaining an icon slot), not the color or spacing.

`apps/console`'s two screens (W5, W6) already opt into a distinct, darker register via
`data-surface="ops"` on the page root, an instrument-panel read against `apps/web`'s lighter customer
surface, using the exact same token names. That is the pattern for any future second register: a
`data-*` attribute selector in `tokens.css`, not a second stylesheet.

## What is here

- `tokens.css`: the token layers above.
- `components.css`: component styles, all token-driven, classes prefixed `ui-`.
- `Button`, `Field`/`SelectField`, `Panel`, `Badge`, `Alert`, `Skeleton`, `EmptyState`, `Stepper`,
  `Shell`/`Topbar`/`TopbarLink`/`Main`, `Row`: the component set, typed, imported from `@arka/ui`.
- `icons.tsx`: a handful of hand-written inline SVGs. Not an icon library dependency, matching this
  codebase's zero-dependency-where-reasonable convention; add more here as screens need them.

## Using it in an app

```tsx
// app/layout.tsx
import '@arka/ui/tokens.css'
import '@arka/ui/components.css'
```

```tsx
import { Panel, Field, Button } from '@arka/ui'
```

Both `apps/web/next.config.ts` and `apps/console/next.config.ts` list `@arka/ui` in `transpilePackages`,
since this package ships TypeScript source directly (no build step, the same convention every other
package in this monorepo follows) and Next.js only compiles workspace packages it is told about.
