# stl-to-gcode-agent — Agent Operating Guide

Workflow agent for converting STL/ZIP/Thingiverse inputs into local G-code for a Creality Ender-3 V2 Neo using checked-in PrusaSlicer profiles.

## Mission

- Import local STL/ZIP files or supported URLs.
- Validate and list discovered STL files.
- Slice the selected printable STL with an approved checked-in profile.
- Publish the final G-code to an external destination only when available, then clean processing files and preserve ignored evidence.

## Dependencies

All dependencies are explicit. Internal and external tools are both first-class dependencies. Secret-bearing config must come from untracked local files or environment variables.

### External tools

Name | Purpose | Required | Verify | Notes
--- | --- | --- | --- | ---
bun | Run internal scripts. | yes | bun --version | -
unzip | List and extract ZIP model archives safely. | yes | unzip -v | -
PrusaSlicer CLI | Slice STL to G-code. | yes | PATH: `prusa-slicer --help`<br>OR PRUSA_SLICER_BIN: `test -n "$PRUSA_SLICER_BIN" && "$PRUSA_SLICER_BIN" --help`<br>OR macOS app default: `test -x /Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer && /Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer --help` | Supply PrusaSlicer either on PATH as prusa-slicer, via PRUSA_SLICER_BIN, or with --prusa-slicer when running slice/convert.
agent-browser | Optional Thingiverse browser fallback when direct ZIP download fails. | no | agent-browser --help | -

### Internal tools

Name | Command | Purpose | Verify
--- | --- | --- | ---
convert | `workflow/01A-convert.sh <source>` | Step 1A: Preferred one-shot import/list/slice/preview wrapper. | -
import | `workflow/01B-import.sh <source>` | Step 1B: Alternate/manual import/download/extract/discover wrapper. | -
list | `workflow/02-list.sh <id>` | Step 2: List discovered STLs. | -
slice | `workflow/03-slice.sh <id>` | Step 3: Slice selected STL. | -
preview | `workflow/04-preview.sh <id>` | Step 4: Regenerate/check G-code previews. | -

### Services

None declared.

### Local config

None declared.

### Environment variables

Name | Purpose | Required | Secret?
--- | --- | --- | ---
PRUSA_SLICER_BIN | Optional override for PrusaSlicer binary path. | no | no

### Filesystem paths

Path | Purpose | Required | Git policy
--- | --- | --- | ---
projects/archive/ | Ignored local evidence archive. | yes | tracked only as .gitkeep; contents ignored
settings.json:slicer.profileRoot | Checked-in approved PrusaSlicer profiles. | yes | tracked
/Volumes/3D_PRINTS | Optional already-mounted external G-code destination. | no | external; do not manage mount

### Tracked assets

Path | Purpose | Required | Git policy
--- | --- | --- | ---
settings.json | Editable non-secret workflow settings. | yes | tracked
.env.example | Example optional environment variables without values. | yes | tracked example only
tools/stl-to-gcode/tool-config/prusa-slicer/ender3-v2-neo/*.ini | Approved PrusaSlicer internal tool config profiles. | yes | tracked

### Generated artifacts

Path | Purpose | Git policy
--- | --- | ---
projects/*/todo/ | Raw imported model files. | ignored
projects/*/in-process/ | Extracted/intermediate model files and metadata. | ignored
projects/*/done/ | Generated G-code and previews before external publish. | ignored
projects/*/evidence/ | Local job evidence, ignored because it can contain private paths/source URLs. | ignored
projects/archive/* | Archived local evidence after cleanup. | ignored


## Startup dependency check

### Required

- [ ] bun: `bun --version`
- [ ] unzip: `unzip -v`
- [ ] PrusaSlicer CLI: PATH: `prusa-slicer --help` OR PRUSA_SLICER_BIN: `test -n "$PRUSA_SLICER_BIN" && "$PRUSA_SLICER_BIN" --help` OR macOS app default: `test -x /Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer && /Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer --help`
- [ ] Path available: `projects/archive/`
- [ ] Path available: `settings.json:slicer.profileRoot`

### Optional

- [ ] agent-browser: `agent-browser --help`
- [ ] Environment variable set if used: `PRUSA_SLICER_BIN`
- [ ] Path available if used: `/Volumes/3D_PRINTS`

## Processing model

- Project root: `projects`
- Archive root: `projects/archive`
- Files being processed location: **internal**
- Never commit files being processed: **yes**

### Internal processing stages

- `todo/`
- `in-process/`
- `done/`

### External processing paths

- None declared

### Evidence

- Enabled: **yes**
- Commit policy: ignored by default
- Archive after completion: **yes**

Evidence files:

- manifest.json
- events.log
- decisions.md
- outputs.json
- cleanup.json

### Cleanup

- After publish: **yes**
- Remove/trash processing files: **yes**
- Preserve evidence only: **yes**

## Workflow steps

### Step 0 — Verify dependencies and settings

Run this before operating the workflow. Fix missing required dependencies before continuing.

```bash
utilities/doctor.sh
```

### Step 1A — Preferred one-shot conversion

Preferred path: import, list, slice, and preview in one command.

```bash
workflow/01A-convert.sh <source>
```

### Step 1B — Manual import path

Alternate path when the user wants import/list/slice separated.

```bash
workflow/01B-import.sh <source>
```

### Step 2 — List discovered STLs

List discovered STL files and printability. If multiple printable STLs exist, ask the user which index to use.

```bash
workflow/02-list.sh <id>
```

### Step 3 — Slice selected STL

Slice the selected STL with an approved profile.

```bash
workflow/03-slice.sh <id> [--stl <index>] [--profile pla-normal]
```

### Step 4 — Generate/check previews

Regenerate/check SVG previews from generated G-code.

```bash
workflow/04-preview.sh <id>
```

### Step 5 — Publish, clean up, and archive evidence

LLM-operated judgment step: if an external destination is already available, copy final G-code there, verify it exists, remove/trash processing files, and preserve/archive evidence only.

## Utilities

- `utilities/doctor.sh` — Verify workflow dependencies, internal tool root, slicer config, and optional settings.

## STL workflow details

Prefer the one-shot command:

```bash
workflow/01A-convert.sh <source>
workflow/01A-convert.sh <source> --stl <index>
workflow/01A-convert.sh <source> --profile pla-fine
```

If PrusaSlicer is not on PATH, supply it with either `PRUSA_SLICER_BIN` or `--prusa-slicer /path/to/prusa-slicer`.

If multiple printable STLs are found, do not guess. Show the list to the user and ask which STL index to use.

After a successful slice, report the G-code and preview paths under `projects/<id>/done/`. If the external destination is already available, copy only the final G-code there; do not mount or manage removable media.

## IDs, settings, and validation

IDs are intentionally simple:

- Thingiverse URL: `<model-name>-thing-<number>`
- Local file: sanitized filename without extension
- Other URL: sanitized URL basename plus a short hash

The checked-in PrusaSlicer tool config root is defined by `settings.json:slicer.profileRoot`. Do not duplicate that editable path elsewhere.

The scripts validate STL discovery, ASCII/binary STL parseability, non-empty geometry, build-volume fit, and safe ZIP paths before extraction.

## Thingiverse behavior

Thingiverse support is best-effort via the direct ZIP endpoint first. If that returns HTML instead of a ZIP, the importer may fall back to `agent-browser` to click the visible STL download button. If both approaches fail, ask the user to manually download the ZIP/STL and rerun `workflow/01A-convert.sh <downloaded-file>`.

## Hard boundaries

- Do not communicate with the printer.
- Do not mount, unmount, format, erase, or otherwise manage SD cards.
- Do not use OctoPrint.
- Do not build or invent slicing settings dynamically; use checked-in profiles only.
- Never commit model inputs, generated G-code, previews, or private evidence.

## Standard workflow

- Run startup dependency checks.
- Import source into projects/<id>/todo and extract/process under projects/<id>/in-process.
- List discovered STLs and ask the user if more than one printable STL is found.
- Slice with the selected checked-in profile and write G-code/previews to projects/<id>/done.
- If /Volumes/3D_PRINTS is already mounted, copy the final G-code there; otherwise report the local output path.
- After external publish is verified, remove processing files and archive evidence only.

## Fallback workflow

- If PrusaSlicer is not on PATH, use PRUSA_SLICER_BIN or --prusa-slicer.
- If direct Thingiverse ZIP download fails, use agent-browser fallback when available.
- If browser fallback fails, ask the user to manually download the STL/ZIP and rerun convert.

## Safety rules

- Never commit files being processed.
- Use safe ZIP extraction and reject unsafe archive paths.
- Validate STL parseability, geometry, and build volume before slicing.
- Evidence is local and ignored by default.

## Known limitations

- Thingiverse support is best-effort.
- Preview SVGs are sanity checks parsed from G-code and do not replace slicer/printer validation.

## Git and credential policy

- Never commit credentials, tokens, API keys, cookies, service config, or environment files.
- Never commit files being processed.
- Evidence and archive data are ignored by default because they may contain private paths, names, URLs, or decisions.
- Commit only workflow instructions, internal tooling, templates, checked-in profiles/configs, and sanitized examples.
