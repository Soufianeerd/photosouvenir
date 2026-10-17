/* ═══════════════════════════════════════════════════════════════
   LIVRE DE SOUVENIRS — Salma & Soufiane · 23 octobre 2026
   HTML / CSS / JavaScript natif. Aucune dépendance externe.

   Parcours : Accueil → Capture plein écran → Aperçu (+ filtres) → Envoi

   Pipeline caméra : l'enregistrement passe par un canvas alimenté en
   continu, et non par le flux de la caméra. C'est ce qui permet de
   basculer entre caméra avant et arrière SANS interrompre la vidéo,
   comme sur Snapchat ou Instagram.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ───────────────────────── CONFIGURATION ───────────────────────── */

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbw_fBZ1FmpvAl8IyXZ_7nsrMrGquVlUuGXY-YfQ7GBac0sI7dRHFLtJVGGWi5d7B-pUeg/exec',

  EVENT_SLUG: 'salma-soufiane',
  FILTERS_URL: 'filters/filters.json',

  MAX_VIDEO_SECONDS: 60,

  /* Limites réelles du backend Apps Script. */
  BACKEND_MAX_PHOTO_BYTES: 20 * 1024 * 1024,
  BACKEND_MAX_VIDEO_BYTES: 25 * 1024 * 1024,

  /* Marge de sécurité côté client. */
  CLIENT_MAX_PHOTO_BYTES: 16 * 1024 * 1024,
  CLIENT_MAX_VIDEO_BYTES: 23 * 1024 * 1024,

  /*
   * Poids des fichiers — c'est LE facteur qui décide de la durée d'envoi.
   *
   * 2,8 Mbit/s en 720p reste très propre sur un écran de téléphone, tout en
   * divisant par presque deux le poids d'une vidéo par rapport aux 4 Mbit/s
   * d'avant. La taille est surveillée pendant l'enregistrement : on s'arrête
   * proprement au budget atteint plutôt que de dégrader toutes les vidéos
   * pour absorber le pire cas.
   */
  VIDEO_BITS_PER_SECOND: 1800000,
  AUDIO_BITS_PER_SECOND: 96000,
  RECORD_SIZE_BUDGET_BYTES: 18 * 1024 * 1024,

  /* Côté court du canvas d'enregistrement (720p portrait). */
  RECORD_SHORT_EDGE: 720,
  RECORD_MAX_LONG_EDGE: 1600,

  /*
   * Photo : 2048 px de grand côté et une qualité de 0,88 donnent un fichier
   * d'environ 600 Ko au lieu de 3 Mo, sans différence visible à l'écran ni
   * sur un tirage 13 × 18. L'envoi passe de quarante secondes à quelques-unes.
   */
  PHOTO_MAX_LONG_EDGE: 2048,
  JPEG_QUALITY: 0.88,

  UPLOAD_POLL_INTERVAL_MS: 4000,
  UPLOAD_TIMEOUT_MS: 240000
};

const VIDEO_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm'
];

const BACKEND_VIDEO_MIME_ALLOWLIST = ['video/mp4', 'video/webm', 'video/quicktime'];
const BACKEND_PHOTO_MIME_ALLOWLIST = ['image/jpeg', 'image/png', 'image/webp'];


/* ───────────────────────── ÉTAT ───────────────────────── */

const state = {
  guestName: '',
  mediaId: 0, importSession: 0, cameraSession: 0, audioGeneration: 0, cameraChanging: false,
  cameraReady: false, recordStarting: false, recordStopping: false, recordRequestId: 0,
  discardRecording: false, recordDimensions: null, screenFlashOn: false,
  doneUploadId: null, doneBatchIds: [], editingDraftId: null,

  message: '',

  videoStream: null,       // flux vidéo courant (change au basculement)
  audioStream: null,       // flux micro persistant, jamais interrompu
  audioPromise: null,      // demande micro en cours, en arrière-plan
  wakeLock: null,          // écran maintenu allumé pendant l'enregistrement
  facingMode: 'user',
  torchOn: false,
  captureMode: 'photo',
  zoom: 1,                 // recadrage réel, appliqué à l'aperçu ET au fichier

  /* Canvas d'enregistrement alimenté en continu */
  recordCanvas: null,
  recordCtx: null,
  recordRafId: null,
  recordStream: null,
  canvasPipelineActive: false,

  filters: [],
  filterIndex: 0,

  mediaBlob: null,
  mediaType: null,
  mediaWidth: 0,
  mediaHeight: 0,
  videoDuration: 0,
  previewURL: null,

  isRecording: false,
  recordStartedAt: 0,
  recordTimerId: null,
  mediaRecorder: null,
  recordedChunks: [],
  recordedBytes: 0,
  recordMimeType: '',
  autoStopped: false,

  previewMuted: false,
  isBusy: false,
  sendPreparing: false,
  isSent: false,
  cancelled: false,       /* l'invité a touché « Annuler » */
  burnCancelled: false,   /* incrustation du filtre interrompue */
  shareFile: null,        /* fichier prêt à partager, sans aucune attente */
  shareURL: null,         /* URL du repli « appui long » */
  activePoll: null,
  activeXhr: null
};


/* ───────────────────────── DOM ───────────────────────── */

const $ = (id) => document.getElementById(id);

const el = {
  srStatus: $('srStatus'),
  toast: $('toast'),

  screenHome: $('screenHome'),
  screenCapture: $('screenCapture'),
  screenPreview: $('screenPreview'),
  screenDone: $('screenDone'),

  nameInput: $('nameInput'),
  btnStart: $('btnStart'),

  cameraFeed: $('cameraFeed'),
  captureFlash: $('captureFlash'),
  playLine: $('playLine'),
  playLineFill: $('playLineFill'),
  btnCaptureBack: $('btnCaptureBack'),
  btnSwitchCamera: $('btnSwitchCamera'),
  btnTorch: $('btnTorch'),
  recPill: $('recPill'),
  recTimer: $('recTimer'),
  modePhoto: $('modePhoto'),
  modeVideo: $('modeVideo'),
  btnShutter: $('btnShutter'),
  shutterProgress: $('shutterProgress'),
  btnGallery: $('btnGallery'),
  galleryInput: $('galleryInput'),
  captureHint: $('captureHint'),
  cameraBlocker: $('cameraBlocker'),
  cameraBlockerTitle: $('cameraBlockerTitle'),
  cameraBlockerText: $('cameraBlockerText'),
  btnRetryCamera: $('btnRetryCamera'),
  btnBlockerGallery: $('btnBlockerGallery'),

  mediaStage: $('mediaStage'),
  mediaBox: $('mediaBox'),
  previewImg: $('previewImg'),
  previewVideo: $('previewVideo'),
  filterOverlay: $('filterOverlay'),
  filterName: $('filterName'),
  filterStrip: $('filterStrip'),
  captionInput: $('captionInput'),
  videoFilterNotice: $('videoFilterNotice'),
  btnRetake: $('btnRetake'),
  btnSaveShare: $('btnSaveShare'),
  saveShareLabel: $('saveShareLabel'),
  btnSend: $('btnSend'),

  working: $('working'),
  workingText: $('workingText'),
  workingFill: $('workingFill'),
  btnWorkingCancel: $('btnWorkingCancel'),

  btnAnother: $('btnAnother'),
  btnDoneHome: $('btnDoneHome'),
  doneText: $('doneText'),
  doneStatus: $('doneStatus')
};


/* ───────────────────────── UTILITAIRES ───────────────────────── */

function announce(text) { el.srStatus.textContent = text; }

let toastTimer = null;
function toast(message, kind) {
  el.toast.textContent = message;
  el.toast.classList.toggle('is-success', kind === 'success');
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 6000);
  announce(message);
}

function formatBytes(bytes) {
  if (!bytes) return '0 o';
  const mo = bytes / (1024 * 1024);
  return mo >= 1 ? mo.toFixed(1) + ' Mo' : Math.round(bytes / 1024) + ' Ko';
}

function pad2(n) { return String(n).padStart(2, '0'); }

function slug(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

function baseMime(mime) { return String(mime || '').split(';')[0].trim().toLowerCase(); }

function extensionForMime(mime) {
  return ({
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov'
  })[baseMime(mime)] || 'bin';
}

function buildFileName(mime) {
  const d = new Date();
  const date = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  const who = slug(state.guestName);
  const id = Math.random().toString(36).slice(2, 8);
  const parts = [CONFIG.EVENT_SLUG, 'souvenir', date, time];
  if (who) parts.push(who);
  parts.push(id);
  return parts.join('-') + '.' + extensionForMime(mime);
}

function newUploadId() {
  return 'up-' + (window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
}

/*
 * Chargement d'image SANS crossOrigin.
 *
 * Les filtres sont servis depuis la même origine. Poser crossOrigin
 * provoquait un échec silencieux : la vignette <img> mettait l'image en
 * cache sans en-tête CORS, puis la requête « anonymous » réutilisait cette
 * entrée de cache et déclenchait onerror — donc plus aucun filtre incrusté
 * dans le fichier final. C'était la cause de la disparition du filtre.
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image introuvable : ' + src));
    img.src = src;
  });
}

/* Dessine en mode « cover » : recadre sans jamais étirer.
   Le facteur de zoom resserre le cadrage exactement comme à l'écran. */
function drawCover(ctx, source, targetW, targetH, mirrored, zoom) {
  const iw = source.naturalWidth || source.videoWidth || source.width;
  const ih = source.naturalHeight || source.videoHeight || source.height;
  if (!iw || !ih) return;

  const scale = Math.max(targetW / iw, targetH / ih) * (zoom || 1);
  const w = iw * scale;
  const h = ih * scale;
  const x = (targetW - w) / 2;
  const y = (targetH - h) / 2;

  if (mirrored) {
    ctx.save();
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, x, y, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(source, x, y, w, h);
  }
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob(resolve, mime, quality);
    else {
      const parts = canvas.toDataURL(mime, quality).split(',');
      const bin = atob(parts[1]);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      resolve(new Blob([buf], { type: mime }));
    }
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/* Octets bruts plutôt qu'un Blob : c'est la forme la plus sûre à stocker
   en base, et la seule qui se relise identiquement sur tous les navigateurs. */
function blobToArrayBuffer(blob) {
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsArrayBuffer(blob);
  });
}

function revokePreviewURL() {
  if (state.previewURL) { URL.revokeObjectURL(state.previewURL); state.previewURL = null; }
}

/* Format de l'écran : tout est capturé, affiché et exporté à ce format,
   ce qui garantit un plein écran sans bande noire et un rendu identique. */
function viewportAspect() {
  const vv = window.visualViewport;
  const w = (vv && vv.width) || window.innerWidth || 1080;
  const h = (vv && vv.height) || window.innerHeight || 1920;
  return w / h;
}

/*
 * Sur iOS, la barre d'adresse Safari apparaît et disparaît en cours de route.
 * On fige la hauteur réelle du viewport dans une variable CSS pour que les
 * commandes ne soient jamais rognées, même pendant l'enregistrement.
 */
function syncViewportHeight() {
  const vv = window.visualViewport;
  const height = (vv && vv.height) || window.innerHeight;
  if (height) document.documentElement.style.setProperty('--vh', height + 'px');
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncViewportHeight);
}
window.addEventListener('orientationchange', () => setTimeout(syncViewportHeight, 250));
window.addEventListener('resize', syncViewportHeight);


/* ───────────────────────── NAVIGATION ───────────────────────── */

function showScreen(name) {
  [el.screenHome, el.screenCapture, el.screenPreview, el.screenDone]
    .forEach((s) => s.classList.remove('is-active'));

  const target = {
    home: el.screenHome, capture: el.screenCapture,
    preview: el.screenPreview, done: el.screenDone
  }[name];

  target.classList.add('is-active');

  const light = (name === 'home' || name === 'done');
  document.body.classList.toggle('is-scrollable', light);

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', light ? '#F9F7F2' : '#000000');

  window.scrollTo(0, 0);
  const focusTarget = target.querySelector('h1, h2, [data-screen-focus]');
  if (focusTarget) { focusTarget.setAttribute('tabindex', '-1'); focusTarget.focus({ preventScroll: true }); }
  const queuePanel = $('queuePanel');
  if (queuePanel) queuePanel.hidden = !light || !pendingCount;
}


/* ───────────────────────── FILTRES ───────────────────────── */

async function loadFilters() {
  let raw = [{ id: 'none', name: 'Aucun filtre', order: 0, active: true }];
  const controller = new AbortController();
  const filterTimeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(CONFIG.FILTERS_URL, { cache: 'no-cache', signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (Array.isArray(data.filters) && data.filters.length) raw = data.filters;
  } catch (err) {
    console.error('[filters] Chargement impossible :', err);
    toast("Les filtres n'ont pas pu être chargés. Vous pouvez continuer sans filtre.");
  } finally { clearTimeout(filterTimeout); }

  const now = Date.now();

  state.filters = raw
    .filter((f) => f && f.id && f.active !== false)
    .filter((f) => {
      if (f.availableFrom && now < Date.parse(f.availableFrom)) return false;
      if (f.availableUntil && now > Date.parse(f.availableUntil)) return false;
      return true;
    })
    .map((f) => Object.assign({}, f, {
      name: f.name || f.id,
      category: f.category || 'default',
      order: Number.isFinite(f.order) ? f.order : 999,
      mediaTypes: Array.isArray(f.mediaTypes) ? f.mediaTypes : ['photo', 'video'],
      /* « composed » : cadre recalculé aux dimensions exactes de la cible.
         « image »    : ancien PNG plein format, conservé pour compatibilité. */
      type: f.id === 'none'
        ? 'none'
        : (f.type === 'image' || (!f.type && f.portrait) ? 'image' : 'composed')
    }))
    .sort((a, b) => a.order - b.order);

  if (!state.filters.some((f) => f.id === 'none')) {
    state.filters.unshift({
      id: 'none', name: 'Aucun filtre', order: -1,
      type: 'none', mediaTypes: ['photo', 'video']
    });
  }
}

function hasOverlay(filter) {
  return !!filter && filter.type && filter.type !== 'none';
}

/*
 * Le filtre est composé à la demande, aux dimensions EXACTES de la cible.
 *
 * C'est le cœur du correctif : un PNG figé en 2:3 posé en « cover » sur un
 * écran en 9:19,5 perdait un tiers de sa largeur, et les filets latéraux
 * comme les ornements d'angle sortaient du cadre. Recalculé au format réel,
 * le cadre épouse toujours les quatre bords — et l'aperçu est identique au
 * fichier exporté, puisque les deux passent par ici.
 */
async function filterCanvasFor(filter, width, height) {
  if (!hasOverlay(filter)) return null;

  if (filter.type === 'image') {
    const isLandscape = state.mediaWidth > state.mediaHeight;
    const src = (isLandscape && filter.landscape) ? filter.landscape : filter.portrait;
    if (!src) return null;
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    drawCover(canvas.getContext('2d'), img, canvas.width, canvas.height, false);
    return canvas;
  }

  return FilterRender.render(filter, width, height);
}

/* Définition d'aperçu : celle de l'écran, plafonnée pour rester fluide
   même sur un téléphone d'entrée de gamme. */
function previewOverlaySize() {
  const box = el.mediaBox.getBoundingClientRect();
  /* Repli sur le viewport : la boîte mesure zéro tant que l'écran d'aperçu
     n'est pas affiché, et un cadre composé en 2 × 2 pixels serait invisible. */
  const w = box.width > 2 ? box.width : (window.innerWidth || 1080);
  const h = box.height > 2 ? box.height : (window.innerHeight || 1920);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const longEdge = Math.max(w, h) * dpr;
  const scale = longEdge > 1800 ? 1800 / Math.max(w, h) : dpr;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function availableFilters() {
  return state.filters.filter(
    (f) => !state.mediaType || f.mediaTypes.indexOf(state.mediaType) !== -1
  );
}

function buildFilterStrip() {
  el.filterStrip.innerHTML = '';
  const list = availableFilters();

  list.forEach((filter, index) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip' + (filter.id === 'none' ? ' filter-chip--none' : '');
    chip.setAttribute('role', 'option');
    chip.setAttribute('aria-selected', index === state.filterIndex ? 'true' : 'false');
    chip.setAttribute('aria-label', 'Filtre : ' + filter.name);
    chip.dataset.index = String(index);

    if (!hasOverlay(filter)) {
      const x = document.createElement('span');
      x.className = 'filter-chip__x';
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '⃠';
      chip.appendChild(x);
    } else {
      /* Miniature composée sur place, au format de la vignette : elle est
         donc toujours fidèle au filtre, sans fichier à régénérer à la main. */
      const thumb = document.createElement('canvas');
      thumb.className = 'filter-chip__thumb';
      thumb.width = 132;
      thumb.height = 132;
      chip.appendChild(thumb);
      chip.dataset.thumbPending = '1';
    }

    const label = document.createElement('span');
    label.className = 'filter-chip__label';
    label.textContent = filter.name;
    chip.appendChild(label);

    chip.addEventListener('click', () => selectFilter(index, true));
    el.filterStrip.appendChild(chip);
  });

  hydrateNearbyThumbnails();
}

function hydrateNearbyThumbnails() {
  const list = availableFilters();
  el.filterStrip.querySelectorAll('.filter-chip').forEach((chip, index) => {
    if (Math.abs(index - state.filterIndex) > 3) return;
    if (chip.dataset.thumbPending !== '1') return;
    const thumb = chip.querySelector('canvas');
    const filter = list[index];
    if (!thumb || !filter) return;

    delete chip.dataset.thumbPending;
    filterCanvasFor(filter, thumb.width, thumb.height)
      .then((composed) => {
        if (!composed) return;
        const ctx = thumb.getContext('2d');
        ctx.fillStyle = 'rgba(70,60,70,0.9)';
        ctx.fillRect(0, 0, thumb.width, thumb.height);
        ctx.drawImage(composed, 0, 0, thumb.width, thumb.height);
      })
      .catch(() => { chip.dataset.thumbPending = '1'; });
  });
}

/* Une seule composition d'aperçu à la fois : si l'invité fait défiler
   rapidement, seul le dernier filtre demandé doit s'afficher. */
let overlayToken = 0;

function paintOverlay(filter) {
  const token = ++overlayToken;

  if (!hasOverlay(filter)) {
    el.filterOverlay.hidden = true;
    const ctx = el.filterOverlay.getContext('2d');
    ctx.clearRect(0, 0, el.filterOverlay.width, el.filterOverlay.height);
    return;
  }

  const size = previewOverlaySize();
  filterCanvasFor(filter, size.width, size.height)
    .then((composed) => {
      if (token !== overlayToken || !composed) return;
      const target = el.filterOverlay;
      if (target.width !== composed.width || target.height !== composed.height) {
        target.width = composed.width;
        target.height = composed.height;
      }
      const ctx = target.getContext('2d');
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(composed, 0, 0);
      target.hidden = false;
    })
    .catch((err) => {
      console.error('[filtre] composition impossible :', err);
      if (token === overlayToken) el.filterOverlay.hidden = true;
    });
}

function selectFilter(index, scrollIntoView) {
  if (state.isBusy) return;
  if (state.shareURL) { el.previewImg.src = state.previewURL; revokeShareURL(); }
  const list = availableFilters();
  if (!list.length) return;
  state.filterIndex = Math.max(0, Math.min(index, list.length - 1));

  const filter = list[state.filterIndex];
  el.filterName.textContent = filter.name;

  el.filterStrip.querySelectorAll('.filter-chip').forEach((chip, i) => {
    chip.setAttribute('aria-selected', i === state.filterIndex ? 'true' : 'false');
    if (scrollIntoView && i === state.filterIndex && chip.scrollIntoView) {
      chip.scrollIntoView({
        block: 'nearest', inline: 'center',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      });
    }
  });

  hydrateNearbyThumbnails();
  paintOverlay(filter);

  updateVideoFilterNotice();
  scheduleSpeculativeRender();
  peekFilter();
  announce('Filtre sélectionné : ' + filter.name);
}

/* La barre d'adresse iOS et la rotation changent le format de l'écran :
   le cadre est alors recomposé pour continuer à épouser les bords. */
let overlayResizeTimer = null;
function refreshOverlayOnResize() {
  if (!el.screenPreview.classList.contains('is-active')) return;
  clearTimeout(overlayResizeTimer);
  overlayResizeTimer = setTimeout(() => paintOverlay(currentFilter()), 220);
}
window.addEventListener('resize', refreshOverlayOnResize);
window.addEventListener('orientationchange', () => setTimeout(refreshOverlayOnResize, 320));

function currentFilter() {
  const list = availableFilters();
  return list[state.filterIndex] || list[0] || { id: 'none', name: 'Aucun filtre' };
}

/*
 * Le bas d'un filtre — cadre doré, prénoms, date — tombait derrière la
 * légende et les boutons. Pendant qu'on choisit, ces éléments s'effacent
 * pour laisser voir le rendu complet, puis reviennent seuls.
 */
let peekTimer = null;
function peekFilter() {
  clearTimeout(peekTimer);
  el.filterStrip.parentElement.classList.remove('is-peeking');
  el.screenPreview.classList.remove('is-peeking');
}

/*
 * Pendant que l'invité cadre sa photo, les filtres sont téléchargés un par un,
 * aux moments creux. Quand il arrive à l'aperçu, le défilement est instantané
 * au lieu d'attendre 2 Mo par filtre sur le réseau de la salle.
 */
let filtersPreloaded = false;
function preloadAllFilters() {
  if (filtersPreloaded) return;
  filtersPreloaded = true;

  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 400));
  idle(() => {
    /* Pièces d'ornement (quelques dizaines de kilo-octets) et polices :
       tout est prêt avant même que l'invité n'arrive à l'aperçu. */
    FilterRender.preload(state.filters.filter((f) => f.type === 'composed'));

    /* Anciens filtres image, s'il en reste dans filters.json. */
    state.filters
      .filter((f) => f.type === 'image' && f.portrait)
      .forEach((f) => { const img = new Image(); img.src = f.portrait; });
  });
}


/* ───────────────────────── CAMÉRA ───────────────────────── */

function stopVideoStream() {
  if (state.videoStream) {
    state.videoStream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
    state.videoStream = null;
  }
}

function stopAudioStream() {
  state.audioGeneration++;
  if (state.audioStream) state.audioStream.getTracks().forEach(t => t.stop());
  state.audioStream = null;
  state.audioPromise = null;
}

function stopAllStreams() {
  state.cameraSession++;
  state.recordRequestId++;
  state.recordStarting = false;
  state.cameraReady = false;
  stopCanvasPipeline();
  stopVideoStream();
  stopAudioStream();
  el.cameraFeed.srcObject = null;
  state.torchOn = false;
  el.btnTorch.hidden = true;
  el.btnTorch.classList.remove('is-on');
  el.btnShutter.disabled = true;
}

function disposeStream(stream) { if (stream) stream.getTracks().forEach(t => t.stop()); }

async function requestVideoStream(facingMode, strict) {
  const attempts = strict
    ? [{ facingMode: { exact: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }]
    : [{ facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, true];
  let lastError;
  for (const video of attempts) {
    try { return await navigator.mediaDevices.getUserMedia({ video, audio: false }); }
    catch (err) {
      lastError = err;
      if (!['OverconstrainedError', 'NotFoundError'].includes(err.name)) throw err;
    }
  }
  throw lastError;
}

async function attachCamera(stream, requested, session) {
  if (session !== state.cameraSession) { disposeStream(stream); return false; }
  state.videoStream = stream;
  const track = stream.getVideoTracks()[0];
  track.addEventListener('ended', () => {
    if (state.videoStream === stream && session === state.cameraSession) {
      state.cameraReady = false; el.btnShutter.disabled = true;
      if (state.isRecording) stopRecording();
      showCameraBlocker('Caméra interrompue', 'La caméra a été interrompue. Réessayez ou choisissez un fichier.');
    }
  }, { once: true });
  const actual = track.getSettings ? track.getSettings().facingMode : null;
  state.facingMode = actual || requested;
  state.zoom = 1;
  el.cameraFeed.srcObject = stream;
  applyCameraTransform();
  try { await el.cameraFeed.play(); }
  catch (err) { if (session === state.cameraSession) throw err; return false; }
  if (session !== state.cameraSession) { disposeStream(stream); return false; }
  // Metadata may precede the first decoded frame. Never enable an empty capture.
  if (!el.cameraFeed.videoWidth || el.cameraFeed.readyState < 2) {
    await new Promise((resolve, reject) => {
      let timer;
      const finish = (error) => {
        clearTimeout(timer); el.cameraFeed.removeEventListener('loadeddata', ready);
        error ? reject(error) : resolve();
      };
      const ready = () => finish();
      el.cameraFeed.addEventListener('loadeddata', ready, { once: true });
      timer = setTimeout(() => finish(new Error('La caméra ne fournit pas d’image.')), 12000);
    });
  }
  if (session !== state.cameraSession) { disposeStream(stream); return false; }
  state.cameraReady = true;
  el.btnShutter.disabled = false;
  setupTorchButton();
  $('cameraStatus').textContent = state.facingMode === 'user' ? 'Caméra avant' : 'Caméra arrière';
  return true;
}

async function startCamera() {
  stopAllStreams();
  const session = state.cameraSession;
  el.cameraBlocker.hidden = true;
  el.btnShutter.disabled = true;
  $('cameraStatus').textContent = 'Ouverture de la caméra…';
  if (!navigator.mediaDevices?.getUserMedia) {
    showCameraBlocker('Caméra non disponible', 'Choisissez une photo ou une vidéo dans votre galerie.'); return;
  }
  try {
    const stream = await requestVideoStream(state.facingMode, false);
    if (await attachCamera(stream, state.facingMode, session)) {
      announce('Caméra prête.');
      preloadAllFilters();
    }
  } catch (err) {
    if (session !== state.cameraSession) return;
    stopVideoStream(); state.cameraReady = false; handleCameraError(err);
  }
}

function ensureAudioStream() {
  if (state.audioStream) return Promise.resolve(state.audioStream);
  if (state.audioPromise) return state.audioPromise;
  const generation = state.audioGeneration;
  let promise;
  promise = navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      if (generation !== state.audioGeneration) { disposeStream(stream); return null; }
      state.audioStream = stream;
      $('microStatus').textContent = 'Micro activé';
      return stream;
    })
    .catch(err => {
      console.info('[camera] micro indisponible :', err.name);
      if (generation === state.audioGeneration) $('microStatus').textContent = 'Sans son — micro indisponible';
      return null;
    })
    .finally(() => { if (state.audioPromise === promise) state.audioPromise = null; });
  state.audioPromise = promise;
  return promise;
}

async function switchCamera() {
  if (state.cameraChanging || state.isBusy || state.recordStarting || !state.videoStream || (state.isRecording && !state.canvasPipelineActive)) return;
  state.cameraChanging = true;
  const session = state.cameraSession;
  const previous = state.facingMode;
  const next = previous === 'user' ? 'environment' : 'user';
  el.btnSwitchCamera.disabled = true;
  state.cameraReady = false;
  el.btnShutter.disabled = !state.isRecording;
  try {
    let stream;
    try { stream = await requestVideoStream(next, true); }
    catch (err) {
      if (session !== state.cameraSession) return;
      if (!['NotReadableError', 'AbortError'].includes(err.name)) throw err;
      // iOS and some Android devices require exclusive camera access.
      stopVideoStream();
      stream = await requestVideoStream(next, true);
    }
    if (session !== state.cameraSession) { disposeStream(stream); return; }
    const actual = stream.getVideoTracks()[0].getSettings?.().facingMode;
    if (actual && actual !== next) { disposeStream(stream); throw new Error('Objectif indisponible.'); }
    stopVideoStream();
    if (await attachCamera(stream, next, session)) announce(next === 'user' ? 'Caméra avant.' : 'Caméra arrière.');
  } catch (err) {
    if (session !== state.cameraSession) return;
    toast('Cet objectif n’est pas disponible. Votre caméra précédente est conservée.');
    if (!state.videoStream) {
      try { await attachCamera(await requestVideoStream(previous, false), previous, session); }
      catch (restoreError) { if (session === state.cameraSession) handleCameraError(restoreError); }
    } else { state.cameraReady = true; el.btnShutter.disabled = false; }
  } finally {
    state.cameraChanging = false;
    el.btnSwitchCamera.disabled = state.isRecording && !state.canvasPipelineActive;
  }
}

function handleCameraError(err) {
  const name = err && err.name ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    showCameraBlocker('Accès à la caméra refusé',
      "Autorisez l'accès à votre caméra pour créer votre souvenir, puis touchez « Réessayer ».");
  } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    showCameraBlocker('Aucune caméra compatible',
      "Aucune caméra utilisable n'a été trouvée sur cet appareil. Vous pouvez choisir un fichier depuis votre galerie.");
  } else if (name === 'NotReadableError') {
    showCameraBlocker('Caméra occupée',
      'Une autre application utilise déjà la caméra. Fermez-la puis touchez « Réessayer ».');
  } else {
    showCameraBlocker('Caméra indisponible',
      "La caméra n'a pas pu être ouverte. Vérifiez que la page est bien en HTTPS, puis réessayez.");
  }
  console.error('[camera]', err);
}

function showCameraBlocker(title, text) {
  el.cameraBlockerTitle.textContent = title;
  el.cameraBlockerText.textContent = text;
  el.cameraBlocker.hidden = false;
  announce(title + '. ' + text);
}

function setupTorchButton() {
  const track = state.videoStream?.getVideoTracks()[0];
  let caps = {};
  try { caps = track?.getCapabilities?.() || {}; } catch (e) {}
  const supported = !!caps.torch;
  const frontScreen = state.facingMode === 'user' && state.captureMode === 'photo';
  state.torchOn = !!(supported && track.getSettings?.().torch);
  el.btnTorch.hidden = !supported && !frontScreen;
  el.btnTorch.classList.toggle('is-on', supported ? state.torchOn : state.screenFlashOn);
  el.btnTorch.setAttribute('aria-pressed', String(supported ? state.torchOn : state.screenFlashOn));
  el.btnTorch.setAttribute('aria-label', supported
    ? (state.torchOn ? 'Éteindre la lampe' : 'Activer la lampe')
    : (state.screenFlashOn ? 'Désactiver l’éclairage écran' : 'Activer l’éclairage écran'));
  el.btnTorch.title = supported ? 'Lampe de la caméra' : 'Éclairage écran pour le selfie';
}

el.btnTorch.addEventListener('click', async () => {
  if (state.cameraChanging || state.isBusy) return;
  const track = state.videoStream?.getVideoTracks()[0];
  let supported = false;
  try { supported = !!track?.getCapabilities?.().torch; } catch (e) {}
  if (!supported && state.facingMode === 'user') {
    state.screenFlashOn = !state.screenFlashOn; setupTorchButton();
    toast(state.screenFlashOn ? 'Éclairage écran activé pour la prochaine photo.' : 'Éclairage écran désactivé.'); return;
  }
  if (!track?.applyConstraints) return;
  el.btnTorch.disabled = true;
  try {
    const enabled = !state.torchOn;
    await track.applyConstraints({ advanced: [{ torch: enabled }] });
    if (track !== state.videoStream?.getVideoTracks()[0]) return;
    state.torchOn = enabled;
    el.btnTorch.classList.toggle('is-on', enabled);
    el.btnTorch.setAttribute('aria-pressed', String(enabled));
    el.btnTorch.setAttribute('aria-label', enabled ? 'Éteindre la lampe' : 'Activer la lampe');
  } catch (err) { state.torchOn = false; el.btnTorch.hidden = true; toast('La lampe n’est pas disponible sur cet appareil.'); }
  finally { el.btnTorch.disabled = false; }
});


el.btnSwitchCamera.addEventListener('click', switchCamera);
el.btnRetryCamera.addEventListener('click', startCamera);


/* ───────────── GESTES CAMÉRA (zoom, double-tape) ───────────── */

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

function applyCameraTransform() {
  const mirror = state.facingMode === 'user' ? -1 : 1;
  el.cameraFeed.style.transform = 'scaleX(' + mirror + ') scale(' + state.zoom.toFixed(3) + ')';
}

function setZoom(value) {
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
  if (Math.abs(next - state.zoom) < 0.005) return;
  state.zoom = next;
  applyCameraTransform();
}

(function enableCaptureGestures() {
  const pointers = new Map();
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  const onControl = (target) =>
    !!(target && target.closest && target.closest('button, input, .modeswitch, .stage__blocker'));

  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  el.screenCapture.addEventListener('pointerdown', (e) => {
    if (onControl(e.target)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      pinchStartDistance = distance();
      pinchStartZoom = state.zoom;
    }
  });

  el.screenCapture.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2 && pinchStartDistance > 0) {
      e.preventDefault();
      setZoom(pinchStartZoom * (distance() / pinchStartDistance));
    }
  }, { passive: false });

  const release = (e) => {
    const wasPinching = pointers.size === 2;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStartDistance = 0;
    if (wasPinching || onControl(e.target)) return;

    /* Double-tape : bascule de caméra, comme sur les applications sociales. */
    const now = Date.now();
    if (now - lastTapAt < 320 &&
        Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40) {
      lastTapAt = 0;
      switchCamera();
      return;
    }
    lastTapAt = now;
    lastTapX = e.clientX;
    lastTapY = e.clientY;
  };

  el.screenCapture.addEventListener('pointerup', release);
  el.screenCapture.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStartDistance = 0;
  });
})();


/* ───────────── RETOURS DE CAPTURE ───────────── */

function buzz(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
}

function fireFlash() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.captureFlash.classList.remove('is-firing');
  void el.captureFlash.offsetWidth;   /* force le redémarrage de l'animation */
  el.captureFlash.classList.add('is-firing');
}


/* ───────────── CANVAS D'ENREGISTREMENT (bascule à chaud) ───────────── */

function recordCanvasSize() {
  const aspect = viewportAspect();
  let w, h;
  if (aspect >= 1) {
    h = CONFIG.RECORD_SHORT_EDGE;
    w = Math.min(CONFIG.RECORD_MAX_LONG_EDGE, Math.round(h * aspect));
  } else {
    w = CONFIG.RECORD_SHORT_EDGE;
    h = Math.min(CONFIG.RECORD_MAX_LONG_EDGE, Math.round(w / aspect));
  }
  /* Dimensions paires : exigées par l'encodeur H.264. */
  return { width: Math.round(w / 2) * 2, height: Math.round(h / 2) * 2 };
}

function startCanvasPipeline() {
  if (state.canvasPipelineActive) return true;
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return false;

  const size = recordCanvasSize();
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  let stream;
  try { stream = canvas.captureStream(30); }
  catch (err) { console.warn('[canvas] captureStream indisponible :', err); return false; }

  /* La piste audio est ajoutée au démarrage de l'enregistrement, et non ici :
     le micro peut encore être en cours d'autorisation à ce moment-là. */

  state.recordCanvas = canvas;
  state.recordCtx = ctx;
  state.recordStream = stream;
  state.canvasPipelineActive = true;

  const draw = () => {
    if (!state.canvasPipelineActive) return;
    const video = el.cameraFeed;
    if (video.readyState >= 2 && video.videoWidth) {
      drawCover(ctx, video, canvas.width, canvas.height,
                state.facingMode === 'user', state.zoom);
    }
    state.recordRafId = requestAnimationFrame(draw);
  };
  draw();

  return true;
}

function stopCanvasPipeline() {
  state.canvasPipelineActive = false;
  if (state.recordRafId) { cancelAnimationFrame(state.recordRafId); state.recordRafId = null; }
  if (state.recordStream) {
    /* Ne pas arrêter la piste micro : elle appartient à audioStream. */
    state.recordStream.getVideoTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
    state.recordStream = null;
  }
  state.recordCanvas = null;
  state.recordCtx = null;
}


/* ───────────────────────── MODE PHOTO / VIDÉO ───────────────────────── */

function setCaptureMode(mode) {
  if (state.isRecording || state.recordStarting) return;
  state.captureMode = mode;
  const isPhoto = mode === 'photo';

  el.modePhoto.classList.toggle('is-active', isPhoto);
  el.modeVideo.classList.toggle('is-active', !isPhoto);
  el.modePhoto.setAttribute('aria-checked', String(isPhoto));
  el.modeVideo.setAttribute('aria-checked', String(!isPhoto));

  el.captureHint.textContent = isPhoto
    ? 'Touchez pour une photo · Maintenez pour une vidéo'
    : 'Touchez pour démarrer, touchez à nouveau pour arrêter (60 s max)';

  el.btnShutter.setAttribute('aria-label', isPhoto
    ? 'Prendre une photo. Maintenez pour enregistrer une vidéo.'
    : "Démarrer ou arrêter l'enregistrement vidéo.");
  $('microStatus').hidden = isPhoto;
  if (state.videoStream) setupTorchButton();
}

el.modePhoto.addEventListener('click', () => setCaptureMode('photo'));
el.modeVideo.addEventListener('click', () => {
  setCaptureMode('video');
  ensureAudioStream();
  startCanvasPipeline();
});


[el.modePhoto, el.modeVideo].forEach(button => button.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const mode = button === el.modePhoto ? 'video' : 'photo';
  setCaptureMode(mode);
  (mode === 'photo' ? el.modePhoto : el.modeVideo).focus();
  if (mode === 'video') ensureAudioStream();
}));

/* ───────────────────────── DÉCLENCHEUR ───────────────────────── */

let pressTimer = null;
let pressActive = false;
let longPressFired = false;

el.btnShutter.addEventListener('contextmenu', (e) => e.preventDefault());

el.btnShutter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state.isBusy) return;
  if (!state.videoStream || (!state.cameraReady && !state.isRecording)) { toast('La caméra se prépare…'); return; }
  try { el.btnShutter.setPointerCapture(e.pointerId); } catch (err) {}

  pressActive = true;
  longPressFired = false;

  /* Préchauffage : le canvas d'enregistrement commence à dessiner dès
     l'appui, pour que la vidéo démarre sur une image et non sur du noir. */
  if (!state.isRecording) startCanvasPipeline();

  if (state.captureMode === 'video') return;

  pressTimer = setTimeout(() => {
    if (pressActive && !state.isRecording) {
      longPressFired = true;
      startRecording();
    }
  }, 350);
});

function endPress() {
  if (!pressActive) return;
  pressActive = false;
  clearTimeout(pressTimer);

  if (state.captureMode === 'video') {
    if (state.recordStarting) { state.recordRequestId++; state.recordStarting = false; return; }
    state.isRecording ? stopRecording() : startRecording();
    return;
  }
  if (state.isRecording) stopRecording();
  else if (!longPressFired) takePhoto();
}

el.btnShutter.addEventListener('pointerup', (e) => { e.preventDefault(); endPress(); });
el.btnShutter.addEventListener('pointercancel', () => {
  pressActive = false;
  clearTimeout(pressTimer);
  state.recordRequestId++; state.recordStarting = false;
  if (state.isRecording) stopRecording();
});

el.btnShutter.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (state.captureMode === 'video') { state.isRecording ? stopRecording() : startRecording(); }
    else takePhoto();
  }
});


/* ───────────────────────── PHOTO ───────────────────────── */

async function grabPhotoSource() {
  const track = state.videoStream && state.videoStream.getVideoTracks()[0];

  if (track && typeof window.ImageCapture === 'function') {
    try {
      const capture = new window.ImageCapture(track);
      const blob = await capture.takePhoto();
      if (blob && blob.size > 0) {
        const bitmap = await createImageBitmap(blob);
        if (bitmap.width >= (el.cameraFeed.videoWidth || 0)) return bitmap;
        bitmap.close();
      }
    } catch (err) {
      console.info('[photo] ImageCapture indisponible, repli sur le canvas :', err && err.name);
    }
  }

  if (!el.cameraFeed.videoWidth) throw new Error('Flux vidéo non prêt.');
  return el.cameraFeed;
}

async function takePhoto() {
  if (state.isBusy) return;
  state.isBusy = true;
  try {
    if (!state.cameraReady) throw new Error('Caméra non prête.');
    const session = state.cameraSession;
    if (state.screenFlashOn && state.facingMode === 'user') {
      el.captureFlash.classList.add('is-lighting');
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    const source = await grabPhotoSource();
    if (session !== state.cameraSession) { if (source.close) source.close(); return; }
    const srcW = source.width || source.videoWidth;
    const srcH = source.height || source.videoHeight;
    if (!srcW || !srcH) throw new Error('Image vide.');

    /* Le fichier adopte le format de l'écran : ce que l'invité voit
       en plein écran est exactement ce qui est enregistré. */
    const aspect = viewportAspect();
    let w, h;
    if (srcW / srcH > aspect) { h = srcH; w = Math.round(srcH * aspect); }
    else { w = srcW; h = Math.round(srcW / aspect); }

    const longEdge = Math.max(w, h);
    if (longEdge > CONFIG.PHOTO_MAX_LONG_EDGE) {
      const k = CONFIG.PHOTO_MAX_LONG_EDGE / longEdge;
      w = Math.round(w * k); h = Math.round(h * k);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    drawCover(ctx, source, w, h, state.facingMode === 'user', state.zoom);
    if (source.close) source.close();

    fireFlash();
    buzz(18);

    const blob = await canvasToBlob(canvas, 'image/jpeg', CONFIG.JPEG_QUALITY);
    if (!blob || blob.size === 0) throw new Error('Photo vide.');

    setCapturedMedia(blob, 'photo', w, h, 0);
    goToPreview();
  } catch (err) {
    console.error('[photo]', err);
    toast("La photo n'a pas pu être prise. Réessayez.");
  } finally {
    el.captureFlash.classList.remove('is-lighting');
    state.isBusy = false;
  }
}


/* ───────────────────────── VIDÉO ───────────────────────── */

function pickVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of VIDEO_MIME_CANDIDATES) {
    if (BACKEND_VIDEO_MIME_ALLOWLIST.indexOf(baseMime(candidate)) === -1) continue;
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch (e) {}
  }
  if (!MediaRecorder.isTypeSupported) return '';
  return null;
}

async function startRecording() {
  if (state.isRecording || state.recordStarting || state.recordStopping || !state.videoStream || !state.cameraReady) return;
  state.recordStarting = true;
  const requestId = ++state.recordRequestId;
  try {
  $('microStatus').hidden = false;
  $('microStatus').textContent = state.audioStream ? 'Micro activé' : 'Préparation du micro…';
  await ensureAudioStream();
  if (requestId !== state.recordRequestId || !state.videoStream || (longPressFired && !pressActive && state.captureMode === 'photo')) return;
  state.discardRecording = false;
  state.recordDimensions = null;

  if (typeof MediaRecorder === 'undefined') {
    toast("L'enregistrement vidéo n'est pas pris en charge par ce navigateur. Utilisez le mode photo ou votre galerie.");
    return;
  }

  const mime = pickVideoMimeType();
  if (mime === null) {
    toast("Aucun format vidéo compatible n'est disponible sur ce navigateur.");
    return;
  }

  /* Enregistrement depuis le canvas : c'est ce qui rend possible le
     basculement de caméra en cours de vidéo. Repli sur le flux brut
     si l'appareil ne le permet pas. */
  let sourceStream;
  const canvasOk = startCanvasPipeline();

  if (canvasOk && state.recordStream) {
    sourceStream = state.recordStream;
    /* Piste micro ajoutée maintenant : elle survit aux changements de caméra. */
    if (state.audioStream && !sourceStream.getAudioTracks().length) {
      state.audioStream.getAudioTracks().forEach((t) => {
        try { sourceStream.addTrack(t); } catch (e) {}
      });
    }
    if (!sourceStream.getAudioTracks().length) {
      toast("Le micro n'est pas encore prêt : cette vidéo sera enregistrée sans son.");
    }
    el.btnSwitchCamera.disabled = false;
  } else {
    const combined = new MediaStream();
    state.videoStream.getVideoTracks().forEach((t) => combined.addTrack(t));
    if (state.audioStream) state.audioStream.getAudioTracks().forEach((t) => combined.addTrack(t));
    sourceStream = combined;
    el.btnSwitchCamera.disabled = true;
    console.info('[video] pipeline canvas indisponible : bascule caméra désactivée pendant la vidéo.');
  }

  state.recordDimensions = state.recordCanvas
    ? { width: state.recordCanvas.width, height: state.recordCanvas.height }
    : { width: el.cameraFeed.videoWidth || 720, height: el.cameraFeed.videoHeight || 1280 };
  const options = {
    videoBitsPerSecond: CONFIG.VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: CONFIG.AUDIO_BITS_PER_SECOND
  };
  if (mime) options.mimeType = mime;

  state.recordedChunks = [];
  state.recordedBytes = 0;
  state.autoStopped = false;

  try {
    state.mediaRecorder = new MediaRecorder(sourceStream, options);
  } catch (err) {
    try { state.mediaRecorder = new MediaRecorder(sourceStream); }
    catch (err2) {
      console.error('[video] MediaRecorder impossible :', err2);
      toast("L'enregistrement vidéo a échoué au démarrage.");
      return;
    }
  }

  state.recordMimeType = state.mediaRecorder.mimeType || mime || 'video/webm';

  state.mediaRecorder.ondataavailable = (e) => {
    if (!e.data || !e.data.size) return;
    state.recordedChunks.push(e.data);
    state.recordedBytes += e.data.size;

    /* Arrêt propre au budget : préserve la qualité d'image plutôt que de
       brider le débit de toutes les vidéos pour le pire cas. */
    if (state.recordedBytes >= CONFIG.RECORD_SIZE_BUDGET_BYTES && state.isRecording) {
      state.autoStopped = true;
      stopRecording();
    }
  };

  state.mediaRecorder.onerror = (e) => {
    console.error('[video] erreur MediaRecorder :', e);
    toast("L'enregistrement a été interrompu.");
    cleanupRecordingUI();
    stopCanvasPipeline();
  };

  state.mediaRecorder.onstop = () => {
    const type = baseMime(state.recordMimeType);
    const blob = new Blob(state.recordedChunks, { type });
    state.recordedChunks = [];

    const duration = Math.min(
      CONFIG.MAX_VIDEO_SECONDS,
      Math.max(1, Math.round((Date.now() - state.recordStartedAt) / 1000))
    );

    const { width, height } = state.recordDimensions || { width: 720, height: 1280 };
    cleanupRecordingUI();
    stopCanvasPipeline();

    if (state.discardRecording) { state.discardRecording = false; return; }
    if (!blob.size) { toast('La vidéo enregistrée est vide. Réessayez.'); return; }

    if (state.autoStopped) {
      toast("Enregistrement arrêté : la vidéo a atteint la taille maximale pouvant être envoyée.");
    }

    setCapturedMedia(blob, 'video', width, height, duration);
    goToPreview();
  };

  try {
    state.mediaRecorder.start(1000);
  } catch (err) {
    console.error('[video] start() a échoué :', err);
    toast("L'enregistrement vidéo n'a pas pu démarrer.");
    stopCanvasPipeline();
    return;
  }

  state.isRecording = true;
  state.recordStartedAt = Date.now();
  el.btnShutter.classList.add('is-recording');
  el.recPill.hidden = false;
  el.recPill.classList.remove('is-warning');
  el.recTimer.textContent = '0:00';
  el.captureHint.textContent = state.captureMode === 'video'
    ? 'Touchez le bouton rouge pour arrêter (60 s max)'
    : 'Relâchez pour arrêter';
  announce("Enregistrement vidéo démarré. Durée maximale : 60 secondes.");

  state.recordTimerId = setInterval(tickRecording, 200);
  requestWakeLock();
  buzz(28);
  } finally {
    state.recordStarting = false;
    if (!state.isRecording && state.captureMode === 'photo') stopAudioStream();
  }
}

/* L'écran ne doit pas s'éteindre pendant qu'on filme. */
async function requestWakeLock() {
  if (!navigator.wakeLock || state.wakeLock) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
  } catch (err) {
    console.info('[wakelock] indisponible :', err && err.name);
  }
}

function releaseWakeLock() {
  if (!state.wakeLock) return;
  try { state.wakeLock.release(); } catch (e) {}
  state.wakeLock = null;
}

function tickRecording() {
  const elapsed = (Date.now() - state.recordStartedAt) / 1000;
  const remaining = CONFIG.MAX_VIDEO_SECONDS - elapsed;

  const shown = Math.min(CONFIG.MAX_VIDEO_SECONDS, Math.floor(elapsed));
  el.recTimer.textContent = Math.floor(shown / 60) + ':' + pad2(shown % 60);

  const ratio = Math.min(1, elapsed / CONFIG.MAX_VIDEO_SECONDS);
  el.shutterProgress.style.strokeDashoffset = String(283 - 283 * ratio);

  if (remaining <= 10) {
    el.recPill.classList.add('is-warning');
    if (Math.abs(remaining - 10) < 0.2) announce('Il reste 10 secondes.');
  }
  if (remaining <= 0) stopRecording();
}

function stopRecording() {
  if (!state.isRecording) return;
  state.recordStopping = true; el.btnShutter.disabled = true;
  state.isRecording = false;
  buzz([14, 60, 14]);
  clearInterval(state.recordTimerId);
  try { state.mediaRecorder.stop(); } catch (e) { console.error(e); }
}

function cleanupRecordingUI() {
  state.recordStopping = false;
  state.isRecording = false;
  el.btnShutter.disabled = !state.cameraReady;
  clearInterval(state.recordTimerId);
  releaseWakeLock();
  el.btnShutter.classList.remove('is-recording');
  el.recPill.hidden = true;
  el.btnSwitchCamera.disabled = false;
  el.shutterProgress.style.strokeDashoffset = '283';
  setCaptureMode(state.captureMode);
}


/* ───────────────────────── GALERIE (SECOURS) ───────────────────────── */

function openGallery() {
  if (state.isRecording || state.recordStarting || state.isBusy) { toast('Terminez la prise de vue avant d’ouvrir la galerie.'); return; }
  el.galleryInput.click();
}
el.btnGallery.addEventListener('click', openGallery);
el.btnBlockerGallery.addEventListener('click', openGallery);

async function normalizeGalleryFile(file) {
  const isVideo = file.type.startsWith('video/'), isPhoto = file.type.startsWith('image/');
  if (!isVideo && !isPhoto) throw new Error('Format non pris en charge. Choisissez une photo ou une vidéo.');
  if (!file.size || file.size > (isVideo ? CONFIG.CLIENT_MAX_VIDEO_BYTES : 32 * 1024 * 1024)) throw new Error('Fichier vide ou trop volumineux. Choisissez un fichier plus léger.');
  if (isVideo) {
    if (!BACKEND_VIDEO_MIME_ALLOWLIST.includes(baseMime(file.type))) throw new Error('Formats vidéo acceptés : MP4, WebM et MOV.');
    const meta = await readVideoMetadata(file);
    if (meta.duration > CONFIG.MAX_VIDEO_SECONDS) throw new Error('Cette vidéo dépasse la durée maximale de 60 secondes.');
    return { blob: file, mediaType: 'video', width: meta.width, height: meta.height, duration: meta.duration };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    let w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error('Image illisible.');
    const ratio = Math.min(1, CONFIG.PHOTO_MAX_LONG_EDGE / Math.max(w, h));
    w = Math.round(w * ratio); h = Math.round(h * ratio);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
    return { blob: await canvasToBlob(canvas, 'image/jpeg', CONFIG.JPEG_QUALITY), mediaType: 'photo', width: w, height: h, duration: 0 };
  } catch (error) { throw new Error('Cette image ne peut pas être lue. Choisissez une photo JPEG ou PNG.'); }
  finally { URL.revokeObjectURL(url); }
}

el.galleryInput.addEventListener('change', async () => {
  const files = Array.from(el.galleryInput.files || []); el.galleryInput.value = '';
  if (!files.length || state.isBusy || selectionBusy) return;
  const importId = ++state.importSession;
  const fromCapture = el.screenCapture.classList.contains('is-active');
  stopAllStreams(); state.isBusy = true; setHomeBusy(true);
  let imported = 0, rejected = [], openedPreview = false;
  try {
    const available = MAX_SELECTION - (await readDrafts()).length;
    if (available <= 0) throw new Error('Votre sélection contient déjà 20 souvenirs. Envoyez-la ou retirez un fichier.');
    for (const file of files.slice(0, available)) {
      if (importId !== state.importSession) break;
      $('draftStatus').textContent = `Préparation ${imported + rejected.length + 1} / ${Math.min(files.length, available)}…`;
      try {
        const media = await normalizeGalleryFile(file);
        if (importId !== state.importSession) break;
        if (files.length === 1) {
          setCapturedMedia(media.blob, media.mediaType, media.width, media.height, media.duration);
          state.message = ''; goToPreview(); openedPreview = true;
        } else {
          await storeDraft(await makeDraft(media.blob, media.mediaType, media.width, media.height, media.duration));
        }
        imported++;
      } catch (err) { rejected.push(file.name + ' : ' + err.message); }
    }
    if (files.length > available) rejected.push(`La sélection est limitée à ${MAX_SELECTION} souvenirs.`);
    if (importId === state.importSession && !openedPreview && imported) showScreen('home');
  } catch (err) { rejected.push(err.message); }
  finally {
    if (importId === state.importSession) {
      state.isBusy = false; setHomeBusy(false); await refreshDrafts();
      if (rejected.length) toast(`${imported ? imported + ' souvenir(s) ajouté(s). ' : ''}${rejected[0]}${rejected.length > 1 ? ' (' + rejected.length + ' fichiers ou limites à vérifier)' : ''}`);
      else if (imported && !openedPreview) announce(`${imported} souvenirs ajoutés à votre sélection.`);
      if (!imported && fromCapture && el.screenCapture.classList.contains('is-active')) startCamera();
    }
  }
});

function readVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata'; video.muted = true; video.playsInline = true;
    const url = URL.createObjectURL(file);
    let settled = false;
    const timer = setTimeout(() => done(null, new Error('La vidéo met trop de temps à s’ouvrir. Choisissez un autre fichier.')), 15000);
    const done = (result, error) => {
      if (settled) return; settled = true; clearTimeout(timer);
      URL.revokeObjectURL(url); video.removeAttribute('src');
      error ? reject(error) : resolve(result);
    };
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        done(null, new Error('La durée de cette vidéo ne peut pas être vérifiée. Choisissez un MP4 ou filmez depuis cette page.')); return;
      }
      done({ duration: video.duration, width: video.videoWidth || 720, height: video.videoHeight || 1280 });
    };
    video.onerror = () => done(null, new Error('Cette vidéo ne peut pas être lue. Choisissez un autre fichier.'));
    video.src = url;
  });
}


/* ───────────────────────── APERÇU ───────────────────────── */

function setCapturedMedia(blob, type, width, height, duration) {
  if (!blob || !blob.size) throw new Error('Média vide.');
  state.editingDraftId = null;
  state.mediaId++;
  clearTimeout(speculativeTimer);
  finalCache = { key: null, blob: null, burned: false };
  state.sharePromise = null;
  revokePreviewURL();
  revokeShareURL();
  state.shareFile = null;
  state.cancelled = false;
  state.mediaBlob = blob;
  state.mediaType = type;
  state.mediaWidth = width || 0;
  state.mediaHeight = height || 0;
  state.videoDuration = duration || 0;
  state.isSent = false;
  state.filterIndex = 0;
}

function fitMediaBox() {
  if (!state.mediaWidth || !state.mediaHeight) return;
  const stage = el.mediaStage.getBoundingClientRect();
  const width = stage.width || innerWidth;
  const height = stage.height || innerHeight;
  const ratio = state.mediaWidth / state.mediaHeight;
  const w = Math.min(width, height * ratio);
  el.mediaBox.style.width = Math.round(w) + 'px';
  el.mediaBox.style.height = Math.round(w / ratio) + 'px';
}
window.addEventListener('resize', fitMediaBox);

function goToPreview(filterId = 'none') {
  state.isBusy = false;
  stopAllStreams();
  state.recordRequestId++;
  state.previewURL = URL.createObjectURL(state.mediaBlob);
  fitMediaBox();

  if (state.mediaType === 'photo') {
    el.previewVideo.hidden = true;
    el.previewVideo.removeAttribute('src');
    el.previewImg.hidden = false;
    el.previewImg.onload = () => {
      state.mediaWidth = el.previewImg.naturalWidth;
      state.mediaHeight = el.previewImg.naturalHeight;
      fitMediaBox();
    };
    el.previewImg.src = state.previewURL;
  } else {
    el.previewImg.hidden = true;
    el.previewImg.removeAttribute('src');
    el.previewVideo.hidden = false;
    el.previewVideo.onloadedmetadata = () => {
      state.mediaWidth = el.previewVideo.videoWidth || state.mediaWidth;
      state.mediaHeight = el.previewVideo.videoHeight || state.mediaHeight;
      fitMediaBox();
      startPreviewPlayback();
    };
    el.previewVideo.src = state.previewURL;
  }

  el.captionInput.value = state.message;
  el.btnSend.disabled = false;
  $('previewSelectionLabel').textContent = state.editingDraftId ? 'Valider les modifications' : 'Ajouter à ma sélection';
  el.btnSaveShare.disabled = false;
  updateSaveButton();

  /* L'écran est affiché AVANT de choisir le filtre : le cadre est composé
     aux dimensions réelles de la boîte d'aperçu, or celles-ci valent zéro
     tant que l'écran est masqué. */
  buildFilterStrip();
  showScreen('preview');
  syncPlaybackControls();
  fitMediaBox();
  selectFilter(Math.max(0, state.filters.findIndex(filter => filter.id === filterId)), false);
  announce('Aperçu de votre souvenir. Faites glisser pour découvrir les filtres.');
}

/*
 * Lecture de l'aperçu.
 * Les navigateurs mobiles refusent souvent la lecture automatique avec son.
 * On tente d'abord avec le son ; en cas de refus, on repart en muet — la
 * première touche de l'invité rétablit alors le son. Aucune vidéo ne reste
 * bloquée sur une image fixe sans explication.
 */
function startPreviewPlayback() {
  el.previewVideo.muted = false;
  el.previewVideo.play()
    .then(() => { state.previewMuted = false; })
    .catch(() => {
      el.previewVideo.muted = true;
      state.previewMuted = true;
      el.previewVideo.play()
        .then(() => announce('Touchez la vidéo pour activer le son.'))
        .catch(() => announce('Touchez la vidéo pour la lire.'));
    });
}

function syncPlaybackControls() {
  const video = state.mediaType === 'video';
  $('btnPreviewPlay').hidden = !video; $('btnPreviewSound').hidden = !video;
  $('btnPreviewPlay').textContent = el.previewVideo.paused ? 'Lire' : 'Pause';
  $('btnPreviewSound').textContent = el.previewVideo.muted ? 'Activer le son' : 'Couper le son';
}
$('btnPreviewPlay').addEventListener('click', () => {
  if (el.previewVideo.paused) el.previewVideo.play().catch(() => toast('Touchez à nouveau pour lire la vidéo.'));
  else el.previewVideo.pause();
});
$('btnPreviewSound').addEventListener('click', () => {
  el.previewVideo.muted = !el.previewVideo.muted; state.previewMuted = el.previewVideo.muted;
  syncPlaybackControls();
});
['play', 'pause', 'volumechange'].forEach(event => el.previewVideo.addEventListener(event, syncPlaybackControls));

/* Progression de lecture : remplace les contrôles natifs, qui masquaient
   le filtre sur le tiers bas de l'écran. */
el.previewVideo.addEventListener('timeupdate', () => {
  const d = el.previewVideo.duration;
  if (!Number.isFinite(d) || d <= 0) { el.playLine.hidden = true; return; }
  el.playLine.hidden = false;
  el.playLineFill.style.width =
    Math.min(100, (el.previewVideo.currentTime / d) * 100).toFixed(2) + '%';
});

/* Glissement horizontal sur le média pour changer de filtre. */
(function enableSwipe() {
  let startX = 0, startY = 0, tracking = false;

  el.mediaStage.addEventListener('pointerdown', (e) => {
    if (state.isBusy) return;
    tracking = true; startX = e.clientX; startY = e.clientY;
    /* Doigt posé sur le média : on dégage tout de suite le bas du cadre. */
    peekFilter(true);
  });

  el.mediaStage.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    /* Appui simple sur une vidéo : lecture / pause, sans contrôles natifs
       qui masqueraient le filtre. */
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      if (state.mediaType === 'video' && !el.previewVideo.hidden) {
        /* Première touche après une lecture automatique muette : on rend le son. */
        if (state.previewMuted) {
          state.previewMuted = false;
          el.previewVideo.muted = false;
          el.previewVideo.play().catch(() => {});
          announce('Son activé.');
        } else if (el.previewVideo.paused) {
          el.previewVideo.play().catch(() => {});
        } else {
          el.previewVideo.pause();
        }
      }
      return;
    }

    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.4) { peekFilter(); return; }
    selectFilter(state.filterIndex + (dx < 0 ? 1 : -1), true);
  });

  el.mediaStage.addEventListener('pointercancel', () => { tracking = false; peekFilter(); });
})();

document.addEventListener('keydown', (e) => {
  if (!el.screenPreview.classList.contains('is-active')) return;
  if (document.activeElement === el.captionInput) return;
  if (e.key === 'ArrowRight') selectFilter(state.filterIndex + 1, true);
  if (e.key === 'ArrowLeft') selectFilter(state.filterIndex - 1, true);
});

el.captionInput.addEventListener('input', () => { state.message = el.captionInput.value; });

el.btnRetake.addEventListener('click', () => {
  if (state.isBusy) return;
  revokePreviewURL();
  el.previewImg.removeAttribute('src');
  el.previewVideo.removeAttribute('src');
  resetMedia();
  showScreen('home');
  refreshDrafts();
});


/* ───────────────────────── INCRUSTATION DU FILTRE ───────────────────────── */

/*
 * Seules deux API sont réellement nécessaires : canvas.captureStream et
 * MediaRecorder. La version précédente exigeait en plus
 * HTMLVideoElement.captureStream, absent de Safari iOS — ce qui privait
 * inutilement tous les iPhone du filtre incrusté. L'audio passe par
 * AudioContext, disponible sur iOS.
 */
function canBurnVideoFilter() {
  return typeof HTMLCanvasElement !== 'undefined' &&
         typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
         typeof MediaRecorder !== 'undefined';
}

function updateVideoFilterNotice() {
  if (state.mediaType !== 'video') { el.videoFilterNotice.hidden = true; return; }
  const filter = currentFilter();
  if (!hasOverlay(filter) || canBurnVideoFilter()) {
    el.videoFilterNotice.hidden = true;
    return;
  }
  el.videoFilterNotice.textContent =
    "Information : sur ce navigateur, le filtre reste visible uniquement à l'aperçu. " +
    "Le fichier enregistré et envoyé sera la vidéo d'origine. " +
    'Le filtre choisi est tout de même transmis aux mariés.';
  el.videoFilterNotice.hidden = false;
}

async function burnFilterIntoPhoto(blob, filter) {
  const url = URL.createObjectURL(blob);
  try {
    const photo = await loadImage(url);
    const w = photo.naturalWidth;
    const h = photo.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo, 0, 0, w, h);

    /* Composé aux dimensions exactes de la photo : aucun recadrage,
       donc aucun risque de voir le cadre déborder ou se rogner. */
    const overlay = await filterCanvasFor(filter, w, h);
    if (overlay) ctx.drawImage(overlay, 0, 0, w, h);

    let out = await canvasToBlob(canvas, 'image/jpeg', CONFIG.JPEG_QUALITY);
    if (!out || !out.size) throw new Error('Export du canvas vide.');

    let quality = CONFIG.JPEG_QUALITY;
    while (out.size > CONFIG.CLIENT_MAX_PHOTO_BYTES && quality > 0.6) {
      quality -= 0.08;
      out = await canvasToBlob(canvas, 'image/jpeg', quality);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function burnFilterIntoVideo(blob, filter, onProgress) {
  if (!canBurnVideoFilter()) return null;

  const url = URL.createObjectURL(blob);
  let audioContext = null;
  let videoEl = null;
  let rafId = null;
  let outStream = null;
  let recorder = null;
  let metadataTimer = null;
  let watchdog = null;
  let checkTimer = null;
  let audioTimer = null;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null; // Preserve the original rather than risk losing its audio.
    audioContext = new AudioCtx();
    // Resume while still on the synchronous user-gesture stack (Safari).
    const audioReady = audioContext.state === 'suspended' ? audioContext.resume() : Promise.resolve();
    audioReady.catch(() => {});
    videoEl = document.createElement('video');
    videoEl.src = url;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.volume = 1; // Routed to MediaStreamDestination only, never to speakers.
    videoEl.preload = 'auto';

    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = () => { clearTimeout(metadataTimer); resolve(); };
      videoEl.onerror = () => { clearTimeout(metadataTimer); reject(new Error('Vidéo illisible.')); };
      metadataTimer = setTimeout(() => reject(new Error('Délai dépassé.')), 15000);
    });

    const srcW = videoEl.videoWidth || state.mediaWidth || 720;
    const srcH = videoEl.videoHeight || state.mediaHeight || 1280;
    const scale = Math.min(1, CONFIG.RECORD_SHORT_EDGE / Math.min(srcW, srcH), CONFIG.RECORD_MAX_LONG_EDGE / Math.max(srcW, srcH));
    const w = Math.max(2, Math.round(srcW * scale / 2) * 2);
    const h = Math.max(2, Math.round(srcH * scale / 2) * 2);

    /* Cadre composé une seule fois, au format exact de la vidéo : il est
       ensuite réutilisé tel quel sur chaque image, sans aucun recadrage. */
    const overlay = await filterCanvasFor(filter, w, h);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');

    outStream = canvas.captureStream(30);

    await Promise.race([
      audioReady,
      new Promise((_, reject) => { audioTimer = setTimeout(() => reject(new Error('Le son ne peut pas être préparé.')), 5000); })
    ]);
    clearTimeout(audioTimer);
    if (audioContext.state !== 'running') throw new Error('Le traitement audio n’est pas disponible.');
    const audioSource = audioContext.createMediaElementSource(videoEl);
    const audioDestination = audioContext.createMediaStreamDestination();
    audioSource.connect(audioDestination);
    audioDestination.stream.getAudioTracks().forEach(track => outStream.addTrack(track));

    const mime = pickVideoMimeType();
    if (mime === null) return null;

    const options = {
      videoBitsPerSecond: CONFIG.VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: CONFIG.AUDIO_BITS_PER_SECOND
    };
    if (mime) options.mimeType = mime;

    try { recorder = new MediaRecorder(outStream, options); }
    catch (e) { recorder = new MediaRecorder(outStream); }

    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    const totalDuration = Number.isFinite(videoEl.duration) && videoEl.duration > 0
      ? videoEl.duration
      : state.videoDuration || CONFIG.MAX_VIDEO_SECONDS;

    const finished = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = () => reject(new Error('Encodage interrompu.')); });
    finished.catch(() => {});

    const draw = () => {
      if (videoEl.readyState >= 2) {
        ctx.drawImage(videoEl, 0, 0, w, h);
        if (overlay) ctx.drawImage(overlay, 0, 0, w, h);
      }
      if (onProgress) onProgress(Math.min(0.99, (videoEl.currentTime || 0) / totalDuration));
      if (!videoEl.ended && !state.burnCancelled) rafId = requestAnimationFrame(draw);
    };

    recorder.start(1000);
    await videoEl.play();
    draw();

    await new Promise((resolve) => {
      checkTimer = setInterval(() => {
        if (videoEl.ended || state.burnCancelled ||
            (videoEl.currentTime || 0) >= totalDuration + 0.5) {
          clearInterval(checkTimer); resolve();
        }
      }, 200);
      watchdog = setTimeout(() => { state.burnCancelled = true; clearInterval(checkTimer); resolve(); },
        (CONFIG.MAX_VIDEO_SECONDS + 20) * 1000);
    });

    if (rafId) cancelAnimationFrame(rafId);
    try { recorder.stop(); } catch (e) {}
    await finished;

    outStream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });

    if (state.burnCancelled) return null;

    const type = baseMime(recorder.mimeType || mime || 'video/webm');
    const out = new Blob(chunks, { type });

    if (!out.size) return null;
    if (BACKEND_VIDEO_MIME_ALLOWLIST.indexOf(type) === -1) return null;
    if (out.size > CONFIG.CLIENT_MAX_VIDEO_BYTES) {
      console.warn('[burn] vidéo filtrée trop lourde :', out.size);
      return null;
    }
    return out;

  } catch (err) {
    console.error('[burn] incrustation vidéo impossible :', err);
    return null;
  } finally {
    clearTimeout(metadataTimer); clearTimeout(audioTimer); clearTimeout(watchdog); clearInterval(checkTimer);
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch (e) {} }
    if (outStream) outStream.getTracks().forEach(t => t.stop());
    if (rafId) cancelAnimationFrame(rafId);
    if (videoEl) { try { videoEl.pause(); } catch (e) {} videoEl.removeAttribute('src'); }
    if (audioContext) { try { await audioContext.close(); } catch (e) {} }
    URL.revokeObjectURL(url);
  }
}

/* Cache du fichier final : évite de refaire l'incrustation entre
   « Enregistrer » et « Envoyer ». */
let finalCache = { key: null, blob: null, burned: false };

/*
 * Dès que l'invité s'arrête sur un filtre, la photo finale est composée en
 * silence. « Enregistrer » et « Envoyer » deviennent alors instantanés au
 * lieu de faire patienter au moment du clic.
 */
let speculativeTimer = null;
function scheduleSpeculativeRender() {
  clearTimeout(speculativeTimer);

  /* Le fichier prêt ne correspond plus au filtre affiché. */
  if (!shareFileIsFresh()) { state.shareFile = null; updateSaveButton(); }

  if (state.mediaType !== 'photo' || !state.mediaBlob || state.isBusy) return;

  speculativeTimer = setTimeout(() => {
    if (state.isBusy || state.isSent) return;
    if (shareFileIsFresh()) return;
    /* On va jusqu'au File, et pas seulement jusqu'au blob : c'est lui qu'il
       faudra passer à navigator.share() sans la moindre attente. */
    prepareShareFile(true).catch(() => {});
  }, 400);
}

function finalCacheKey() {
  return [state.mediaId, state.mediaType, currentFilter().id].join('|');
}

async function buildFinalMedia(silent) {
  const key = finalCacheKey();
  if (finalCache.key === key && finalCache.blob) {
    return { blob: finalCache.blob, filterBurned: finalCache.burned };
  }

  const filter = currentFilter();
  let result;

  if (!hasOverlay(filter)) {
    result = { blob: state.mediaBlob, filterBurned: false };
  } else if (state.mediaType === 'photo') {
    if (!silent) setWorking(true, 'Application du filtre…', 0.4, null);
    try {
      result = { blob: await burnFilterIntoPhoto(state.mediaBlob, filter), filterBurned: true };
    } catch (err) {
      console.error('[final] filtre photo :', err);
      if (!silent) toast("Le filtre n'a pas pu être appliqué à la photo.");
      result = { blob: state.mediaBlob, filterBurned: false };
    }
    if (!silent) setWorking(false);
  } else if (silent) {
    /* On ne réencode jamais une vidéo en tâche de fond : le traitement dure
       le temps de la vidéo et entrerait en conflit avec sa lecture. */
    return null;
  } else if (!canBurnVideoFilter()) {
    result = { blob: state.mediaBlob, filterBurned: false };
  } else {
    state.burnCancelled = false;
    /* L'aperçu est mis en pause : deux vidéos qui lisent en même temps
       ralentissent le réencodage et sont interdites sur certains iPhone. */
    try { el.previewVideo.pause(); } catch (e) {}
    setWorking(true, 'Incrustation du filtre dans la vidéo…', 0, true);

    const burned = await burnFilterIntoVideo(state.mediaBlob, filter, (p) => {
      setWorking(true, 'Incrustation du filtre dans la vidéo…', p, true);
    });

    if (burned) result = { blob: burned, filterBurned: true };
    else if (state.burnCancelled) {
      /* Annulé : surtout ne rien mettre en cache. Sinon un envoi ultérieur
         partirait avec la vidéo SANS filtre, sous la clé du filtre choisi —
         l'invité recevrait autre chose que ce qu'il a vu à l'écran. */
      throw cancelledError();
    } else {
      toast("Le filtre n'a pas pu être incrusté dans la vidéo. La vidéo d'origine est conservée.");
      result = { blob: state.mediaBlob, filterBurned: false };
    }
  }

  if (key !== finalCacheKey()) throw cancelledError();
  finalCache = { key: key, blob: result.blob, burned: result.filterBurned };
  return result;
}


/* ───────────────────────── OVERLAY DE TRAVAIL ───────────────────────── */

/*
 * Un seul bouton, un seul mot : « Annuler ».
 *
 * L'ancien « Passer cette étape » ne voulait rien dire pour un invité : il
 * poursuivait l'action avec un fichier différent de celui qu'il voyait à
 * l'écran. Désormais, annuler annule — l'opération s'arrête et l'invité
 * retrouve son aperçu intact, exactement comme il l'avait laissé.
 */
function setWorking(visible, text, progress, cancellable, indeterminate) {
  el.working.hidden = !visible;
  state.isBusy = visible || state.sendPreparing;
  if (text) { el.workingText.textContent = text; announce(text); }

  el.workingFill.classList.toggle('is-indeterminate', indeterminate === true);
  if (indeterminate === true) {
    el.workingFill.style.width = '';
  } else if (typeof progress === 'number') {
    el.workingFill.style.width = Math.round(Math.max(0, Math.min(1, progress)) * 100) + '%';
  }

  el.btnWorkingCancel.hidden = !cancellable;
  if (visible && cancellable) el.btnWorkingCancel.textContent = 'Annuler';
  if (!visible) state.cancelled = false;
}

el.btnWorkingCancel.addEventListener('click', () => {
  state.cancelled = true;
  state.burnCancelled = true;
  el.btnWorkingCancel.hidden = true;
  el.workingText.textContent = 'Annulation…';

  /* Coupe aussi tout envoi resté en cours au premier plan. */
  if (state.activeXhr) { try { state.activeXhr.abort(); } catch (e) {} }
  if (state.activePoll) { state.activePoll.stop(true); state.activePoll = null; }
});


/* ───────────────────────── ENREGISTRER / PARTAGER ───────────────────────── */

/*
 * ENREGISTRER DANS LA GALERIE / PARTAGER
 *
 * Le point capital, et la cause du bug d'origine.
 *
 * iOS n'autorise `navigator.share()` que pendant l'« activation
 * utilisateur » : la fenêtre ouverte par le toucher de l'invité. Or le code
 * précédent composait la photo AVANT d'appeler share(). Cette attente
 * consommait l'activation, Safari refusait le partage, et le repli
 * téléchargeait le fichier — ce qui, sur iPhone, ouvre un onglet Safari au
 * lieu d'enregistrer quoi que ce soit. D'où l'impossibilité d'envoyer vers
 * Snapchat ou WhatsApp.
 *
 * La solution : le fichier est prêt AVANT le toucher. Au moment du clic, on
 * appelle share() immédiatement, sans le moindre `await`. La feuille de
 * partage native s'ouvre alors instantanément, avec « Enregistrer l'image »,
 * WhatsApp et Snapchat directement dedans.
 *
 * À savoir : aucune page web, sur aucun navigateur, ne peut écrire seule
 * dans l'application Photos. La feuille de partage native EST le chemin
 * officiel — et c'est un seul geste.
 */

function shareFileIsFresh() {
  return !!(state.shareFile && state.shareFile.key === finalCacheKey());
}

function canShareFiles(file) {
  try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); }
  catch (err) { return false; }
}

/* Appel synchrone : c'est ce qui préserve l'activation utilisateur. */
function shareNow() {
  const entry = state.shareFile;
  if (!entry) return false;

  if (!canShareFiles(entry.file)) {
    offerLongPressSave(entry);
    return true;
  }

  let sharing;
  try { sharing = navigator.share({ files: [entry.file], title: 'Mon souvenir — Salma & Soufiane' }); }
  catch (err) { offerLongPressSave(entry); return true; }
  Promise.resolve(sharing).then(() => {
    announce('Feuille de partage ouverte.');
  }).catch((err) => {
    if (err && err.name === 'AbortError') return;
    console.warn('[partage]', err);
    offerLongPressSave(entry);
  });

  return true;
}

/* Repli de téléchargement quand le partage natif n’est pas disponible. */
function offerLongPressSave(entry) {
  const url = URL.createObjectURL(entry.file);
  const link = document.createElement('a');
  link.href = url; link.download = entry.file.name; link.textContent = 'Télécharger le souvenir';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast('Le téléchargement est lancé. Sur iPhone, utilisez Partager puis Enregistrer dans Photos.');
}

function revokeShareURL() {
  if (state.shareURL) { URL.revokeObjectURL(state.shareURL); state.shareURL = null; }
}

/* Prépare le fichier en silence, pour que le toucher suivant soit immédiat. */
async function prepareShareFile(silent) {
  const key = finalCacheKey();
  if (state.shareFile && state.shareFile.key === key) return state.shareFile;

  const { blob } = await buildFinalMedia(silent);
  if (!blob || state.cancelled || key !== finalCacheKey()) return null;

  const name = buildFileName(blob.type);
  state.shareFile = { key: key, file: new File([blob], name, { type: blob.type }) };
  updateSaveButton();
  return state.shareFile;
}

function updateSaveButton() {
  /* Une photo est prête en une demi-seconde : le libellé reste donc
     « Enregistrer » et un seul toucher suffit. Une vidéo demande un
     réencodage : on le dit franchement plutôt que de faire patienter. */
  const ready = shareFileIsFresh() || state.mediaType === 'photo';
  el.saveShareLabel.textContent = ready
    ? ' Enregistrer dans mes photos'
    : ' Préparer l’enregistrement';
}

el.btnSaveShare.addEventListener('click', () => {
  if (!state.mediaBlob || state.isBusy) return;

  /* Chemin normal : le fichier est déjà prêt, on partage sans aucune attente. */
  if (shareFileIsFresh()) { shareNow(); return; }

  /* Vidéo non encore incrustée : on prépare, puis on demande un second
     toucher. C'est la seule façon honnête de conserver l'activation
     utilisateur exigée par iOS. */
  el.btnSaveShare.disabled = true;
  prepareShareFile()
    .then((entry) => {
      if (!entry || state.cancelled) return;
      setWorking(false);
      toast('Votre souvenir est prêt. Touchez à nouveau pour l’enregistrer.', 'success');
    })
    .catch((err) => {
      if (err && err.cancelled) { toast('Annulé. Votre souvenir est intact.'); return; }
      console.error('[enregistrer]', err);
      toast('La préparation a échoué. Réessayez.');
    })
    .finally(() => {
      el.btnSaveShare.disabled = false;
      setWorking(false);
    });
});


/* ───────────────────────── ENVOI AUX MARIÉS ───────────────────────── */

/*
 * Envoi du média.
 *
 * Attention : ne JAMAIS attacher d'écouteur à xhr.upload ici. Dès qu'un
 * écouteur d'upload existe, la spécification CORS impose une requête
 * préliminaire OPTIONS — que Google Apps Script ne gère pas. Le POST ne
 * partirait alors jamais. C'est pourquoi il n'y a pas de pourcentage
 * d'envoi : la barre est volontairement indéterminée plutôt que fausse.
 */
function postMedia(url, body) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    state.activeXhr = xhr;

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');
    xhr.timeout = CONFIG.UPLOAD_TIMEOUT_MS;

    xhr.onload = () => {
      state.activeXhr = null;
      let parsed = null;
      try { parsed = JSON.parse(xhr.responseText); } catch (e) {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 400, data: parsed });
    };
    /* Une erreur réseau ou un blocage CORS n'est pas un échec d'envoi :
       seule la consultation du statut fait foi. */
    xhr.onerror = () => { state.activeXhr = null; resolve({ ok: false, data: null }); };
    xhr.ontimeout = () => { state.activeXhr = null; resolve({ ok: false, data: null }); };
    /* Sans ce gestionnaire, « Annuler l'envoi » laisserait la promesse en
       suspens et l'écran de chargement resterait figé indéfiniment. */
    xhr.onabort = () => {
      state.activeXhr = null;
      resolve({ ok: false, data: null, aborted: true });
    };

    xhr.send(body);
  });
}

/* ═══════════ FILE D'ATTENTE HORS LIGNE ═══════════
   Le réseau d'une salle de réception est capricieux. Tout souvenir est
   donc écrit sur l'appareil AVANT d'être envoyé, puis supprimé de la file
   seulement une fois la confirmation du serveur reçue. En cas de coupure,
   il repart automatiquement au retour du réseau ou au prochain chargement.
   La réception est confirmée par le serveur ; les éléments non confirmés
   restent accessibles pour reprise et export explicites.
   ═══════════════════════════════════════════════ */

const DB_NAME = 'livre-souvenirs';
const DB_STORE = 'file-attente';
const LEASE_STORE = 'envoi-verrous';
const DRAFT_STORE = 'selection';
const MAX_SELECTION = 20;
const LOCAL_BYTE_BUDGET = 32 * 1024 * 1024;
const memoryDrafts = new Map();
let draftCount = 0, selectionBusy = false, draftRenderId = 0;
let draftURLs = [];
const tabOwner = newUploadId();
const memoryQueue = new Map();
const receivedUploads = new Set();
let queueRunning = false;
let queueTimer = null;
let pendingCount = 0;
let closingPage = false;

function openQueueDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('Stockage local indisponible.'));
    const request = indexedDB.open(DB_NAME, 3);
    const timer = setTimeout(() => reject(new Error('Le stockage local ne répond pas.')), 6000);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'uploadId' });
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE, { keyPath: 'uploadId' });
      if (!db.objectStoreNames.contains(LEASE_STORE)) db.createObjectStore(LEASE_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => { clearTimeout(timer); const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
    request.onblocked = () => { clearTimeout(timer); reject(new Error('Fermez les autres onglets de ce site pour activer le stockage.')); };
  });
}

function queueTransaction(mode, run, store = DB_STORE) {
  return openQueueDb().then(db => new Promise((resolve, reject) => {
    let tx, request;
    try { tx = db.transaction(store, mode); request = run(tx.objectStore(store)); }
    catch (err) { db.close(); reject(err); return; }
    tx.oncomplete = () => { db.close(); resolve(request?.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Écriture interrompue.')); };
  }));
}
const queuePut = item => queueTransaction('readwrite', s => s.put(item));
const queueDelete = id => queueTransaction('readwrite', s => s.delete(id));
const queueAll = () => queueTransaction('readonly', s => s.getAll());
async function completePending(item) {
  receivedUploads.add(item.uploadId); // Called only after an actual COMPLETED receipt.
  if (memoryQueue.has(item.uploadId)) { memoryQueue.delete(item.uploadId); return; }
  const db = await openQueueDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([DB_STORE, LEASE_STORE], 'readwrite');
    tx.objectStore(LEASE_STORE).put({ key: 'received:' + item.uploadId, receivedAt: Date.now() });
    tx.objectStore(DB_STORE).delete(item.uploadId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Réception confirmée, nettoyage local différé.')); };
  });
}
async function readReceived(ids) {
  try {
    const receipts = await queueTransaction('readonly', store => store.getAll(), LEASE_STORE);
    for (const receipt of receipts || []) {
      if (receipt.key.startsWith('received:') && ids.includes(receipt.key.slice(9))) receivedUploads.add(receipt.key.slice(9));
    }
  } catch (err) { /* Absence de lecture ne constitue jamais une preuve de réception. */ }
  return ids.filter(id => receivedUploads.has(id));
}
// Never discard an unconfirmed memory, regardless of age or count.
async function queueTrim() { return refreshPending(); }

async function readPending() {
  let items = [];
  try { items = await queueAll() || []; } catch (err) {}
  const merged = new Map(items.map(item => [item.uploadId, item]));
  for (const [id, item] of memoryQueue) merged.set(id, item);
  return [...merged.values()].sort((a, b) => a.createdAt - b.createdAt);
}

async function savePending(item) {
  if (memoryQueue.has(item.uploadId)) { memoryQueue.set(item.uploadId, item); return; }
  await queuePut(item);
}

// IndexedDB serializes this compare-and-set across tabs, including Safari.
async function claimUploadLease(release) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    let acquired = false;
    const tx = db.transaction(LEASE_STORE, 'readwrite');
    const store = tx.objectStore(LEASE_STORE);
    const req = store.get('upload');
    req.onsuccess = () => {
      const lease = req.result;
      if (release) { if (lease?.owner === tabOwner) store.delete('upload'); return; }
      if (!lease || lease.owner === tabOwner || lease.until < Date.now()) {
        store.put({ key: 'upload', owner: tabOwner, until: Date.now() + 30000 }); acquired = true;
      }
    };
    tx.oncomplete = () => { db.close(); resolve(acquired); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Verrou indisponible.')); };
  });
}

function checkStatusOnce(uploadId, timeoutMs) {
  return new Promise(resolve => {
    const callbackName = 'lpchk' + Math.random().toString(36).slice(2, 12);
    const script = document.createElement('script');
    let settled = false, timer;
    const finish = data => {
      if (settled) return; settled = true; clearTimeout(timer);
      delete window[callbackName]; script.remove(); resolve(data);
    };
    window[callbackName] = finish;
    script.onerror = () => finish(null);
    script.src = CONFIG.API_URL + '?action=status&uploadId=' + encodeURIComponent(uploadId) + '&prefix=' + callbackName + '&_=' + Date.now();
    timer = setTimeout(() => finish(null), timeoutMs || 12000);
    document.head.appendChild(script);
  });
}

function cancelledError() { return Object.assign(new Error('Opération annulée.'), { cancelled: true }); }
function retryError(message, retryAfter) { return Object.assign(new Error(message), { retryAfter: retryAfter || 10 }); }
function serverResult(data) {
  if (data?.status === 'COMPLETED') return data;
  if (data?.status === 'FAILED') throw Object.assign(new Error(data.error || 'Envoi refusé.'), { permanent: !!data.permanent });
  if (data?.status === 'RETRY' || data?.status === 'BUSY') throw retryError(data.message || 'Les souvenirs arrivent nombreux. Nouvelle tentative dans un instant.', data.retryAfter);
  return null;
}

async function pollUploadStatus(uploadId) {
  const startedAt = Date.now();
  while (!closingPage && navigator.onLine && Date.now() - startedAt < CONFIG.UPLOAD_TIMEOUT_MS) {
    const data = await checkStatusOnce(uploadId, 12000);
    const result = serverResult(data);
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, CONFIG.UPLOAD_POLL_INTERVAL_MS + Math.random() * 2000));
  }
  throw retryError('La réception n’est pas encore confirmée. Le souvenir reste conservé sur cet appareil.', 20);
}

async function attemptSend(item) {
  if (!navigator.onLine || closingPage) throw retryError('Connexion indisponible.', 10);
  if (item.attempts > 0) {
    const known = await checkStatusOnce(item.uploadId, 12000);
    if (known?.status === 'COMPLETED') return known;
    if (known?.status === 'FAILED' && known.permanent) serverResult(known);
    if (known?.status === 'PROCESSING') return pollUploadStatus(item.uploadId);
  }
  // Persist before the POST: a page closing mid-response must check status on retry.
  item.attempts = (item.attempts || 0) + 1;
  item.status = 'SENDING';
  await savePending(item);
  const mediaBase64 = await blobToBase64(new Blob([item.bytes], { type: item.mimeType }));
  if (closingPage) throw cancelledError();
  const payload = JSON.stringify({ ...item, bytes: undefined, mediaBase64 });
  const response = await postMedia(CONFIG.API_URL, payload);
  if (response.aborted) throw cancelledError();
  const direct = serverResult(response.data);
  if (direct) return direct;
  return pollUploadStatus(item.uploadId);
}

function scheduleQueue(delay) {
  clearTimeout(queueTimer);
  if (!closingPage) queueTimer = setTimeout(() => processQueue('reprise programmée'), Math.max(1000, delay || 0));
}

async function processQueue(reason) {
  if (queueRunning || closingPage) return;
  queueRunning = true;
  let lease = false, heartbeat = null, leaseLost = false;
  try {
    if (!navigator.onLine) return;
    let items = await readPending();
    if (!items.length) return;
    const persistent = items.some(item => !memoryQueue.has(item.uploadId));
    if (persistent) {
      lease = await claimUploadLease(false);
      if (!lease) { scheduleQueue(8000); return; }
      heartbeat = setInterval(() => claimUploadLease(false).then(ok => {
        if (!ok) { leaseLost = true; state.activeXhr?.abort(); }
      }).catch(() => { leaseLost = true; state.activeXhr?.abort(); }), 8000);
    }
    for (const item of items) {
      if (closingPage || leaseLost || !navigator.onLine) break;
      if (item.status === 'FAILED') continue;
      if (item.nextAttemptAt > Date.now()) continue;
      if (item.uploadId === state.doneUploadId) setDoneStatus('sending', 'Envoi en cours… Gardez cette page ouverte jusqu’à la confirmation.');
      try {
        await attemptSend(item);
        await completePending(item);
        if (item.uploadId === state.doneUploadId) setDoneStatus('sent', 'Votre souvenir est bien arrivé chez les mariés. Merci !');
        else if (!state.doneBatchIds.includes(item.uploadId)) toast('Un souvenir en attente vient d’être reçu par les mariés.', 'success');
      } catch (err) {
        item.status = err.permanent ? 'FAILED' : 'PENDING';
        item.lastError = err.message;
        const delay = Math.max((err.retryAfter || 0) * 1000, Math.min(180000, 5000 * 2 ** Math.min(item.attempts || 0, 5))) + Math.random() * 5000;
        item.nextAttemptAt = Date.now() + delay;
        try { await savePending(item); } catch (storageError) { memoryQueue.set(item.uploadId, item); }
        if (item.uploadId === state.doneUploadId) setDoneStatus(err.permanent ? 'failed' : 'pending', err.permanent
          ? 'Envoi impossible : ' + err.message + ' Vous pouvez toujours enregistrer ce souvenir.'
          : memoryQueue.has(item.uploadId)
            ? 'Envoi non confirmé. Gardez cet onglet ouvert et enregistrez une copie sur votre téléphone.'
            : 'Souvenir conservé sur cet appareil. Gardez ou rouvrez cette page pour terminer l’envoi.');
      }
      await refreshPending();
    }
  } catch (err) {
    console.warn('[file] reprise différée :', err.message);
  } finally {
    clearInterval(heartbeat);
    if (lease) { try { await claimUploadLease(true); } catch (err) {} }
    queueRunning = false;
    const items = await refreshPending();
    const retryable = items.filter(item => item.status !== 'FAILED');
    if (retryable.length && navigator.onLine && !closingPage) {
      scheduleQueue(Math.max(3000, Math.min(...retryable.map(item => (item.nextAttemptAt || 0) - Date.now()))));
    }
  }
}

function downloadPending(item) {
  const file = new File([item.bytes], item.filename, { type: item.mimeType });
  // Called directly from a user gesture. No preparation before native sharing.
  if (canShareFiles(file)) navigator.share({ files: [file], title: 'Mon souvenir' }).catch(err => {
    if (err.name !== 'AbortError') offerLongPressSave({ file });
  });
  else offerLongPressSave({ file });
}

async function retryPending() {
  const items = await readPending();
  for (const item of items) {
    if (item.status === 'FAILED') continue; // A permanent validation error cannot succeed on retry.
    item.nextAttemptAt = 0;
    try { await savePending(item); } catch (err) {}
  }
  await refreshPending(); processQueue('demande de l’invité');
}

async function refreshPending() {
  const items = await readPending(); pendingCount = items.length;
  const panel = $('queuePanel'), list = $('queueList');
  if (!panel || !list) return items;
  $('queueCount').textContent = items.length === 1 ? '1 souvenir en attente' : items.length + ' souvenirs en attente';
  panel.hidden = !items.length || !(el.screenHome.classList.contains('is-active') || el.screenDone.classList.contains('is-active'));
  list.replaceChildren();
  for (const item of items) {
    const row = document.createElement('li');
    const label = document.createElement('span');
    const time = new Date(item.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    label.textContent = (item.mediaType === 'photo' ? 'Photo' : 'Vidéo') + ' de ' + time + (item.status === 'FAILED' ? ' — envoi refusé' : ' — à transmettre');
    row.appendChild(label);
    if (item.lastError) { const info = document.createElement('small'); info.textContent = item.lastError; row.appendChild(info); }
    const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Enregistrer une copie';
    save.addEventListener('click', () => downloadPending(item)); row.appendChild(save); list.appendChild(row);
  }
  const batch = state.doneBatchIds;
  if (batch.length) {
    const confirmed = await readReceived(batch);
    const received = confirmed.length;
    const outstanding = batch.filter(id => !confirmed.includes(id));
    const remaining = outstanding.map(id => items.find(item => item.uploadId === id) || { uploadId: id, status: 'PENDING' });
    const failed = remaining.some(item => item.status === 'FAILED');
    $('doneTitle').textContent = !remaining.length ? 'Souvenirs bien reçus' : failed ? 'Certains souvenirs restent à garder' : 'Vos souvenirs sont en route';
    el.doneText.textContent = `${received} / ${batch.length} souvenir${batch.length > 1 ? 's' : ''} reçu${batch.length > 1 ? 's' : ''} par les mariés.`;
    el.doneStatus.hidden = false;
    el.doneStatus.className = 'done__status is-' + (!remaining.length ? 'sent' : failed ? 'failed' : 'pending');
    el.doneStatus.textContent = !remaining.length ? 'Merci ! Toute votre sélection est arrivée dans notre album privé.' : memoryQueue.size ? 'Gardez cet onglet ouvert et enregistrez une copie : le stockage du navigateur est indisponible.' : navigator.onLine ? 'Gardez cette page ouverte. Chaque réception sera confirmée ici.' : 'Vous êtes hors ligne. Rouvrez cette page avec une connexion pour terminer les envois.';
    $('btnDoneSave').hidden = true;
  } else $('btnDoneSave').hidden = false;
  $('btnDoneRetry').hidden = !items.some(item => (item.uploadId === state.doneUploadId || batch.includes(item.uploadId)) && item.status !== 'FAILED');
  return items;
}

function setDoneStatus(kind, text) {
  el.doneStatus.textContent = text;
  el.doneStatus.className = 'done__status is-' + kind; el.doneStatus.hidden = false;
  $('doneTitle').textContent = kind === 'sent' ? 'Souvenir bien reçu' : kind === 'failed' ? 'Votre souvenir est à garder' : 'Votre souvenir se prépare à partir';
  el.doneText.textContent = kind === 'sent' ? 'Merci pour ce beau moment partagé avec Salma & Soufiane.'
    : 'La réception par les mariés sera confirmée ici. Vous pouvez aussi garder une copie.';
  if (el.screenDone.classList.contains('is-active')) announce(text);
}

window.addEventListener('online', () => processQueue('retour du réseau'));
window.addEventListener('pageshow', () => { closingPage = false; processQueue('retour sur la page'); });
window.addEventListener('beforeunload', event => {
  if (memoryQueue.size || pendingCount || memoryDrafts.size || draftCount) { event.preventDefault(); event.returnValue = ''; }
});
$('btnQueueRetry').addEventListener('click', retryPending);
$('btnDoneRetry').addEventListener('click', retryPending);
$('btnDoneSave').addEventListener('click', () => {
  if (state.shareFile && shareFileIsFresh()) shareNow();
  else if (finalCache.blob) offerLongPressSave({ file: new File([finalCache.blob], buildFileName(finalCache.blob.type), { type: finalCache.blob.type }) });
});

el.btnSend.addEventListener('click', async () => {
  if (!state.mediaBlob || state.isBusy || state.isSent) return;
  state.sendPreparing = true; state.isBusy = true; state.cancelled = false;
  el.btnSend.disabled = true; el.btnSaveShare.disabled = true;
  state.message = el.captionInput.value.trim();
  const filter = currentFilter(), replacingId = state.editingDraftId;
  try {
    const { blob, filterBurned } = await buildFinalMedia();
    if (state.cancelled) throw cancelledError();
    const item = await makeDraft(blob, state.mediaType, state.mediaWidth, state.mediaHeight, state.videoDuration, {
      uploadId: replacingId || newUploadId(), message: state.message, filterId: filter.id, filterBurned
    });
    if (filterBurned) {
      item.originalBytes = await blobToArrayBuffer(state.mediaBlob);
      item.originalMimeType = state.mediaBlob.type;
    }
    item.storageSize = item.size + (item.originalBytes?.byteLength || 0);
    await storeDraft(item, !!replacingId);
    resetMedia(); setWorking(false); showScreen('home'); await refreshDrafts();
    toast(replacingId ? 'Souvenir mis à jour.' : 'Souvenir ajouté. Vous pouvez en ajouter un autre ou envoyer votre sélection.', 'success');
  } catch (err) { toast(err.cancelled ? 'Annulé. Votre souvenir est intact.' : err.message); }
  finally { state.sendPreparing = false; setWorking(false); el.btnSend.disabled = false; el.btnSaveShare.disabled = false; setHomeBusy(false); }
});

/* Sélection persistante, distincte de la file d'envoi : aucun envoi implicite. */
function setHomeBusy(busy) {
  for (const id of ['btnStart', 'btnHomeVideo', 'btnHomeGallery', 'btnClearDrafts']) $(id).disabled = busy;
  $('btnSendSelection').disabled = busy || !draftCount;
  $('draftList').setAttribute('aria-busy', String(busy));
}
async function readDrafts() {
  let saved = [];
  try { saved = await queueTransaction('readonly', store => store.getAll(), DRAFT_STORE) || []; } catch (err) {}
  const all = new Map(saved.map(item => [item.uploadId, item]));
  for (const [id, item] of memoryDrafts) all.set(id, item);
  return [...all.values()].sort((a, b) => a.createdAt - b.createdAt);
}
async function makeDraft(blob, mediaType, width, height, duration, extra = {}) {
  const mime = baseMime(blob?.type), video = mediaType === 'video';
  if (!blob?.size) throw new Error('Le fichier est vide.');
  if (blob.size > (video ? CONFIG.CLIENT_MAX_VIDEO_BYTES : CONFIG.CLIENT_MAX_PHOTO_BYTES)) throw new Error('Fichier trop volumineux (' + formatBytes(blob.size) + ').');
  if (!(video ? BACKEND_VIDEO_MIME_ALLOWLIST : BACKEND_PHOTO_MIME_ALLOWLIST).includes(mime)) throw new Error('Ce format ne peut pas être envoyé.');
  if (video && (!Number.isFinite(duration) || duration <= 0 || duration > CONFIG.MAX_VIDEO_SECONDS)) throw new Error('La durée maximale est de 60 secondes.');
  return { uploadId: newUploadId(), bytes: await blobToArrayBuffer(blob), size: blob.size, mediaType, mimeType: mime,
    duration, width, height, filename: buildFileName(mime), message: '', filterId: 'none', filterBurned: false,
    orientation: height >= width ? 'portrait' : 'landscape', createdAt: Date.now(), ...extra };
}
function validateDraftBudget(drafts, pending, item) {
  const others = drafts.filter(draft => draft.uploadId !== item.uploadId);
  if (others.length >= MAX_SELECTION) throw new Error('Votre sélection contient déjà 20 souvenirs. Envoyez-la ou retirez un fichier.');
  const bytes = [...others, ...pending].reduce((sum, draft) => sum + (draft.storageSize || draft.size || draft.bytes?.byteLength || 0), 0);
  if (bytes + (item.storageSize || item.size) > LOCAL_BYTE_BUDGET) throw new Error('La limite de 32 Mo sur cet appareil est atteinte. Envoyez votre sélection et attendez la réception avant d’ajouter ce fichier.');
}
async function storeDraft(item, replacing = false) {
  const existing = await readDrafts();
  if (replacing && !existing.some(draft => draft.uploadId === item.uploadId)) throw new Error('Ce souvenir a déjà été retiré ou envoyé depuis un autre onglet.');
  validateDraftBudget(existing, await readPending(), item);
  let db;
  try { db = await openQueueDb(); } catch (err) { memoryDrafts.set(item.uploadId, item); return; }
  // The budget check and write share a transaction, including across tabs.
  await new Promise((resolve, reject) => {
    const tx = db.transaction([DRAFT_STORE, DB_STORE], 'readwrite');
    const drafts = tx.objectStore(DRAFT_STORE).getAll(), pending = tx.objectStore(DB_STORE).getAll();
    let validationError;
    pending.onsuccess = () => {
      try {
        if (replacing && !drafts.result.some(draft => draft.uploadId === item.uploadId) && !memoryDrafts.has(item.uploadId)) throw new Error('Ce souvenir a déjà été retiré ou envoyé depuis un autre onglet.');
        validateDraftBudget([...drafts.result, ...memoryDrafts.values()], [...pending.result, ...memoryQueue.values()], item);
        tx.objectStore(DRAFT_STORE).put(item);
      } catch (err) { validationError = err; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); memoryDrafts.delete(item.uploadId); resolve(); };
    tx.onerror = tx.onabort = () => {
      db.close();
      if (validationError) reject(validationError);
      else if (replacing && !memoryDrafts.has(item.uploadId)) reject(new Error('Le stockage est plein ou indisponible. Votre sélection reste intacte ; gardez une copie de cette modification.'));
      else { memoryDrafts.set(item.uploadId, item); resolve(); }
    };
  });
}
async function removeDraft(id) {
  if (memoryDrafts.has(id)) {
    try { await queueTransaction('readwrite', store => store.delete(id), DRAFT_STORE); } catch (err) {}
    memoryDrafts.delete(id); return;
  }
  await queueTransaction('readwrite', store => store.delete(id), DRAFT_STORE);
  memoryDrafts.delete(id);
}
async function refreshDrafts() {
  const renderId = ++draftRenderId, drafts = await readDrafts();
  if (renderId !== draftRenderId) return;
  draftCount = drafts.length;
  draftURLs.forEach(url => URL.revokeObjectURL(url)); draftURLs = [];
  const list = $('draftList'); list.replaceChildren();
  $('draftCount').textContent = drafts.length;
  $('draftEmpty').hidden = !!drafts.length; $('btnClearDrafts').hidden = !drafts.length;
  $('draftStatus').textContent = memoryDrafts.size
    ? 'Stockage indisponible : gardez cet onglet ouvert et enregistrez une copie de vos souvenirs.'
    : drafts.length ? formatBytes(drafts.reduce((sum, item) => sum + (item.storageSize || item.size), 0)) + ' · Touchez un souvenir pour le voir ou ajouter un filtre.' : '';
  for (const [index, item] of drafts.entries()) {
    const row = document.createElement('li'); row.className = 'draft-tile';
    const open = document.createElement('button'); open.className = 'draft-tile__open'; open.type = 'button';
    open.setAttribute('aria-label', `Voir ${item.mediaType === 'photo' ? 'la photo' : 'la vidéo'} ${index + 1}`);
    const url = URL.createObjectURL(new Blob([item.bytes], { type: item.mimeType })); draftURLs.push(url);
    const media = document.createElement(item.mediaType === 'photo' ? 'img' : 'video');
    media.src = url; media.alt = ''; media.muted = true; media.playsInline = true; media.preload = 'metadata';
    if (item.mediaType === 'video') media.setAttribute('aria-hidden', 'true');
    open.appendChild(media);
    open.addEventListener('click', () => {
      if (state.isBusy || selectionBusy) return;
      resetMedia(); setCapturedMedia(new Blob([item.originalBytes || item.bytes], { type: item.originalMimeType || item.mimeType }), item.mediaType, item.width, item.height, item.duration);
      state.editingDraftId = item.uploadId; state.message = item.message || ''; goToPreview(item.originalBytes ? item.filterId : 'none');
    }); row.appendChild(open);
    if (item.mediaType === 'video') { const duration = document.createElement('span'); duration.className = 'draft-tile__duration'; duration.textContent = '▶ ' + Math.round(item.duration) + ' s'; row.appendChild(duration); }
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'draft-tile__remove'; remove.textContent = '×';
    remove.setAttribute('aria-label', `Retirer le souvenir ${index + 1}`);
    remove.addEventListener('click', async () => {
      if (state.isBusy || selectionBusy) return;
      selectionBusy = true; setHomeBusy(true);
      try { await removeDraft(item.uploadId); await refreshDrafts(); announce('Souvenir retiré de la sélection.'); }
      catch (err) { toast('Le souvenir n’a pas pu être retiré. Réessayez.'); }
      finally { selectionBusy = false; setHomeBusy(false); }
    }); row.appendChild(remove); list.appendChild(row);
  }
  setHomeBusy(state.isBusy || selectionBusy);
}
$('btnClearDrafts').addEventListener('click', async () => {
  if (state.isBusy || selectionBusy) return;
  if (!window.confirm('Retirer tous les souvenirs de votre sélection ? Les envois déjà en attente seront conservés.')) return;
  selectionBusy = true; setHomeBusy(true);
  try {
    const drafts = await readDrafts();
    if (drafts.some(item => !memoryDrafts.has(item.uploadId))) await queueTransaction('readwrite', store => store.clear(), DRAFT_STORE);
    memoryDrafts.clear(); await refreshDrafts();
  }
  catch (err) { toast('La sélection n’a pas pu être effacée. Réessayez.'); }
  finally { selectionBusy = false; setHomeBusy(false); }
});
async function submitDrafts(ids, guestName, message) {
  const nextAttemptAt = Date.now() + 500 + Math.random() * 12000;
  const prepare = draft => {
    const { originalBytes, originalMimeType, storageSize, ...media } = draft;
    return { ...media, guestName, message: draft.message || message, status: 'PENDING', attempts: 0, nextAttemptAt };
  };
  const submitted = [], wanted = new Set(ids);
  const persistent = (await readDrafts()).filter(item => !memoryDrafts.has(item.uploadId) && wanted.has(item.uploadId));
  if (persistent.length) {
    const db = await openQueueDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([DRAFT_STORE, DB_STORE], 'readwrite');
      const req = tx.objectStore(DRAFT_STORE).getAll();
      req.onsuccess = () => {
        for (const draft of req.result.filter(item => wanted.has(item.uploadId))) {
          const item = prepare(draft); tx.objectStore(DB_STORE).put(item); tx.objectStore(DRAFT_STORE).delete(item.uploadId); submitted.push(item);
        }
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Envoi non préparé. Votre sélection est conservée.')); };
    });
  }
  for (const [id, draft] of memoryDrafts) {
    if (!wanted.has(id)) continue;
    const item = prepare(draft);
    try { await queuePut(item); } catch (err) { memoryQueue.set(id, item); }
    memoryDrafts.delete(id); submitted.push(item);
  }
  return submitted;
}
$('btnSendSelection').addEventListener('click', async () => {
  if (state.isBusy || selectionBusy) return;
  selectionBusy = true; setHomeBusy(true);
  try {
    state.guestName = el.nameInput.value.trim(); rememberGuestName(state.guestName);
    const drafts = await readDrafts();
    const items = await submitDrafts(drafts.map(item => item.uploadId), state.guestName, $('batchCaption').value.trim());
    if (!items.length) { await refreshDrafts(); toast('Votre sélection est vide ou a déjà été envoyée depuis un autre onglet.'); return; }
    state.doneBatchIds = items.map(item => item.uploadId); state.doneUploadId = null;
    resetMedia(); $('batchCaption').value = ''; showScreen('done');
    setDoneStatus('pending', 'Votre sélection est conservée sur cet appareil. Gardez cette page ouverte jusqu’à la réception.');
    await refreshDrafts(); await refreshPending(); scheduleQueue(500);
  } catch (err) { toast(err.message || 'Votre sélection est conservée. Réessayez.'); }
  finally { selectionBusy = false; setHomeBusy(false); }
});
window.addEventListener('storage', () => { if (!state.isBusy && !selectionBusy) refreshDrafts(); });


/* ───────────────────────── ACCUEIL & CYCLE DE VIE ───────────────────────── */

/* Le prénom est mémorisé sur l'appareil : un invité qui laisse plusieurs
   souvenirs dans la soirée ne le retape jamais. Rien d'autre n'est conservé. */
const NAME_KEY = 'livre-souvenirs.prenom';

function rememberGuestName(name) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch (e) { /* navigation privée : sans conséquence */ }
}

function recallGuestName() {
  try { return localStorage.getItem(NAME_KEY) || ''; }
  catch (e) { return ''; }
}

$('btnHomeGallery').addEventListener('click', () => {
  if (selectionBusy) return;
  state.guestName = el.nameInput.value.trim(); rememberGuestName(state.guestName); openGallery();
});
$('btnBlockerBack').addEventListener('click', () => { stopAllStreams(); showScreen('home'); });
$('nameInput').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('batchCaption').focus(); } });
async function beginCapture(mode) {
  if (state.isBusy || selectionBusy) return;
  resetMedia();
  state.guestName = el.nameInput.value.trim();
  rememberGuestName(state.guestName);
  showScreen('capture');
  setCaptureMode(mode);
  await startCamera();
  if (mode === 'video' && el.screenCapture.classList.contains('is-active')) { ensureAudioStream(); startCanvasPipeline(); }
}
el.btnStart.addEventListener('click', () => beginCapture('photo'));
$('btnHomeVideo').addEventListener('click', () => beginCapture('video'));

el.btnCaptureBack.addEventListener('click', () => {
  state.importSession++; state.isBusy = false; setHomeBusy(false);
  state.discardRecording = true;
  if (state.isRecording) stopRecording();
  stopAllStreams();
  showScreen('home');
});

el.btnAnother.addEventListener('click', async () => {
  resetMedia();
  showScreen('capture');
  setCaptureMode('photo');
  await startCamera();
});

el.btnDoneHome.addEventListener('click', () => {
  resetMedia();
  showScreen('home');
});

function resetMedia() {
  revokePreviewURL();
  revokeShareURL();
  state.shareFile = null;
  state.cancelled = false;
  el.doneStatus.hidden = true;
  el.previewImg.removeAttribute('src');
  el.previewVideo.removeAttribute('src');
  el.filterOverlay.hidden = true;
  el.filterOverlay.getContext('2d')
    .clearRect(0, 0, el.filterOverlay.width, el.filterOverlay.height);
  state.editingDraftId = null;
  state.message = '';
  el.captionInput.value = '';
  state.mediaBlob = null;
  state.mediaType = null;
  state.videoDuration = 0;
  state.isSent = false;
  state.filterIndex = 0;
  finalCache = { key: null, blob: null, burned: false };
  el.videoFilterNotice.hidden = true;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.isRecording) {
      stopRecording(); // onstop owns cleanup and preserves the partial video.
    } else if (el.screenCapture.classList.contains('is-active')) stopAllStreams();
  } else {
    if (el.screenCapture.classList.contains('is-active') && !state.videoStream) startCamera();
    refreshDrafts();
    processQueue('retour sur la page');
  }
});

window.addEventListener('pagehide', () => {
  closingPage = true; clearTimeout(queueTimer);
  state.discardRecording = true;
  if (state.isRecording) stopRecording();
  stopAllStreams();
  releaseWakeLock();
  clearTimeout(speculativeTimer);
  clearInterval(state.recordTimerId);
  // Blob URLs are retained for bfcache restoration; the page owns their lifetime.
  if (state.activePoll) state.activePoll.stop();
  if (state.activeXhr) { try { state.activeXhr.abort(); } catch (e) {} }
});

window.addEventListener('error', (e) => console.error('[global]', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[promise]', e.reason));


/* ───────────────────────── DÉMARRAGE ───────────────────────── */

(async function init() {
  if (location.protocol !== 'https:' &&
      location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    toast('La caméra nécessite une connexion sécurisée (HTTPS).');
  }
  syncViewportHeight();

  const knownName = recallGuestName();
  if (knownName && !el.nameInput.value) el.nameInput.value = knownName;

  setCaptureMode('photo');
  showScreen('home');
  refreshDrafts();
  refreshPending().then(() => scheduleQueue(1500 + Math.random() * 4000));
  await loadFilters();
  if (el.screenPreview.classList.contains('is-active') && !state.isBusy) {
    buildFilterStrip(); selectFilter(0, false);
  }
  console.info('[app] prêt · filtres chargés :', state.filters.length);

})();
