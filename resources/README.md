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

A danmaku speech bubble on a warm gold tile, in the app's own palette.

- The silhouette is one bold shape plus three dots, so it still reads at 16px
  in the taskbar. Detail (gradient, gloss, sparkle) is additive: losing it at
  small sizes costs nothing.
- Nothing is drawn with a stroke thinner than 8px at 256, because finer work
  turns to mush when scaled down.
- The tile gloss is a radial gradient rather than a shaped overlay. A path with
  its own corner radius reads as a second edge laid over the first.
