#!/usr/bin/env bash
set -u
fail=0

expand_path() {
  local value="$1"
  if [[ "$value" == "~/"* ]]; then
    printf '%s/%s' "$HOME" "${value#\~/}"
  else
    printf '%s' "$value"
  fi
}

check_cmd() {
  local name="$1"
  local cmd="$2"
  echo "checking $name: $cmd"
  if bash -lc "$cmd" >/dev/null 2>&1; then
    echo "  ok"
  else
    echo "  missing/failed"
    fail=1
  fi
}

check_any_cmd() {
  local name="$1"
  shift
  echo "checking $name: one of the supported options"
  while [ "$#" -gt 0 ]; do
    local label="$1"
    local cmd="$2"
    shift 2
    echo "  option $label: $cmd"
    if bash -lc "$cmd" >/dev/null 2>&1; then
      echo "  ok ($label)"
      return 0
    fi
  done
  echo "  missing/failed: supply one of the options above"
  fail=1
}

check_env() {
  local name="$1"
  if [ -n "${!name:-}" ]; then
    echo "env $name: ok"
  else
    echo "env $name: missing"
    fail=1
  fi
}

check_path() {
  local p
  p=$(expand_path "$1")
  if [ -e "$p" ]; then
    echo "path $1: ok"
  else
    echo "path $1: missing"
    fail=1
  fi
}

check_json_paths() {
  local file="$1"
  local object_path="${2:-}"
  local expanded
  expanded=$(expand_path "$file")
  if [ ! -f "$expanded" ]; then
    echo "settings paths file $file: missing"
    fail=1
    return
  fi
  if [ -n "$object_path" ]; then
    echo "checking paths from $file:$object_path"
  else
    echo "checking paths from $file"
  fi
  while IFS=$'	' read -r key value; do
    [ -n "$key" ] || continue
    local path_value
    path_value=$(expand_path "$value")
    if [ -e "$path_value" ]; then
      echo "path $key=$value: ok"
    else
      echo "path $key=$value: missing"
      fail=1
    fi
  done < <(node -e 'const fs=require("fs"); const file=process.argv[1]; const objectPath=process.argv[2]; let data=JSON.parse(fs.readFileSync(file,"utf8")); if (objectPath) for (const key of objectPath.split(".")) data = data?.[key]; for (const [k,v] of Object.entries(data || {})) if (typeof v === "string" && (v.startsWith("~/") || v.startsWith("/") || v.includes("/"))) console.log(k + "	" + v);' "$expanded" "$object_path")
}

check_cmd 'bun' 'bun --version'
check_cmd 'unzip' 'unzip -v'
check_any_cmd 'PrusaSlicer CLI' 'PATH' 'prusa-slicer --help' 'PRUSA_SLICER_BIN' 'test -n "$PRUSA_SLICER_BIN" && "$PRUSA_SLICER_BIN" --help' 'macOS app default' 'test -x /Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer && /Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer --help'
check_json_paths 'settings.json' 'slicer'
check_json_paths 'settings.json' 'internalTools.stlToGcode'

exit "$fail"
