#!/usr/bin/env bash
#
# Génère des miniatures légères pour la bande de filtres.
#
# Pourquoi : les filtres plein format pèsent entre 2 et 2,8 Mo chacun.
# Sans miniatures, la bande de filtres peut représenter plus de 13 Mo,
# ce qui est lourd sur une connexion mobile faible le jour du mariage.
#
# À exécuter depuis la racine du projet, sur macOS (sips est préinstallé) :
#   bash tools/make-thumbnails.sh
#
# Ensuite, renseigner le champ "thumbnail" de chaque filtre dans
# filters/filters.json, par exemple :
#   "thumbnail": "filters/thumbnails/filter-ss-ivory-gold-02.png"
#
# js/app.js utilise automatiquement "thumbnail" quand il est renseigné,
# et retombe sinon sur l'image plein format.

set -euo pipefail

SRC_DIR="filters/portrait"
OUT_DIR="filters/thumbnails"
SIZE=240

if [ ! -d "$SRC_DIR" ]; then
  echo "Dossier introuvable : $SRC_DIR (à lancer depuis la racine du projet)" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

shopt -s nullglob
count=0

for src in "$SRC_DIR"/*.png "$SRC_DIR"/*.jpg; do
  name="$(basename "$src")"
  out="$OUT_DIR/$name"

  if command -v sips >/dev/null 2>&1; then
    sips -Z "$SIZE" "$src" --out "$out" >/dev/null
  elif command -v magick >/dev/null 2>&1; then
    magick "$src" -resize "${SIZE}x${SIZE}>" "$out"
  elif command -v convert >/dev/null 2>&1; then
    convert "$src" -resize "${SIZE}x${SIZE}>" "$out"
  else
    echo "Aucun outil disponible (sips, magick ou convert)." >&2
    exit 1
  fi

  before=$(wc -c < "$src" | tr -d ' ')
  after=$(wc -c < "$out" | tr -d ' ')
  echo "$name : $((before / 1024)) Ko → $((after / 1024)) Ko"
  count=$((count + 1))
done

echo
echo "$count miniature(s) générée(s) dans $OUT_DIR"
