---
id: assets
title: Assets and fonts
icon: perm_media
related: [import, canvas, library]
verified: 1.3.0-beta.33
---

Manage the images, videos and fonts an imported profile carries.

Open the **Library** and press **Canvas files** for the current screen. See [Library](library) for your files across screens.

## Files

Each file shows a preview, its real type and pixel size, byte size and how many items use it.

- **Add files**: duplicates are merged by content.
- **Replace by name…**: pick a set of files and the studio matches them to the canvas's files by name. It shows matches, identical, unmatched and ambiguous files before anything changes.
- On a row, **Replace**, **Save a copy to My library**, **Use** and **Remove**.

## Cleanup

The finding chips are Unused, Identical, Larger than drawn, Over 1 MB, Missing and Tiled. **Clean up** acts on the findings; the number on the button counts them.

## Optimise images

**Optimise images…** re-encodes still images (same type or WebP) with a quality and a size cap (None, Drawn size or 50 %). The studio replaces a file only when it gets at least 5 % smaller. One undo step.

## Fonts

In **Library › Fonts**, see each font the profile asks for, the face that will be drawn and where it came from. **Add fonts** takes `.ttf`, `.otf`, `.ttc`, `.woff`, `.woff2` or `.zip`. **Get a font** searches Fontsource and Font Squirrel. Each font shows whether it may be shared: **May share**, **Check licence** or **Do not share**.

:::warn
Before sharing an exported profile, check the fonts marked **Check licence** or **Do not share**.
:::
