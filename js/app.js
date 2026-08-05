const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbw_fBZ1FmpvAl8IyXZ_7nsrMrGquVlUuGXY-YfQ7GBac0sI7dRHFLtJVGGWi5d7B-pUeg/exec',
  MAX_VIDEO_DURATION: 60, // secondes
  FILTERS: [
    { id: 'none', name: 'Aucun filtre', src: '' },
    { id: 'ss-floral-burgundy-01', name: 'Floral Burgundy', src: 'filters/portrait/filter-ss-floral-burgundy-01.png' },
    { id: 'ss-ivory-gold-02', name: 'Ivory Gold', src: 'filters/portrait/filter-ss-ivory-gold-02.png' },
    { id: 'salma-soufiane-gold-03', name: 'Salma & Soufiane Gold', src: 'filters/portrait/filter-salma-soufiane-gold-03.png' },
    { id: 'salma-soufiane-gold-04', name: 'Salma & Soufiane Gold 2', src: 'filters/portrait/filter-salma-soufiane-gold-04.png' },
    { id: 'salma-soufiane-ivory-05', name: 'Salma & Soufiane Ivory', src: 'filters/portrait/filter-salma-soufiane-ivory-05.png' }
  ]
};

const state = {
  userName: '',
  userRelation: '',
  currentStream: null,
  facingMode: 'environment',
  activeFilter: CONFIG.FILTERS[0],
  isRecording: false,
  mediaBlob: null,
  mediaType: null, // 'photo' ou 'video'
  previewURL: null,
  recordTimer: null,
  recordStartTime: 0
};

// ── DOM ELEMENTS ──
const els = {
  step1: document.getElementById('step1'),
  step2: document.getElementById('step2'),
  step3: document.getElementById('step3'),
  step4: document.getElementById('step4'),
  
  nameInput: document.getElementById('nameInput'),
  relationInput: document.getElementById('relationInput'),
  captionInput: document.getElementById('captionInput'),
  
  btnGoStep2: document.getElementById('btnGoStep2'),
  btnBackToStep1: document.getElementById('btnBackToStep1'),
  
  cameraContainer: document.getElementById('cameraContainer'),
  cameraFeed: document.getElementById('cameraFeed'),
  cameraFallback: document.getElementById('cameraFallback'),
  filterCarousel: document.getElementById('filterCarousel'),
  videoTimer: document.getElementById('videoTimer'),
  
  btnSwitchCamera: document.getElementById('btnSwitchCamera'),
  btnSnapCapture: document.getElementById('btnSnapCapture'),
  
  previewImg: document.getElementById('previewImg'),
  previewVideo: document.getElementById('previewVideo'),
  previewOverlay: document.getElementById('previewOverlay'),
  btnChangeMedia: document.getElementById('btnChangeMedia'),
  
  btnShareNative: document.getElementById('btnShareNative'),
  btnSendToDrive: document.getElementById('btnSendToDrive'),
  loadingState: document.getElementById('loadingState'),
  loadingText: document.getElementById('loadingText'),
  alertBox: document.getElementById('alertBox')
};

// ── INITIALISATION FILTRES ──
async function initFilters() {
  try {
    const res = await fetch('filters/filters.json');
    if(res.ok) {
      const data = await res.json();
      CONFIG.FILTERS = data.filters.filter(f => f.active).map(f => ({
        id: f.id,
        name: f.name,
        src: f.id === 'none' ? '' : `filters/portrait/filter-${f.id}.png` // Adaptation pour correspondre au chemin
      }));
    }
  } catch (e) {
    console.log("Impossible de charger filters.json (exécution locale file:// probable), utilisation des filtres par défaut.");
  }

  state.activeFilter = CONFIG.FILTERS[0];
  els.filterCarousel.innerHTML = '';
  
  CONFIG.FILTERS.forEach((f, idx) => {
    const div = document.createElement('div');
    div.className = 'filter-item' + (idx === 0 ? ' active' : '');
    div.dataset.id = f.id;
    
    if (f.src) {
      const img = document.createElement('img');
      img.src = f.src;
      div.appendChild(img);
    }
    const name = document.createElement('span');
    name.className = 'filter-item-name';
    name.textContent = f.name;
    div.appendChild(name);
    
    div.addEventListener('click', () => selectFilter(f, div));
    els.filterCarousel.appendChild(div);
  });
}

function applyFilter(filter) {
  state.activeFilter = filter;
  if (filter.id === 'none') {
    els.previewOverlay.innerHTML = '';
  } else {
    els.previewOverlay.innerHTML = `<img src="${filter.src}" />`;
  }
}

function selectFilter(filter, el) {
  applyFilter(filter);
  document.querySelectorAll('.filter-item').forEach(i => i.classList.remove('active'));
  if(el) el.classList.add('active');
}

// ── NAVIGATION ──
function showStep(stepId) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
  
  // Bascule du mode plein écran pour étape 2 et 3
  if (stepId === 'step2' || stepId === 'step3') {
    document.body.classList.add('fullscreen-mode');
  } else {
    document.body.classList.remove('fullscreen-mode');
  }
  
  els.loadingState.classList.remove('visible');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showAlert(msg) {
  els.alertBox.textContent = msg;
  els.alertBox.classList.add('visible');
  setTimeout(() => els.alertBox.classList.remove('visible'), 5000);
}

// ── CAMERA API ──
async function startCamera() {
  if (state.currentStream) {
    state.currentStream.getTracks().forEach(t => t.stop());
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true
    });
    state.currentStream = stream;
    els.cameraFeed.srcObject = stream;
    els.cameraFallback.style.display = 'none';
  } catch (err) {
    console.error("Camera access denied or error:", err);
    els.cameraFallback.style.display = 'flex';
  }
}

els.btnSwitchCamera.addEventListener('click', () => {
  state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
  startCamera();
});

// ── CAPTURE PHOTO ──
function takePhoto() {
  if (!state.currentStream) return;
  const canvas = document.createElement('canvas');
  canvas.width = els.cameraFeed.videoWidth;
  canvas.height = els.cameraFeed.videoHeight;
  const ctx = canvas.getContext('2d');
  
  // Dessiner la vidéo
  if (state.facingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(els.cameraFeed, 0, 0, canvas.width, canvas.height);
  
  // Pas de filtre ici, le média brut est sauvegardé
  canvas.toBlob(blob => {
    state.mediaBlob = blob;
    state.mediaType = 'photo';
    
    // Apply default filter on capture
    applyFilter(CONFIG.FILTERS[0]);
    document.querySelectorAll('.filter-item').forEach(el => el.classList.remove('active'));
    document.querySelector('.filter-item').classList.add('active');
    
    goToPreview();
  }, 'image/jpeg', 0.85);
}

// ── GET COMPOSITED MEDIA ──
async function getFinalBlob() {
  if (state.mediaType === 'video' || state.activeFilter.id === 'none') {
    return state.mediaBlob; // Vidéo sans filtre brûlé, ou pas de filtre
  }
  
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const img = new Image();
    const filterImg = els.previewOverlay.querySelector('img');
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      if (filterImg) {
        ctx.drawImage(filterImg, 0, 0, canvas.width, canvas.height);
      }
      
      canvas.toBlob(resolve, 'image/jpeg', 0.90);
    };
    img.src = state.previewURL;
  });
}

// ── CAPTURE VIDÉO ──
let mediaRecorder;
let recordedChunks = [];
let capturePressTimer = null;
let isCapturePressed = false;

// ── SNAPCHAT BUTTON LOGIC ──
function handleCaptureStart(e) {
  if(e.type === 'touchstart') e.preventDefault();
  if (!state.currentStream) return;
  isCapturePressed = true;
  
  // Si on reste appuyé plus de 300ms, c'est une vidéo
  capturePressTimer = setTimeout(() => {
    if(isCapturePressed) startRecording();
  }, 300);
}

function handleCaptureEnd(e) {
  if(e.type === 'touchend') e.preventDefault();
  isCapturePressed = false;
  
  if (capturePressTimer) clearTimeout(capturePressTimer);
  
  if (state.isRecording) {
    stopRecording();
  } else {
    // Si on a relâché avant 300ms, c'est une photo
    takePhoto();
  }
}

els.btnSnapCapture.addEventListener('mousedown', handleCaptureStart);
els.btnSnapCapture.addEventListener('touchstart', handleCaptureStart, {passive: false});
els.btnSnapCapture.addEventListener('mouseup', handleCaptureEnd);
els.btnSnapCapture.addEventListener('touchend', handleCaptureEnd, {passive: false});

function startRecording() {
  recordedChunks = [];
  state.recordStartTime = Date.now(); // Track start time for accurate duration
  
  // Configurer le MediaRecorder avec une bonne qualité (2.5 Mbps)
  const options = { mimeType: 'video/mp4', videoBitsPerSecond: 2500000 };
  try {
    mediaRecorder = new MediaRecorder(state.currentStream, options);
  } catch (e) {
    mediaRecorder = new MediaRecorder(state.currentStream, { videoBitsPerSecond: 2500000 }); // fallback mimeType
  }
  
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    state.mediaBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/mp4' });
    state.mediaType = 'video';
    
    // Calculate real duration
    state.videoDuration = Math.round((Date.now() - state.recordStartTime) / 1000);
    
    // Apply default filter on capture
    applyFilter(CONFIG.FILTERS[0]);
    document.querySelectorAll('.filter-item').forEach(el => el.classList.remove('active'));
    document.querySelector('.filter-item').classList.add('active');
    
    goToPreview();
  };
  
  mediaRecorder.start();
  state.isRecording = true;
  els.btnSnapCapture.classList.add('recording');
  
  // Timer
  els.videoTimer.classList.add('visible');
  els.videoTimer.classList.remove('warning');
  
  state.recordTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.recordStartTime) / 1000);
    const remaining = 60 - elapsed;
    
    if(remaining <= 0) {
      stopRecording();
      return;
    }
    
    if(remaining <= 10) els.videoTimer.classList.add('warning');
    
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    els.videoTimer.textContent = `${m}:${s}`;
  }, 1000);
}

function stopRecording() {
  if (!state.isRecording) return;
  mediaRecorder.stop();
  clearInterval(state.recordTimerInterval);
  state.isRecording = false;
  els.btnSnapCapture.classList.remove('recording');
  els.videoTimer.classList.remove('visible');
}

// ── PREVIEW ──
function goToPreview() {
  if(state.previewURL) URL.revokeObjectURL(state.previewURL);
  state.previewURL = URL.createObjectURL(state.mediaBlob);
  
  if (state.mediaType === 'photo') {
    els.previewImg.src = state.previewURL;
    els.previewImg.style.display = 'block';
    els.previewVideo.style.display = 'none';
  } else {
    els.previewVideo.src = state.previewURL;
    els.previewVideo.style.display = 'block';
    els.previewImg.style.display = 'none';
  }
  
  showStep('step3');
}

els.btnChangeMedia.addEventListener('click', () => {
  if(state.previewURL) URL.revokeObjectURL(state.previewURL);
  state.mediaBlob = null;
  showStep('step2');
});

// ── SAUVEGARDE & PARTAGE ──
function getFileName() {
  const ext = state.mediaType === 'photo' ? 'jpg' : 'mp4';
  const namePart = state.userName.replace(/[^a-zA-Z0-9]/g, '_') || 'invite';
  return `souvenir_${namePart}_${Date.now()}.${ext}`;
}

// PARTAGE NATIF / SAUVEGARDE
els.btnShareNative?.addEventListener('click', async () => {
  if (!state.mediaBlob) return;
  const fileName = getFileName();
  const finalBlob = await getFinalBlob();
  const file = new File([finalBlob], fileName, { type: finalBlob.type });
  
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Mon souvenir',
        text: 'Voici mon souvenir pour le livre d\'or !'
      });
    } catch (e) {
      console.log('Partage annulé ou échoué:', e);
    }
  } else {
    // Fallback : lien de téléchargement standard si Web Share API non supportée
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
});

// ── ENVOI GOOGLE DRIVE ──
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function generateUploadId() {
  return 'up_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

els.btnSendToDrive.addEventListener('click', async () => {
  if (!state.mediaBlob) return;
  
  document.getElementById('step3').classList.remove('active');
  els.loadingState.classList.add('visible');
  els.loadingText.textContent = 'Préparation du fichier...';
  
  try {
    const finalBlob = await getFinalBlob();
    const base64 = await blobToBase64(finalBlob);
    els.loadingText.textContent = 'Envoi vers Google Drive (cela peut prendre quelques minutes pour une vidéo)...';
    
    const payload = {
      uploadId: generateUploadId(),
      mediaType: state.mediaType,
      mimeType: finalBlob.type,
      mediaBase64: base64,
      duration: state.mediaType === 'video' ? (state.videoDuration || 0) : 0,
      guestName: state.userName,
      message: els.captionInput.value.trim(),
      filterId: state.activeFilter.id,
      orientation: window.innerHeight > window.innerWidth ? 'portrait' : 'landscape',
      filename: getFileName()
    };
    
    await fetch(CONFIG.API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    
    // Succès apparent (no-cors empêche de lire la vraie réponse)
    els.loadingState.classList.remove('visible');
    showStep('step4');
    
  } catch (err) {
    console.error(err);
    els.loadingState.classList.remove('visible');
    showStep('step3');
    showAlert("Erreur lors de l'envoi. Veuillez réessayer.");
  }
});

// ── EVENTS ──
els.btnGoStep2.addEventListener('click', () => {
  state.userName = els.nameInput.value.trim();
  state.userRelation = els.relationInput.value.trim();
  if (!state.userName) {
    els.nameInput.classList.add('error');
    showAlert('Veuillez entrer votre prénom.');
    return;
  }
  els.nameInput.classList.remove('error');
  showStep('step2');
  startCamera();
});

els.btnBackToStep1.addEventListener('click', () => {
  if (state.currentStream) state.currentStream.getTracks().forEach(t => t.stop());
  showStep('step1');
});

els.btnResetAll = document.getElementById('btnResetAll');
if (els.btnResetAll) {
  els.btnResetAll.addEventListener('click', () => {
    if(state.previewURL) URL.revokeObjectURL(state.previewURL);
    state.mediaBlob = null;
    els.captionInput.value = '';
    showStep('step2');
    startCamera();
  });
}

// ── INIT ──
initFilters();
