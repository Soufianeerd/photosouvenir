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
   * Qualité vidéo : 4 Mbit/s en 720p, soit une image nettement plus nette
   * qu'un débit bridé. Plutôt que de dégrader toutes les vidéos pour que
   * le pire cas (60 s) tienne dans la limite, on surveille la taille
   * pendant l'enregistrement et on arrête proprement au budget atteint.
   * Une capture typique de 10 à 20 s pèse alors 5 à 10 Mo : bien plus
   * rapide à envoyer que les 20 Mo de l'approche précédente.
   */
  VIDEO_BITS_PER_SECOND: 4000000,
  AUDIO_BITS_PER_SECOND: 128000,
  RECORD_SIZE_BUDGET_BYTES: 20 * 1024 * 1024,

  /* Côté court du canvas d'enregistrement (720p portrait). */
  RECORD_SHORT_EDGE: 720,
  RECORD_MAX_LONG_EDGE: 1600,

  /* Photo : on garde une vraie définition. */
  PHOTO_MAX_LONG_EDGE: 3000,
  JPEG_QUALITY: 0.94,

  UPLOAD_POLL_INTERVAL_MS: 1500,
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
  message: '',

  videoStream: null,       // flux vidéo courant (change au basculement)
  audioStream: null,       // flux micro persistant, jamais interrompu
  facingMode: 'user',
  torchOn: false,
  captureMode: 'photo',

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

  isBusy: false,
  isSent: false,
  burnCancelled: false,
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
  messageInput: $('messageInput'),
  btnStart: $('btnStart'),

  cameraFeed: $('cameraFeed'),
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
  btnSend: $('btnSend'),

  working: $('working'),
  workingText: $('workingText'),
  workingFill: $('workingFill'),
  btnWorkingCancel: $('btnWorkingCancel'),

  btnAnother: $('btnAnother'),
  btnDoneHome: $('btnDoneHome'),
  doneText: $('doneText')
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
  return 'up-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
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

/* Dessine en mode « cover » : recadre sans jamais étirer. */
function drawCover(ctx, source, targetW, targetH, mirrored) {
  const iw = source.naturalWidth || source.videoWidth || source.width;
  const ih = source.naturalHeight || source.videoHeight || source.height;
  if (!iw || !ih) return;

  const scale = Math.max(targetW / iw, targetH / ih);
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

function revokePreviewURL() {
  if (state.previewURL) { URL.revokeObjectURL(state.previewURL); state.previewURL = null; }
}

/* Format de l'écran : tout est capturé, affiché et exporté à ce format,
   ce qui garantit un plein écran sans bande noire et un rendu identique. */
function viewportAspect() {
  const w = window.innerWidth || 1080;
  const h = window.innerHeight || 1920;
  return w / h;
}


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
}


/* ───────────────────────── FILTRES ───────────────────────── */

async function loadFilters() {
  let raw = [{ id: 'none', name: 'Aucun filtre', order: 0, active: true }];
  try {
    const res = await fetch(CONFIG.FILTERS_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (Array.isArray(data.filters) && data.filters.length) raw = data.filters;
  } catch (err) {
    console.error('[filters] Chargement impossible :', err);
    toast("Les filtres n'ont pas pu être chargés. Vous pouvez continuer sans filtre.");
  }

  const now = Date.now();

  state.filters = raw
    .filter((f) => f && f.id && f.active !== false)
    .filter((f) => {
      if (f.availableFrom && now < Date.parse(f.availableFrom)) return false;
      if (f.availableUntil && now > Date.parse(f.availableUntil)) return false;
      return true;
    })
    .map((f) => ({
      id: f.id,
      name: f.name || f.id,
      category: f.category || 'default',
      order: Number.isFinite(f.order) ? f.order : 999,
      mediaTypes: Array.isArray(f.mediaTypes) ? f.mediaTypes : ['photo', 'video'],
      portrait: f.id === 'none' ? '' : (f.portrait || `filters/portrait/filter-${f.id}.png`),
      landscape: f.id === 'none' ? '' : (f.landscape || ''),
      thumbnail: f.id === 'none' ? '' : (f.thumbnail || '')
    }))
    .sort((a, b) => a.order - b.order);

  if (!state.filters.some((f) => f.id === 'none')) {
    state.filters.unshift({
      id: 'none', name: 'Aucun filtre', order: -1,
      mediaTypes: ['photo', 'video'], portrait: '', landscape: '', thumbnail: ''
    });
  }
}

function filterSourceFor(filter) {
  if (!filter || filter.id === 'none') return '';
  const isLandscape = state.mediaWidth > state.mediaHeight;
  return (isLandscape && filter.landscape) ? filter.landscape : filter.portrait;
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

    if (filter.id === 'none') {
      const x = document.createElement('span');
      x.className = 'filter-chip__x';
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '⃠';
      chip.appendChild(x);
    } else {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.dataset.src = filter.thumbnail || filterSourceFor(filter);
      img.onerror = () => { img.remove(); };
      chip.appendChild(img);
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
  el.filterStrip.querySelectorAll('.filter-chip').forEach((chip, index) => {
    if (Math.abs(index - state.filterIndex) > 2) return;
    const img = chip.querySelector('img[data-src]');
    if (img && img.dataset.src) {
      img.src = img.dataset.src;
      delete img.dataset.src;
    }
  });
}

function selectFilter(index, scrollIntoView) {
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

  const src = filterSourceFor(filter);
  if (!src) {
    el.filterOverlay.hidden = true;
    el.filterOverlay.removeAttribute('src');
  } else {
    el.filterOverlay.src = src;
    el.filterOverlay.hidden = false;
  }

  updateVideoFilterNotice();
  announce('Filtre sélectionné : ' + filter.name);

  [state.filterIndex - 1, state.filterIndex + 1].forEach((i) => {
    const near = list[i];
    const nearSrc = near && filterSourceFor(near);
    if (nearSrc) { const p = new Image(); p.src = nearSrc; }
  });
}

function currentFilter() {
  const list = availableFilters();
  return list[state.filterIndex] || list[0] || { id: 'none', name: 'Aucun filtre' };
}


/* ───────────────────────── CAMÉRA ───────────────────────── */

function stopVideoStream() {
  if (state.videoStream) {
    state.videoStream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
    state.videoStream = null;
  }
}

function stopAudioStream() {
  if (state.audioStream) {
    state.audioStream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
    state.audioStream = null;
  }
}

function stopAllStreams() {
  stopCanvasPipeline();
  stopVideoStream();
  stopAudioStream();
  el.cameraFeed.srcObject = null;
  state.torchOn = false;
  el.btnTorch.hidden = true;
  el.btnTorch.classList.remove('is-on');
}

async function requestVideoStream(facingMode) {
  const attempts = [
    { facingMode: { exact: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    { facingMode: facingMode },
    true
  ];

  let lastError = null;
  for (const video of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: video, audio: false });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function startCamera() {
  el.cameraBlocker.hidden = true;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCameraBlocker(
      'Caméra non disponible',
      "Ce navigateur ne permet pas d'ouvrir la caméra. Vous pouvez choisir une photo ou une vidéo depuis votre galerie."
    );
    return;
  }

  /* Le micro est demandé une seule fois et conservé : il ne doit jamais
     être coupé, sinon le basculement de caméra interromprait le son. */
  if (!state.audioStream) {
    try {
      state.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn('[camera] micro indisponible :', err && err.name);
    }
  }

  try {
    stopVideoStream();
    state.videoStream = await requestVideoStream(state.facingMode);
  } catch (err) {
    handleCameraError(err);
    return;
  }

  el.cameraFeed.srcObject = state.videoStream;
  el.cameraFeed.classList.toggle('is-mirrored', state.facingMode === 'user');
  try { await el.cameraFeed.play(); } catch (e) {}

  setupTorchButton();
  announce('Caméra prête.');
}

/*
 * Basculement avant / arrière.
 * Pendant un enregistrement, seule la piste vidéo est remplacée : le canvas
 * continue de dessiner et le MediaRecorder n'est jamais interrompu.
 */
async function switchCamera() {
  const next = state.facingMode === 'user' ? 'environment' : 'user';
  const previous = state.facingMode;

  el.btnSwitchCamera.disabled = true;
  try {
    const newStream = await requestVideoStream(next);
    stopVideoStream();
    state.videoStream = newStream;
    state.facingMode = next;

    el.cameraFeed.srcObject = newStream;
    el.cameraFeed.classList.toggle('is-mirrored', next === 'user');
    try { await el.cameraFeed.play(); } catch (e) {}

    setupTorchButton();
    announce(next === 'user' ? 'Caméra avant.' : 'Caméra arrière.');
  } catch (err) {
    state.facingMode = previous;
    console.error('[camera] basculement impossible :', err);
    toast("Impossible de changer de caméra sur cet appareil.");
    if (!state.videoStream) startCamera();
  } finally {
    el.btnSwitchCamera.disabled = false;
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
  const track = state.videoStream && state.videoStream.getVideoTracks()[0];
  const caps = track && track.getCapabilities ? track.getCapabilities() : null;
  const supported = !!(caps && caps.torch);
  el.btnTorch.hidden = !supported;
  if (!supported) state.torchOn = false;
}

el.btnTorch.addEventListener('click', async () => {
  const track = state.videoStream && state.videoStream.getVideoTracks()[0];
  if (!track || !track.applyConstraints) return;
  try {
    state.torchOn = !state.torchOn;
    await track.applyConstraints({ advanced: [{ torch: state.torchOn }] });
    el.btnTorch.classList.toggle('is-on', state.torchOn);
    el.btnTorch.setAttribute('aria-label', state.torchOn ? 'Éteindre la lampe' : 'Activer la lampe');
  } catch (e) {
    el.btnTorch.hidden = true;
  }
});

el.btnSwitchCamera.addEventListener('click', switchCamera);
el.btnRetryCamera.addEventListener('click', startCamera);


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

  /* Le son vient du flux micro persistant, jamais du flux caméra. */
  if (state.audioStream) {
    state.audioStream.getAudioTracks().forEach((t) => {
      try { stream.addTrack(t); } catch (e) {}
    });
  }

  state.recordCanvas = canvas;
  state.recordCtx = ctx;
  state.recordStream = stream;
  state.canvasPipelineActive = true;

  const draw = () => {
    if (!state.canvasPipelineActive) return;
    const video = el.cameraFeed;
    if (video.readyState >= 2 && video.videoWidth) {
      drawCover(ctx, video, canvas.width, canvas.height, state.facingMode === 'user');
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
  if (state.isRecording) return;
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
}

el.modePhoto.addEventListener('click', () => setCaptureMode('photo'));
el.modeVideo.addEventListener('click', () => setCaptureMode('video'));


/* ───────────────────────── DÉCLENCHEUR ───────────────────────── */

let pressTimer = null;
let pressActive = false;
let longPressFired = false;

el.btnShutter.addEventListener('contextmenu', (e) => e.preventDefault());

el.btnShutter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state.isBusy) return;
  if (!state.videoStream) { toast("La caméra n'est pas active."); return; }
  try { el.btnShutter.setPointerCapture(e.pointerId); } catch (err) {}

  pressActive = true;
  longPressFired = false;

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
    const source = await grabPhotoSource();
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
    drawCover(ctx, source, w, h, state.facingMode === 'user');
    if (source.close) source.close();

    const blob = await canvasToBlob(canvas, 'image/jpeg', CONFIG.JPEG_QUALITY);
    if (!blob || blob.size === 0) throw new Error('Photo vide.');

    setCapturedMedia(blob, 'photo', w, h, 0);
    goToPreview();
  } catch (err) {
    console.error('[photo]', err);
    toast("La photo n'a pas pu être prise. Réessayez.");
  } finally {
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

function startRecording() {
  if (state.isRecording || !state.videoStream) return;

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
    el.btnSwitchCamera.disabled = false;
  } else {
    const combined = new MediaStream();
    state.videoStream.getVideoTracks().forEach((t) => combined.addTrack(t));
    if (state.audioStream) state.audioStream.getAudioTracks().forEach((t) => combined.addTrack(t));
    sourceStream = combined;
    el.btnSwitchCamera.disabled = true;
    console.info('[video] pipeline canvas indisponible : bascule caméra désactivée pendant la vidéo.');
  }

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
  };

  state.mediaRecorder.onstop = () => {
    const type = baseMime(state.recordMimeType);
    const blob = new Blob(state.recordedChunks, { type });
    state.recordedChunks = [];

    const duration = Math.min(
      CONFIG.MAX_VIDEO_SECONDS,
      Math.max(1, Math.round((Date.now() - state.recordStartedAt) / 1000))
    );

    let width, height;
    if (state.recordCanvas) {
      width = state.recordCanvas.width;
      height = state.recordCanvas.height;
    } else {
      const settings = state.videoStream.getVideoTracks()[0].getSettings
        ? state.videoStream.getVideoTracks()[0].getSettings() : {};
      width = settings.width || el.cameraFeed.videoWidth || 720;
      height = settings.height || el.cameraFeed.videoHeight || 1280;
    }

    cleanupRecordingUI();
    stopCanvasPipeline();

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
  el.captureHint.textContent = canvasOk
    ? "Relâchez pour arrêter · Vous pouvez changer de caméra"
    : "Relâchez pour arrêter l'enregistrement";
  announce("Enregistrement vidéo démarré. Durée maximale : 60 secondes.");

  state.recordTimerId = setInterval(tickRecording, 200);
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
  state.isRecording = false;
  clearInterval(state.recordTimerId);
  try { state.mediaRecorder.stop(); } catch (e) { console.error(e); }
}

function cleanupRecordingUI() {
  state.isRecording = false;
  clearInterval(state.recordTimerId);
  el.btnShutter.classList.remove('is-recording');
  el.recPill.hidden = true;
  el.btnSwitchCamera.disabled = false;
  el.shutterProgress.style.strokeDashoffset = '283';
  setCaptureMode(state.captureMode);
}


/* ───────────────────────── GALERIE (SECOURS) ───────────────────────── */

function openGallery() { el.galleryInput.click(); }
el.btnGallery.addEventListener('click', openGallery);
el.btnBlockerGallery.addEventListener('click', openGallery);

el.galleryInput.addEventListener('change', async () => {
  const file = el.galleryInput.files && el.galleryInput.files[0];
  el.galleryInput.value = '';
  if (!file) return;

  const isVideo = file.type.indexOf('video/') === 0;
  const isPhoto = file.type.indexOf('image/') === 0;
  if (!isVideo && !isPhoto) { toast('Format de fichier non pris en charge.'); return; }

  try {
    if (isPhoto) {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);

      let w = img.naturalWidth, h = img.naturalHeight;
      const longEdge = Math.max(w, h);
      if (longEdge > CONFIG.PHOTO_MAX_LONG_EDGE) {
        const k = CONFIG.PHOTO_MAX_LONG_EDGE / longEdge;
        w = Math.round(w * k); h = Math.round(h * k);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await canvasToBlob(canvas, 'image/jpeg', CONFIG.JPEG_QUALITY);
      setCapturedMedia(blob, 'photo', w, h, 0);
    } else {
      const meta = await readVideoMetadata(file);
      if (meta.duration > CONFIG.MAX_VIDEO_SECONDS + 1) {
        toast(`Cette vidéo dure ${Math.round(meta.duration)} s. La durée maximale est de 60 secondes.`);
        return;
      }
      if (BACKEND_VIDEO_MIME_ALLOWLIST.indexOf(baseMime(file.type)) === -1) {
        toast("Ce format vidéo n'est pas accepté. Formats acceptés : MP4, WebM, MOV.");
        return;
      }
      setCapturedMedia(file, 'video', meta.width, meta.height, Math.round(meta.duration) || 1);
    }
    goToPreview();
  } catch (err) {
    console.error('[galerie]', err);
    toast("Ce fichier n'a pas pu être ouvert.");
  }
});

function readVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    const done = (result, error) => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      error ? reject(error) : resolve(result);
    };
    video.onloadedmetadata = () => done({
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth || 720,
      height: video.videoHeight || 1280
    });
    video.onerror = () => done(null, new Error('Vidéo illisible.'));
    video.src = url;
  });
}


/* ───────────────────────── APERÇU ───────────────────────── */

function setCapturedMedia(blob, type, width, height, duration) {
  revokePreviewURL();
  state.mediaBlob = blob;
  state.mediaType = type;
  state.mediaWidth = width || 0;
  state.mediaHeight = height || 0;
  state.videoDuration = duration || 0;
  state.isSent = false;
  state.filterIndex = 0;
}

function goToPreview() {
  stopAllStreams();
  state.previewURL = URL.createObjectURL(state.mediaBlob);

  if (state.mediaType === 'photo') {
    el.previewVideo.hidden = true;
    el.previewVideo.removeAttribute('src');
    el.previewImg.src = state.previewURL;
    el.previewImg.hidden = false;
    el.previewImg.onload = () => {
      state.mediaWidth = el.previewImg.naturalWidth;
      state.mediaHeight = el.previewImg.naturalHeight;
    };
  } else {
    el.previewImg.hidden = true;
    el.previewImg.removeAttribute('src');
    el.previewVideo.src = state.previewURL;
    el.previewVideo.hidden = false;
    el.previewVideo.onloadedmetadata = () => {
      state.mediaWidth = el.previewVideo.videoWidth || state.mediaWidth;
      state.mediaHeight = el.previewVideo.videoHeight || state.mediaHeight;
      el.previewVideo.play().catch(() => {
        announce('Touchez la vidéo pour la lire.');
      });
    };
  }

  el.captionInput.value = state.message;
  el.btnSend.disabled = false;
  el.btnSaveShare.disabled = false;

  buildFilterStrip();
  selectFilter(0, false);
  showScreen('preview');
  announce('Aperçu de votre souvenir. Faites glisser pour découvrir les filtres.');
}

/* Glissement horizontal sur le média pour changer de filtre. */
(function enableSwipe() {
  let startX = 0, startY = 0, tracking = false;

  el.mediaStage.addEventListener('pointerdown', (e) => {
    if (state.isBusy) return;
    tracking = true; startX = e.clientX; startY = e.clientY;
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
        if (el.previewVideo.paused) el.previewVideo.play().catch(() => {});
        else el.previewVideo.pause();
      }
      return;
    }

    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    selectFilter(state.filterIndex + (dx < 0 ? 1 : -1), true);
  });

  el.mediaStage.addEventListener('pointercancel', () => { tracking = false; });
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
  state.mediaBlob = null;
  state.mediaType = null;
  el.videoFilterNotice.hidden = true;
  showScreen('capture');
  startCamera();
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
  if (!filter || filter.id === 'none' || canBurnVideoFilter()) {
    el.videoFilterNotice.hidden = true;
    return;
  }
  el.videoFilterNotice.textContent =
    "Information : sur ce navigateur, le filtre reste visible uniquement à l'aperçu. " +
    "Le fichier enregistré et envoyé sera la vidéo d'origine. " +
    'Le filtre choisi est tout de même transmis aux mariés.';
  el.videoFilterNotice.hidden = false;
}

async function burnFilterIntoPhoto(blob, filterSrc) {
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

    const overlay = await loadImage(filterSrc);
    drawCover(ctx, overlay, w, h, false);

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

async function burnFilterIntoVideo(blob, filterSrc, onProgress) {
  if (!canBurnVideoFilter()) return null;

  const url = URL.createObjectURL(blob);
  let audioContext = null;
  let videoEl = null;
  let rafId = null;

  try {
    const overlay = await loadImage(filterSrc);

    videoEl = document.createElement('video');
    videoEl.src = url;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.volume = 0;
    videoEl.preload = 'auto';

    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = resolve;
      videoEl.onerror = () => reject(new Error('Vidéo illisible.'));
      setTimeout(() => reject(new Error('Délai dépassé.')), 15000);
    });

    const srcW = videoEl.videoWidth || state.mediaWidth || 720;
    const srcH = videoEl.videoHeight || state.mediaHeight || 1280;
    const w = Math.round(srcW / 2) * 2;
    const h = Math.round(srcH / 2) * 2;

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');

    const outStream = canvas.captureStream(30);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
        if (audioContext.state === 'suspended') { try { await audioContext.resume(); } catch (e) {} }
        const source = audioContext.createMediaElementSource(videoEl);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);   /* non relié à ctx.destination : silencieux */
        destination.stream.getAudioTracks().forEach((t) => outStream.addTrack(t));
      }
    } catch (audioErr) {
      console.warn('[burn] audio non capturé :', audioErr);
    }

    const mime = pickVideoMimeType();
    if (mime === null) return null;

    const options = {
      videoBitsPerSecond: CONFIG.VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: CONFIG.AUDIO_BITS_PER_SECOND
    };
    if (mime) options.mimeType = mime;

    let recorder;
    try { recorder = new MediaRecorder(outStream, options); }
    catch (e) { recorder = new MediaRecorder(outStream); }

    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    const totalDuration = Number.isFinite(videoEl.duration) && videoEl.duration > 0
      ? videoEl.duration
      : state.videoDuration || CONFIG.MAX_VIDEO_SECONDS;

    const finished = new Promise((resolve) => { recorder.onstop = resolve; });

    const draw = () => {
      if (videoEl.readyState >= 2) {
        ctx.drawImage(videoEl, 0, 0, w, h);
        drawCover(ctx, overlay, w, h, false);
      }
      if (onProgress) onProgress(Math.min(0.99, (videoEl.currentTime || 0) / totalDuration));
      if (!videoEl.ended && !state.burnCancelled) rafId = requestAnimationFrame(draw);
    };

    recorder.start(1000);
    await videoEl.play();
    draw();

    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (videoEl.ended || state.burnCancelled ||
            (videoEl.currentTime || 0) >= totalDuration + 0.5) {
          clearInterval(check); resolve();
        }
      }, 200);
      setTimeout(() => { clearInterval(check); resolve(); },
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
    if (rafId) cancelAnimationFrame(rafId);
    if (videoEl) { try { videoEl.pause(); } catch (e) {} videoEl.removeAttribute('src'); }
    if (audioContext) { try { await audioContext.close(); } catch (e) {} }
    URL.revokeObjectURL(url);
  }
}

/* Cache du fichier final : évite de refaire l'incrustation entre
   « Enregistrer » et « Envoyer ». */
let finalCache = { key: null, blob: null, burned: false };

function finalCacheKey() {
  return [state.mediaType, currentFilter().id, state.mediaBlob && state.mediaBlob.size].join('|');
}

async function buildFinalMedia() {
  const key = finalCacheKey();
  if (finalCache.key === key && finalCache.blob) {
    return { blob: finalCache.blob, filterBurned: finalCache.burned };
  }

  const filter = currentFilter();
  const src = filterSourceFor(filter);
  let result;

  if (!src) {
    result = { blob: state.mediaBlob, filterBurned: false };
  } else if (state.mediaType === 'photo') {
    setWorking(true, 'Application du filtre…', 0.4, false);
    try {
      result = { blob: await burnFilterIntoPhoto(state.mediaBlob, src), filterBurned: true };
    } catch (err) {
      console.error('[final] filtre photo :', err);
      toast("Le filtre n'a pas pu être appliqué à la photo.");
      result = { blob: state.mediaBlob, filterBurned: false };
    }
  } else if (!canBurnVideoFilter()) {
    result = { blob: state.mediaBlob, filterBurned: false };
  } else {
    state.burnCancelled = false;
    setWorking(true, 'Incrustation du filtre dans la vidéo…', 0, true);

    const burned = await burnFilterIntoVideo(state.mediaBlob, src, (p) => {
      setWorking(true, 'Incrustation du filtre dans la vidéo…', p, true);
    });

    if (burned) result = { blob: burned, filterBurned: true };
    else {
      if (!state.burnCancelled) {
        toast("Le filtre n'a pas pu être incrusté dans la vidéo. La vidéo d'origine est conservée.");
      }
      result = { blob: state.mediaBlob, filterBurned: false };
    }
  }

  finalCache = { key: key, blob: result.blob, burned: result.filterBurned };
  return result;
}


/* ───────────────────────── OVERLAY DE TRAVAIL ───────────────────────── */

function setWorking(visible, text, progress, cancellable, indeterminate) {
  el.working.hidden = !visible;
  state.isBusy = visible;
  if (text) { el.workingText.textContent = text; announce(text); }

  el.workingFill.classList.toggle('is-indeterminate', indeterminate === true);
  if (indeterminate === true) {
    el.workingFill.style.width = '';
  } else if (typeof progress === 'number') {
    el.workingFill.style.width = Math.round(Math.max(0, Math.min(1, progress)) * 100) + '%';
  }

  el.btnWorkingCancel.hidden = !cancellable;
}

el.btnWorkingCancel.addEventListener('click', () => {
  state.burnCancelled = true;
  el.btnWorkingCancel.hidden = true;
  el.workingText.textContent = 'Interruption…';
});


/* ───────────────────────── ENREGISTRER / PARTAGER ───────────────────────── */

el.btnSaveShare.addEventListener('click', async () => {
  if (!state.mediaBlob || state.isBusy) return;
  el.btnSaveShare.disabled = true;

  try {
    const { blob } = await buildFinalMedia();
    const name = buildFileName(blob.type);
    const file = new File([blob], name, { type: blob.type });
    setWorking(false);

    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      try {
        await navigator.share({
          files: [file],
          title: 'Mon souvenir — Salma & Soufiane',
          text: 'Mon souvenir du mariage de Salma & Soufiane.'
        });
        announce('Menu de partage ouvert.');
      } catch (err) {
        if (err && err.name !== 'AbortError') {
          console.warn('[share]', err);
          downloadBlob(blob, name);
        }
      }
    } else {
      downloadBlob(blob, name);
      toast('Fichier téléchargé (' + formatBytes(blob.size) + ').', 'success');
    }
  } catch (err) {
    console.error('[save]', err);
    toast("L'enregistrement a échoué. Réessayez.");
  } finally {
    el.btnSaveShare.disabled = false;
    setWorking(false);
  }
});

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}


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

    xhr.send(body);
  });
}

function pollUploadStatus(uploadId, onTick) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let stopped = false;
    let sequence = 0;

    state.activePoll = { stop() { stopped = true; } };

    function request() {
      if (stopped) return;
      if (Date.now() - startedAt > CONFIG.UPLOAD_TIMEOUT_MS) {
        stopped = true;
        return reject(new Error('TIMEOUT'));
      }

      const callbackName = 'lpcb' + (++sequence) + Math.random().toString(36).slice(2, 8);
      const script = document.createElement('script');
      let settled = false;

      const cleanup = () => {
        try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      };

      window[callbackName] = (data) => {
        if (settled) return;
        settled = true; cleanup(); handle(data);
      };

      script.onerror = () => {
        if (settled) return;
        settled = true; cleanup();
        setTimeout(request, CONFIG.UPLOAD_POLL_INTERVAL_MS);
      };

      script.src = CONFIG.API_URL +
        '?action=status&uploadId=' + encodeURIComponent(uploadId) +
        '&prefix=' + encodeURIComponent(callbackName) +
        '&_=' + Date.now();

      document.head.appendChild(script);

      setTimeout(() => {
        if (settled) return;
        settled = true; cleanup(); request();
      }, CONFIG.UPLOAD_POLL_INTERVAL_MS * 4);
    }

    function handle(data) {
      if (onTick) onTick(data);
      const status = data && data.status;
      if (status === 'COMPLETED') { stopped = true; return resolve(data); }
      if (status === 'FAILED') {
        stopped = true;
        const error = new Error(data.error || "L'enregistrement a échoué.");
        error.details = data;
        return reject(error);
      }
      setTimeout(request, CONFIG.UPLOAD_POLL_INTERVAL_MS);
    }

    request();
  });
}

el.btnSend.addEventListener('click', async () => {
  if (!state.mediaBlob || state.isBusy) return;
  if (state.isSent) { toast('Ce souvenir a déjà été envoyé.'); return; }

  el.btnSend.disabled = true;
  el.btnSaveShare.disabled = true;
  state.message = el.captionInput.value.trim();

  const filter = currentFilter();
  let uploadId = newUploadId();

  try {
    const { blob, filterBurned } = await buildFinalMedia();

    setWorking(true, 'Vérification du fichier…', 0.05, false);

    if (!blob || blob.size === 0) throw new Error('Le fichier est vide.');

    const mime = baseMime(blob.type);
    const limit = state.mediaType === 'photo'
      ? CONFIG.CLIENT_MAX_PHOTO_BYTES : CONFIG.CLIENT_MAX_VIDEO_BYTES;

    if (blob.size > limit) {
      throw new Error(
        `Ce souvenir pèse ${formatBytes(blob.size)}, au-delà de la limite d'envoi ` +
        `(${formatBytes(limit)}). Enregistrez-le sur votre téléphone, ou refaites une vidéo plus courte.`
      );
    }
    if (state.mediaType === 'photo' && BACKEND_PHOTO_MIME_ALLOWLIST.indexOf(mime) === -1) {
      throw new Error('Format de photo non pris en charge (' + mime + ').');
    }
    if (state.mediaType === 'video' && BACKEND_VIDEO_MIME_ALLOWLIST.indexOf(mime) === -1) {
      throw new Error('Format de vidéo non pris en charge (' + mime + ').');
    }
    if (state.mediaType === 'video' &&
        (state.videoDuration <= 0 || state.videoDuration > CONFIG.MAX_VIDEO_SECONDS)) {
      throw new Error('La durée de la vidéo est invalide (' + state.videoDuration + ' s).');
    }

    console.info('[upload]', {
      uploadId, mediaType: state.mediaType, mimeType: mime,
      size: blob.size, sizeLabel: formatBytes(blob.size),
      duration: state.videoDuration, filterId: filter.id, filterBurned
    });

    setWorking(true, 'Préparation de votre souvenir…', 0.12, false);
    const mediaBase64 = await blobToBase64(blob);

    const payload = JSON.stringify({
      uploadId: uploadId,
      mediaType: state.mediaType,
      mimeType: mime,
      mediaBase64: mediaBase64,
      duration: state.mediaType === 'video' ? state.videoDuration : 0,
      guestName: state.guestName,
      message: state.message,
      filterId: filter.id,
      orientation: state.mediaHeight >= state.mediaWidth ? 'portrait' : 'landscape',
      filename: buildFileName(blob.type),
      filterBurned: filterBurned
    });

    setWorking(true, 'Envoi aux mariés… (' + formatBytes(blob.size) + ')', null, false, true);

    const response = await postMedia(CONFIG.API_URL, payload);
    if (response.data && response.data.uploadId) uploadId = response.data.uploadId;

    setWorking(true, 'Enregistrement dans l’album…', 0.85, false, false);

    const result = await pollUploadStatus(uploadId);

    state.isSent = true;
    setWorking(false);
    el.doneText.textContent = 'Votre souvenir a bien été envoyé aux mariés' +
      (result && result.filename ? ' (' + result.filename + ').' : '.');
    showScreen('done');
    announce('Votre souvenir a bien été envoyé aux mariés.');

  } catch (err) {
    setWorking(false);
    console.error('[upload] échec :', err, err && err.details);

    if (err && err.message === 'TIMEOUT') {
      toast("Aucune confirmation reçue du serveur. Le souvenir n'est peut-être pas enregistré. " +
            'Vérifiez votre connexion puis réessayez.');
    } else {
      toast("L'envoi a échoué : " + (err && err.message ? err.message : 'erreur inconnue') +
            ' Vérifiez votre connexion puis réessayez.');
    }
  } finally {
    if (state.activePoll) { state.activePoll.stop(); state.activePoll = null; }
    el.btnSend.disabled = state.isSent;
    el.btnSaveShare.disabled = false;
    setWorking(false);
  }
});


/* ───────────────────────── ACCUEIL & CYCLE DE VIE ───────────────────────── */

el.btnStart.addEventListener('click', async () => {
  state.guestName = el.nameInput.value.trim();
  state.message = el.messageInput.value.trim();
  showScreen('capture');
  setCaptureMode('photo');
  await startCamera();
});

el.btnCaptureBack.addEventListener('click', () => {
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
  el.previewImg.removeAttribute('src');
  el.previewVideo.removeAttribute('src');
  el.filterOverlay.removeAttribute('src');
  el.captionInput.value = state.message;
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
    if (state.isRecording) stopRecording();
    if (el.screenCapture.classList.contains('is-active')) stopAllStreams();
  } else if (el.screenCapture.classList.contains('is-active') && !state.videoStream) {
    startCamera();
  }
});

window.addEventListener('pagehide', () => {
  stopAllStreams();
  clearInterval(state.recordTimerId);
  revokePreviewURL();
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
  await loadFilters();
  setCaptureMode('photo');
  showScreen('home');
  console.info('[app] prêt · filtres chargés :', state.filters.length);
})();
