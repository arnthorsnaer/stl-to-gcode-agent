# stl-to-gcode-agent

_Created with [workflow-agent-factory](https://github.com/arnthorsnaer/workflow-agent-factory)._ 

Workflow agent for converting STL/ZIP/Thingiverse inputs into local G-code for a Creality Ender-3 V2 Neo using checked-in PrusaSlicer profiles.

## Quick start

1. Read `AGENTS.md`.
2. Run the startup dependency check.
3. Confirm required external tools, internal tools, services, config, environment variables, and paths.
4. Process work through the declared workflow.
5. Publish outputs to the external destination, clean processing files, and preserve evidence only.

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

## Internal commands

- `workflow/01A-convert.sh <source>` — Step 1A: Preferred one-shot import/list/slice/preview wrapper.
- `workflow/01B-import.sh <source>` — Step 1B: Alternate/manual import/download/extract/discover wrapper.
- `workflow/02-list.sh <id>` — Step 2: List discovered STLs.
- `workflow/03-slice.sh <id>` — Step 3: Slice selected STL.
- `workflow/04-preview.sh <id>` — Step 4: Regenerate/check G-code previews.

## Doctor

If generated, run:

```bash
commands/doctor.sh
```
