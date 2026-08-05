/* ═══════════════════════════════════════════════════════════════
   COMPOSITEUR DE FILTRES — Salma & Soufiane

   Pourquoi ce fichier existe.

   Les filtres étaient auparavant des PNG figés en 1024 × 1536, soit un
   format 2:3. Un téléphone moderne affiche du 9:19,5 (≈ 0,46). Posée en
   « cover » sur un tel écran, une image en 2:3 perd 31 % de sa largeur :
   les filets latéraux et les ornements d'angle sortaient du cadre. Le
   filtre ne cadrait donc jamais l'écran.

   Ici, le filtre n'est plus une image : c'est une composition recalculée
   à la demande, aux dimensions exactes de la cible. Le cadre épouse donc
   toujours les bords, quel que soit l'appareil — téléphone très allongé,
   tablette, paysage — et l'aperçu est rigoureusement identique au fichier
   exporté, puisque les deux passent par cette même fonction.

   Tout est piloté par filters/filters.json : créer un filtre revient à
   ajouter un objet, sans toucher au code.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const FilterRender = (function () {

  /* ─────────────── Chargement des pièces (WebP, repli PNG) ─────────────── */

  const partCache = new Map();

  function loadPart(src) {
    if (!src) return Promise.resolve(null);
    if (partCache.has(src)) return partCache.get(src);

    const attempt = (url) => new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Pièce introuvable : ' + url));
      img.src = url;
    });

    /* WebP d'abord (5 à 7 fois plus léger sur le réseau d'une salle),
       PNG si le navigateur ne sait pas le décoder. */
    const promise = attempt(src).catch(() => {
      const png = src.replace(/\.webp$/i, '.png');
      return png === src ? null : attempt(png).catch(() => null);
    });

    partCache.set(src, promise);
    return promise;
  }

  /* ─────────────── Polices ───────────────
     canvas.fillText dessine avec la police de secours tant que la police
     web n'est pas chargée. On l'attend donc explicitement, sinon le premier
     filtre composé sortirait en Times New Roman. */

  const FONT_PROBES = [
    '300 100px "Cormorant Garamond"',
    '400 100px "Cormorant Garamond"',
    'italic 300 100px "Cormorant Garamond"',
    '400 100px "Great Vibes"',
    '500 100px "Montserrat"',
    '600 100px "Montserrat"'
  ];

  let fontsReady = null;
  function ensureFonts() {
    if (fontsReady) return fontsReady;
    if (!document.fonts || !document.fonts.load) {
      fontsReady = Promise.resolve();
      return fontsReady;
    }
    fontsReady = Promise.all(
      FONT_PROBES.map((f) => document.fonts.load(f).catch(() => null))
    ).then(() => document.fonts.ready).catch(() => null);
    return fontsReady;
  }

  /* ─────────────── Outils de dessin ─────────────── */

  /* Dégradé « feuille d'or » : un aplat uni fait plat et imprimé,
     ce dégradé rend la lumière rasante d'une dorure réelle. */
  function goldFill(ctx, y0, y1, palette) {
    const p = palette || ['#F3E2A8', '#C9A227', '#EBD489', '#B98F1E'];
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0.00, p[0]);
    g.addColorStop(0.35, p[1]);
    g.addColorStop(0.62, p[2]);
    g.addColorStop(1.00, p[3]);
    return g;
  }

  /*
   * Halo.
   *
   * De l'or fin sur une robe blanche ou un mur clair devient illisible : les
   * anciens filtres disparaissaient dès qu'une photo était lumineuse. Une
   * ombre sombre très diffuse, invisible en tant que telle, décolle le doré
   * de n'importe quel fond sans rien changer à son aspect.
   */
  function setHalo(ctx, spec, size) {
    if (spec.glow) {
      ctx.shadowColor = spec.glow;
      ctx.shadowBlur = size * 0.55;
      ctx.shadowOffsetY = 0;
    } else {
      ctx.shadowColor = 'rgba(32,18,8,0.55)';
      ctx.shadowBlur = size * 0.32;
      ctx.shadowOffsetY = size * 0.05;
    }
  }

  function clearHalo(ctx) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  /* Interlettrage manuel : ctx.letterSpacing n'existe pas sur Safari < 17.4
     ni sur de nombreux Android encore en circulation. On place donc chaque
     glyphe soi-même, ce qui fonctionne partout de la même façon. */
  function trackedWidth(ctx, text, tracking) {
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + tracking;
    return Math.max(0, w - tracking);
  }

  /* Encombrement RÉEL, débords compris. Great Vibes dessine de longues
     boucles qui sortent largement de la chasse des glyphes : mesurer la
     seule largeur d'avance ferait toucher les prénoms aux filets. */
  function inkWidth(ctx, text) {
    const m = ctx.measureText(text);
    if (typeof m.actualBoundingBoxLeft === 'number' &&
        typeof m.actualBoundingBoxRight === 'number') {
      const ink = Math.abs(m.actualBoundingBoxLeft) + Math.abs(m.actualBoundingBoxRight);
      if (ink > 0) return Math.max(ink, m.width);
    }
    return m.width;
  }

  function drawTracked(ctx, text, cx, y, tracking, align) {
    const total = trackedWidth(ctx, text, tracking);
    let x = align === 'center' ? cx - total / 2 : (align === 'right' ? cx - total : cx);
    ctx.textAlign = 'left';
    for (const ch of text) {
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + tracking;
    }
    return total;
  }

  /* Petits filets qui encadrent une ligne de texte : « — 23.10.2026 — » */
  function flankingRules(ctx, cx, y, textWidth, ruleLength, thickness) {
    const gap = ruleLength * 0.45;
    const half = textWidth / 2;
    ctx.save();
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - half - gap - ruleLength, y);
    ctx.lineTo(cx - half - gap, y);
    ctx.moveTo(cx + half + gap, y);
    ctx.lineTo(cx + half + gap + ruleLength, y);
    ctx.stroke();
    ctx.restore();
  }

  /* Ouvre une respiration dans le filet avant d'y poser un ornement :
     sans cela le trait traverse le motif et l'ensemble paraît sale. */
  function breakLine(ctx, cx, cy, halfWidth, halfHeight) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - halfWidth, cy - halfHeight, halfWidth * 2, halfHeight * 2);
    ctx.restore();
  }

  /* Ornement central minimaliste posé sur un filet : losange + volutes. */
  function centreMotif(ctx, cx, cy, size) {
    ctx.save();
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.42);
    ctx.lineTo(cx + size * 0.30, cy);
    ctx.lineTo(cx, cy + size * 0.42);
    ctx.lineTo(cx - size * 0.30, cy);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - size * 0.34, cy);
    ctx.quadraticCurveTo(cx - size * 0.85, cy - size * 0.55, cx - size * 1.05, cy);
    ctx.moveTo(cx + size * 0.34, cy);
    ctx.quadraticCurveTo(cx + size * 0.85, cy - size * 0.55, cx + size * 1.05, cy);
    ctx.stroke();
    ctx.restore();
  }

  /* ─────────────── Cadre : filets + ornements d'angle ───────────────
     Les insets sont exprimés dans le repère de la tuile d'angle (240 px),
     et mis à l'échelle avec elle. Les amorces de filet incluses dans la
     tuile et les filets tracés ici sont donc toujours parfaitement alignés,
     quel que soit le format de l'écran. */

  const TILE = 240;

  function drawFrame(ctx, W, H, geo, gold) {
    ctx.save();
    ctx.strokeStyle = gold;

    ctx.lineWidth = geo.outerWidth;
    ctx.strokeRect(geo.outer, geo.outer, W - geo.outer * 2, H - geo.outer * 2);

    ctx.lineWidth = geo.innerWidth;
    ctx.strokeRect(geo.inner, geo.inner, W - geo.inner * 2, H - geo.inner * 2);

    ctx.restore();
  }

  function drawCorners(ctx, W, H, tile, size, skipBottomRight) {
    if (!tile) return;
    const place = [
      [0, 0, 1, 1],
      [W, 0, -1, 1],
      [0, H, 1, -1],
      [W, H, -1, -1]
    ];
    place.forEach(([x, y, sx, sy], i) => {
      if (skipBottomRight && i === 3) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sx, sy);
      ctx.drawImage(tile, 0, 0, size, size);
      ctx.restore();
    });
  }

  /* ─────────────── Mises en page ─────────────── */

  /* A · Bouquet d'angle : gerbe en bas à droite, bloc texte en bas à gauche.
     C'est le rendu « Floral Burgundy » et « Ivory Gold ».

     Le bloc texte se met tout seul à la bonne taille : selon le format de
     l'écran, la gerbe remonte plus ou moins haut, et une taille figée
     finirait par écrire la date par-dessus les roses. */
  function layoutBouquet(ctx, W, H, u, spec, parts, geo) {
    const text = spec.text || {};

    let bouquetLeft = W;
    if (parts.bouquet) {
      const bw = Math.min(
        (spec.bouquetWidth || 0.56) * W,
        parts.bouquet.width / parts.bouquet.height * (spec.bouquetMaxHeight || 0.52) * H
      );
      const bh = bw * parts.bouquet.height / parts.bouquet.width;
      ctx.drawImage(parts.bouquet, W - bw, H - bh, bw, bh);
      /* Le bord gauche de la gerbe est estompé : on peut mordre un peu
         dessus sans que cela se voie. */
      bouquetLeft = W - bw + bw * 0.14;
    }

    /* Le bloc reste toujours en dehors de l'ornement d'angle. */
    const left = Math.max(geo.inner + u * 0.050, geo.corner * 0.56);
    const bottom = H - Math.max(geo.inner + u * 0.085, geo.corner * 0.80);
    const room = Math.max(u * 0.30, bouquetLeft - left);

    const sizes = {
      tagline: u * 0.042,
      date: u * 0.046,
      monogram: u * 0.155
    };
    const track = { tagline: u * 0.002, date: u * 0.006, monogram: u * 0.004 };

    const measure = (key, value, font) => {
      if (!value) return 0;
      ctx.font = font;
      return trackedWidth(ctx, value, track[key]);
    };

    const widest = Math.max(
      measure('tagline', text.tagline,
        'italic 300 ' + sizes.tagline.toFixed(1) + 'px "Cormorant Garamond", Georgia, serif'),
      measure('date', text.date,
        '400 ' + sizes.date.toFixed(1) + 'px "Cormorant Garamond", Georgia, serif'),
      measure('monogram', text.monogram,
        '400 ' + sizes.monogram.toFixed(1) + 'px "Great Vibes", "Cormorant Garamond", cursive')
    );

    const fit = widest > room ? room / widest : 1;
    Object.keys(sizes).forEach((k) => { sizes[k] *= fit; track[k] *= fit; });

    let baseline = bottom;

    ctx.save();

    /* Accroche, en bas */
    if (text.tagline) {
      setHalo(ctx, spec, sizes.tagline);
      ctx.font = 'italic 300 ' + sizes.tagline.toFixed(1) + 'px "Cormorant Garamond", Georgia, serif';
      ctx.fillStyle = goldFill(ctx, baseline - sizes.tagline, baseline + u * 0.01, spec.palette);
      ctx.strokeStyle = ctx.fillStyle;
      const w = trackedWidth(ctx, text.tagline, track.tagline);
      drawTracked(ctx, text.tagline, left, baseline, track.tagline, 'left');
      flankingRules(ctx, left + w / 2, baseline - sizes.tagline * 0.30, w,
                    sizes.tagline * 0.72, Math.max(1, u * 0.0022));
      baseline -= sizes.tagline * 1.50;
    }

    /* Date */
    if (text.date) {
      setHalo(ctx, spec, sizes.date);
      ctx.font = '400 ' + sizes.date.toFixed(1) + 'px "Cormorant Garamond", Georgia, serif';
      ctx.fillStyle = goldFill(ctx, baseline - sizes.date, baseline + u * 0.01, spec.palette);
      drawTracked(ctx, text.date, left, baseline, track.date, 'left');
      baseline -= sizes.date * 1.15;
    }

    /* Monogramme calligraphié */
    if (text.monogram) {
      setHalo(ctx, spec, sizes.monogram * 0.45);
      ctx.font = '400 ' + sizes.monogram.toFixed(1) + 'px "Great Vibes", "Cormorant Garamond", cursive';
      ctx.fillStyle = goldFill(ctx, baseline - sizes.monogram * 0.9,
                               baseline + sizes.monogram * 0.15, spec.palette);
      drawTracked(ctx, text.monogram, left, baseline, track.monogram, 'left');
    }

    ctx.restore();
  }

  /* B · Cadre d'apparat : titre en haut, prénoms et date en bas, centrés.
     C'est le rendu « Salma & Soufiane Gold ». */
  function layoutWedding(ctx, W, H, u, spec, parts, geo) {
    const text = spec.text || {};
    const cx = W / 2;

    /* Largeur utile entre les filets : rien n'a le droit de la dépasser,
       sinon le titre viendrait buter contre le cadre. */
    const room = W - (geo.inner + u * 0.075) * 2;

    /* Ajuste une taille de police pour qu'une ligne tienne dans la largeur.
       `font` doit contenir « %s » à la place de la taille. */
    const fitSize = (value, nominal, tracking, font) => {
      if (!value) return nominal;
      ctx.font = font.replace('%s', nominal.toFixed(1) + 'px ');
      const w = tracking
        ? trackedWidth(ctx, value, tracking * nominal)
        : inkWidth(ctx, value);
      return w > room ? nominal * (room / w) : nominal;
    };

    const FONT_HEADING = '300 %s"Cormorant Garamond", Georgia, serif';
    const FONT_DATE    = '500 %s"Montserrat", system-ui, sans-serif';
    const FONT_SCRIPT  = '400 %s"Great Vibes", "Cormorant Garamond", cursive';

    ctx.save();

    /* ─ Haut ─ */
    let y = geo.inner + u * 0.115;

    if (text.heading) {
      const size = fitSize(text.heading, u * 0.082, 0.24, FONT_HEADING);
      setHalo(ctx, spec, size * 0.55);
      ctx.font = FONT_HEADING.replace('%s', size.toFixed(1) + 'px ');
      ctx.fillStyle = goldFill(ctx, y - size, y + u * 0.015, spec.palette);
      ctx.strokeStyle = ctx.fillStyle;
      const w = drawTracked(ctx, text.heading, cx, y, size * 0.24, 'center');
      flankingRules(ctx, cx, y - size * 0.32, w, size * 0.55, Math.max(1, u * 0.0028));
      y += size * 0.52;
      centreMotif(ctx, cx, y, u * 0.030);
      y += u * 0.014;
      ctx.lineWidth = Math.max(1, u * 0.0022);
      ctx.beginPath();
      ctx.moveTo(cx - room * 0.46, y); ctx.lineTo(cx + room * 0.46, y);
      ctx.stroke();
    }

    /* Petit motif posé sur le filet supérieur, dans une respiration du trait.
       La coupure est faite AVANT de réactiver l'ombre : sinon le halo du
       motif serait effacé en même temps que le trait. */
    clearHalo(ctx);
    breakLine(ctx, cx, geo.outer, u * 0.042, u * 0.020);
    ctx.strokeStyle = goldFill(ctx, geo.outer - u * 0.02, geo.outer + u * 0.02, spec.palette);
    setHalo(ctx, spec, u * 0.014);
    centreMotif(ctx, cx, geo.outer, u * 0.026);

    /* ─ Bas ─ */
    let baseline = H - geo.inner - u * 0.105;

    if (text.date) {
      const size = fitSize(text.date, u * 0.038, 0.50, FONT_DATE);
      setHalo(ctx, spec, size);
      ctx.font = FONT_DATE.replace('%s', size.toFixed(1) + 'px ');
      ctx.fillStyle = goldFill(ctx, baseline - size, baseline + u * 0.008, spec.palette);
      ctx.strokeStyle = ctx.fillStyle;
      const w = drawTracked(ctx, text.date, cx, baseline, size * 0.50, 'center');
      flankingRules(ctx, cx, baseline - size * 0.32, w, size * 1.15, Math.max(1, u * 0.0025));
      /* Great Vibes descend très bas : sans cet écart, la boucle du « f »
         de Soufiane retomberait pile sur la date. */
      baseline -= size * 2.4;
    }

    if (text.names) {
      const size = fitSize(text.names, u * 0.135, 0, FONT_SCRIPT);
      setHalo(ctx, spec, size * 0.4);
      ctx.font = FONT_SCRIPT.replace('%s', size.toFixed(1) + 'px ');
      ctx.fillStyle = goldFill(ctx, baseline - size * 0.85, baseline + size * 0.2, spec.palette);
      ctx.textAlign = 'center';
      ctx.fillText(text.names, cx, baseline);
      ctx.textAlign = 'left';
    }

    /* Monogramme posé sur le filet inférieur */
    if (text.monogram) {
      const my = H - geo.outer;
      const size = u * 0.062;
      ctx.font = FONT_SCRIPT.replace('%s', size.toFixed(1) + 'px ');
      const half = ctx.measureText(text.monogram).width / 2 + u * 0.018;
      clearHalo(ctx);
      breakLine(ctx, cx, my, half, u * 0.020);
      setHalo(ctx, spec, size * 0.45);
      ctx.fillStyle = goldFill(ctx, my - size * 0.7, my + size * 0.3, spec.palette);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.monogram, cx, my);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }

  const LAYOUTS = { bouquet: layoutBouquet, wedding: layoutWedding };

  /* ─────────────── Composition ─────────────── */

  const renderCache = new Map();
  const RENDER_CACHE_MAX = 24;

  function cacheKey(spec, w, h) {
    return spec.id + '|' + Math.round(w) + 'x' + Math.round(h);
  }

  async function compose(spec, width, height) {
    const W = Math.max(2, Math.round(width));
    const H = Math.max(2, Math.round(height));
    const u = Math.min(W, H);

    const [cornerTile, bouquet] = await Promise.all([
      loadPart(spec.corner),
      loadPart(spec.bouquet),
      ensureFonts()
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.textBaseline = 'alphabetic';

    /* Échelle de la tuile d'angle : toute la géométrie du cadre en découle. */
    const cornerSize = (spec.cornerScale || 0.235) * u;
    const k = cornerSize / TILE;
    const line = spec.line || {};
    const geo = {
      corner: cornerSize,
      outer: (line.outer || 49) * k,
      inner: (line.inner || 61) * k,
      outerWidth: Math.max(1, (line.outerWidth || 3.5) * k),
      innerWidth: Math.max(1, (line.innerWidth || 3.5) * k)
    };

    const gold = goldFill(ctx, 0, H, spec.palette);

    ctx.save();
    setHalo(ctx, spec, geo.outerWidth * 2.4);
    drawFrame(ctx, W, H, geo, gold);
    drawCorners(ctx, W, H, cornerTile, cornerSize, spec.layout === 'bouquet');
    ctx.restore();

    const layout = LAYOUTS[spec.layout] || layoutBouquet;
    layout(ctx, W, H, u, spec, { corner: cornerTile, bouquet: bouquet }, geo);

    return canvas;
  }

  function render(spec, width, height) {
    const key = cacheKey(spec, width, height);
    if (renderCache.has(key)) return renderCache.get(key);

    const promise = compose(spec, width, height);
    renderCache.set(key, promise);

    if (renderCache.size > RENDER_CACHE_MAX) {
      renderCache.delete(renderCache.keys().next().value);
    }
    return promise;
  }

  /* Précharge les pièces pendant que l'invité cadre sa photo : à l'aperçu,
     le défilement des filtres est alors instantané. */
  function preload(specs) {
    ensureFonts();
    const seen = new Set();
    (specs || []).forEach((s) => {
      [s.corner, s.bouquet].forEach((src) => {
        if (src && !seen.has(src)) { seen.add(src); loadPart(src); }
      });
    });
  }

  function clearRenderCache() { renderCache.clear(); }

  return { render, preload, clearRenderCache, ensureFonts };
})();
