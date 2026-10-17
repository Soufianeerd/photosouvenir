// Served only by tests/serve.mjs on loopback; excluded from the production build.
window.lab = { requests: [], posts: [], statuses: new Map(), offline: false, failStorage: false };
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !lab.offline });
let audioContext;
navigator.mediaDevices.getUserMedia = async options => {
  lab.requests.push(options);
  if (options.audio) {
    audioContext ||= new AudioContext(); await audioContext.resume();
    const oscillator = audioContext.createOscillator(), destination = audioContext.createMediaStreamDestination();
    oscillator.frequency.value = 440; oscillator.connect(destination); oscillator.start(); return destination.stream;
  }
  const facing = options.video?.facingMode?.exact || options.video?.facingMode?.ideal || 'user';
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 1280;
  const ctx = canvas.getContext('2d'); let frame = 0, torch = false;
  const draw = () => {
    ctx.fillStyle = facing === 'user' ? '#5D262C' : '#164E63'; ctx.fillRect(0, 0, 720, 1280);
    ctx.fillStyle = '#fff'; ctx.font = '38px sans-serif'; ctx.fillText('TEST — CAMÉRA ' + (facing === 'user' ? 'AVANT' : 'ARRIÈRE'), 24, 290);
    ctx.fillText('17 OCTOBRE 2026', 24, 350); ctx.fillRect(40 + frame++ % 550, 600, 80, 80);
  };
  draw(); const timer = setInterval(draw, 33), stream = canvas.captureStream(30), track = stream.getVideoTracks()[0];
  const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); };
  track.getSettings = () => ({ facingMode: facing, width: 720, height: 1280, torch });
  track.getCapabilities = () => ({ torch: facing === 'environment' });
  track.applyConstraints = async options => { torch = !!options.advanced?.[0]?.torch; };
  return stream;
};
window.ImageCapture = undefined;
window.XMLHttpRequest = class {
  open(method, url) { this.url = url; }
  setRequestHeader() {}
  abort() { this.onabort?.(); }
  send(body) {
    if (lab.offline) { setTimeout(() => this.onerror?.(), 30); return; }
    const p = JSON.parse(body); lab.posts.push({ ...p, mediaBase64: '[synthetic media omitted]' });
    lab.statuses.set(p.uploadId, { status: 'COMPLETED', uploadId: p.uploadId });
    this.status = 200; this.responseText = JSON.stringify(lab.statuses.get(p.uploadId));
    setTimeout(() => this.onload?.(), 40);
  }
};
const append = document.head.appendChild.bind(document.head);
document.head.appendChild = node => {
  if (node.tagName === 'SCRIPT' && node.src.startsWith('https://script.google.com/')) {
    const url = new URL(node.src);
    setTimeout(() => lab.offline ? node.onerror?.() : window[url.searchParams.get('prefix')]?.(lab.statuses.get(url.searchParams.get('uploadId')) || { status: 'PENDING' }), 30);
    return node;
  }
  return append(node);
};
