# STL to G-code Agent

Small Bun scripts for producing local `.gcode` files for a **Creality Ender-3 V2 Neo** using **PrusaSlicer CLI**.

This does not talk to the printer, SD card, OctoPrint, or firmware. It only creates a local G-code file under `projects/<id>/done/`.

## Requirements

- Bun
- `unzip`
- PrusaSlicer CLI as `prusa-slicer`
  - or use `--prusa-slicer /path/to/prusa-slicer`
  - or set `PRUSA_SLICER_BIN=/path/to/prusa-slicer`

No `dist/`, no build step, no npm dependencies.

## Layout

```text
app/
  scripts/   runnable Bun scripts
  lib/       shared helpers
profiles/   PrusaSlicer profiles
projects/   per-model project folders
```

## Direct one-shot use

```bash
bun run convert ./dragon.stl
bun run convert ./model.zip
bun run convert https://example.com/model.stl
bun run convert https://www.thingiverse.com/thing:251118
```

If more than one printable STL is found, choose one explicitly:

```bash
bun run convert ./model.zip --stl 2
```

Use a different profile:

```bash
bun run convert ./dragon.stl --profile pla-fine
```

Each source gets a project folder:

```text
projects/<id>/
  todo/        original STL/ZIP/download
  in-process/  extracted files and metadata
  done/        final G-code and preview SVG
```

Final G-code and previews go to:

```text
projects/<id>/done/<id>-<profile>.gcode
projects/<id>/done/<id>-<profile>-preview.svg
projects/<id>/done/<id>-<profile>-preview-isometric.svg
```

## Two-step use

Import/download/extract/discover STLs:

```bash
bun run import ./model.zip
bun run import https://www.thingiverse.com/thing:251118
```

This writes files under:

```text
projects/<id>/
```

Regenerate previews from an existing G-code:

```bash
bun run preview <id>
bun run preview <id> --isometric
bun run preview projects/<id>/done/<id>-pla-normal.gcode
```

List discovered STLs:

```bash
bun run list <id>
```

Slice:

```bash
bun run slice <id>
bun run slice <id> --stl 2
bun run slice <id> --profile pla-draft
```

## IDs

IDs are intentionally simple:

- Thingiverse URL: `<model-name>-thing-<number>`
- Local file: sanitized filename without extension
- Other URL: sanitized URL basename plus a short hash

## Profiles

Version-controlled PrusaSlicer profiles live in:

```text
profiles/ender3-v2-neo/
  pla-normal.ini
  pla-draft.ini
  pla-fine.ini
```

Default: `pla-normal`.

## Validation

The scripts validate that STL files are:

- discoverable
- parseable as ASCII or binary STL
- non-empty
- within the Ender-3 V2 Neo build volume: `220 x 220 x 250 mm`

If multiple printable STLs exist, the scripts do not guess. Use `--stl <index>`.

## Thingiverse note

Thingiverse downloads are attempted with:

```text
https://www.thingiverse.com/thing:<id>/zip
```

If Thingiverse returns HTML instead of a ZIP, use your browser to download the model ZIP/STL manually, then run:

```bash
bun run convert ~/Downloads/model.zip
```
