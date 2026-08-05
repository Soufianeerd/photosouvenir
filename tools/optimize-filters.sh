#!/usr/bin/env bash
#
# OPTIMISATION DES FILTRES — à lancer une fois, depuis la racine du projet :
#
#   bash tools/optimize-filters.sh
#
# Pourquoi : les filtres plein format pèsent 2 à 2,8 Mo chacun, soit plus de
# 13 Mo au total. Sur le réseau mobile d'une salle de réception, c'est le
# principal facteur de lenteur de l'application.
#
# Ce script fait deux choses :
#   1. génère des miniatures dans filters/thumbnails/ ;
#   2. compresse les PNG plein format sans perte visible, si pngquant
#      ou oxipng est installé (facultatif mais recommandé).
#
# Aucune modification de filters.json n'est nécessaire : js/app.js cherche
# automatiquement filters/thumbnails/filter-<id>.png et retombe sur l'image
# plein format si elle n'existe pas.
#
# Les originaux sont sauvegardés dans filters/portrait/_originaux/
# avant toute compression.

set -euo pipefail

SRC_DIR="filters/portrait"
THUMB_DIR="filters/thumbnails"
BACKUP_DIR="filters/portrait/_originaux"
THUMB_SIZE=240

if [ ! -d "$SRC_DIR" ]; then
  echo "Dossier introuvable : $SRC_DIR" >&2
  echo "Lancez ce script depuis la racine du projet." >&2
  exit 1
fi

mkdir -p "$THUMB_DIR"

shopt -s nullglob

# ─────────────────────────────────────────────────────────────
# 1. Miniatures
# ─────────────────────────────────────────────────────────────
echo "── Génération des miniatures (${THUMB_SIZE} px) ──"
count=0

for src in "$SRC_DIR"/*.png "$SRC_DIR"/*.jpg; do
  name="$(basename "$src")"
  out="$THUMB_DIR/$name"

  if command -v sips >/dev/null 2>&1; then
    sips -Z "$THUMB_SIZE" "$src" --out "$out" >/dev/null
  elif command -v magick >/dev/null 2>&1; then
    magick "$src" -resize "${THUMB_SIZE}x${THUMB_SIZE}>" "$out"
  elif command -v convert >/dev/null 2>&1; then
    convert "$src" -resize "${THUMB_SIZE}x${THUMB_SIZE}>" "$out"
  else
    echo "Aucun outil de redimensionnement (sips, magick ou convert)." >&2
    exit 1
  fi

  before=$(wc -c < "$src" | tr -d ' ')
  after=$(wc -c < "$out" | tr -d ' ')
  printf '  %-46s %5s Ko → %4s Ko\n' "$name" "$((before / 1024))" "$((after / 1024))"
  count=$((count + 1))
done

echo "  $count miniature(s) dans $THUMB_DIR"
echo

# ─────────────────────────────────────────────────────────────
# 2. Compression des PNG plein format (facultatif)
# ─────────────────────────────────────────────────────────────
if command -v pngquant >/dev/null 2>&1; then
  COMPRESSOR="pngquant"
elif command -v oxipng >/dev/null 2>&1; then
  COMPRESSOR="oxipng"
else
  COMPRESSOR=""
fi

if [ -z "$COMPRESSOR" ]; then
  echo "── Compression des PNG : ignorée ──"
  echo "  Aucun compresseur trouvé. Pour diviser le poids des filtres par 3 à 5"
  echo "  sans perte visible, installez pngquant :"
  echo "      brew install pngquant"
  echo "  puis relancez ce script."
  exit 0
fi

echo "── Compression des PNG plein format ($COMPRESSOR) ──"
mkdir -p "$BACKUP_DIR"

total_before=0
total_after=0

for src in "$SRC_DIR"/*.png; do
  name="$(basename "$src")"
  before=$(wc -c < "$src" | tr -d ' ')

  # Sauvegarde de l'original, une seule fois.
  [ -f "$BACKUP_DIR/$name" ] || cp "$src" "$BACKUP_DIR/$name"

  if [ "$COMPRESSOR" = "pngquant" ]; then
    # --quality 70-92 conserve la transparence et reste invisible à l'œil.
    pngquant --force --skip-if-larger --quality=70-92 \
             --output "$src.tmp" -- "$BACKUP_DIR/$name" 2>/dev/null || cp "$BACKUP_DIR/$name" "$src.tmp"
  else
    oxipng -o 4 --strip safe --out "$src.tmp" "$BACKUP_DIR/$name" >/dev/null 2>&1 \
      || cp "$BACKUP_DIR/$name" "$src.tmp"
  fi

  mv "$src.tmp" "$src"
  after=$(wc -c < "$src" | tr -d ' ')

  total_before=$((total_before + before))
  total_after=$((total_after + after))

  gain=$(( (before - after) * 100 / (before > 0 ? before : 1) ))
  printf '  %-46s %5s Ko → %4s Ko  (-%s%%)\n' "$name" "$((before / 1024))" "$((after / 1024))" "$gain"
done

echo
echo "  Total : $((total_before / 1024 / 1024)) Mo → $((total_after / 1024 / 1024)) Mo"
echo "  Originaux conservés dans $BACKUP_DIR"
echo
echo "Pensez à ajouter $BACKUP_DIR à .gitignore si vous ne voulez pas le versionner."
