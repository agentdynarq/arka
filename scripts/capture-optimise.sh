#!/usr/bin/env bash
# Image optimisation and video conversion for captured media. Idempotent:
# every step reads a stable source file and rewrites its output from
# scratch via a temp file, so re-running just reproduces the same result
# rather than compounding on a previous run's output.
#
# 1. Losslessly recompresses every PNG in apps/web/public/media/.
# 2. Converts docs/media/quarantine.gif to quarantine.mp4 (h264, yuv420p,
#    faststart, no audio) and quarantine.webm (vp9, no audio), both under
#    400KB, plus a quarantine-poster.jpg poster frame. The source GIF is
#    left in place as a fallback, never deleted.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
MEDIA_DIR="$REPO_ROOT/apps/web/public/media"
DOCS_MEDIA_DIR="$REPO_ROOT/docs/media"
# 400 * 1000, not 400 * 1024, so the output is under 400KB whether the budget is
# read as decimal kB or binary KiB. The difference is 9,600 bytes and a webm can
# land in exactly that gap.
MAX_VIDEO_BYTES=$((400 * 1000))

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "capture-optimise: '$1' is required but not on PATH" >&2; exit 1; }
}
require ffmpeg

optimise_png() {
  local src="$1"
  local tmp
  tmp="$(mktemp "${src}.XXXXXX.png")"
  # -compression_level 100 is zlib's max, lossless: same pixels, smaller file.
  if ffmpeg -y -loglevel error -i "$src" -compression_level 100 -pred mixed "$tmp"; then
    mv "$tmp" "$src"
    echo "  optimised $(basename "$src") ($(du -h "$src" | cut -f1))"
  else
    rm -f "$tmp"
    echo "  skipped $(basename "$src"), ffmpeg failed to re-encode it" >&2
  fi
}

optimise_all_pngs() {
  if [ ! -d "$MEDIA_DIR" ]; then
    echo "no $MEDIA_DIR yet, nothing to optimise"
    return
  fi
  shopt -s nullglob
  local pngs=("$MEDIA_DIR"/*.png)
  shopt -u nullglob
  if [ ${#pngs[@]} -eq 0 ]; then
    echo "no PNGs in $MEDIA_DIR yet"
    return
  fi
  echo "optimising ${#pngs[@]} PNG(s) in $MEDIA_DIR"
  for png in "${pngs[@]}"; do
    optimise_png "$png"
  done
}

file_size() {
  wc -c < "$1" | tr -d ' '
}

# Encodes with an increasing CRF (lower quality, smaller file) until the
# output is under $MAX_VIDEO_BYTES or the attempt list is exhausted.
encode_under_budget() {
  local label="$1" out="$2"
  shift 2
  local crf
  for crf in "$@"; do
    local tmp
    tmp="$(mktemp "${out}.XXXXXX")"
    "$ENCODE_FN" "$crf" "$tmp" || true
    local size
    size="$( [ -s "$tmp" ] && file_size "$tmp" || echo 0 )"
    if [ "$size" -le "$MAX_VIDEO_BYTES" ]; then
      mv "$tmp" "$out"
      echo "  $label: crf $crf, $((size / 1024))KB"
      return 0
    fi
    rm -f "$tmp" 2>/dev/null || true
    echo "  $label: crf $crf produced $((size / 1024))KB, over budget, trying higher crf"
  done
  echo "  $label: still over ${MAX_VIDEO_BYTES}B budget after every crf tried" >&2
  return 1
}

convert_quarantine_video() {
  local gif="$DOCS_MEDIA_DIR/quarantine.gif"
  if [ ! -f "$gif" ]; then
    echo "no $gif yet, skipping video conversion"
    return
  fi

  local mp4="$DOCS_MEDIA_DIR/quarantine.mp4"
  local webm="$DOCS_MEDIA_DIR/quarantine.webm"
  local poster="$DOCS_MEDIA_DIR/quarantine-poster.jpg"

  ENCODE_FN=mp4_pass
  mp4_pass() {
    local crf="$1" tmp="$2"
    # h264/yuv420p needs even width and height; the source gif is not guaranteed to be.
    ffmpeg -y -loglevel error -i "$gif" \
      -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
      -pix_fmt yuv420p -c:v libx264 -crf "$crf" -preset veryslow -an -movflags +faststart \
      -f mp4 "$tmp"
  }
  encode_under_budget "quarantine.mp4" "$mp4" 28 32 36 40 44

  ENCODE_FN=webm_pass
  webm_pass() {
    local crf="$1" tmp="$2"
    ffmpeg -y -loglevel error -i "$gif" \
      -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
      -pix_fmt yuva420p -c:v libvpx-vp9 -b:v 0 -crf "$crf" -an \
      -f webm "$tmp"
  }
  encode_under_budget "quarantine.webm" "$webm" 32 36 40 44 48 52 56

  ffmpeg -y -loglevel error -i "$gif" -vframes 1 -q:v 3 "$poster"
  echo "  quarantine-poster.jpg: $(( $(file_size "$poster") / 1024 ))KB"

  # docs/media is where the recording lives, apps/web/public/media is what the
  # site actually serves. quarantine.gif is already in both; the mp4, webm and
  # poster that replace it have to be too or the homepage <video> 404s.
  mkdir -p "$MEDIA_DIR"
  cp "$mp4" "$webm" "$poster" "$MEDIA_DIR/"
  echo "  published mp4, webm and poster to $MEDIA_DIR"
}

case "${1:-all}" in
  png) optimise_all_pngs ;;
  # Re-encoding already-verified captures for a lossless byte saving is not worth
  # invalidating a reviewed frame, so a video-only run stays available.
  video) convert_quarantine_video ;;
  all) optimise_all_pngs; convert_quarantine_video ;;
  *) echo "usage: capture-optimise.sh [all|png|video]" >&2; exit 1 ;;
esac
echo "capture-optimise: done"
