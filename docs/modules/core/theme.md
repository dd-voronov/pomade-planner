---
doc: docs/modules/core/theme.md
audience: engineers, product
holds: Pomade's tokens and theme on every frame, the surface background, and the rule that every colour is a token
kind: reference
---

# Theme — both apps look like Pomade

**Module:** `core` · **UI:** every frame of both apps · **Code:** `src/core/mount.tsx`,
`src/core/app.css`, `src/core/switcher.css`, `src/core/tips.css`, the apps' styles
(`src/planner/*.css`, `src/board/board.css`), the icons (`apps/*/public/*.svg`) · **e2e:**
`fake-host.spec.ts` (`?theme=dark`, `fakeHost.setTheme`), `pomade-planner.spec.ts` · **Unit:**
`test/colors.test.ts` · **Contract:** `../Pomade/docs/HOST-API.md` §3 `welcome.theme`, §4
`theme.changed`

## What it does

Both apps draw with Pomade's design tokens and wear Pomade's theme, so a frame reads as part of
Pomade, and a theme Pomade adds restyles both apps whole.

## How

- **Tokens.** `mount.tsx` imports `pomade-kit/tokens.css` (generated from Pomade's own) before the
  app's styles.
- **Theme.** On a connected handshake `followTheme(host)` puts `welcome.theme` on the frame's root
  (`data-theme`) and follows `theme.changed`; a Pomade that names no theme is light, and so is a
  page with no host (`applyTheme("light")`). The Mac's appearance is never read.
- **Surface background.** `<html data-surface>` (set by `App`) picks the background Pomade's own
  surface has: a tab and an overlay on `--panel-raised`, the side panel on `--bg` (`app.css`).

## Invariants (`test/colors.test.ts`)

- No colour literal (hex, `rgb()` / `hsl()` and the like, named colours) in any style, component
  or icon.
- SVG glyphs draw in `currentColor`; a data-URI image appears only as a mask over a token colour.
- Every custom property a style reads is one of Pomade's tokens or declared by the styles
  themselves.
