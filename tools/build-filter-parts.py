#!/usr/bin/env python3
"""
FABRICATION DES PIÈCES DE FILTRE — à lancer depuis la racine du projet :

    python3 tools/build-filter-parts.py

Pourquoi ce script existe
─────────────────────────
Les filtres ne sont plus des images figées. Un cadre figé a un format figé :
posé sur un téléphone en 9:19,5, un PNG en 2:3 perdait un tiers de sa largeur
et ses filets latéraux sortaient de l'écran. js/filter-render.js recompose
donc le cadre aux dimensions exactes de la cible, à partir de deux pièces
seulement :

  · une tuile d'angle de 240 × 240 px (ornement + amorces de filets) ;
  · une gerbe florale d'angle, détourée.

Ce script découpe ces pièces dans les grandes images d'origine
(filters/portrait/) et les décline en WebP. Bénéfice mesuré : 12 Mo de PNG
plein format remplacés par environ 480 Ko réellement téléchargés.

Ajouter un filtre
─────────────────
1. Déposer l'image d'origine dans filters/portrait/.
2. Ajouter une entrée dans CORNERS et/ou BOUQUETS ci-dessous.
3. Relancer ce script, puis déclarer le filtre dans filters/filters.json.

Dépendances : pillow, numpy  (pip install pillow numpy)
"""

import os
import sys

try:
    from PIL import Image
    import numpy as np
except ImportError:
    sys.exit("Dépendances manquantes :  pip install pillow numpy")

SRC = 'filters/portrait'
OUT = 'filters/parts'
TILE = 240          # côté de la tuile d'angle, en pixels

# nom de sortie -> image source
CORNERS = {
    'corner-flourish': 'filter-ss-floral-burgundy-01.png',
    'corner-fine':     'filter-ss-ivory-gold-02.png',
    'corner-royal':    'filter-salma-soufiane-gold-03.png',
}

# nom de sortie -> (image source, zone à découper)
BOUQUETS = {
    'bouquet-burgundy': ('filter-ss-floral-burgundy-01.png', (430, 545, 1024, 1536)),
    'bouquet-ivory':    ('filter-ss-ivory-gold-02.png',      (505, 530, 1024, 1536)),
}


def runs(idx):
    """Regroupe une liste d'indices en plages contiguës."""
    out = []
    if len(idx) == 0:
        return out
    start = idx[0]
    for i in range(1, len(idx)):
        if idx[i] != idx[i - 1] + 1:
            out.append((start, idx[i - 1]))
            start = idx[i]
    out.append((start, idx[-1]))
    return out


def wipe_thin_vertical(arr, y0, y1, max_width=9):
    """Efface les filets verticaux fins traversant une bande horizontale."""
    for y in range(y0, min(y1, arr.shape[0])):
        idx = np.where(arr[y, :, 3] > 30)[0]
        if len(idx) == 0 or len(idx) > 60:
            continue
        for a, b in runs(idx):
            if b - a <= max_width:
                arr[y, a:b + 1, 3] = 0


def wipe_thin_horizontal(arr, y0, y1, max_height=9):
    """Efface les filets horizontaux fins traversant une bande."""
    band = arr[y0:y1]
    for x in range(band.shape[1]):
        idx = np.where(band[:, x, 3] > 30)[0]
        if len(idx) == 0 or len(idx) > 60:
            continue
        for a, b in runs(idx):
            if b - a <= max_height:
                band[a:b + 1, x, 3] = 0
    arr[y0:y1] = band


def save(image, name):
    """PNG (repli universel) + WebP (ce que téléchargent les navigateurs)."""
    png = os.path.join(OUT, name + '.png')
    webp = os.path.join(OUT, name + '.webp')
    image.save(png, optimize=True)
    image.save(webp, 'WEBP', quality=90, method=6)
    print('  %-20s %4d × %-4d   PNG %4d Ko   WebP %4d Ko'
          % (name, image.width, image.height,
             os.path.getsize(png) // 1024, os.path.getsize(webp) // 1024))


def main():
    if not os.path.isdir(SRC):
        sys.exit('Dossier introuvable : %s — lancez ce script depuis la racine.' % SRC)
    os.makedirs(OUT, exist_ok=True)

    print('── Tuiles d\'angle (%d × %d) ──' % (TILE, TILE))
    for name, src in CORNERS.items():
        img = Image.open(os.path.join(SRC, src)).convert('RGBA').crop((0, 0, TILE, TILE))
        save(img, name)

    print('── Gerbes florales ──')
    for name, (src, box) in BOUQUETS.items():
        img = Image.open(os.path.join(SRC, src)).convert('RGBA').crop(box)
        arr = np.array(img)
        # Les filets du cadre traversent le haut et le bas de la découpe :
        # le cadre étant redessiné par le code, ces fragments doivent partir.
        wipe_thin_vertical(arr, 0, 150)
        wipe_thin_horizontal(arr, arr.shape[0] - 110, arr.shape[0])
        img = Image.fromarray(arr)
        bbox = img.split()[3].getbbox()
        if bbox:
            img = img.crop((0, bbox[1], img.width, img.height))
        save(img, name)

    print('\nTerminé. Vérifiez le rendu, puis déclarez les pièces dans filters/filters.json.')


if __name__ == '__main__':
    main()
