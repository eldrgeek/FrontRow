#!/bin/bash
# Assemble FrontRow Demo v2 from recorded clips + narration
set -e

BASE="/Users/mikewolf/Projects/frontrow/video-production/output/v2"
RAW="$BASE/raw"
AUDIO="$BASE/audio"
CLIPS="$BASE/clips"
TMP="$BASE/tmp_assembly"

mkdir -p "$CLIPS" "$TMP"

# ── Cut per-beat clips from raw recordings ──────────────────────────
echo "Cutting beat clips..."

# Beat 1: Empty stage — audience perspective 0-8s
ffmpeg -y -ss 0 -t 8 -i "$RAW/audience-perspective.mp4" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "$CLIPS/beat_01.mp4" 2>/dev/null

# Beat 2: HM console — house-manager 2-12s
ffmpeg -y -ss 2 -t 10 -i "$RAW/house-manager.mp4" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "$CLIPS/beat_02.mp4" 2>/dev/null

# Beat 3: Audience seats — audience perspective 10-20s
ffmpeg -y -ss 10 -t 10 -i "$RAW/audience-perspective.mp4" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "$CLIPS/beat_03.mp4" 2>/dev/null

# Beat 4: Backstage — performer 0-8s (backstage room)
ffmpeg -y -ss 0 -t 8 -i "$RAW/performer.mp4" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "$CLIPS/beat_04.mp4" 2>/dev/null

# Beat 5: Curtains open — audience perspective 30-36s
ffmpeg -y -ss 30 -t 6 -i "$RAW/audience-perspective.mp4" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "$CLIPS/beat_05.mp4" 2>/dev/null

# Beat 6: Performer enters — audience perspective 36-44s
ffmpeg -y -ss 36 -t 8 -i "$RAW/audience-perspective.mp4" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "$CLIPS/beat_06.mp4" 2>/dev/null

# Beat 7: Applause — audience perspective 44-49s
ffmpeg -y -ss 44 -t 6 -i "$RAW/audience-perspective.mp4" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "$CLIPS/beat_07.mp4" 2>/dev/null

# Beat 8: Spotlight — audience perspective 49-55s
ffmpeg -y -ss 49 -t 6 -i "$RAW/audience-perspective.mp4" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "$CLIPS/beat_08.mp4" 2>/dev/null

# Beat 9: Curtains close — audience perspective 52-57s
ffmpeg -y -ss 52 -t 5 -i "$RAW/audience-perspective.mp4" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "$CLIPS/beat_09.mp4" 2>/dev/null

# Beat 10: CTA card (simple dark background — already generated)
ffmpeg -y -f lavfi -i "color=c=0x1a0a2e:s=1920x1080:d=5" -c:v libx264 -pix_fmt yuv420p "$CLIPS/beat_10.mp4" 2>/dev/null

echo "All clips cut."

# ── Mix narration with clips ────────────────────────────────────────
echo "Mixing narration with clips..."

mix_beat() {
  local beat=$1
  local clip="$CLIPS/beat_${beat}.mp4"
  local audio="$AUDIO/beat_${beat}.mp3"
  local out="$TMP/mixed_${beat}.mp4"

  if [ ! -f "$clip" ] || [ ! -f "$audio" ]; then
    echo "  SKIP beat $beat (missing files)"
    return
  fi

  # Get audio duration
  local adur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$audio")
  # Add 0.5s buffer
  local target=$(python3 -c "print(round(float('$adur') + 0.5, 2))")

  # Get clip duration
  local vdur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$clip")

  echo "  Beat $beat: audio=${adur}s video=${vdur}s target=${target}s"

  # Loop clip if needed, mix with narration (300ms delay for breath)
  ffmpeg -y -stream_loop -1 -i "$clip" -i "$audio" \
    -t "$target" \
    -filter_complex "[1:a]adelay=300|300[a]" \
    -map 0:v -map "[a]" \
    -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p \
    -c:a aac -b:a 192k \
    "$out" 2>/dev/null

  echo "  ✓ beat_${beat} mixed"
}

for i in 01 02 03 04 05 06 07 08 09 10; do
  mix_beat "$i"
done

# ── Concatenate all beats ───────────────────────────────────────────
echo ""
echo "Concatenating all beats..."

CONCAT="$TMP/concat.txt"
> "$CONCAT"
for i in 01 02 03 04 05 06 07 08 09 10; do
  if [ -f "$TMP/mixed_${i}.mp4" ]; then
    echo "file '$TMP/mixed_${i}.mp4'" >> "$CONCAT"
  fi
done

ffmpeg -y -f concat -safe 0 -i "$CONCAT" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  "$BASE/frontrow-demo-v2.mp4" 2>/dev/null

echo ""
echo "✓ Final video: $BASE/frontrow-demo-v2.mp4"
ffprobe -v quiet -show_entries format=duration,size -of default=noprint_wrappers=1 "$BASE/frontrow-demo-v2.mp4"
