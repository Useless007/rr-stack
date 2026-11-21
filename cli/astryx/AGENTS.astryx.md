
## UI components: Astryx

This app was created with `--astryx`. The playground pages (`/app`, `/app/todos`, `/app/todos/:id`,
`/sign-in`) use [Astryx](https://github.com/meta/astryx), Meta's React design system (beta), under
Tailwind. The marketing pages keep plain Tailwind.

- Before you use a component, read its props: `bun run astryx component <Name>` (in `web/`).
  Run every Astryx command as `bun run astryx ...`, also when its output says `bunx astryx`: the
  unscoped `astryx` on npm is an unrelated package. Ignore its hint to run `init`; this file already
  holds the guide.
  `bun run astryx build "<what you are building>"` names a template to start a new page from.
- Astryx text props are `label` (Button, Badge, Tab), booleans start with `is`/`has`, inputs take
  `value` and `onChange(value)`. Lay out with `VStack`/`HStack`, not raw `<div>`.
- Styles: `web/app/ui.css` layers Astryx under Tailwind; keep its `@layer` line first. Tailwind
  classes keep their usual meaning (Astryx's token bridge is not loaded), so `text-primary` or
  `bg-surface` do not exist; use component props or the app's own colours (`text-ink`). The theme is
  set in `web/app/components/ui-provider.tsx` (`@astryxdesign/theme-neutral`, light/dark from the
  system).
- After bumping Astryx, run `bun run astryx upgrade --from <old version> --apply` and `bun run check`.
