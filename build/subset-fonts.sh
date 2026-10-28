#!/usr/bin/env bash
# Subset Inter and Geist Mono into the two WOFF2 files the 404 page inlines,
# then rename their families to B404 Sans and B404 Mono (ADR-0008, A-8.2).
#
# Usage: build/subset-fonts.sh <source-dir> [output-dir]
#   <source-dir>  folder holding the unzipped official releases. It must contain
#                 exactly one Inter-Regular.ttf (Inter 4.1 zip, extras/ttf/) and
#                 exactly one GeistMono-Regular.ttf (geist-font-v1.8.2 zip,
#                 GeistMono/ttf/). See assets/fonts/README.md.
#   [output-dir]  where to write the .woff2 files (default: assets/fonts).
#
# Needs uv. fonttools is not a repo dependency; uvx runs a pinned copy.
set -euo pipefail

readonly FONTTOOLS_VERSION='4.67.0'
readonly BROTLI_VERSION='1.2.1'
readonly ZOPFLI_VERSION='0.4.3'
readonly MAX_BYTES=14336
# Printable ASCII, right single quote, ellipsis, middle dot (HUD strip).
readonly UNICODES='U+0020-007E,U+00B7,U+2019,U+2026'
# kern for spacing, tnum so the HUD score digits do not jitter.
readonly LAYOUT_FEATURES='kern,tnum'
# Copyright, family, style, unique ID, full name, version, PostScript name,
# license description, license URL. Copyright and license stay per the OFL.
readonly NAME_IDS='0,1,2,3,4,5,6,13,14'

usage() {
  echo "usage: $0 <source-dir> [output-dir]" >&2
  exit 2
}

find_one() {
  local dir="$1" name="$2" matches
  matches="$(find "${dir}" -type f -name "${name}")"
  if [[ -z "${matches}" || "$(wc -l <<<"${matches}")" -ne 1 ]]; then
    echo "error: expected exactly one ${name} under ${dir}" >&2
    exit 1
  fi
  printf '%s\n' "${matches}"
}

fonttools() {
  "${UVX:-uvx}" \
    --from "fonttools[woff]==${FONTTOOLS_VERSION}" \
    --with "brotli==${BROTLI_VERSION}" \
    --with "zopfli==${ZOPFLI_VERSION}" \
    "$@"
}

subset() {
  local source="$1" output="$2"
  fonttools pyftsubset "${source}" \
    --unicodes="${UNICODES}" \
    --layout-features="${LAYOUT_FEATURES}" \
    --name-IDs="${NAME_IDS}" \
    --no-hinting \
    --flavor=woff2 \
    --output-file="${output}"
}

# Rewrites the name table in place: family, full, PostScript, unique ID, and
# the typographic family (16/17). Keeps the copyright (ID 0) and license (13/14).
# Leaves head.modified alone so reruns produce identical bytes.
rename_family() {
  local font="$1" family="$2"
  fonttools python -I - "${font}" "${family}" <<'PY'
import sys
from fontTools.ttLib import TTFont

path, family = sys.argv[1], sys.argv[2]
style = "Regular"
postscript = family.replace(" ", "") + "-" + style
font = TTFont(path, recalcTimestamp=False)
name = font["name"]
version = name.getDebugName(5) or ""
legacy = [r for r in name.names if (r.platformID, r.platEncID, r.langID) != (3, 1, 0x409)]
if legacy:
    sys.exit(f"unexpected non-Windows-English name records: {legacy}")
for name_id, value in {
    1: family,
    2: style,
    3: f"{version.split(';')[0].replace('Version ', '')};{postscript}",
    4: f"{family} {style}",
    5: f"{version.split(';')[0]}; subset for benjo-404",
    6: postscript,
    16: family,
    17: style,
}.items():
    name.setName(value, name_id, 3, 1, 0x409)
font.save(path)
PY
}

verify() {
  local font="$1" family="$2" size
  size="$(wc -c <"${font}" | tr -d ' ')"
  if ((size > MAX_BYTES)); then
    echo "error: ${font} is ${size} bytes, over the ${MAX_BYTES} byte budget" >&2
    exit 1
  fi
  fonttools python -I - "${font}" "${family}" "${UNICODES}" <<'PY'
import sys
from fontTools.ttLib import TTFont

path, family, unicodes = sys.argv[1], sys.argv[2], sys.argv[3]
font = TTFont(path)
name = font["name"]
for name_id in (1, 4, 6, 16):
    print(f"{path}: name ID {name_id} = {name.getDebugName(name_id)}")
if name.getDebugName(1) != family or name.getDebugName(16) != family:
    sys.exit(f"{path}: family name is not {family}")
banned = ("Inter", "Geist")
for record in name.names:
    if record.nameID in (1, 3, 4, 6, 16) and any(b in record.toUnicode() for b in banned):
        sys.exit(f"{path}: name ID {record.nameID} still says {record.toUnicode()}")
wanted = set()
for part in unicodes.split(","):
    lo, _, hi = part.removeprefix("U+").partition("-")
    wanted.update(range(int(lo, 16), int(hi or lo, 16) + 1))
missing = sorted(wanted - set(font.getBestCmap()))
if missing:
    sys.exit(f"{path}: missing code points {[hex(c) for c in missing]}")
print(f"{path}: weight {font['OS/2'].usWeightClass}, {len(font.getGlyphOrder())} glyphs")
PY
  echo "${font}: ${size} bytes"
}

build_one() {
  local source="$1" output="$2" family="$3"
  subset "${source}" "${output}"
  rename_family "${output}" "${family}"
  verify "${output}" "${family}"
}

main() {
  [[ $# -ge 1 && $# -le 2 ]] || usage
  local source_dir="$1"
  local repo_root
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  local output_dir="${2:-${repo_root}/assets/fonts}"
  [[ -d "${source_dir}" ]] || usage
  mkdir -p "${output_dir}"

  local inter geist_mono
  inter="$(find_one "${source_dir}" 'Inter-Regular.ttf')"
  geist_mono="$(find_one "${source_dir}" 'GeistMono-Regular.ttf')"

  build_one "${inter}" "${output_dir}/b404-sans-400.woff2" 'B404 Sans'
  build_one "${geist_mono}" "${output_dir}/b404-mono-400.woff2" 'B404 Mono'
}

main "$@"
