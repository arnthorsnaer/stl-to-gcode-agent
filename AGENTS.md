# STL to G-code Agent — Operating Notes

This directory intentionally uses small Bun scripts under `app/scripts/`, not a compiled Node app.

## Purpose

Create local `.gcode` files for a Creality Ender-3 V2 Neo from:

- local `.stl`
- local `.zip`
- direct `.stl`/`.zip` URL
- Thingiverse URL, with ZIP endpoint first and headless `agent-browser` fallback when needed

The agent creates local `.gcode` files and, when the `3D_PRINTS` volume is already mounted, may copy the final `.gcode` there for the user.

## Hard boundaries

- Do not communicate with the printer.
- Do not mount, unmount, format, erase, or otherwise manage SD cards.
- Do not write anything except final `.gcode` files, and only to an already-mounted `3D_PRINTS` volume.
- Do not use OctoPrint.
- Do not build slicing logic.
- Do not invent slicing settings dynamically.
- Use PrusaSlicer CLI and checked-in profiles only.

## Standard workflow

### Step 1 — Import and slice

Prefer the one-shot command:

```bash
bun run convert <source>
bun run convert <source> --stl <index>
bun run convert <source> --profile pla-fine
```

If PrusaSlicer is not named `prusa-slicer`, pass the binary explicitly:

```bash
bun run convert <source> --prusa-slicer /path/to/prusa-slicer
```

On macOS with Homebrew cask PrusaSlicer, the binary is usually:

```text
/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer
```

### Step 2 — If multiple printable STLs are found

Do not guess. Show the list to the user and ask which STL index to use, or rerun with:

```bash
bun run convert <source> --stl <index>
```

### Step 3 — Confirm local G-code and preview output

After a successful slice, the final G-code plus top-down and isometric SVG previews should exist at:

```text
projects/<id>/done/<id>-<profile>.gcode
projects/<id>/done/<id>-<profile>-preview.svg
projects/<id>/done/<id>-<profile>-preview-isometric.svg
```

Report all paths to the user. The previews are for sanity checking only; they parse extrusion moves from the generated G-code and do not replace slicer/printer validation.

### Step 4 — Copy to `3D_PRINTS` if already mounted

Check whether the volume is mounted:

```bash
test -d /Volumes/3D_PRINTS
```

If `/Volumes/3D_PRINTS` exists, copy only the final `.gcode` file:

```bash
cp projects/<id>/done/<id>-<profile>.gcode /Volumes/3D_PRINTS/
```

Then report the copied path:

```text
/Volumes/3D_PRINTS/<id>-<profile>.gcode
```

If `/Volumes/3D_PRINTS` is not mounted, do not mount it. Leave the `.gcode` in `projects/<id>/done/` and tell the user the volume was not mounted.

## Two-step workflow

Use this when the user wants import/list/slice separated:

```bash
bun run import <source>
bun run list <id>
bun run slice <id>
bun run slice <id> --stl <index>
bun run preview <id>
```

If PrusaSlicer is not named `prusa-slicer`:

```bash
PRUSA_SLICER_BIN=/path/to/prusa-slicer bun run slice <id>
bun run slice <id> --prusa-slicer /path/to/prusa-slicer
```

## Code layout

No build step. No `dist/`.

```text
app/
  scripts/   runnable Bun scripts
  lib/       shared helpers
profiles/   PrusaSlicer profiles
projects/   per-model project folders
```

## Output

Each source gets a project folder:

```text
projects/<id>/
  todo/        original STL/ZIP/download
  in-process/  extracted files and metadata
  done/        final G-code
```

Final G-code and preview files go in:

```text
projects/<id>/done/<id>-<profile>.gcode
projects/<id>/done/<id>-<profile>-preview.svg
projects/<id>/done/<id>-<profile>-preview-isometric.svg
```

Import/extraction metadata goes in:

```text
projects/<id>/in-process/
```

Generated project files under `projects/` are ignored by git.

## IDs

- Thingiverse: `<model-name>-thing-<number>` (model name is read from the Thingiverse page title and sanitized)
- Local file: sanitized filename without extension
- Other URL: sanitized basename plus short hash

## Profiles

Profiles live in:

```text
profiles/ender3-v2-neo/
  pla-normal.ini
  pla-draft.ini
  pla-fine.ini
```

Default profile: `pla-normal`.

Target printer assumptions:

- Creality Ender-3 V2 Neo
- Marlin
- 220 x 220 x 250 mm build volume
- 0.4 mm nozzle
- Bowden extruder
- PLA-focused

## Validation

The scripts validate:

- STL discovery
- ASCII/binary STL parseability
- non-empty geometry
- model bounds within `220 x 220 x 250 mm`
- safe ZIP entry paths before extraction

If multiple printable STL files are found, do not guess. Use `--stl <index>` only after the user chooses.

## Thingiverse

Thingiverse support is best-effort via:

```text
https://www.thingiverse.com/thing:<id>/zip
```

If that endpoint returns HTML instead of a ZIP, the importer may fall back to headless `agent-browser` to click the visible STL download button. If both approaches fail, tell the user to download the ZIP/STL manually in a browser and run:

```bash
bun run convert ~/Downloads/model.zip
```
