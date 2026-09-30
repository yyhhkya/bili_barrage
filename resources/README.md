# Build resources

## Icon

`icon.svg` is the source of truth. `icon.ico` and `icon.png` are generated from
it — never hand-edit those, they are overwritten.

```bash
npx electron scripts/make-icon.cjs
```

That renders each size in Electron itself (the same engine that draws the UI)
and packs the results into a multi-resolution ICO. Doing it this way avoids
pulling in `sharp` (a native module that has to be rebuilt on every Electron
upgrade) or ImageMagick (an external tool every build machine would need).

| File | Used by |
|---|---|
| `icon.svg` | source |
| `icon.ico` | `electron-builder.yml` → exe, installer, shortcuts |
| `icon.png` | `BrowserWindow` icon (taskbar / Alt-Tab in dev), title bar, README |

### Design notes

The character 弹 on a gold tile — two elements, no effects.

- The glyph is ZCOOL KuaiLe, the font the whole UI is set in
  (`tokens.css` → `--font-sans`), so the icon and the window read as one product.
  It is stored as an outline path rather than `<text>` so rasterising never
  depends on a font being installed.
- The tile is a saturated gold, not a pale cream, because a pale tile vanishes
  against a white Explorer background. Gold separates from light and dark alike.
- The tile gradient is deepened (relative to the original `#FFDE79 → #EFB62E`)
  so cream clears it everywhere. At the original top stop the glyph's densest
  strokes landed on the lightest part of the gradient and dissolved into it.
- Removed: sparkle, gloss, drop shadow, glyph gradient. Each competed for the
  same 256px and none survived being scaled to 16px.
- Trade-off accepted: 弹 has 12 strokes, so at 16px it is a blob. The taskbar
  and Alt-Tab read the silhouette; the character is legible from 32px up.

Redoing the outline after a font change: parse
`@fontsource/zcool-kuaile/files/zcool-kuaile-113-400-normal.woff` (U+5F39) with
opentype.js and rescale `glyph.getPath(0, 0, 1000)` by
`150 / max(bbox width, bbox height)` about the tile centre.
