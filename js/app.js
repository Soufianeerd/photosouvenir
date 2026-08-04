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
  cameraOverlay: document.getElementById('cameraOverlay'),
  cameraFallback: document.getElementById('cameraFallback'),
  filterCarousel: document.getElementById('filterCarousel'),
  videoTimer: document.getElementById('videoTimer'),
  
  btnSwitchCamera: document.getElementById('btnSwitchCamera'),
  btnCapturePhoto: document.getElementById('btnCapturePhoto'),
  btnCaptureVideo: document.getElementById('btnCaptureVideo'),
  
  previewImg: document.getElementById('previewImg'),
  previewVideo: document.getElementById('previewVideo'),
  btnChangeMedia: document.getElementById('btnChangeMedia'),
  metaName: document.getElementById('metaName'),
  metaSize: document.getElementById('metaSize'),
  
  btnSaveToDevice: document.getElementById('btnSaveToDevice'),
  btnShareNative: document.getElementById('btnShareNative'),
  btnSendToDrive: document.getElementById('btnSendToDrive'),
  btnResetAll: document.getElementById('btnResetAll'),
  
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

function selectFilter(filter, el) {
  state.activeFilter = filter;
  document.querySelectorAll('.filter-item').forEach(i => i.classList.remove('active'));
  if(el) el.classList.add('active');
  
  if (filter.src) {
    els.cameraOverlay.innerHTML = `<img src="${filter.src}" />`;
  } else {
    els.cameraOverlay.innerHTML = '';
  }
}

// ── NAVIGATION ──
function showStep(stepId) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
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
els.btnCapturePhoto.addEventListener('click', () => {
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
  
  // Dessiner le filtre par dessus si présent
  if (state.activeFilter.src) {
    const img = els.cameraOverlay.querySelector('img');
    if (img) {
      // Réinitialiser la transfo pour le filtre
      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
  }
  
  canvas.toBlob(blob => {
    state.mediaBlob = blob;
    state.mediaType = 'photo';
    goToPreview();
  }, 'image/jpeg', 0.85);
});

// ── CAPTURE VIDÉO ──
let mediaRecorder;
let recordedChunks = [];
els.btnCaptureVideo.addEventListener('click', () => {
  if (!state.currentStream) return;
  
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

function startRecording() {
  recordedChunks = [];
  try {
    mediaRecorder = new MediaRecorder(state.currentStream, { mimeType: 'video/mp4' });
  } catch (e) {
    mediaRecorder = new MediaRecorder(state.currentStream); // fallback mimeType
  }
  
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const type = mediaRecorder.mimeType || 'video/mp4';
    state.mediaBlob = new Blob(recordedChunks, { type });
    state.mediaType = 'video';
    
    // Alerte sur les limites techniques de la vidéo sur mobile
    if(state.activeFilter.id !== 'none') {
      showAlert("Info technique : Sur vidéo, le filtre n'est appliqué qu'en aperçu. Le fichier enregistré sera sans filtre (limitation navigateur mobile).");
    }
    
    goToPreview();
  };
  
  mediaRecorder.start();
  state.isRecording = true;
  els.btnCaptureVideo.classList.add('recording');
  
  // Timer
  state.recordStartTime = Date.now();
  els.videoTimer.classList.add('visible');
  els.videoTimer.classList.remove('warning');
  
  state.recordTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.recordStartTime) / 1000);
    const remaining = CONFIG.MAX_VIDEO_DURATION - elapsed;
    els.videoTimer.textContent = `00:${remaining < 10 ? '0'+remaining : remaining}`;
    
    if (remaining <= 10) els.videoTimer.classList.add('warning');
    if (remaining <= 0) stopRecording();
  }, 1000);
}

function stopRecording() {
  if (!state.isRecording) return;
  mediaRecorder.stop();
  clearInterval(state.recordTimer);
  state.isRecording = false;
  els.btnCaptureVideo.classList.remove('recording');
  els.videoTimer.classList.remove('visible');
}

// ── PREVIEW ──
function goToPreview() {
  if(state.previewURL) URL.revokeObjectURL(state.previewURL);
  state.previewURL = URL.createObjectURL(state.mediaBlob);
  
  els.metaSize.textContent = (state.mediaBlob.size / (1024*1024)).toFixed(2) + ' Mo';
  
  if (state.mediaType === 'photo') {
    els.previewImg.src = state.previewURL;
    els.previewImg.style.display = 'block';
    els.previewVideo.style.display = 'none';
    els.metaName.textContent = `Photo de ${state.userName}`;
  } else {
    els.previewVideo.src = state.previewURL;
    els.previewVideo.style.display = 'block';
    els.previewImg.style.display = 'none';
    els.metaName.textContent = `Vidéo de ${state.userName}`;
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

els.btnSaveToDevice.addEventListener('click', () => {
  if (!state.mediaBlob) return;
  const a = document.createElement('a');
  a.href = state.previewURL;
  a.download = getFileName();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

els.btnShareNative.addEventListener('click', async () => {
  if (!state.mediaBlob) return;
  const file = new File([state.mediaBlob], getFileName(), { type: state.mediaBlob.type });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Souvenir Mariage',
        text: `Souvenir de ${state.userName} pour Soufiane & Salma`
      });
    } catch (err) {
      console.log('Partage annulé ou erreur', err);
    }
  } else {
    showAlert("Le partage natif n'est pas supporté sur votre appareil. Utilisez le bouton Enregistrer.");
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
    const base64 = await blobToBase64(state.mediaBlob);
    els.loadingText.textContent = 'Envoi vers Google Drive (cela peut prendre quelques minutes pour une vidéo)...';
    
    const payload = {
      uploadId: generateUploadId(),
      mediaType: state.mediaType,
      mimeType: state.mediaBlob.type,
      mediaBase64: base64,
      duration: state.mediaType === 'video' ? 60 : 0,
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

els.btnResetAll.addEventListener('click', () => {
  if(state.previewURL) URL.revokeObjectURL(state.previewURL);
  state.mediaBlob = null;
  els.captionInput.value = '';
  showStep('step2');
  startCamera();
});

// ── INIT ──
initFilters();
